import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();
const app = express();
app.use(express.json());
const PORT = 3000;

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds to allow cloud DBs to wake up
});

function getGeminiClients(): GoogleGenAI[] {
  const rawKeys = process.env.GEMINI_API_KEY;
  if (!rawKeys || rawKeys.trim() === "") {
    throw new Error('GEMINI_API_KEY is missing.');
  }

  const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k !== "");
  return keys.map(key => new GoogleGenAI({ apiKey: key }));
}

// --- YOUTUBE AUTOMATION LOGIC ---
async function fetchAndSaveHighlight(matchId: string, homeTeamName: string, awayTeamName: string) {
  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!ytKey) {
    console.warn("YouTube API Key missing.");
    return null;
  }

  // Highly specific search query to avoid garbage results
  const searchQuery = `official highlights ${homeTeamName} vs ${awayTeamName} FIFA World Cup 2026`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(searchQuery)}&type=video&key=${ytKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items.filter((item: any) => item.id?.videoId) : [];
    if (items.length > 0) {
      const videoId = items[0].id.videoId;
      const client = await pool.connect();
      await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [videoId, matchId]);
      client.release();
      console.log(`Saved YouTube ID ${videoId} for match ${matchId}`);
      return videoId;
    }

    // Fallback search if the first query doesn't return a valid result
    const fallbackQuery = `${homeTeamName} vs ${awayTeamName} FIFA World Cup 2026 highlights`;
    const fallbackUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(fallbackQuery)}&type=video&key=${ytKey}&videoDuration=short`;
    const fallbackResponse = await fetch(fallbackUrl);
    const fallbackData = await fallbackResponse.json();
    const fallbackItems = Array.isArray(fallbackData.items) ? fallbackData.items.filter((item: any) => item.id?.videoId) : [];
    if (fallbackItems.length > 0) {
      const videoId = fallbackItems[0].id.videoId;
      const client = await pool.connect();
      await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [videoId, matchId]);
      client.release();
      console.log(`Saved YouTube ID ${videoId} for match ${matchId} using fallback search`);
      return videoId;
    }
  } catch (error) {
    console.error("YouTube Fetch Error:", error);
  }
  return null;
}

let matchCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

app.get('/api/db-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };
  try {
    const client = await pool.connect();
    const result = await client.query(
      'SELECT * FROM world_cup_matches ORDER BY match_date ASC, match_time ASC'
    );
    client.release();

    // We will use Promise.all to fetch missing videos in parallel
    const dynamicMatches = await Promise.all(result.rows.map(async (row) => {
      const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
      const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

      const isFinished = row.match_time === 'FT';
      let ytId = row.youtube_highlight_id;

      // 🚨 THE AUTOMATION TRIGGER: If it's finished but has no video, fetch it!
      if (isFinished && !ytId && process.env.YOUTUBE_API_KEY) {
        fetchAndSaveHighlight(row.id, homeTeamName, awayTeamName).catch(console.error);
      }

      return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        dbStatus: isFinished ? 'FINISHED' : 'SCHEDULED', // Send what the database says
        time: row.match_time,
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
    // Graceful fallback: return empty matches instead of 500 error so UI doesn't crash
    res.status(200).set(corsHeaders).json({ matches: [], warning: 'Failed to fetch matches from DB' });
  }
});

app.get('/api/live-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  // Disable caching entirely in development mode so you can see your live changes instantly
  if (process.env.NODE_ENV === 'production' && matchCache && (Date.now() - matchCache.timestamp < CACHE_DURATION)) {
    return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true });
  }

  // 🚨 ડમી મેચ કાઢી નાખી (ખાલી Array) 🚨
  const minorLeagueFallback: any[] = [];

  // 🚨 તમારા સ્ક્રીનશોટમાંથી લીધેલું એકદમ સાચું URL 🚨
  const sofaUrl = 'https://sofascore6.p.rapidapi.com/api/sofascore/v1/match/live?sport_slug=football';
  const sofaOptions = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.RAPID_API_KEY || '',
      'X-RapidAPI-Host': 'sofascore6.p.rapidapi.com'
    }
  };

  try {
    const sofaResponse = await fetch(sofaUrl, sofaOptions);
    if (!sofaResponse.ok) throw new Error(`API Error: Status ${sofaResponse.status}`);
    const rawData = await sofaResponse.json();

    // RapidAPI ના ડેટાને એક્સટ્રેક્ટ કરો
    const liveEvents = rawData.events || rawData.data || rawData || [];

    const footballEvents = Array.isArray(liveEvents) ? liveEvents.filter((event: any) =>
      event.tournament?.category?.sport?.name?.toLowerCase() === 'football' ||
      event.sport?.name?.toLowerCase() === 'football' ||
      event.homeScore !== undefined ||
      event.sport_slug === 'football'
    ) : [];

    if (footballEvents.length === 0) {
      matchCache = { data: minorLeagueFallback, timestamp: Date.now() };
      return res.status(200).set(corsHeaders).json({ matches: minorLeagueFallback, cached: false });
    }

    const processedMatches = footballEvents.slice(0, 15).map((event: any) => {
      const minuteStr = event.status?.description || "45";
      const parsedMinute = parseInt(minuteStr.replace(/\D/g, '')) || 45;

      const statusType = event.status?.type?.toLowerCase() || '';
      const statusCode = event.status?.code;

      // EXTREME AGGRESSIVE STATUS MAPPING (UPGRADED)
      let mappedStatus = 'UPCOMING';
      if (['finished', 'closed', 'ended', 'ft', 'aet', 'pen', 'afterpenalties'].includes(statusType) || statusCode === 100 || statusCode === 120) {
        mappedStatus = 'FINISHED';
      } else if (['inprogress', 'live', '1st half', '2nd half', 'halftime', 'extratime'].includes(statusType) || (statusCode && statusCode >= 6 && statusCode <= 50)) {
        mappedStatus = 'LIVE';
      } else if (['canceled', 'postponed', 'delayed'].includes(statusType)) {
        mappedStatus = 'POSTPONED';
      }

      return {
        id: String(event.id),
        competition: event.tournament?.name || 'Global Football',
        status: mappedStatus,
        minute: mappedStatus === 'LIVE' ? parsedMinute : undefined,
        time: mappedStatus === 'FINISHED' ? 'FT' : (mappedStatus === 'LIVE' ? 'LIVE' : 'TBD'),
        date: new Date().toISOString().split('T')[0],
        homeScore: event.homeScore?.current ?? event.homeScore?.display ?? 0,
        awayScore: event.awayScore?.current ?? event.awayScore?.display ?? 0,
        homeTeam: {
          id: String(event.homeTeam?.id || 'h1'),
          name: event.homeTeam?.name || 'Home Team',
          code: event.homeTeam?.shortName || 'HOM',
          logo: '⚽',
          form: ['W', 'D', 'W']
        },
        awayTeam: {
          id: String(event.awayTeam?.id || 'a1'),
          name: event.awayTeam?.name || 'Away Team',
          code: event.awayTeam?.shortName || 'AWY',
          logo: '⚽',
          form: ['L', 'W', 'D']
        },
        stats: {
          possession: { home: 55, away: 45 },
          shots: { home: 12, away: 9 },
          shotsOnTarget: { home: 5, away: 4 },
          fouls: { home: 8, away: 11 },
          yellowCards: { home: 1, away: 1 },
          redCards: { home: 0, away: 0 },
          corners: { home: 6, away: 5 }
        },
        events: [],
        h2h: { matchesPlayed: 3, homeWins: 1, awayWins: 1, draws: 1, lastResults: ['D', 'W', 'L'] }
      };
    });

    matchCache = { data: processedMatches, timestamp: Date.now() };
    res.status(200).set(corsHeaders).json({ matches: processedMatches, cached: false });
  } catch (error: any) {
    console.error("RapidAPI Fetch Error:", error.message);
    res.status(200).set(corsHeaders).json({
      matches: [], // એરર આવે તો ડમી મેચને બદલે ખાલી Array મોકલો
      cached: false,
      warning: true,
      apiErrorDetail: error.message
    });
  }
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
    res.status(200).set(corsHeaders).json([]); // Return empty array on failure
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
    const clients = getGeminiClients();
    const isFinished = match.status === 'FINISHED' || match.time === 'FT';
    const isEarlyGame = !isFinished && (match.minute ?? 0) < 30;
    const isLateGame = !isFinished && (match.minute ?? 0) > 75;
    const isDraw = (match.homeScore ?? 0) === (match.awayScore ?? 0);

    let tacticalContext = "";
    if (isFinished) {
      tacticalContext = "The match has ended. Provide a post-match tactical review explaining the final result.";
    } else if (isEarlyGame) {
      tacticalContext = "Analyze early setups.";
    } else if (isLateGame && isDraw) {
      tacticalContext = "Analyze desperation phase for a late winner.";
    } else {
      tacticalContext = "Analyze current game state and defense.";
    }

    const postMatchInstructions = isFinished
      ? `Set "suggestedScore" exactly to "${match.homeScore}-${match.awayScore} (FT)". Set "winProbability" to reflect the actual final result (100 for winner, 0 for loser, or 100 for draw).`
      : "";

    const prompt = `You are a premium football tactical analyst. Analyze this match: ${match.homeTeam.name} (${match.homeScore}) vs ${match.awayTeam.name} (${match.awayScore}). Context: ${tacticalContext}. ${postMatchInstructions} Respond strictly in this JSON format: {"winProbability": {"home": 50, "draw": 25, "away": 25}, "suggestedScore": ${isFinished ? `"${match.homeScore}-${match.awayScore} (FT)"` : '"2-1"'}, "analysis": "2 sentences.", "vulnerabilities": {"home": "weakness", "away": "weakness"}, "keyMatchups": [{"battle": "P1 vs P2", "impact": "Crucial", "detail": "why"}], "advisor": {"captain": "Name", "viceCaptain": "Name", "bestXI": [{"name": "P1", "team": "${match.homeTeam.name}", "rating": 8.9, "reason": "why"}]}}`;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.0-flash'];
    let parsedData = null;
    let lastErrorMsg = "";

    //Proper rotation logic
    for (let i = 0; i < clients.length; i++) {
      const ai = clients[i];
      console.log(`Trying API Key #${i + 1}`); // This helps identify which key is being used in Vercel Logs

      for (const modelName of modelsToTry) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: 'application/json' }
          });
          parsedData = JSON.parse(response.text || '{}');
          break; // Success -> break out of the model loop
        } catch (err: any) {
          lastErrorMsg = err.message;
          // Only try the next model if it's a 429 (Rate Limit) or 503 (Overloaded) error
          if (err.status === 429 || err.status === 503 || err.message.includes('exhausted') || err.message.includes('quota')) {
            continue;
          } else {
            // If it's another serious error (like bad format), there's no point changing the model
            break;
          }
        }
      }
      if (parsedData) break; // Success -> break out of the key rotation loop as well
    }

    if (!parsedData) throw new Error("All keys and models cooling down.");

    predictionCache[matchId] = { data: parsedData, timestamp: now, scoreHash: currentScoreHash };
    res.json({ prediction: parsedData, cached: false });
  } catch (error: any) {
    res.status(500).json({ error: 'Gemini Analysis Interrupted', details: error.message });
  }
});

// --- BRUTE FORCE SEO ROUTES ---

app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400');

  const today = new Date().toISOString().split('T')[0];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://e2match.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/privacy-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/terms-of-service</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
</urlset>`;

  res.status(200).send(xml);
});

app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send("User-agent: *\nAllow: /\n\nSitemap: https://e2match.vercel.app/sitemap.xml");
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;