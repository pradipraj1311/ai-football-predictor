import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache';

dotenv.config();
const app = express();
app.use(express.json());
const PORT = 3000;

// 🚀 FIX 1: Suppress Postgres SSL Connection Warnings
let dbUrl = process.env.DB_URL || '';
if (dbUrl && dbUrl.includes('sslmode=require') && !dbUrl.includes('uselibpqcompat=true')) {
  dbUrl = dbUrl.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require');
}

const pool = new Pool({
  connectionString: dbUrl,
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
  const searchQuery = `FIFA official highlights ${homeTeamName} vs ${awayTeamName} World Cup 2026`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(searchQuery)}&type=video&key=${ytKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const items = Array.isArray(data.items) ? data.items.filter((item: any) => item.id?.videoId) : [];
    if (items.length > 0) {
      const videoId = items[0].id.videoId;
      // Try to persist the highlight id, but tolerate schema or connectivity issues
      let client: any = null;
      try {
        client = await pool.connect();
        await client.query('UPDATE world_cup_matches SET youtube_highlight_id = $1 WHERE id = $2', [videoId, matchId]);
        console.log(`Saved YouTube ID ${videoId} for match ${matchId}`);
      } catch (err: any) {
        // If the column doesn't exist, PG returns code 42703. We surface the video id
        // to the caller so the UI can show the highlight immediately even if DB
        // schema/update failed in production.
        if (err && err.code === '42703') {
          console.warn('YouTube column missing in DB (youtube_highlight_id). Returning video id without persisting.');
        } else {
          console.error('Failed to save YouTube ID to DB:', err?.message || err);
        }
      } finally {
        try { if (client) client.release(); } catch (e) { /* ignore */ }
      }
      return videoId;
    }

    // Fallback search if the first query doesn't return a valid result
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
        try { if (client) client.release(); } catch (e) { /* ignore */ }
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
// Singleflight / rate-limit protection for RapidAPI live fetches
let inFlightLiveFetch: Promise<any> | null = null;
let lastSofaFetchAllowed = 0; // timestamp in ms when next fetch is allowed after backoff
const SOFA_BACKOFF_BASE = 30 * 1000; // 30s base backoff on 429
const SOFA_FETCH_TIMEOUT = 10 * 1000; // 10s fetch timeout
let sofa429Count = 0;
const SOFA_MAX_BACKOFF = 10 * 60 * 1000; // 10 minutes
const SOFA_BACKOFF_JITTER = 0.25; // 25% jitter
const SOFA_MIN_INTERVAL = 60 * 1000; // Minimum interval between real RapidAPI fetches per process

app.get('/api/db-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' // 🚀 FIX: Vercel Edge Caching
  };
  // If DB is not configured, return empty matches quickly to avoid repeated timeouts
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

    // We will use Promise.all to fetch missing videos in parallel
    const dynamicMatches = await Promise.all(result.rows.map(async (row) => {
      const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
      const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

      const rawMatchTime = typeof row.match_time === 'string' ? row.match_time.toUpperCase() : '';
      const isFinished = rawMatchTime.includes('FT') || row.db_status === 'FINISHED' || row.dbStatus === 'FINISHED' || row.match_status === 'FINISHED';
      let ytId = row.youtube_highlight_id;

      // 🚨 THE AUTOMATION TRIGGER: If it's finished but has no video, fetch it synchronously for immediate availability
      if (isFinished && !ytId && process.env.YOUTUBE_API_KEY) {
        const fetchedId = await fetchAndSaveHighlight(row.id, homeTeamName, awayTeamName);
        if (fetchedId) ytId = fetchedId;
      }

      let displayTime = row.match_time;
      // Format "14:00:00" from PostgreSQL cleanly to "14:00"
      if (typeof displayTime === 'string' && displayTime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        displayTime = displayTime.substring(0, 5);
      }

      return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        dbStatus: isFinished ? 'FINISHED' : 'SCHEDULED', // Send what the database says
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
    // Graceful fallback: return empty matches instead of 500 error so UI doesn't crash
    res.status(200).set(corsHeaders).json({ matches: [], warning: 'Failed to fetch matches from DB' });
  }
});

app.get('/api/live-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' // 🚀 FIX: Prevent RapidAPI exhaustion globally
  };

  // Strict 60-second cache to give real-time updates while protecting RapidAPI's 1440/day limit
  const LIVE_CACHE_DURATION = 60 * 1000;
  const redisKey = 'live-matches:v1';
  try {
    const r = await getCache(redisKey);
    if (r && r.timestamp && (Date.now() - r.timestamp < LIVE_CACHE_DURATION)) {
      return res.status(200).set(corsHeaders).json({ matches: r.data, cached: true, source: 'redis' });
    }
  } catch (e) {
    console.warn('Failed to read Redis cache for live-matches', e);
  }

  if (matchCache && (Date.now() - matchCache.timestamp < LIVE_CACHE_DURATION)) {
    return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, source: 'memory' });
  }

  // 🚀 FIX 2: Prevent Cache Stampede (Thundering Herd)
  // Temporarily reset the timestamp so concurrent requests immediately use the old cache while we fetch new data in the background.
  if (matchCache) {
    matchCache.timestamp = Date.now();
  }

  // Dummy match fallback to prove the UI works when no real matches are happening
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

  const sofaUrl = 'https://sofascore6.p.rapidapi.com/api/sofascore/v1/match/live?sport_slug=football';
  const sofaOptions = {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': process.env.RAPID_API_KEY || '',
      'X-RapidAPI-Host': 'sofascore6.p.rapidapi.com'
    }
  };

  const extractScore = (score: any) => {
    if (score == null) return undefined;
    if (typeof score === 'number') return score;
    if (typeof score === 'string') return parseInt(score.replace(/\D/g, ''), 10) || 0;
    if (typeof score === 'object') {
      return score.current ?? score.display ?? score.normal ?? score.total ?? score.value ?? 0;
    }
    return undefined;
  };

  const extractMatchDate = (event: any) => {
    const dateCandidates = [
      event.startDate,
      event.matchDate,
      event.match_date,
      event.date,
      event.scheduled?.date,
      event.start?.date,
      event.start_date,
      event.start_time,
      event.match_time,
      event.kickoff,
      event.kickoff_time
    ];

    for (const candidate of dateCandidates) {
      if (!candidate) continue;
      if (typeof candidate === 'string') {
        const parsed = Date.parse(candidate);
        if (!Number.isNaN(parsed)) {
          return new Date(parsed).toISOString().split('T')[0];
        }
        const normalized = candidate.replace(/\//g, '-');
        const parsed2 = Date.parse(normalized);
        if (!Number.isNaN(parsed2)) {
          return new Date(parsed2).toISOString().split('T')[0];
        }
      }
      if (typeof candidate === 'number') {
        const timestamp = candidate > 9999999999 ? candidate : candidate * 1000;
        return new Date(timestamp).toISOString().split('T')[0];
      }
    }

    const timestampCandidates = [
      event.startTimestamp,
      event.timestamp,
      event.matchTimestamp,
      event.scheduled?.timestamp,
      event.start?.timestamp
    ];
    for (const ts of timestampCandidates) {
      if (!ts) continue;
      const timestamp = Number(ts);
      if (!Number.isNaN(timestamp)) {
        const millis = timestamp > 9999999999 ? timestamp : timestamp * 1000;
        return new Date(millis).toISOString().split('T')[0];
      }
    }

    return new Date().toISOString().split('T')[0];
  };

  const normalizeCompetitionName = (rawName: any) => {
    if (!rawName) return 'Global Football';
    const name = String(rawName).trim();
    const lower = name.toLowerCase();
    if (lower.includes('world cup')) return 'FIFA World Cup 2026';
    if (lower.includes('champions league')) return 'UEFA Champions League';
    if (lower.includes('euros') || lower.includes('european championship')) return 'UEFA European Championship';
    return name;
  };

  const normalizeStatusName = (status: any) => {
    const statusText = String(status || '').toLowerCase();
    if (/finished|full time|final|ft|ended|closed|aet|after penalties|penalties|pen|match ended/.test(statusText)) return 'FINISHED';
    if (/in progress|inprogress|live|1st half|2nd half|first half|second half|half time|halftime|extra time|et|playing|ongoing|period/.test(statusText)) return 'LIVE';
    if (/postponed|cancelled|cancelled|delayed|abandoned|suspended/.test(statusText)) return 'POSTPONED';
    return 'UPCOMING';
  };

  try {
    // If a recent backoff due to 429 is active, serve stale cache immediately
    const now = Date.now();
    if (now < lastSofaFetchAllowed) {
      console.warn('RapidAPI backoff active, serving stale cache until', new Date(lastSofaFetchAllowed).toISOString());
      try {
        const r = await getCache(redisKey);
        if (r && r.data && r.data !== minorLeagueFallback) {
          return res.status(200).set(corsHeaders).json({ matches: r.data, cached: true, warning: true, backoff: true, source: 'redis' });
        }
      } catch (e) {
        console.warn('Redis read failed while serving backoff cache', e);
      }
      if (matchCache && matchCache.data && matchCache.data !== minorLeagueFallback) {
        return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, warning: true, backoff: true, source: 'memory' });
      }
    }

    // Singleflight: if another request is already fetching, wait for it instead of firing a new request
    if (inFlightLiveFetch) {
      try {
        await inFlightLiveFetch;
        if (matchCache) return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true });
      } catch (e) {
        // fall through to attempt our own fetch
      }
    }

    inFlightLiveFetch = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SOFA_FETCH_TIMEOUT);
      try {
        const sofaResponse = await fetch(sofaUrl, { ...sofaOptions, signal: controller.signal });
        clearTimeout(timeout);
        if (!sofaResponse.ok) {
          // If we get a 429, schedule exponential backoff with jitter
          if (sofaResponse.status === 429) {
            sofa429Count = Math.min(sofa429Count + 1, 30);
            const exp = Math.pow(2, Math.max(0, sofa429Count - 1));
            let backoffMs = Math.min(SOFA_BACKOFF_BASE * exp, SOFA_MAX_BACKOFF);
            // jitter +/- SOFA_BACKOFF_JITTER
            const jitter = (Math.random() * 2 - 1) * SOFA_BACKOFF_JITTER;
            backoffMs = Math.floor(backoffMs * (1 + jitter));
            lastSofaFetchAllowed = Date.now() + backoffMs;
            console.warn(`RapidAPI 429 received — backing off for ${backoffMs}ms (count=${sofa429Count})`);
            throw new Error(`API Error: Status ${sofaResponse.status}`);
          }
          // For other non-ok statuses, treat as transient but don't increase 429 counter
          throw new Error(`API Error: Status ${sofaResponse.status}`);
        }
        // Success -> reset 429 counter and set a short minimum interval to throttle
        sofa429Count = 0;
        // Prevent immediate subsequent real fetches from this process
        lastSofaFetchAllowed = Date.now() + SOFA_MIN_INTERVAL;
        console.log('RapidAPI fetch succeeded; setting per-process minimum interval of', SOFA_MIN_INTERVAL, 'ms');
        const rawData = await sofaResponse.json();
        return rawData;
      } catch (err: any) {
        if (err && err.name === 'AbortError') {
          // Timeout — apply a small backoff to avoid immediate retries from many clients
          const backoffMs = SOFA_BACKOFF_BASE;
          lastSofaFetchAllowed = Date.now() + backoffMs;
          console.warn('RapidAPI fetch timed out; applying small backoff', backoffMs);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    })();

    let rawData: any;
    try {
      rawData = await inFlightLiveFetch;
    } finally {
      inFlightLiveFetch = null;
    }

    // RapidAPI ના ડેટાને એક્સટ્રેક્ટ કરો
    const liveEvents = rawData.events || rawData.data?.events || rawData.data || rawData || [];

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

    let processedMatches = footballEvents.slice(0, 15).map((event: any) => {
      const minuteStr = event.status?.description || event.status?.text || event.status?.name || '45';
      const parsedMinute = parseInt(String(minuteStr).replace(/\D/g, ''), 10) || 45;

      const rawStatus = event.status?.type || event.status?.description || event.status?.short || event.status?.name || event.status;
      const mappedStatus = normalizeStatusName(rawStatus);

      const competitionName = normalizeCompetitionName(
        event.tournament?.name ||
        event.tournament?.category?.name ||
        event.competition?.name ||
        event.league?.name ||
        event.group ||
        event.groupName ||
        event.tournament?.name_long ||
        'Global Football'
      );

      const eventDate = extractMatchDate(event);
      const truncatedHomeCode = (event.homeTeam?.shortName || event.homeTeam?.code || event.homeTeam?.name || 'HOM').toString().substring(0, 3).toUpperCase();
      const truncatedAwayCode = (event.awayTeam?.shortName || event.awayTeam?.code || event.awayTeam?.name || 'AWY').toString().substring(0, 3).toUpperCase();

      return {
        id: String(event.id),
        competition: competitionName,
        status: mappedStatus,
        minute: mappedStatus === 'LIVE' ? parsedMinute : undefined,
        time: mappedStatus === 'FINISHED' ? 'FT' : (mappedStatus === 'LIVE' ? 'LIVE' : 'TBD'),
        date: eventDate,
        homeScore: extractScore(event.homeScore),
        awayScore: extractScore(event.awayScore),
        homeTeam: {
          id: String(event.homeTeam?.id || 'h1'),
          name: event.homeTeam?.name || 'Home Team',
          code: truncatedHomeCode,
          logo: '⚽',
          form: ['W', 'D', 'W']
        },
        awayTeam: {
          id: String(event.awayTeam?.id || 'a1'),
          name: event.awayTeam?.name || 'Away Team',
          code: truncatedAwayCode,
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

    // --- Attempt to map live matches to DB rows and persist final scores ---
    if (process.env.DB_URL) {
      let client: any = null;
      try {
        client = await pool.connect();

        for (const pm of processedMatches) {
          try {
            const homeCode = (pm.homeTeam && pm.homeTeam.code) ? String(pm.homeTeam.code).toUpperCase() : null;
            const awayCode = (pm.awayTeam && pm.awayTeam.code) ? String(pm.awayTeam.code).toUpperCase() : null;
            const matchDate = pm.date;
            if (!homeCode || !awayCode || !matchDate) continue;

            const findSql = `
              SELECT id, home_team, away_team, home_score, away_score, db_status
              FROM world_cup_matches
              WHERE match_date = $1
                AND (
                  (home_team->> 'code' = $2 AND away_team->> 'code' = $3)
                  OR (home_team->> 'code' = $3 AND away_team->> 'code' = $2)
                )
              LIMIT 1
            `;

            const found = await client.query(findSql, [matchDate, homeCode, awayCode]);
            if (found && found.rows && found.rows.length > 0) {
              const row = found.rows[0];
              pm.id = row.id;

              if (pm.status === 'FINISHED' && pm.homeScore != null && pm.awayScore != null) {
                const dbHome = row.home_score;
                const dbAway = row.away_score;
                if (dbHome !== pm.homeScore || dbAway !== pm.awayScore || row.db_status !== 'FINISHED') {
                  try {
                    await client.query(
                      `UPDATE world_cup_matches SET home_score = $1, away_score = $2, db_status = 'FINISHED' WHERE id = $3`,
                      [pm.homeScore, pm.awayScore, row.id]
                    );
                    console.log(`Persisted final score for match ${row.id}: ${pm.homeScore}-${pm.awayScore}`);
                  } catch (upErr: any) {
                    console.warn('Failed to persist live score to DB for', row.id, upErr?.message || upErr);
                  }
                }
              }
            }
          } catch (innerErr: any) {
            console.warn('DB mapping error for live match:', innerErr?.message || innerErr);
            continue;
          }
        }
      } catch (err: any) {
        console.warn('Could not connect to DB for live-match mapping:', err?.message || err);
      } finally {
        try { if (client) client.release(); } catch (e) { /* ignore */ }
      }
    }

    matchCache = { data: processedMatches, timestamp: Date.now() };
    try {
      await setCache(redisKey, { data: processedMatches, timestamp: matchCache.timestamp }, LIVE_CACHE_DURATION);
    } catch (e) {
      console.warn('Failed to write live-matches to Redis', e);
    }
    res.status(200).set(corsHeaders).json({ matches: processedMatches, cached: false });
  } catch (error: any) {
    console.error("RapidAPI Fetch Error:", error.message);

    // 🚀 FIX 3: Serve Stale Cache on Rate Limit (429)
    // Do NOT overwrite real matches with dummy fallback data if we get rate limited!
    if (matchCache && matchCache.data !== minorLeagueFallback && matchCache.data.length > 0) {
      console.log("Serving stale cache due to RapidAPI error.");
      return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, warning: true, apiErrorDetail: error.message });
    }

    matchCache = { data: minorLeagueFallback, timestamp: Date.now() };
    res.status(200).set(corsHeaders).json({
      matches: minorLeagueFallback, // એરર આવે તો પણ ડમી મેચ બતાવો જેથી UI ખાલી ના રહે!
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

    const prompt = `Act as an elite, world-class football tactician, data scientist, and fantasy sports advisor. You are providing a high-stakes, deeply analytical briefing for the match: ${match.homeTeam.name} (${match.homeScore}) vs ${match.awayTeam.name} (${match.awayScore}). 

Context: ${tacticalContext}. ${postMatchInstructions}

Your analysis MUST be rooted in advanced modern football concepts (e.g., xG, expected threat, half-spaces, high presses, low blocks, transitional play, numerical superiorities). Do not use generic filler. Be highly specific, opinionated, and insightful.

Output STRICTLY in the following JSON schema:
{
  "winProbability": {"home": 50, "draw": 25, "away": 25},
  "suggestedScore": ${isFinished ? `"${match.homeScore}-${match.awayScore} (FT)"` : '"X-Y"'},
  "analysis": "A dense, 3-sentence tactical breakdown detailing formation strategies, key areas of exploitation, and momentum shifts.",
  "vulnerabilities": {
    "home": "Specific tactical flaw (e.g., 'Exposed on the counter when fullbacks overlap').",
    "away": "Specific tactical flaw."
  },
  "keyMatchups": [
    {
      "battle": "Player/Role A vs Player/Role B",
      "impact": "Crucial",
      "detail": "Why this specific zone or duel dictates the game's tempo."
    }
  ],
  "advisor": {
    "captain": "Name",
    "viceCaptain": "Name",
    "bestXI": [
      {
        "name": "Player Name",
        "team": "${match.homeTeam.name}",
        "rating": 8.9,
        "reason": "1-sentence highly technical justification."
      }
    ]
  }
}
Do not include markdown blocks, just the raw JSON.`;

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

app.get('/robots.txt', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(`User-agent: *\nAllow: /\nSitemap: https://e2match.vercel.app/sitemap.xml\n`);
});

app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');

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

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;