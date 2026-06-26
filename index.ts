import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache.js';
import path from 'path';
import { fileURLToPath } from 'url';

//  CORRECT FIREBASE MODULAR IMPORTS
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

dotenv.config();

// --- INITIALIZE FIREBASE ADMIN (MODULAR MODE) ---
let isFirebaseInitialized = false;
try {
  if (getApps().length === 0) {
    const projectId = process.env.project_id || '';
    const clientEmail = process.env.client_email || '';
    const privateKey = (process.env.private_key || '').replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      isFirebaseInitialized = true;
      console.log("🔥 Firebase Admin Initialized Successfully! (Modular Mode)");
    } else {
      console.error("🚨 CRITICAL ERROR: Firebase Environment Variables are missing.");
    }
  } else {
    isFirebaseInitialized = true; // Already initialized (Warm start)
  }
} catch (error) {
  console.error("🚨 CRITICAL: Firebase Admin Initialization Failed:", error);
}
// ----------------------------------------------

const app = express();
app.use(express.json());
const PORT = 3000;

let dbUrl = process.env.DB_URL || '';
if (dbUrl && dbUrl.includes('sslmode=require') && !dbUrl.includes('uselibpqcompat=true')) {
  dbUrl = dbUrl.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const pool = new Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const checkMaintenance = async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const maintenanceStatus = await getCache('maintenance_mode');
    if (maintenanceStatus === true) {
      return res.status(503).json({
        message: 'The service is temporarily unavailable due to maintenance. Please try again later.',
        maintenance: true
      });
    }
  } catch (e) { console.error("Maintenance check failed:", e); }
  next();
};

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/login') || req.path.startsWith('/maintenance') || req.path.startsWith('/test-noti')) {
    return next();
  }
  checkMaintenance(req, res, next);
});

const checkAdminPassword = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || password !== adminPass) {
    return res.status(403).json({ message: 'Forbidden: Invalid admin password.' });
  }
  next();
};

function getGeminiClients(): GoogleGenAI[] {
  const rawKeys = process.env.GEMINI_API_KEY;
  if (!rawKeys || rawKeys.trim() === "") {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k !== "");
  return keys.map(key => new GoogleGenAI({ apiKey: key }));
}

async function fetchAndSaveHighlight(matchId: string, homeTeamName: string, awayTeamName: string) {
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey) {
    console.warn("YouTube API Key missing.");
    return null;
  }

  const searchQuery = `FIFA official highlights ${homeTeamName} vs ${awayTeamName} World Cup 2026`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(searchQuery)}&type=video&key=${ytKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items.filter((item: any) => item.id?.videoId) : [];
    if (items.length > 0) {
      const videoId = items[0].id.videoId;
      let client: any = null;
      try {
        client = await pool.connect();
        await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [videoId, matchId]);
        console.log(`Saved YouTube ID ${videoId} for match ${matchId}`);
      } catch (err: any) {
        if (err && err.code === '42703') {
          console.warn('YouTube column missing in DB (youtube_highlight_id). Returning video id without persisting.');
        } else {
          console.error('Failed to save YouTube ID to DB:', err?.message || err);
        }
      } finally {
        try { if (client) client.release(); } catch (e) { }
      }
      return videoId;
    }

    const fallbackQuery = `FIFA TV highlights ${homeTeamName} vs ${awayTeamName} 2026`;
    const fallbackUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(fallbackQuery)}&type=video&key=${ytKey}&videoDuration=short`;
    const fallbackResponse = await fetch(fallbackUrl);
    const fallbackData = await fallbackResponse.json();
    const fallbackItems = Array.isArray(fallbackData.items) ? fallbackData.items.filter((item: any) => item.id?.videoId) : [];
    if (fallbackItems.length > 0) {
      const videoId = fallbackItems[0].id.videoId;
      let client: any = null;
      try {
        client = await pool.connect();
        await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [videoId, matchId]);
        console.log(`Saved YouTube ID ${videoId} for match ${matchId} using fallback search`);
      } catch (err: any) {
        if (err && err.code === '42703') {
          console.warn('YouTube column missing in DB (youtube_highlight_id). Returning video id without persisting.');
        } else {
          console.error('Failed to save YouTube ID to DB (fallback):', err?.message || err);
        }
      } finally {
        try { if (client) client.release(); } catch (e) { }
      }
      return videoId;
    }
  } catch (error) {
    console.error("YouTube Fetch Error:", error);
  }
  return null;
}

let matchCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

const teamNameAliases: { [key: string]: string } = {
  'dr congo': 'congo dr',
  "côte d'ivoire": 'ivory coast',
  'usa': 'united states',
  'eng': 'england',
  'ksa': 'saudi arabia',
  'uae': 'united arab emirates',
  'south korea': 'korea republic',
  'korea': 'korea republic',
  'ir iran': 'iran',
};

function normalizeTeamName(name: string): string {
  if (!name) return '';
  let normalized = name.toLowerCase().trim();

  if (teamNameAliases[normalized]) {
    normalized = teamNameAliases[normalized];
  }
  return normalized.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

app.get('/api/db-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
  };
  if (!process.env.DB_URL) {
    console.warn('DB_URL not set. Returning empty matches.');
    return res.status(200).set(corsHeaders).json({ matches: [], warning: 'DB not configured' });
  }

  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM world_cup_matches ORDER BY match_date ASC, match_time ASC'
    );
    client.release();

    const dynamicMatches = await Promise.all(result.rows.map(async (row) => {
      const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
      const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

      const rawMatchTime = typeof row.match_time === 'string' ? row.match_time.toUpperCase() : '';
      const isFinished = rawMatchTime.includes('FT') || row.db_status === 'FINISHED' || row.dbStatus === 'FINISHED' || row.match_status === 'FINISHED';
      let ytId = row.youtube_highlight_id;

      if (isFinished && !ytId && process.env.YOUTUBE_API_KEY) {
        const fetchedId = await fetchAndSaveHighlight(row.id, homeTeamName, awayTeamName);
        if (fetchedId) ytId = fetchedId;
      }

      let displayTime = row.match_time;
      if (typeof displayTime === 'string' && displayTime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        displayTime = displayTime.substring(0, 5);
      }

      return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        dbStatus: isFinished ? 'FINISHED' : 'SCHEDULED',
        time: displayTime || 'TBD',
        date: new Date(row.match_date).toISOString().split('T')[0],
        youtubeHighlightId: ytId || null,
        homeTeam: {
          id: row.home_team_id || homeTeamName.toLowerCase().replace(/\s/g, '-'),
          name: homeTeamName,
          code: row.home_team_code || homeTeamName.substring(0, 3).toUpperCase(),
          logo: row.home_team_logo || '⚽',
          form: row.home_team_form ? JSON.parse(row.home_team_form) : ['W', 'D', 'W', 'L', 'W']
        },
        awayTeam: {
          id: row.away_team_id || awayTeamName.toLowerCase().replace(/\s/g, '-'),
          name: awayTeamName,
          code: row.away_team_code || awayTeamName.substring(0, 3).toUpperCase(),
          logo: row.away_team_logo || '⚽',
          form: row.away_team_form ? JSON.parse(row.away_team_form) : ['D', 'W', 'L', 'W', 'D']
        },
        homeScore: row.home_score ?? 0,
        awayScore: row.away_score ?? 0,
        stats: {
          possession: { home: 50, away: 50 },
          shots: { home: 10, away: 8 },
          shotsOnTarget: { home: 4, away: 3 },
          fouls: { home: 10, away: 12 },
          yellowCards: { home: 1, away: 2 },
          redCards: { home: 0, away: 0 },
          corners: { home: 5, away: 4 }
        },
        events: [],
        h2h: { matchesPlayed: 5, homeWins: 2, awayWins: 1, draws: 2, lastResults: ['W', 'D', 'L', 'W', 'D'] }
      };
    }));

    res.status(200).set(corsHeaders).json({ matches: dynamicMatches });
  } catch (error: any) {
    console.error('Database Error:', error.message);
    res.status(200).set(corsHeaders).json({ matches: [], warning: 'Failed to fetch matches from DB' });
  }
});

app.get('/api/live-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
  };

  const LIVE_CACHE_DURATION = 60 * 1000;
  const STALE_WHILE_REVALIDATE_WINDOW = 5 * 60 * 1000;
  const redisKey = 'live-matches:v1';

  let responseSent = false;

  try {
    const r = await getCache(redisKey);
    if (r && r.timestamp) {
      const age = Date.now() - r.timestamp;
      if (age < LIVE_CACHE_DURATION) {
        return res.status(200).set(corsHeaders).json({ matches: r.data, cached: true, source: 'redis' });
      } else if (age < STALE_WHILE_REVALIDATE_WINDOW) {
        res.status(200).set(corsHeaders).json({ matches: r.data, cached: true, warning: false, source: 'redis-stale' });
        responseSent = true;
      }
    }
  } catch (e) {
    console.warn('Failed to read Redis cache for live-matches', e);
  }

  if (!responseSent && matchCache) {
    const age = Date.now() - matchCache.timestamp;
    if (age < LIVE_CACHE_DURATION) {
      return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, source: 'memory' });
    } else if (age < STALE_WHILE_REVALIDATE_WINDOW) {
      res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, warning: false, source: 'memory-stale' });
      responseSent = true;
    }
  }

  if (matchCache) {
    matchCache.timestamp = Date.now();
  }

  const minorLeagueFallback: any[] = [{
    id: 'dummy-live-test',
    competition: 'Global Test League',
    status: 'LIVE',
    minute: 75,
    time: 'LIVE',
    date: new Date().toISOString().split('T')[0],
    homeScore: 2,
    awayScore: 1,
    homeTeam: { id: 't1', name: 'Test FC', code: 'TST', logo: '🔴', form: ['W', 'D', 'W'] },
    awayTeam: { id: 't2', name: 'Demo Utd', code: 'DMU', logo: '🔵', form: ['L', 'W', 'L'] },
    stats: {
      possession: { home: 60, away: 40 },
      shots: { home: 10, away: 4 },
      shotsOnTarget: { home: 5, away: 2 },
      fouls: { home: 2, away: 3 }, yellowCards: { home: 0, away: 1 }, redCards: { home: 0, away: 0 }, corners: { home: 4, away: 2 }
    },
    events: [],
    h2h: { matchesPlayed: 1, homeWins: 1, awayWins: 0, draws: 0, lastResults: ['W'] }
  }];

  // 🔴 Trigger goal checking and notifications 🔴
  checkGoalsAndNotify(minorLeagueFallback);
  return res.status(200).set(corsHeaders).json({ matches: minorLeagueFallback, cached: false, warning: true });
});

app.get('/api/standings', async (req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  const tournamentId = req.query.tournamentId || '16';
  const seasonId = req.query.seasonId || '52186';

  const cacheKey = `standings:${tournamentId}:${seasonId}`;

  try {
    const cachedData = await getCache(cacheKey);
    if (cachedData && cachedData.data) {
      console.log(`Served Standings from Cache for Tournament: ${tournamentId}`);
      return res.status(200).set(corsHeaders).json({ standings: cachedData.data, cached: true });
    }

    console.log(`Fetching External Standings from RapidAPI for Tournament: ${tournamentId}...`);
    const keys = (process.env.RAPID_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) throw new Error('RAPID_API_KEY missing');

    const url = `https://sofascore6.p.rapidapi.com/api/sofascore/v1/tournament/${tournamentId}/season/${seasonId}/standings`;
    const response = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': keys[0],
        'X-RapidAPI-Host': 'sofascore6.p.rapidapi.com'
      }
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error('RapidAPI Rate Limit Exceeded');
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    let formattedStandings: any[] = [];

    if (data.standings && Array.isArray(data.standings)) {
      data.standings.forEach((group: any) => {
        const groupName = group.name || 'Group';

        group.rows?.forEach((row: any) => {
          formattedStandings.push({
            rank: row.position,
            team: row.team?.name || 'Unknown',
            logo: '⚽',
            played: row.matches || 0,
            won: row.wins || 0,
            drawn: row.draws || 0,
            lost: row.losses || 0,
            gf: row.scoresFor || 0,
            ga: row.scoresAgainst || 0,
            gd: (row.scoresFor || 0) - (row.scoresAgainst || 0),
            points: row.points || 0,
            group: groupName
          });
        });
      });
    }

    if (formattedStandings.length > 0) {
      await setCache(cacheKey, { data: formattedStandings }, 43200);
    }

    res.status(200).set(corsHeaders).json({ standings: formattedStandings, cached: false });
  } catch (error: any) {
    console.error("Standings Fetch Error:", error.message);
    res.status(200).set(corsHeaders).json({ standings: [], error: error.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;

  if (!adminUser || !adminPass) {
    console.error('Admin credentials are not set in environment variables.');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  const isValid = username === adminUser && password === adminPass;

  if (isValid) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/api/maintenance', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const maintenanceStatus = await getCache('maintenance_mode') || false;
  res.status(200).json({ maintenance: maintenanceStatus });
});

app.post('/api/maintenance', checkAdminPassword, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Invalid payload. "enabled" must be a boolean.' });
  }
  await setCache('maintenance_mode', enabled);
  console.log(`[ADMIN] Server maintenance mode set to: ${enabled ? 'ON' : 'OFF'}`);
  res.status(200).json({ success: true, maintenance: enabled });
});

app.get('/api/poll', async (_req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT * FROM fan_poll ORDER BY votes DESC');
    client.release();
    res.status(200).set(corsHeaders).json(result.rows);
  } catch (error) {
    console.error("Poll DB Error:", error);
    res.status(200).set(corsHeaders).json([]);
  }
});

app.post('/api/poll/vote', async (req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  try {
    const { team_id } = req.body;
    const client = await pool.connect();
    await client.query('UPDATE fan_poll SET votes = votes + 1 WHERE team_id = $1', [team_id]);
    const updated = await client.query('SELECT * FROM fan_poll ORDER BY votes DESC');
    client.release();
    res.status(200).set(corsHeaders).json(updated.rows);
  } catch (error) {
    res.status(500).set(corsHeaders).json({ error: 'Failed to submit vote' });
  }
});

let predictionCache: { [matchId: string]: { data: any; timestamp: number; scoreHash: string } } = {};
const PREDICT_CACHE_DURATION = 3 * 60 * 1000;

app.post('/api/predict', async (req, res) => {
  try {
    const { match } = req.body;
    if (!match || !match.id) {
      return res.status(400).json({ error: "Invalid match payload provided." });
    }

    const matchId = String(match.id);
    const currentScoreHash = `${match.homeScore ?? 0}-${match.awayScore ?? 0}`;
    const now = Date.now();

    if (
      predictionCache[matchId] &&
      (now - predictionCache[matchId].timestamp < PREDICT_CACHE_DURATION) &&
      predictionCache[matchId].scoreHash === currentScoreHash
    ) {
      return res.json({ prediction: predictionCache[matchId].data, cached: true });
    }

    return res.json({
      prediction: {
        analysis: "AI Analysis is temporarily paused to save API limits.",
        vulnerabilities: { home: "N/A", away: "N/A" },
        keyMatchups: [],
        winProbability: { "home": 33, "draw": 34, "away": 33 },
        suggestedScore: "0-0"
      },
      cached: true
    });

  } catch (error: any) {
    res.status(500).json({ error: 'Gemini Analysis Interrupted', details: error.message });
  }
});

// --- PUSH NOTIFICATION LOGIC ---
const sendFirebaseTopicNotification = async (topic: string, title: string, body: string) => {
  if (!isFirebaseInitialized) {
    console.error("Firebase is not initialized. Notification skipped.");
    return;
  }
  
  const message = {
    notification: {
      title: title,
      body: body
    },
    topic: topic,
    android: {
      priority: 'high' as const,
      notification: {
        sound: 'default',
        channelId: 'default',
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
        },
      },
    },
  };

  try {
    const response = await getMessaging().send(message);
    console.log(`Successfully sent message to topic ${topic}:`, response);
  } catch (error) {
    console.error(`Error sending message to topic ${topic}:`, error);
  }
};

let previousScoresCache: { [matchId: string]: string } = {};

const checkGoalsAndNotify = async (liveMatches: any[]) => {
  liveMatches.forEach(match => {
    if (match.status === 'LIVE' && match.homeScore !== undefined && match.awayScore !== undefined) {
      const matchId = String(match.id);
      const currentScoreHash = `${match.homeScore}-${match.awayScore}`;

      const prevScoreHash = previousScoresCache[matchId];

      if (prevScoreHash && prevScoreHash !== currentScoreHash) {
        let goalMessage = '';
        const prevScores = prevScoreHash.split('-');
        const prevHome = parseInt(prevScores[0]);
        const prevAway = parseInt(prevScores[1]);

        if (match.homeScore > prevHome) {
          goalMessage = `⚽ GOAL! ${match.homeTeam.name} scores!`;
        } else if (match.awayScore > prevAway) {
          goalMessage = `⚽ GOAL! ${match.awayTeam.name} scores!`;
        } else {
          goalMessage = `⚽ SCORE UPDATE!`;
        }

        const fullMessage = `${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`;

        // 🔴 Trigger the actual notification 🔴
        sendFirebaseTopicNotification('global_goal_alerts', goalMessage, fullMessage);
      }

      previousScoresCache[matchId] = currentScoreHash;
    }
  });
};

// --- SECRET TEST ROUTE ---
app.get('/api/test-noti', async (req, res) => {
  try {
    await sendFirebaseTopicNotification(
      'global_goal_alerts',
      '🚀 VERCEL TEST!',
      'This is a High-Priority notification from your backend!'
    );
    res.status(200).send('<h1>Notification Fired! Check your emulator!</h1>');
  } catch (error) {
    res.status(500).send('Error firing notification');
  }
});

// --- SEO AND STATIC ROUTES ---
app.get('/robots.txt', (_req, res) => {
  try {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    const content = [
      'User-agent: *',
      'Allow: /',
      'Sitemap: https://e2match.vercel.app/sitemap.xml'
    ].join('\n');
    res.status(200).send(content);
  } catch (error) {
    console.error("robots.txt Generation Error:", error);
    res.status(500).setHeader('Content-Type', 'text/plain').send("Error generating robots.txt");
  }
});

function seoPage(title: string, description: string, keywords: string, bodyContent: string, canonical: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="keywords" content="${keywords}">
  <link rel="canonical" href="https://e2match.vercel.app${canonical}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0B1121; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem; }
    .hero { text-align: center; padding: 3rem 1rem 2rem; }
    .hero h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 800; color: #fff; margin-bottom: 1rem; line-height: 1.2; }
    .hero p { font-size: 1.1rem; color: #94a3b8; max-width: 600px; margin: 0 auto 2rem; }
  </style>
</head>
<body>
  <div class="container">
    ${bodyContent}
  </div>
</body>
</html>`;
}

app.get('/world-cup-2026', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const body = `<div class="hero"><h1>FIFA World Cup 2026 Live Updates</h1></div>`;
  res.status(200).send(seoPage('FIFA World Cup 2026', 'Live scores', 'world cup 2026', body, '/world-cup-2026'));
});

app.get('/ai-football-predictions', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const body = `<div class="hero"><h1>AI Football Predictions</h1></div>`;
  res.status(200).send(seoPage('AI Football Predictions', 'AI Predictions', 'ai football', body, '/ai-football-predictions'));
});

app.get('/fantasy-football-ai', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const body = `<div class="hero"><h1>Free AI Fantasy Football Advice</h1></div>`;
  res.status(200).send(seoPage('Fantasy Football AI', 'Fantasy Football', 'fantasy football', body, '/fantasy-football-ai'));
});

app.get('/live-football-scores', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const body = `<div class="hero"><h1>Live Football Scores</h1></div>`;
  res.status(200).send(seoPage('Live Football Scores', 'Live Scores', 'live scores', body, '/live-football-scores'));
});

app.get('/sitemap.xml', (_req, res) => {
  try {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

    const today = new Date().toISOString().split('T')[0];
    const baseUrl = 'https://e2match.vercel.app';

    const urls = [
      '/',
      '/world-cup-2026',
      '/ai-football-predictions',
      '/fantasy-football-ai',
      '/live-football-scores',
      '/privacy-policy',
      '/terms-of-service',
    ];

    const urlset = urls.map(url =>
      `<url><loc>${baseUrl}${url.startsWith('/') ? url : '/' + url}</loc><lastmod>${today}</lastmod></url>`
    ).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;

    res.status(200).send(xml);
  } catch (error) {
    console.error("Sitemap Generation Error:", error);
    res.status(500).setHeader('Content-Type', 'text/plain').send("Error generating sitemap.");
  }
});

// --- SERVE THE REACT/VITE FRONTEND ---

// Set __dirname for use in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the 'dist' folder built for production
app.use(express.static(path.join(__dirname, 'dist')));

// For any unknown route, serve the main index.html (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;