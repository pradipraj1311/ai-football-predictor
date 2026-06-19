import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache.js';

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

const checkMaintenance = async (_req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    // Fetch maintenance status from the persistent cache (Redis)
    const maintenanceStatus = await getCache('maintenance_mode');
    if (maintenanceStatus === true) { // Explicitly check for boolean true
      return res.status(503).json({
        message: 'The service is temporarily unavailable due to maintenance. Please try again later.',
        maintenance: true
      });
    }
  } catch (e) {
    console.error("Maintenance check failed:", e);
    // Fail open: If Redis check fails for any reason, allow traffic to prevent total outage.
  }
  next();
};

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
const SOFA_FETCH_TIMEOUT = 5 * 1000; // 5s fetch timeout (Reduced slightly so we can safely retry 4 keys within Vercel's limit)
let sofa429Count = 0;
let currentSofaKeyIndex = 0; // NEW: Keeps track of which RapidAPI key to use
const SOFA_MAX_BACKOFF = 10 * 60 * 1000; // 10 minutes
const SOFA_BACKOFF_JITTER = 0.25; // 25% jitter
const SOFA_MIN_INTERVAL = 60 * 1000; // Minimum interval between real RapidAPI fetches per process

// --- NEW: Robust Team Name Normalization for Data Consistency ---
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

  // Apply aliases for known variations
  if (teamNameAliases[normalized]) {
    normalized = teamNameAliases[normalized];
  }
  return normalized.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

app.get('/api/db-matches', checkMaintenance, async (_req, res) => {
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

app.get('/api/live-matches', checkMaintenance, async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' // 🚀 FIX: Prevent RapidAPI exhaustion globally
  };

  // Strict 60-second cache to give real-time updates while protecting RapidAPI's 1440/day limit
  const LIVE_CACHE_DURATION = 60 * 1000;
  const STALE_WHILE_REVALIDATE_WINDOW = 5 * 60 * 1000; // Serve up to 5 min old data while refreshing
  const redisKey = 'live-matches:v1';
  const backoffKey = 'live-matches:backoff-until';

  let responseSent = false;

  try {
    const r = await getCache(redisKey);
    if (r && r.timestamp) {
      const age = Date.now() - r.timestamp;
      if (age < LIVE_CACHE_DURATION) {
        return res.status(200).set(corsHeaders).json({ matches: r.data, cached: true, source: 'redis' });
      } else if (age < STALE_WHILE_REVALIDATE_WINDOW) {
        // Stale-While-Revalidate: send stale data immediately, but don't return so fetch continues
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

    // --- NEW: Check for global Redis backoff ---
    let globalBackoffUntil = 0;
    if (hasRedis()) {
      try {
        const backoffData = await getCache(backoffKey);
        if (backoffData && backoffData.until) {
          globalBackoffUntil = backoffData.until;
        }
      } catch (e) {
        console.warn('Failed to read Redis backoff key', e);
      }
    }

    const effectiveBackoffUntil = Math.max(lastSofaFetchAllowed, globalBackoffUntil);

    if (now < effectiveBackoffUntil) {
      const reason = (globalBackoffUntil > lastSofaFetchAllowed) ? 'Global (Redis)' : 'Local';
      console.warn(`RapidAPI backoff active (${reason}), serving stale cache until`, new Date(effectiveBackoffUntil).toISOString());
      if (!responseSent) {
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
        return res.status(200).set(corsHeaders).json({ matches: minorLeagueFallback, cached: false, warning: true, backoff: true, apiErrorDetail: 'RapidAPI is in a cool-down period. Serving fallback data.' });
      } else {
        return; // Already sent SWR response
      }
    }

    // Singleflight: if another request is already fetching, wait for it instead of firing a new request
    if (inFlightLiveFetch) {
      try {
        await inFlightLiveFetch;
        if (!responseSent && matchCache) return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true });
        if (responseSent) return;
      } catch (e) {
        // fall through to attempt our own fetch
      }
    }

    inFlightLiveFetch = (async () => {
      const keys = (process.env.RAPID_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) {
        throw new Error('No RAPID_API_KEY configured.');
      }

      let attempt = 0;
      let sofaResponse: Response | null = null;
      let lastError: any = null;

      // Loop over keys to provide fallback and load-balancing
      while (attempt < keys.length) {
        const keyToUse = keys[currentSofaKeyIndex];
        const sofaOptions = {
          method: 'GET',
          headers: {
            'X-RapidAPI-Key': keyToUse,
            'X-RapidAPI-Host': 'sofascore6.p.rapidapi.com'
          }
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), SOFA_FETCH_TIMEOUT);

        try {
          sofaResponse = await fetch(sofaUrl, { ...sofaOptions, signal: controller.signal });
          clearTimeout(timeout);

          if (sofaResponse.ok) {
            break; // Success! Break out of the retry loop
          }

          if (sofaResponse.status === 429 || sofaResponse.status === 403) {
            console.warn(`RapidAPI Key #${currentSofaKeyIndex + 1} returned ${sofaResponse.status}. Rotating to next key...`);
            currentSofaKeyIndex = (currentSofaKeyIndex + 1) % keys.length;
            attempt++;
            continue; // Try the next key
          }

          throw new Error(`API Error: Status ${sofaResponse.status}`);
        } catch (err: any) {
          clearTimeout(timeout);
          if (err && err.name === 'AbortError') {
            console.warn(`RapidAPI Key #${currentSofaKeyIndex + 1} timed out. Rotating to next key...`);
            currentSofaKeyIndex = (currentSofaKeyIndex + 1) % keys.length;
            attempt++;
            lastError = err;
            continue; // Try next key on timeout
          }
          // For non-timeout errors, throw immediately
          throw err;
        }
      }

      // If we exhausted all keys and still don't have a successful response
      if (!sofaResponse || !sofaResponse.ok) {
        const is429 = sofaResponse && sofaResponse.status === 429;
        if (is429 || (lastError && lastError.name === 'AbortError')) {
          sofa429Count = Math.min(sofa429Count + 1, 30);
          const exp = Math.pow(2, Math.max(0, sofa429Count - 1));
          let backoffMs = Math.min(SOFA_BACKOFF_BASE * exp, SOFA_MAX_BACKOFF);
          const jitter = (Math.random() * 2 - 1) * SOFA_BACKOFF_JITTER;
          backoffMs = Math.floor(backoffMs * (1 + jitter));
          lastSofaFetchAllowed = Date.now() + backoffMs;

          if (hasRedis()) {
            try {
              await setCache(backoffKey, { until: lastSofaFetchAllowed }, Math.ceil(backoffMs / 1000) + 60);
            } catch (e) {
              console.warn('Failed to set Redis backoff key', e);
            }
          }
          console.warn(`All RapidAPI keys exhausted. Backing off for ${backoffMs}ms (count=${sofa429Count})`);
          throw new Error(is429 ? `API Error: Status 429 (All keys exhausted)` : `API Error: Fetch Timeout (All keys)`);
        }
        throw new Error(`API Error: Status ${sofaResponse?.status || 'Unknown'}`);
      }

      // Success -> reset 429 counter, move to next key for next request (Load Balancing), and set throttle
      sofa429Count = 0;
      currentSofaKeyIndex = (currentSofaKeyIndex + 1) % keys.length;
      lastSofaFetchAllowed = Date.now() + SOFA_MIN_INTERVAL;
      console.log(`RapidAPI fetch succeeded; Load balancing to next key for next request. Interval: ${SOFA_MIN_INTERVAL}ms`);
      const rawData = await sofaResponse.json();
      return rawData;
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
      if (!responseSent) return res.status(200).set(corsHeaders).json({ matches: minorLeagueFallback, cached: false });
      return;
    }

    let processedMatches = footballEvents.slice(0, 50).map((event: any) => {
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
      let dbClient: any = null;
      try {
        dbClient = await pool.connect();

        // --- OPTIMIZATION: Fetch all potentially relevant matches from DB at once ---
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const candidateMatchesResult = await dbClient.query(
          `SELECT id, home_team, away_team, home_score, away_score, db_status, match_date 
           FROM world_cup_matches 
           WHERE match_date = ANY($1::date[])`,
          [[today.toISOString().split('T')[0], tomorrow.toISOString().split('T')[0], yesterday.toISOString().split('T')[0]]]
        );
        const dbMatches = candidateMatchesResult.rows;

        for (const pm of processedMatches) {
          const normalizedLiveHome = normalizeTeamName(pm.homeTeam?.name);
          const normalizedLiveAway = normalizeTeamName(pm.awayTeam?.name);

          const foundDbMatch = dbMatches.find(dbMatch => {
            if (new Date(dbMatch.match_date).toDateString() !== new Date(pm.date).toDateString()) {
              return false;
            }

            const normalizedDbHome = normalizeTeamName(dbMatch.home_team?.name);
            const normalizedDbAway = normalizeTeamName(dbMatch.away_team?.name);

            return (normalizedLiveHome === normalizedDbHome && normalizedLiveAway === normalizedDbAway) ||
              (normalizedLiveHome === normalizedDbAway && normalizedLiveAway === normalizedDbHome);
          });

          if (foundDbMatch) {
            pm.id = foundDbMatch.id; // CRITICAL: Align the ID for frontend state management

            // Persist final score if match is finished and score differs
            if (pm.status === 'FINISHED' && pm.homeScore != null && pm.awayScore != null) {
              const dbHomeScore = foundDbMatch.home_score;
              const dbAwayScore = foundDbMatch.away_score;
              if (dbHomeScore !== pm.homeScore || dbAwayScore !== pm.awayScore || foundDbMatch.db_status !== 'FINISHED') {
                try {
                  await dbClient.query(
                    `UPDATE world_cup_matches SET home_score = $1, away_score = $2, db_status = 'FINISHED' WHERE id = $3`,
                    [pm.homeScore, pm.awayScore, foundDbMatch.id]
                  );
                  console.log(`Persisted final score for match ${foundDbMatch.id}: ${pm.homeScore}-${pm.awayScore}`);
                } catch (upErr: any) {
                  console.warn('Failed to persist live score to DB for', foundDbMatch.id, upErr?.message || upErr);
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.warn('Could not connect to DB for live-match mapping:', err?.message || err);
      } finally {
        try { if (dbClient) dbClient.release(); } catch (e) { /* ignore */ }
      }
    }

    matchCache = { data: processedMatches, timestamp: Date.now() };
    try {
      await setCache(redisKey, { data: processedMatches, timestamp: matchCache.timestamp }, LIVE_CACHE_DURATION);
    } catch (e) {
      console.warn('Failed to write live-matches to Redis', e);
    }
    if (!responseSent) {
      res.status(200).set(corsHeaders).json({ matches: processedMatches, cached: false });
    }
  } catch (error: any) {
    console.error("RapidAPI Fetch Error:", error.message);

    if (!responseSent) {
      // Do NOT overwrite real matches with dummy fallback data if we get rate limited!
      if (matchCache && matchCache.data !== minorLeagueFallback && matchCache.data.length > 0) {
        console.log("Serving stale cache due to RapidAPI error.");
        return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true, warning: true, apiErrorDetail: error.message });
      }

      matchCache = { data: minorLeagueFallback, timestamp: Date.now() };
      res.status(200).set(corsHeaders).json({
        matches: minorLeagueFallback,
        cached: false,
        warning: true,
        apiErrorDetail: error.message
      });
    }
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

  // IMPORTANT: In a real-world, high-security app, use a constant-time comparison
  // library like `scmp` to prevent timing attacks. For this internal tool, direct
  // comparison is acceptable.
  const isValid = username === adminUser && password === adminPass;

  if (isValid) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.get('/api/maintenance', async (_req, res) => {
  const maintenanceStatus = await getCache('maintenance_mode') || false;
  res.status(200).json({ maintenance: maintenanceStatus });
});

app.post('/api/maintenance', checkAdminPassword, async (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ message: 'Invalid payload. "enabled" must be a boolean.' });
  }
  await setCache('maintenance_mode', enabled); // Persist to Redis without an expiry time
  console.log(`[ADMIN] Server maintenance mode set to: ${enabled ? 'ON' : 'OFF'}`);
  res.status(200).json({ success: true, maintenance: enabled });
});


app.get('/api/poll', checkMaintenance, async (_req, res) => {
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

app.post('/api/poll/vote', checkMaintenance, async (req, res) => {
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

app.post('/api/predict', checkMaintenance, async (req, res) => {
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

// ============================================================
// SEO ROUTES — aa badha routes server.ts ma
// "export default app;" thi PEHLA add karo
// ============================================================

// --- SEO Helper: Generate full HTML page ---
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

  <!-- Open Graph -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://e2match.vercel.app${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://e2match.vercel.app/og-image.png">
  <meta property="og:site_name" content="E2Match.ai">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://e2match.vercel.app/og-image.png">

  <!-- Schema.org Structured Data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "${title}",
    "description": "${description}",
    "url": "https://e2match.vercel.app${canonical}",
    "publisher": {
      "@type": "Organization",
      "name": "E2Match.ai",
      "url": "https://e2match.vercel.app"
    }
  }
  </script>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0B1121; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem; }
    .hero { text-align: center; padding: 3rem 1rem 2rem; }
    .hero h1 { font-size: clamp(1.5rem, 4vw, 2.5rem); font-weight: 800; color: #fff; margin-bottom: 1rem; line-height: 1.2; }
    .hero p { font-size: 1.1rem; color: #94a3b8; max-width: 600px; margin: 0 auto 2rem; }
    .cta-btn { display: inline-block; background: linear-gradient(135deg, #4F46E5, #7C3AED); color: #fff; padding: 0.9rem 2rem; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 1rem; margin: 0.5rem; transition: opacity 0.2s; }
    .cta-btn:hover { opacity: 0.9; }
    .badge { display: inline-block; background: rgba(99,102,241,0.15); border: 1px solid rgba(99,102,241,0.3); color: #818CF8; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; margin-bottom: 1rem; }
    .section { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .section h2 { font-size: 1.3rem; font-weight: 700; color: #fff; margin-bottom: 1rem; }
    .section p { color: #94a3b8; line-height: 1.7; margin-bottom: 0.75rem; }
    .section ul { color: #94a3b8; padding-left: 1.5rem; line-height: 2; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
    .stat { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2); border-radius: 12px; padding: 1rem; text-align: center; }
    .stat-val { font-size: 1.8rem; font-weight: 800; color: #818CF8; }
    .stat-lbl { font-size: 0.8rem; color: #64748b; margin-top: 0.25rem; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
    .feature { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 1rem; }
    .feature h3 { font-size: 1rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.5rem; }
    .feature p { font-size: 0.875rem; color: #64748b; line-height: 1.5; }
    nav { background: rgba(11,17,33,0.95); border-bottom: 1px solid rgba(255,255,255,0.06); padding: 1rem 2rem; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
    .nav-brand { font-size: 1.2rem; font-weight: 800; color: #fff; text-decoration: none; }
    .nav-brand span { color: #818CF8; }
    .nav-link { color: #94a3b8; text-decoration: none; font-size: 0.9rem; }
    footer { text-align: center; padding: 2rem; color: #475569; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 3rem; }
    footer a { color: #64748b; text-decoration: none; margin: 0 0.5rem; }
  </style>
</head>
<body>
  <nav>
    <a href="/" class="nav-brand">E2Match<span>.ai</span></a>
    <a href="/" class="nav-link">← Live App</a>
  </nav>

  <div class="container">
    ${bodyContent}
  </div>

  <footer>
    <p>© 2026 E2Match.ai by E2Soft. All rights reserved.</p>
    <p style="margin-top:0.5rem">
      <a href="/">Home</a>
      <a href="/privacy-policy">Privacy Policy</a>
      <a href="/terms-of-service">Terms of Service</a>
      <a href="/world-cup-2026">World Cup 2026</a>
      <a href="/ai-football-predictions">AI Predictions</a>
    </p>
  </footer>

  <script>
    // Redirect to app after 8 seconds (optional)
    // setTimeout(() => { window.location.href = '/'; }, 8000);
  </script>
</body>
</html>`;
}

// ============================================================
// ROUTE 1: World Cup 2026 Hub
// Target keywords: "world cup 2026", "fifa world cup 2026 predictions"
// Monthly searches: 5M+
// ============================================================
app.get('/world-cup-2026', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const body = `
    <div class="hero">
      <span class="badge">⚽ LIVE NOW</span>
      <h1>FIFA World Cup 2026 — Live Scores, Predictions & AI Analysis</h1>
      <p>Real-time scores, AI-powered match predictions, group standings, and expert analysis for all 104 matches of FIFA World Cup 2026 in USA, Canada & Mexico.</p>
      <a href="/" class="cta-btn">🤖 Get AI Predictions Live</a>
      <a href="/?tab=standings" class="cta-btn" style="background: rgba(99,102,241,0.2); border: 1px solid rgba(99,102,241,0.4);">📊 View Standings</a>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-val">48</div><div class="stat-lbl">Teams</div></div>
      <div class="stat"><div class="stat-val">104</div><div class="stat-lbl">Matches</div></div>
      <div class="stat"><div class="stat-val">12</div><div class="stat-lbl">Groups</div></div>
      <div class="stat"><div class="stat-val">3</div><div class="stat-lbl">Host Countries</div></div>
    </div>

    <div class="section">
      <h2>World Cup 2026 — AI Match Predictions</h2>
      <p>E2Match.ai uses Google Gemini AI to analyze every World Cup 2026 match in real time. Unlike basic prediction tools that show just percentages, our AI explains <strong>why</strong> a team will win — covering tactical formations, player form, head-to-head history, and key matchups.</p>
      <p>With 48 teams from 6 confederations competing across 16 host cities in the USA, Canada, and Mexico, World Cup 2026 is the biggest football tournament in history. Our AI covers every single match — from Group A opener on June 11 to the Final at MetLife Stadium on July 19, 2026.</p>
    </div>

    <div class="section">
      <h2>World Cup 2026 Groups & Favorites</h2>
      <p>Spain lead the World Cup 2026 odds as favorites, followed by France, England, and Brazil. Argentina are the reigning champions looking to defend their 2022 title. Host nations USA, Canada, and Mexico are all expected to advance from the group stage.</p>
      <ul>
        <li>Group A: Mexico, South Africa, South Korea, Czechia</li>
        <li>Group B: Canada, Switzerland, Qatar, Bosnia</li>
        <li>Group C: Brazil, Morocco, Scotland, Jamaica</li>
        <li>Group D: USA, Paraguay, Netherlands, Angola</li>
        <li>Group E: Argentina, Italy, Ivory Coast, New Zealand</li>
        <li>Group F: France, Colombia, Japan, Honduras</li>
        <li>Group G: England, Uruguay, Nigeria, UAE</li>
        <li>Group H: Spain, Senegal, Australia, Panama</li>
      </ul>
    </div>

    <div class="section">
      <h2>Features Available on E2Match.ai</h2>
      <div class="feature-grid">
        <div class="feature"><h3>🤖 AI Analysis</h3><p>Gemini AI explains every match prediction with tactical depth — not just odds.</p></div>
        <div class="feature"><h3>⚽ Live Scores</h3><p>Real-time scores from all 104 World Cup matches plus 500+ other competitions.</p></div>
        <div class="feature"><h3>📊 Group Standings</h3><p>Live group tables updating after every match result.</p></div>
        <div class="feature"><h3>🎯 Fantasy Advice</h3><p>AI-powered captain picks and best XI suggestions for World Cup Fantasy.</p></div>
        <div class="feature"><h3>🧠 Daily Quiz</h3><p>AI-generated football trivia with global leaderboard.</p></div>
        <div class="feature"><h3>🔔 Goal Alerts</h3><p>Real-time goal notifications for matches you follow.</p></div>
      </div>
    </div>`;

  res.status(200).send(seoPage(
    'FIFA World Cup 2026 — Live Scores, AI Predictions & Standings | E2Match.ai',
    'Live scores, AI-powered predictions, and expert analysis for all 104 matches of FIFA World Cup 2026. Free, no signup required.',
    'world cup 2026, fifa world cup 2026, world cup predictions, world cup live scores, world cup standings 2026',
    body,
    '/world-cup-2026'
  ));
});

// ============================================================
// ROUTE 2: AI Football Predictions Hub
// Target keywords: "ai football predictions", "football prediction today"
// Monthly searches: 500K+
// ============================================================
app.get('/ai-football-predictions', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const body = `
    <div class="hero">
      <span class="badge">🤖 AI POWERED</span>
      <h1>AI Football Predictions — Match Analysis Powered by Google Gemini</h1>
      <p>Get intelligent, natural language match predictions for every football game. Our AI explains tactics, key matchups, and win probabilities — not just numbers.</p>
      <a href="/" class="cta-btn">🔮 Get Today's Predictions</a>
    </div>

    <div class="section">
      <h2>How Our AI Football Predictions Work</h2>
      <p>E2Match.ai uses Google Gemini — one of the world's most advanced AI models — to analyze every football match. We combine live match data from 500+ competitions with AI to generate predictions that explain the "why" behind every result.</p>
      <p>Our AI considers: recent form (last 5 matches), head-to-head history, home vs away performance, key player availability, tactical formations, and momentum indicators. The result is a prediction that reads like expert analysis, not a betting algorithm.</p>
    </div>

    <div class="section">
      <h2>What Makes E2Match.ai Different</h2>
      <ul>
        <li><strong>Natural language analysis</strong> — "Brazil's high press will exploit Argentina's slow center-backs" not just "Brazil 65%"</li>
        <li><strong>Key matchup identification</strong> — Which player battles will decide the game</li>
        <li><strong>Vulnerability analysis</strong> — Tactical weaknesses of both teams exposed</li>
        <li><strong>Fantasy advice</strong> — Captain picks and differential suggestions</li>
        <li><strong>Free to use</strong> — No signup, no payment required</li>
        <li><strong>500+ competitions</strong> — World Cup, Premier League, La Liga, UCL, and more</li>
      </ul>
    </div>

    <div class="section">
      <h2>Today's Top Football Predictions</h2>
      <p>Visit E2Match.ai for live AI predictions on every match happening today. Our predictions update in real time as match conditions change — including in-game analysis during live matches.</p>
      <a href="/" class="cta-btn">View Today's Predictions →</a>
    </div>`;

  res.status(200).send(seoPage(
    'AI Football Predictions — Free Match Analysis by Google Gemini | E2Match.ai',
    'Free AI-powered football predictions for World Cup 2026, Premier League, La Liga, and 500+ competitions. Natural language analysis, not just odds.',
    'ai football predictions, football prediction today, match prediction ai, football analysis ai, world cup predictions ai',
    body,
    '/ai-football-predictions'
  ));
});

// ============================================================
// ROUTE 3: Match Prediction Pages (Dynamic)
// Target keywords: "[team1] vs [team2] prediction 2026"
// Monthly searches: 100K-500K per match
// ============================================================
const WC_MATCHES: { [slug: string]: { home: string; away: string; group: string; date: string; homeOdds: number; drawOdds: number; awayOdds: number; analysis: string } } = {
  'brazil-vs-morocco': { home: 'Brazil', away: 'Morocco', group: 'Group C', date: 'June 2026', homeOdds: 62, drawOdds: 22, awayOdds: 16, analysis: "Brazil enter as heavy favorites with Vinicius Jr in red-hot form. Morocco, Africa's 2022 semi-finalists, will defend deep and hit on the counter. Brazil's fullback-heavy system may leave gaps for Morocco's pacey wingers." },
  'england-vs-nigeria': { home: 'England', away: 'Nigeria', group: 'Group G', date: 'June 2026', homeOdds: 68, drawOdds: 18, awayOdds: 14, analysis: "England are strong favorites at home on North American soil. Nigeria's Super Eagles are dangerous on transitions but England's midfield depth should control possession. Bellingham and Saka are key threats." },
  'france-vs-japan': { home: 'France', away: 'Japan', group: 'Group F', date: 'June 2026', homeOdds: 72, drawOdds: 18, awayOdds: 10, analysis: "France are World Cup favorites and should dominate possession. Japan's organized 4-3-3 defensive shape caused problems in 2022, but France's individual quality at every position is too strong to contain." },
  'spain-vs-senegal': { home: 'Spain', away: 'Senegal', group: 'Group H', date: 'June 2026', homeOdds: 65, drawOdds: 20, awayOdds: 15, analysis: "Spain's tiki-taka system will dominate the ball but Senegal's physical midfield and Sadio Mane's experience make this dangerous. Spain must avoid counter-attacking exposure from their high defensive line." },
  'argentina-vs-italy': { home: 'Argentina', away: 'Italy', group: 'Group E', date: 'June 2026', homeOdds: 55, drawOdds: 25, awayOdds: 20, analysis: "A dream match between Messi's Argentina and Italy's Azzurri. Argentina's fluid attacking system against Italy's defensive organization. Messi vs Donnarumma is the key battle. Argentina's experience as reigning champions gives them the edge." },
  'usa-vs-paraguay': { home: 'USA', away: 'Paraguay', group: 'Group D', date: 'June 2026', homeOdds: 58, drawOdds: 24, awayOdds: 18, analysis: "USA benefit from massive home support on their own soil. Paraguay's physical pressing game can unsettle USA's build-up but Christian Pulisic's threat from wide areas should be decisive." },
  'germany-vs-iran': { home: 'Germany', away: 'Iran', group: 'Group I', date: 'June 2026', homeOdds: 78, drawOdds: 14, awayOdds: 8, analysis: "Germany are heavy favorites with superior technical quality throughout the squad. Iran will defend in a low 4-5-1 block but Germany's press and quick combinations should find gaps early." },
  'mexico-vs-south-korea': { home: 'Mexico', away: 'South Korea', group: 'Group A', date: 'June 2026', homeOdds: 52, drawOdds: 26, awayOdds: 22, analysis: "An evenly matched battle between two technically gifted sides. Mexico's home advantage in North America is significant. South Korea's pressing intensity can cause problems but Mexico's experience in tournament football is decisive." },
  'portugal-vs-croatia': { home: 'Portugal', away: 'Croatia', group: 'Group J', date: 'June 2026', homeOdds: 55, drawOdds: 24, awayOdds: 21, analysis: "Portugal without Ronaldo face a battle-hardened Croatia side. Modric's experience and Croatia's counter-attacking system make this a potential upset. Portugal's attacking depth through Bruno Fernandes should be enough." },
  'netherlands-vs-angola': { home: 'Netherlands', away: 'Angola', group: 'Group D', date: 'June 2026', homeOdds: 82, drawOdds: 12, awayOdds: 6, analysis: "Netherlands are overwhelming favorites. Van Dijk's defensive leadership and the Dutch attacking trio should dominate comfortably. Angola's debut at a major tournament means limited big-game experience." },
};

app.get('/predictions/:matchSlug', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const slug = req.params.matchSlug.toLowerCase().replace(/_/g, '-');
  const match = WC_MATCHES[slug];

  if (match) {
    const body = `
      <div class="hero">
        <span class="badge">⚽ FIFA WORLD CUP 2026 — ${match.group}</span>
        <h1>${match.home} vs ${match.away} Prediction — World Cup 2026</h1>
        <p>AI-powered prediction, tactical analysis, and win probability for ${match.home} vs ${match.away} at FIFA World Cup 2026.</p>
        <a href="/" class="cta-btn">🤖 Get Live AI Prediction</a>
      </div>

      <div class="stats-grid">
        <div class="stat"><div class="stat-val">${match.homeOdds}%</div><div class="stat-lbl">${match.home} Win</div></div>
        <div class="stat"><div class="stat-val">${match.drawOdds}%</div><div class="stat-lbl">Draw</div></div>
        <div class="stat"><div class="stat-val">${match.awayOdds}%</div><div class="stat-lbl">${match.away} Win</div></div>
      </div>

      <div class="section">
        <h2>AI Tactical Analysis — ${match.home} vs ${match.away}</h2>
        <p>${match.analysis}</p>
        <p>For real-time AI analysis that updates as the match progresses, including live tactical adjustments, key player ratings, and fantasy advice — visit E2Match.ai.</p>
        <a href="/" class="cta-btn">View Live Analysis →</a>
      </div>

      <div class="section">
        <h2>About This Prediction</h2>
        <p>This prediction is generated by E2Match.ai's AI system powered by Google Gemini. Our AI analyzes team form, head-to-head records, tactical setups, and player availability to provide expert-level match analysis.</p>
        <p>E2Match.ai covers all ${match.group} matches and all 104 FIFA World Cup 2026 games. Get live predictions, real-time scores, group standings, and fantasy advice — all free, no signup required.</p>
      </div>`;

    res.status(200).send(seoPage(
      `${match.home} vs ${match.away} Prediction — World Cup 2026 AI Analysis | E2Match.ai`,
      `AI prediction for ${match.home} vs ${match.away} at FIFA World Cup 2026. Win probability: ${match.home} ${match.homeOdds}%, Draw ${match.drawOdds}%, ${match.away} ${match.awayOdds}%. Free tactical analysis.`,
      `${match.home} vs ${match.away} prediction, ${match.home} vs ${match.away} 2026, world cup 2026 prediction, ${match.home.toLowerCase()} prediction, ${match.away.toLowerCase()} prediction`,
      body,
      `/predictions/${slug}`
    ));
  } else {
    // Generic prediction page for unknown slugs
    const teams = slug.split('-vs-');
    const home = teams[0]?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Home Team';
    const away = teams[1]?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Away Team';

    const body = `
      <div class="hero">
        <span class="badge">⚽ FOOTBALL PREDICTION</span>
        <h1>${home} vs ${away} Prediction & AI Analysis</h1>
        <p>Get AI-powered prediction and tactical analysis for ${home} vs ${away}. Live win probabilities, key matchups, and fantasy advice.</p>
        <a href="/" class="cta-btn">🤖 Get Live AI Prediction</a>
      </div>
      <div class="section">
        <h2>AI Match Prediction</h2>
        <p>E2Match.ai provides AI-powered predictions for football matches worldwide including World Cup 2026, Premier League, La Liga, Champions League, and 500+ competitions. Visit our live app for real-time analysis of ${home} vs ${away}.</p>
        <a href="/" class="cta-btn">View Live Prediction →</a>
      </div>`;

    res.status(200).send(seoPage(
      `${home} vs ${away} Prediction — AI Football Analysis | E2Match.ai`,
      `AI-powered prediction for ${home} vs ${away}. Win probabilities, tactical analysis, and fantasy advice. Free on E2Match.ai.`,
      `${home} vs ${away} prediction, football prediction, ai prediction football`,
      body,
      `/predictions/${slug}`
    ));
  }
});

// ============================================================
// ROUTE 4: Fantasy Football AI Hub
// Target keywords: "fantasy football predictions", "fpl ai advice"
// Monthly searches: 300K+
// ============================================================
app.get('/fantasy-football-ai', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const body = `
    <div class="hero">
      <span class="badge">🎯 FANTASY ADVISOR</span>
      <h1>Free AI Fantasy Football Advice — Captain Picks, Best XI & Transfer Tips</h1>
      <p>Get AI-powered fantasy football advice for World Cup 2026 Fantasy, FPL, UCL Fantasy, and more. Free captain picks, differential suggestions, and Best XI every gameweek.</p>
      <a href="/" class="cta-btn">🎯 Get AI Fantasy Advice</a>
    </div>

    <div class="section">
      <h2>World Cup 2026 Fantasy Football — AI Strategy</h2>
      <p>With 48 teams and 104 matches, World Cup 2026 Fantasy is the biggest fantasy football game ever. Our AI analyzes every match to give you the best captain picks, differential players, and transfer suggestions.</p>
      <ul>
        <li><strong>Captain picks</strong> — AI identifies the highest expected point scorer each gameweek</li>
        <li><strong>Differentials</strong> — High-value, low-ownership players who can win you your mini-league</li>
        <li><strong>Transfer advice</strong> — Which players to bring in based on upcoming fixtures</li>
        <li><strong>Best XI builder</strong> — Optimal lineup from your existing squad</li>
        <li><strong>Injury alerts</strong> — Key player availability updates before deadline</li>
      </ul>
    </div>

    <div class="section">
      <h2>Why Use AI for Fantasy Football?</h2>
      <p>Traditional fantasy advice relies on human opinion. E2Match.ai uses Google Gemini AI to analyze tactical data, form metrics, and fixture difficulty simultaneously — giving you an analytical edge over your mini-league rivals.</p>
      <a href="/" class="cta-btn">Start Getting AI Advice →</a>
    </div>`;

  res.status(200).send(seoPage(
    'Free AI Fantasy Football Advice — World Cup 2026 Captain Picks & Best XI | E2Match.ai',
    'Free AI fantasy football advice for World Cup 2026. Captain picks, differential suggestions, best XI builder, and transfer tips powered by Google Gemini AI.',
    'fantasy football ai, fpl ai advice, world cup fantasy 2026, fantasy football captain picks, ai fantasy football predictions',
    body,
    '/fantasy-football-ai'
  ));
});

// ============================================================
// ROUTE 5: Live Football Scores Hub
// Target keywords: "live football scores", "football scores today"
// Monthly searches: 10M+
// ============================================================
app.get('/live-football-scores', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');

  const body = `
    <div class="hero">
      <span class="badge">🔴 LIVE</span>
      <h1>Live Football Scores Today — World Cup 2026 & All Major Leagues</h1>
      <p>Real-time football scores from FIFA World Cup 2026, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, and 500+ competitions worldwide.</p>
      <a href="/" class="cta-btn">⚽ View Live Scores Now</a>
    </div>

    <div class="stats-grid">
      <div class="stat"><div class="stat-val">500+</div><div class="stat-lbl">Competitions</div></div>
      <div class="stat"><div class="stat-val">Live</div><div class="stat-lbl">Updates</div></div>
      <div class="stat"><div class="stat-val">Free</div><div class="stat-lbl">No Signup</div></div>
      <div class="stat"><div class="stat-val">104</div><div class="stat-lbl">WC Matches</div></div>
    </div>

    <div class="section">
      <h2>Live Scores + AI Analysis — Only on E2Match.ai</h2>
      <p>E2Match.ai is the only live scores platform that combines real-time match data with AI-powered tactical analysis. While other platforms show you scores, we explain what's happening on the pitch — formation changes, momentum shifts, and key player matchups.</p>
      <p>Available for: FIFA World Cup 2026, UEFA Champions League, Premier League, La Liga, Bundesliga, Serie A, Ligue 1, and 500+ competitions worldwide.</p>
      <a href="/" class="cta-btn">View Live Scores + AI Analysis →</a>
    </div>`;

  res.status(200).send(seoPage(
    'Live Football Scores Today — World Cup 2026 & All Leagues | E2Match.ai',
    'Real-time football scores for World Cup 2026, Premier League, La Liga, Champions League, and 500+ competitions. Plus AI match analysis. Free.',
    'live football scores, football scores today, world cup 2026 scores, live scores football, football results today',
    body,
    '/live-football-scores'
  ));
});

// ============================================================
// UPDATED SITEMAP — all SEO pages included
// ============================================================
app.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');

  const today = new Date().toISOString().split('T')[0];

  const matchSlugs = Object.keys(WC_MATCHES);

  const matchUrls = matchSlugs.map(slug => `
  <url>
    <loc>https://e2match.vercel.app/predictions/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">

  <url>
    <loc>https://e2match.vercel.app/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/world-cup-2026</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/ai-football-predictions</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/live-football-scores</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://e2match.vercel.app/fantasy-football-ai</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
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
  ${matchUrls}
</urlset>`;

  res.status(200).send(xml);
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

export default app;