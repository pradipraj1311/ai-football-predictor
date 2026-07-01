import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache.js';

// CORRECT FIREBASE MODULAR IMPORTS
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
      console.log("Firebase Admin Initialized Successfully! (Modular Mode)");
    } else {
      console.error("CRITICAL ERROR: Firebase Environment Variables are missing.");
    }
  } else {
    isFirebaseInitialized = true; // Already initialized (Warm start)
  }
} catch (error) {
  console.error("CRITICAL: Firebase Admin Initialization Failed:", error);
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
  } catch (e) {
    console.error("Maintenance check failed:", e);
  }
  next();
};

const minorLeagueFallback = [
    {
        id: 'dummy-live-test',
        competition: 'E2match Demo League',
        status: 'LIVE',
        minute: 78,
        time: "78'",
        date: new Date().toISOString(),
        homeScore: 1,
        awayScore: 1,
        homeTeam: { id: 't_dummy_1', name: 'Red Dragons', code: 'RED', logo: '🐉' },
        awayTeam: { id: 't_dummy_2', name: 'Blue Knights', code: 'BLU', logo: '⚔️' },
        stats: { possession: { home: 55, away: 45 }, shots: { home: 12, away: 9 }, shotsOnTarget: { home: 5, away: 4 }, fouls: { home: 8, away: 11 }, yellowCards: { home: 1, away: 2 }, redCards: { home: 0, away: 0 }, corners: { home: 6, away: 3 } },
        events: [],
        h2h: { matchesPlayed: 2, homeWins: 1, awayWins: 0, draws: 1, lastResults: ['W', 'D'] }
    }
];

const checkAdminPassword = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { password } = req.body;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (!adminPass || password !== adminPass) {
    return res.status(403).json({ message: 'Forbidden: Invalid admin password.' });
  }
  next();
};

// --- GEMINI CLIENT INITIALIZATION ---
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
let inFlightLiveFetch: Promise<any> | null = null;
let lastSofaFetchAllowed = 0;
const SOFA_BACKOFF_BASE = 30 * 1000;
const SOFA_FETCH_TIMEOUT = 5 * 1000;
let sofa429Count = 0;
let currentSofaKeyIndex = 0;
const SOFA_MAX_BACKOFF = 10 * 60 * 1000;
const SOFA_BACKOFF_JITTER = 0.25;
const SOFA_MIN_INTERVAL = 60 * 1000;

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

function transformMatchRow(row: any, status: 'UPCOMING' | 'FINISHED' | 'SCHEDULED'): any {
    const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
    const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

    let displayTime = row.match_time;
    if (typeof displayTime === 'string' && displayTime.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
        displayTime = displayTime.substring(0, 5);
    }

    let homeForm: string[] = [];
    try {
        homeForm = row.home_team_form ? JSON.parse(row.home_team_form) : ['W', 'D', 'W', 'L', 'W'];
    } catch (e) {
        homeForm = ['W', 'D', 'W', 'L', 'W'];
    }

    let awayForm: string[] = [];
    try {
        awayForm = row.away_team_form ? JSON.parse(row.away_team_form) : ['D', 'W', 'L', 'W', 'D'];
    } catch (e) {
        awayForm = ['D', 'W', 'L', 'W', 'D'];
    }

    return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        status: status,
        dbStatus: row.db_status || status,
        time: status === 'FINISHED' ? 'FT' : (displayTime || 'TBD'),
        date: new Date(row.match_date).toISOString().split('T')[0],
        youtubeHighlightId: row.youtube_highlight_id || null,
        homeTeam: {
            id: row.home_team_id || homeTeamName.toLowerCase().replace(/\s/g, '-'),
            name: homeTeamName,
            code: row.home_team_code || homeTeamName.substring(0, 3).toUpperCase(),
            logo: row.home_team_logo || '⚽',
            form: homeForm
        },
        awayTeam: {
            id: row.away_team_id || awayTeamName.toLowerCase().replace(/\s/g, '-'),
            name: awayTeamName,
            code: row.away_team_code || awayTeamName.substring(0, 3).toUpperCase(),
            logo: row.away_team_logo || '⚽',
            form: awayForm
        },
        homeScore: row.home_score ?? 0,
        awayScore: row.away_score ?? 0,
        stats: {
            possession: { home: 50, away: 50 }, shots: { home: 10, away: 8 }, shotsOnTarget: { home: 4, away: 3 },
            fouls: { home: 10, away: 12 }, yellowCards: { home: 1, away: 2 }, redCards: { home: 0, away: 0 }, corners: { home: 5, away: 4 }
        },
        events: [],
        h2h: { matchesPlayed: 5, homeWins: 2, awayWins: 1, draws: 2, lastResults: ['W', 'D', 'L', 'W', 'D'] }
    };
}

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/login') || req.path.startsWith('/maintenance') || req.path.startsWith('/test-noti')) {
    return next();
  }
  checkMaintenance(req, res, next);
});

// --- CENTRALIZED TEAM DATA MANAGEMENT ---
const MANAGED_TEAMS = [
  { id: 'arg', name: 'Argentina', code: 'ARG', logo: '🇦🇷', country: 'South America', founded: 1893, stadium: 'Estadio Monumental', form: ['W', 'W', 'W', 'D', 'W'] },
  { id: 'bra', name: 'Brazil', code: 'BRA', logo: '🇧🇷', country: 'South America', founded: 1914, stadium: 'Maracanã', form: ['L', 'W', 'W', 'D', 'W'] },
  { id: 'fra', name: 'France', code: 'FRA', logo: '🇫🇷', country: 'Europe', founded: 1919, stadium: 'Stade de France', form: ['W', 'D', 'W', 'W', 'L'] },
  { id: 'eng', name: 'England', code: 'ENG', logo: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', country: 'Europe', founded: 1863, stadium: 'Wembley', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'usa', name: 'United States', code: 'USA', logo: '🇺🇸', country: 'North America', founded: 1913, stadium: 'MetLife Stadium', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'mex', name: 'Mexico', code: 'MEX', logo: '🇲🇽', country: 'North America', founded: 1927, stadium: 'Estadio Azteca', form: ['D', 'W', 'L', 'W', 'W'] },
  { id: 'can', name: 'Canada', code: 'CAN', logo: '🇨🇦', country: 'North America', founded: 1912, stadium: 'BMO Field', form: ['W', 'L', 'W', 'D', 'L'] },
  { id: 'esp', name: 'Spain', code: 'ESP', logo: '🇪🇸', country: 'Europe', founded: 1909, stadium: 'Santiago Bernabéu', form: ['W', 'W', 'W', 'W', 'D'] },
  { id: 'ger', name: 'Germany', code: 'GER', logo: '🇩🇪', country: 'Europe', founded: 1900, stadium: 'Allianz Arena', form: ['D', 'W', 'W', 'L', 'W'] },
  { id: 'jpn', name: 'Japan', code: 'JPN', logo: '🇯🇵', country: 'Asia', founded: 1921, stadium: 'National Stadium', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'sen', name: 'Senegal', code: 'SEN', logo: '🇸🇳', country: 'Africa', founded: 1960, stadium: 'Diamniadio', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'aus', name: 'Australia', code: 'AUS', logo: '🇦🇺', country: 'Asia', founded: 1961, stadium: 'Stadium Australia', form: ['D', 'D', 'W', 'W', 'L'] },
  { id: 'rsa', name: 'South Africa', code: 'RSA', logo: '🇿🇦', country: 'Africa', founded: 1991, stadium: 'FNB Stadium', form: ['W', 'D', 'W', 'L', 'L'] },
  { id: 'kor', name: 'South Korea', code: 'KOR', logo: '🇰🇷', country: 'Asia', founded: 1928, stadium: 'Seoul World Cup Stadium', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'cze', name: 'Czechia', code: 'CZE', logo: '🇨🇿', country: 'Europe', founded: 1901, stadium: 'Fortuna Arena', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'par', name: 'Paraguay', code: 'PAR', logo: '🇵🇾', country: 'South America', founded: 1906, stadium: 'Defensores del Chaco', form: ['L', 'D', 'W', 'L', 'D'] },
  { id: 'mar', name: 'Morocco', code: 'MAR', logo: '🇲🇦', country: 'Africa', founded: 1955, stadium: 'Stade Mohammed V', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'bih', name: 'Bosnia and Herzegovina', code: 'BIH', logo: '🇧🇦', country: 'Europe', founded: 1992, stadium: 'Bilino Polje', form: ['L', 'L', 'L', 'W', 'L'] },
  { id: 'qat', name: 'Qatar', code: 'QAT', logo: '🇶🇦', country: 'Asia', founded: 1960, stadium: 'Khalifa International Stadium', form: ['W', 'D', 'W', 'L', 'W'] },
  { id: 'sui', name: 'Switzerland', code: 'SUI', logo: '🇨🇭', country: 'Europe', founded: 1895, stadium: 'St. Jakob-Park', form: ['D', 'W', 'D', 'W', 'D'] },
  { id: 'hai', name: 'Haiti', code: 'HAI', logo: '🇭🇹', country: 'North America', founded: 1904, stadium: 'Stade Sylvio Cator', form: ['D', 'L', 'D', 'L', 'W'] },
  { id: 'sco', name: 'Scotland', code: 'SCO', logo: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', country: 'Europe', founded: 1873, stadium: 'Hampden Park', form: ['L', 'D', 'L', 'L', 'D'] },
  { id: 'tur', name: 'Türkiye', code: 'TUR', logo: '🇹🇷', country: 'Europe', founded: 1923, stadium: 'Atatürk Olympic Stadium', form: ['L', 'D', 'L', 'W', 'D'] },
  { id: 'cuw', name: 'Curaçao', code: 'CUW', logo: '🇨🇼', country: 'North America', founded: 1921, stadium: 'Ergilio Hato Stadium', form: ['W', 'D', 'L', 'L', 'W'] },
  { id: 'civ', name: 'Ivory Coast', code: 'CIV', logo: '🇨🇮', country: 'Africa', founded: 1960, stadium: 'Stade Alassane Ouattara', form: ['W', 'D', 'W', 'W', 'D'] },
  { id: 'ecu', name: 'Ecuador', code: 'ECU', logo: '🇪🇨', country: 'South America', founded: 1925, stadium: 'Estadio Rodrigo Paz Delgado', form: ['W', 'L', 'W', 'L', 'W'] },
  { id: 'ned', name: 'Netherlands', code: 'NED', logo: '🇳🇱', country: 'Europe', founded: 1889, stadium: 'Johan Cruyff Arena', form: ['W', 'W', 'L', 'W', 'W'] },
  { id: 'swe', name: 'Sweden', code: 'SWE', logo: '🇸🇪', country: 'Europe', founded: 1904, stadium: 'Friends Arena', form: ['L', 'W', 'L', 'W', 'W'] },
  { id: 'tun', name: 'Tunisia', code: 'TUN', logo: '🇹🇳', country: 'Africa', founded: 1957, stadium: 'Stade Hammadi Agrebi', form: ['D', 'D', 'L', 'D', 'W'] },
  { id: 'bel', name: 'Belgium', code: 'BEL', logo: '🇧🇪', country: 'Europe', founded: 1895, stadium: 'King Baudouin Stadium', form: ['W', 'D', 'D', 'W', 'D'] },
  { id: 'egy', name: 'Egypt', code: 'EGY', logo: '🇪🇬', country: 'Africa', founded: 1921, stadium: 'Cairo International Stadium', form: ['D', 'W', 'W', 'D', 'W'] },
  { id: 'irn', name: 'IR Iran', code: 'IRN', logo: '🇮🇷', country: 'Asia', founded: 1920, stadium: 'Azadi Stadium', form: ['W', 'W', 'D', 'W', 'W'] },
  { id: 'nzl', name: 'New Zealand', code: 'NZL', logo: '🇳🇿', country: 'Oceania', founded: 1891, stadium: 'Sky Stadium', form: ['L', 'D', 'L', 'W', 'L'] },
  { id: 'cpv', name: 'Cabo Verde', code: 'CPV', logo: '🇨🇻', country: 'Africa', founded: 1982, stadium: 'Estádio Nacional de Cabo Verde', form: ['W', 'W', 'L', 'W', 'D'] },
  { id: 'ksa', name: 'Saudi Arabia', code: 'KSA', logo: '🇸🇦', country: 'Asia', founded: 1956, stadium: 'King Fahd International Stadium', form: ['D', 'W', 'D', 'W', 'L'] },
  { id: 'uru', name: 'Uruguay', code: 'URU', logo: '🇺🇾', country: 'South America', founded: 1900, stadium: 'Estadio Centenario', form: ['D', 'L', 'D', 'W', 'W'] },
  { id: 'irq', name: 'Iraq', code: 'IRQ', logo: '🇮🇶', country: 'Asia', founded: 1948, stadium: 'Basra International Stadium', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'nor', name: 'Norway', code: 'NOR', logo: '🇳🇴', country: 'Europe', founded: 1902, stadium: 'Ullevaal Stadion', form: ['D', 'L', 'D', 'D', 'L'] },
  { id: 'alg', name: 'Algeria', code: 'ALG', logo: '🇩🇿', country: 'Africa', founded: 1962, stadium: 'Stade du 5 Juillet 1962', form: ['W', 'D', 'W', 'D', 'W'] },
  { id: 'aut', name: 'Austria', code: 'AUT', logo: '🇦🇹', country: 'Europe', founded: 1904, stadium: 'Ernst-Happel-Stadion', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'jor', name: 'Jordan', code: 'JOR', logo: '🇯🇴', country: 'Asia', founded: 1949, stadium: 'Amman International Stadium', form: ['W', 'W', 'L', 'W', 'W'] },
  { id: 'cod', name: 'Congo DR', code: 'COD', logo: '🇨🇩', country: 'Africa', founded: 1919, stadium: 'Stade des Martyrs', form: ['D', 'W', 'D', 'D', 'L'] },
  { id: 'uzb', name: 'Uzbekistan', code: 'UZB', logo: '🇺🇿', country: 'Asia', founded: 1946, stadium: 'Milliy Stadium', form: ['D', 'W', 'W', 'D', 'W'] },
  { id: 'col', name: 'Colombia', code: 'COL', logo: '🇨🇴', country: 'South America', founded: 1924, stadium: 'Estadio Metropolitano', form: ['W', 'W', 'W', 'W', 'W'] },
  { id: 'cro', name: 'Croatia', code: 'CRO', logo: '🇭🇷', country: 'Europe', founded: 1912, stadium: 'Stadion Maksimir', form: ['W', 'W', 'W', 'D', 'W'] },
  { id: 'gha', name: 'Ghana', code: 'GHA', logo: '🇬🇭', country: 'Africa', founded: 1957, stadium: 'Baba Yara Stadium', form: ['W', 'L', 'D', 'L', 'D'] },
  { id: 'pan', name: 'Panama', code: 'PAN', logo: '🇵🇦', country: 'North America', founded: 1937, stadium: 'Estadio Rommel Fernández', form: ['W', 'L', 'L', 'W', 'L'] }
];

app.get('/api/teams', (_req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  res.status(200).set(corsHeaders).json(MANAGED_TEAMS);
});

app.get('/api/team-stats/:teamId', (req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  const teamId = req.params.teamId.toLowerCase();

  const team = MANAGED_TEAMS.find(t => t.id === teamId || t.code.toLowerCase() === teamId);

  if (team) {
    const advancedStats = {
      ...team,
      manager: "Head Coach",
      worldRanking: Math.floor(Math.random() * 15) + 1,
      tacticalStyle: "High Pressing"
    };
    res.status(200).set(corsHeaders).json(advancedStats);
  } else {
    res.status(404).set(corsHeaders).json({ error: "Team not found" });
  }
});


// --- REAL API LOGIC REACTIVATED ---

app.get('/api/db-matches', checkMaintenance, async (_req, res) => {
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

// ✅ RAPID API ACTIVATED
app.get('/api/live-matches', checkMaintenance, async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
  };

  const LIVE_CACHE_DURATION = 60 * 1000;
  const STALE_WHILE_REVALIDATE_WINDOW = 5 * 60 * 1000;
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

  const now = Date.now();
  let backoffUntil = await getCache(backoffKey) || 0;

  if (now < backoffUntil) {
    console.log(`[Rate Limit] Backoff active. Resuming at ${new Date(backoffUntil).toISOString()}`);
    if (!responseSent) {
      return res.status(200).set(corsHeaders).json({ matches: matchCache?.data || [], cached: true, backoff: true });
    }
    return;
  }

  if (now < lastSofaFetchAllowed || inFlightLiveFetch) {
    if (!responseSent) {
      return res.status(200).set(corsHeaders).json({ matches: matchCache?.data || [], cached: true });
    }
    return;
  }

  const performFetch = async () => {
    try {
      const rawKeys = process.env.RAPID_API_KEY;
      if (!rawKeys) throw new Error('RAPID_API_KEY is missing.');
      const keys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
      if (keys.length === 0) throw new Error('No valid RapidAPI keys found.');

      if (currentSofaKeyIndex >= keys.length) {
        currentSofaKeyIndex = 0;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SOFA_FETCH_TIMEOUT);

      const url = `https://sofascore6.p.rapidapi.com/api/sofascore/v1/match/live?sport_slug=football`;

      const response = await fetch(url, {
        headers: {
          'x-rapidapi-key': keys[currentSofaKeyIndex],
          'x-rapidapi-host': 'sofascore6.p.rapidapi.com',
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          sofa429Count++;
          let backoffDuration = Math.min(SOFA_BACKOFF_BASE * Math.pow(2, sofa429Count - 1), SOFA_MAX_BACKOFF);
          backoffDuration = backoffDuration * (1 - SOFA_BACKOFF_JITTER + Math.random() * (SOFA_BACKOFF_JITTER * 2));
          backoffUntil = now + backoffDuration;
          await setCache(backoffKey, backoffUntil, Math.ceil(backoffDuration / 1000));
          console.warn(`[429] Rate limited. Key ${currentSofaKeyIndex}. Backing off for ${Math.round(backoffDuration / 1000)}s.`);
          currentSofaKeyIndex = (currentSofaKeyIndex + 1) % keys.length;
        } else {
          sofa429Count = 0;
          lastSofaFetchAllowed = now + SOFA_MIN_INTERVAL;
        }
        throw new Error(`RapidAPI returned ${response.status}`);
      }

      sofa429Count = 0;
      await setCache(backoffKey, 0, 1);
      lastSofaFetchAllowed = now + SOFA_MIN_INTERVAL;
      const data = await response.json();

      let liveOrFinishedMatches = [];
      // IMPROVEMENT: If the live endpoint returns data, take all matches.
      if (data && data.events && Array.isArray(data.events)) {
        liveOrFinishedMatches = data.events; 
      }

      const formattedLiveMatches = liveOrFinishedMatches.map((m: any) => {
        let status = 'LIVE'; // Default to LIVE for this endpoint
        if (m.status?.type === 'notstarted') status = 'UPCOMING';
        if (m.status?.type === 'finished') status = 'FINISHED';

        return {
          id: String(m.id),
          competition: m.tournament?.name || 'Other Competitions',
          status,
          minute: m.status?.description ? parseInt(m.status.description.replace(/\D/g, '')) || 0 : 0,
          time: status === 'FINISHED' ? 'FT' : (m.status?.description || 'LIVE'),
          date: new Date(m.startTimestamp * 1000).toISOString(),
          homeScore: m.homeScore?.current ?? 0,
          awayScore: m.awayScore?.current ?? 0,
          homeTeam: { id: `t_${m.homeTeam?.id}`, name: m.homeTeam?.name || 'Home', code: (m.homeTeam?.name || 'HOM').substring(0, 3).toUpperCase(), logo: '⚽' },
          awayTeam: { id: `t_${m.awayTeam?.id}`, name: m.awayTeam?.name || 'Away', code: (m.awayTeam?.name || 'AWY').substring(0, 3).toUpperCase(), logo: '⚽' },
          stats: { possession: { home: 50, away: 50 }, shots: { home: 0, away: 0 }, shotsOnTarget: { home: 0, away: 0 }, fouls: { home: 0, away: 0 }, yellowCards: { home: 0, away: 0 }, redCards: { home: 0, away: 0 }, corners: { home: 0, away: 0 } },
          events: [],
          h2h: { matchesPlayed: 0, homeWins: 0, awayWins: 0, draws: 0, lastResults: [] }
        };
      });

      // If there are no live matches, show our fallback match so the UI doesn't look empty.
      const finalMatches = formattedLiveMatches.length > 0 ? formattedLiveMatches : minorLeagueFallback;

      matchCache = { data: finalMatches, timestamp: now };
      await setCache(redisKey, matchCache.data, Math.ceil(LIVE_CACHE_DURATION / 1000));
      
      checkGoalsAndNotify(finalMatches);

      if (!responseSent) {
        res.status(200).set(corsHeaders).json({ matches: finalMatches, cached: false });
        responseSent = true;
      }
    } catch (error: any) {
      console.error("Live Fetch Error:", error.message);
      if (!responseSent) {
        res.status(200).set(corsHeaders).json({ matches: matchCache?.data || [], cached: true, warning: true });
        responseSent = true;
      }
    } finally {
      inFlightLiveFetch = null;
    }
  };

  inFlightLiveFetch = performFetch();
  return inFlightLiveFetch;

  // 👇 The old manual fallback block has been removed, RapidAPI runs the show now.
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

app.get('/api/upcoming-matches', checkMaintenance, async (_req, res) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
    };
    if (!process.env.DB_URL) {
        return res.status(200).set(corsHeaders).json({ matches: [], warning: 'DB not configured' });
    }
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT * FROM world_cup_matches 
                 WHERE match_date >= NOW() 
                 ORDER BY match_date ASC 
                 LIMIT 20`
        );
        client.release();

        const matches = result.rows.map(row => transformMatchRow(row, 'UPCOMING'));
        res.status(200).set(corsHeaders).json({
            matches,
            count: result.rows.length
        });
    } catch (error: any) {
        console.error('Upcoming matches error:', error.message);
        res.status(200).set(corsHeaders).json({
            matches: [],
            warning: 'Could not fetch upcoming matches'
        });
    }
});

app.get('/api/completed-matches', checkMaintenance, async (_req, res) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600'
    };
    if (!process.env.DB_URL) {
        return res.status(200).set(corsHeaders).json({ matches: [], warning: 'DB not configured' });
    }
    try {
        const client = await pool.connect();
        const result = await client.query(
            `SELECT * FROM world_cup_matches 
                 WHERE db_status = 'FINISHED' 
                 ORDER BY match_date DESC 
                 LIMIT 20`
        );
        client.release();

        const matches = await Promise.all(result.rows.map(async (row) => {
            const transformed = transformMatchRow(row, 'FINISHED');
            if (!transformed.youtubeHighlightId && process.env.YOUTUBE_API_KEY) {
                const ytId = await fetchAndSaveHighlight(row.id, transformed.homeTeam.name, transformed.awayTeam.name);
                if (ytId) transformed.youtubeHighlightId = ytId;
            }
            return transformed;
        }));

        res.status(200).set(corsHeaders).json({
            matches,
            count: result.rows.length
        });
    } catch (error: any) {
        console.error('Completed matches error:', error.message);
        res.status(200).set(corsHeaders).json({
            matches: [],
            warning: 'Could not fetch completed matches'
        });
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

app.get('/api/poll', checkMaintenance, async (_req, res) => {
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

// ---  DAILY TRIVIA QUIZ ENDPOINT ---
app.get('/api/trivia', checkMaintenance, (_req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);

  const quizBank = [
    [ // Set 1
      { q: "Which country has won the most FIFA World Cups?", options: ["Brazil", "Germany", "Italy", "Argentina"], a: "Brazil", exp: "Brazil has won the World Cup 5 times (1958, 1962, 1970, 1994, 2002)." },
      { q: "Who is the all-time top scorer in World Cup history?", options: ["Pele", "Miroslav Klose", "Ronaldo", "Messi"], a: "Miroslav Klose", exp: "Germany's Miroslav Klose scored 16 goals across 4 World Cup tournaments." },
      { q: "Which nation will host the 2026 World Cup Final?", options: ["USA", "Canada", "Mexico", "Brazil"], a: "USA", exp: "The 2026 Final will be held at MetLife Stadium in New Jersey, USA." }
    ],
    [ // Set 2
      { q: "Who won the Golden Boot at the 2022 World Cup?", options: ["Lionel Messi", "Kylian Mbappe", "Julian Alvarez", "Olivier Giroud"], a: "Kylian Mbappe", exp: "Mbappe won the Golden Boot with 8 goals, including a hat-trick in the final." },
      { q: "Which of these countries has NEVER won a World Cup?", options: ["Spain", "England", "Netherlands", "Uruguay"], a: "Netherlands", exp: "The Netherlands have reached the final 3 times but never won the tournament." },
      { q: "How many teams will compete in the 2026 World Cup?", options: ["32", "40", "48", "64"], a: "48", exp: "2026 marks the first time the tournament expands from 32 to 48 teams." }
    ],
    [ // Set 3
      { q: "Who is the youngest player to score in a World Cup?", options: ["Pele", "Kylian Mbappe", "Michael Owen", "Lionel Messi"], a: "Pele", exp: "Pele scored his first World Cup goal in 1958 at just 17 years and 239 days old." },
      { q: "Which host country won the World Cup on home soil in 1998?", options: ["Italy", "France", "Brazil", "Germany"], a: "France", exp: "France won their first World Cup in 1998 by defeating Brazil 3-0 in Paris." },
      { q: "What is the official name of the World Cup trophy introduced in 1974?", options: ["Jules Rimet Trophy", "FIFA World Cup Trophy", "Global Cup", "Champion's Gold"], a: "FIFA World Cup Trophy", exp: "It replaced the Jules Rimet Trophy, which was permanently given to Brazil in 1970." }
    ]
  ];

  const todaysQuiz = quizBank[dayOfYear % quizBank.length];

  res.status(200).set(corsHeaders).json({ 
    date: new Date().toISOString().split('T')[0], 
    questions: todaysQuiz 
  });
});

let predictionCache: { [matchId: string]: { data: any; timestamp: number; scoreHash: string } } = {};
const PREDICT_CACHE_DURATION = 3 * 60 * 1000;

app.options('/api/predict', (req, res) => {
  const corsHeaders = { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  res.status(204).set(corsHeaders).end();
});

app.post('/api/predict', checkMaintenance, async (req, res) => {
  const corsHeaders = { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  try {
    const { match } = req.body;
    if (!match || !match.id) return res.status(400).set(corsHeaders).json({ error: "Invalid match payload." });

    const matchId = String(match.id);
    const currentScoreHash = `${match.homeScore ?? 0}-${match.awayScore ?? 0}`;
    const now = Date.now();

    if (predictionCache[matchId] && (now - predictionCache[matchId].timestamp < 3 * 60 * 1000) && predictionCache[matchId].scoreHash === currentScoreHash) {
      return res.status(200).set(corsHeaders).json({ prediction: predictionCache[matchId].data, cached: true });
    }

    const homeTeam = typeof match.homeTeam === 'object' ? match.homeTeam.name : match.homeTeam;
    const awayTeam = typeof match.awayTeam === 'object' ? match.awayTeam.name : match.awayTeam;

    const prompt = `Analyze the football match between ${homeTeam} and ${awayTeam}. Current Status: ${match.status || 'Upcoming'}, Current Score: ${homeTeam} ${match.homeScore ?? 0} - ${awayTeam} ${match.awayScore ?? 0}.
Return ONLY valid JSON (no markdown):
{
  "analysis": "3-4 sentence tactical analysis.",
  "vulnerabilities": { "home": "1 sentence.", "away": "1 sentence." },
  "keyMatchups": [ { "battle": "Name", "impact": "High", "detail": "1 sentence." } ],
  "winProbability": { "home": 45, "draw": 25, "away": 30 },
  "suggestedScore": "2-1",
  "advisor": { "captain": "Player", "viceCaptain": "Player", "bestXI": [ { "name": "Player 1", "team": "${homeTeam}", "rating": "8.5", "reason": "Good form." } ] }
}`;

    // Rotation list: Use models that are active in your project
    const modelsToTry = ["gemini-2.5-flash", "gemini-3.1-flash-lite"];
    const geminiClients = getGeminiClients();
    let lastError: any = null;

    // Rotate through both keys and models
    for (const aiClient of geminiClients) {
      for (const modelName of modelsToTry) {
        try {
          const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { temperature: 0.7, responseMimeType: "application/json" }
          });

          let cleanedJsonStr = (response.text || "").trim();
          if (cleanedJsonStr.startsWith('```json')) cleanedJsonStr = cleanedJsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
          else if (cleanedJsonStr.startsWith('```')) cleanedJsonStr = cleanedJsonStr.replace(/^```\n/, '').replace(/\n```$/, '');

          const predictionData = JSON.parse(cleanedJsonStr);
          predictionCache[matchId] = { data: predictionData, timestamp: now, scoreHash: currentScoreHash };

          return res.status(200).set(corsHeaders).json({ prediction: predictionData, cached: false });
        } catch (e: any) {
          console.warn(`Gemini API call failed with model ${modelName}. Trying next... Error: ${e.message}`);
          lastError = e;
        }
      }
    }
    throw lastError || new Error("All Gemini API keys and models failed.");

  } catch (error: any) {
    console.error('Gemini Analysis Interrupted', error.message);
    res.status(500).set(corsHeaders).json({ error: 'Gemini Analysis Interrupted', details: error.message });
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
      headers: {
        'apns-priority': '10', // 10 for immediate, 5 for power-saving
        'apns-push-type': 'alert',
      },
      payload: {
        aps: {
          sound: 'default',
          'interruption-level': 'time-sensitive', // For iOS 15+, makes it a high-priority notification.
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
            const prevScores = prevScoreHash.split('-');
            const prevHome = parseInt(prevScores[0]);
            const prevAway = parseInt(prevScores[1]);

            let goalMessage = '';
            let scoringTeamName = '';

            if (match.homeScore > prevHome) {
                goalMessage = `⚽ GOAL! ${match.homeTeam.name} scores!`;
                scoringTeamName = match.homeTeam.name;
            } else if (match.awayScore > prevAway) {
                goalMessage = `⚽ GOAL! ${match.awayTeam.name} scores!`;
                scoringTeamName = match.awayTeam.name;
            } else {
                goalMessage = `⚽ SCORE UPDATE!`;
            }

            const fullMessage = `${match.homeTeam.name} ${match.homeScore} - ${match.awayScore} ${match.awayTeam.name}`;

            // 1. Send specific alert to users following the HOME team
            if (match.homeTeam.code) {
                sendFirebaseTopicNotification(`team_${match.homeTeam.code}`, goalMessage, fullMessage);
            }

            // 2. Send specific alert to users following the AWAY team
            if (match.awayTeam.code) {
                sendFirebaseTopicNotification(`team_${match.awayTeam.code}`, goalMessage, fullMessage);
            }

            // 3. SPAM CONTROL: Only send to 'global_goal_alerts' if it's a massive competition
            // We filter out minor leagues so users don't get spammed.
            const premiumCompetitions = ['FIFA World Cup 2026', 'UEFA Champions League', 'Premier League', 'LaLiga'];
            const isPremiumMatch = premiumCompetitions.some(comp => match.competition.includes(comp));

            if (isPremiumMatch) {
                sendFirebaseTopicNotification('global_goal_alerts', goalMessage, fullMessage);
            }
        }
        previousScoresCache[matchId] = currentScoreHash;
    }
  });
};

// --- 🧠 DAILY ENGAGEMENT NOTIFICATION LOGIC ---
// Zomato-style clever, varied notifications to drive app opens

const ENGAGEMENT_MESSAGES = [
  {
    title: "🔮 AI Predictions are Ready!",
    body: "Our Neural Engine has just calculated the odds for tonight's biggest matches. Tap to see the hidden tactical advantages.",
  },
  {
    title: "🧠 Test Your Football IQ",
    body: "Think you know the beautiful game? Today's Trivia Quiz is live. Can you score a perfect 5/5?",
  },
  {
    title: "🎯 Fantasy Advisor Alert",
    body: "Struggling to pick a captain? Our AI has analyzed 10,000+ data points to find today's hidden gem.",
  },
  {
    title: "🔥 High-Stakes Match Tonight",
    body: "The tension is building. Dive into our live matrix overview before kickoff to see where the game will be won.",
  },
  {
    title: "📊 Form Analytics Updated",
    body: "We've just crunched the numbers from the latest fixtures. See which teams are peaking at the right moment.",
  },
  {
    title: "⚔️ Key Pitch Battles",
    body: "Midfield masterclass or defensive disaster? See our AI's breakdown of where today's matches will be decided.",
  }
];

// This endpoint can be hit (e.g., via a CRON job or manually) to trigger an engagement push
app.get('/api/daily-engage', checkMaintenance, async (_req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  
  try {
    // 1. Pick a random clever message
    const randomMsg = ENGAGEMENT_MESSAGES[Math.floor(Math.random() * ENGAGEMENT_MESSAGES.length)];

    // 2. Send it to the default 'global_goal_alerts' topic. 
    // Since users are subscribed to this by default (for major match goals), 
    // they will receive these engagement pushes even if they haven't explicitly followed a team.
    await sendFirebaseTopicNotification(
      'global_goal_alerts', 
      randomMsg.title, 
      randomMsg.body
    );

    res.status(200).set(corsHeaders).json({ 
      success: true, 
      message_sent: randomMsg 
    });
  } catch (error) {
    console.error("Failed to send engagement push:", error);
    res.status(500).set(corsHeaders).json({ error: "Failed to send engagement push." });
  }
});

// --- 🚀 FUTURE UPDATE ANNOUNCEMENT ROUTE ---
// Use this manually when you deploy a massive new feature
app.post('/api/announce-update', checkAdminPassword, async (req, res) => {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };
  try {
    const { title, body } = req.body;
    
    if (!title || !body) {
      return res.status(400).set(corsHeaders).json({ error: "Title and body are required." });
    }

    await sendFirebaseTopicNotification('global_goal_alerts', `🌟 UPDATE: ${title}`, body);

    res.status(200).set(corsHeaders).json({ success: true, message: "Update announcement sent!" });
  } catch (error) {
    console.error("Failed to send update announcement:", error);
    res.status(500).set(corsHeaders).json({ error: "Failed to send announcement." });
  }
});

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
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(`User-agent: *\nAllow: /\nSitemap: https://e2match.vercel.app/sitemap.xml\n`);
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

  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://e2match.vercel.app${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="https://e2match.vercel.app/og-image.png">
  <meta property="og:site_name" content="E2Match.ai">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="https://e2match.vercel.app/og-image.png">

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
</body>
</html>`;
}

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
        <span class="badge">⚽ FIFA WORLD Cup 2026 — ${match.group}</span>
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
      `${home} vs ${away} prediction, football football prediction, ai prediction football`,
      body,
      `/predictions/${slug}`
    ));
  }
});

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