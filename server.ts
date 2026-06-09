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
  connectionTimeoutMillis: 2000,
});

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error('GEMINI_API_KEY is missing.');
  }
  return new GoogleGenAI({ apiKey });
}

let matchCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

// ✅ FIX 1: homeTeam/awayTeam now return full objects, not plain strings
// This fixes "data not visible" — frontend expects match.homeTeam.name
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dynamicMatches = result.rows.map(row => {
      const matchDate = new Date(row.match_date);
      matchDate.setHours(0, 0, 0, 0);

      let status = 'UPCOMING';
      if (matchDate.getTime() === today.getTime()) {
        status = 'LIVE';
      } else if (matchDate.getTime() < today.getTime()) {
        status = 'FT';
      }

      // ✅ CRITICAL FIX: Return full team objects so frontend can access
      // match.homeTeam.name, match.homeTeam.logo, match.homeTeam.code
      const homeTeamName = typeof row.home_team === 'string' ? row.home_team : row.home_team?.name || 'Home';
      const awayTeamName = typeof row.away_team === 'string' ? row.away_team : row.away_team?.name || 'Away';

      return {
        id: row.id,
        competition: row.competition || 'FIFA World Cup 2026',
        status,
        minute: status === 'LIVE' ? 45 : undefined,
        time: status === 'FT' ? 'FT' : (status === 'LIVE' ? 'LIVE' : row.match_time),
        date: matchDate.toISOString().split('T')[0],
        // ✅ Full team objects — fixes blank data on frontend
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
      };
    });

    res.status(200).set(corsHeaders).json({ matches: dynamicMatches });
  } catch (error: any) {
    console.error('Database Error:', error.message);
    res.status(500).set(corsHeaders).json({ error: 'Failed to fetch matches from DB' });
  }
});

app.get('/api/live-matches', async (_req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (matchCache && (Date.now() - matchCache.timestamp < CACHE_DURATION)) {
    return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true });
  }

  const minorLeagueFallback = [
    {
      id: 'live-minor-1',
      competition: 'LaLiga 2, Promotion Playoffs',
      status: 'LIVE',
      minute: 82,
      time: 'LIVE',
      date: new Date().toISOString().split('T')[0],
      homeScore: 1,
      awayScore: 1,
      homeTeam: { id: 'cas', name: 'Castellón', code: 'CAS', logo: '🛡️', form: ['D', 'W', 'W'] },
      awayTeam: { id: 'alm', name: 'Almería', code: 'ALM', logo: '⚔️', form: ['D', 'L', 'W'] }
    }
  ];

  const sofaUrl = 'https://sofascore6.p.rapidapi.com/api/sofascore/v1/events/live';
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
    const liveEvents = rawData.events || rawData.data || [];

    const footballEvents = liveEvents.filter((event: any) =>
      event.tournament?.category?.sport?.name?.toLowerCase() === 'football' ||
      event.sport?.name?.toLowerCase() === 'football' ||
      event.homeScore !== undefined
    );

    if (footballEvents.length === 0) {
      matchCache = { data: minorLeagueFallback, timestamp: Date.now() };
      return res.status(200).set(corsHeaders).json({ matches: minorLeagueFallback, cached: false });
    }

    const processedMatches = footballEvents.slice(0, 5).map((event: any) => {
      const minuteStr = event.status?.description || "45";
      const parsedMinute = parseInt(minuteStr.replace(/\D/g, '')) || 45;

      return {
        id: String(event.id),
        competition: event.tournament?.name || 'Global Football',
        status: 'LIVE',
        minute: parsedMinute,
        time: 'LIVE',
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
        }
      };
    });

    matchCache = { data: processedMatches, timestamp: Date.now() };
    res.status(200).set(corsHeaders).json({ matches: processedMatches, cached: false });
  } catch (error: any) {
    res.status(200).set(corsHeaders).json({
      matches: minorLeagueFallback,
      cached: false,
      warning: true
    });
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

    const ai = getGeminiClient();
    const isEarlyGame = (match.minute ?? 0) < 30;
    const isLateGame = (match.minute ?? 0) > 75;
    const isDraw = (match.homeScore ?? 0) === (match.awayScore ?? 0);

    const tacticalContext = isEarlyGame
      ? "Analyze early setups."
      : (isLateGame && isDraw
        ? "Analyze desperation phase for a late winner."
        : "Analyze current game state and defense.");

    const prompt = `You are a premium football tactical analyst. Analyze this match: ${match.homeTeam.name} (${match.homeScore}) vs ${match.awayTeam.name} (${match.awayScore}). Context: ${tacticalContext}. Respond strictly in this JSON format: {"winProbability": {"home": 50, "draw": 25, "away": 25}, "suggestedScore": "2-1", "analysis": "2 sentences.", "vulnerabilities": {"home": "weakness", "away": "weakness"}, "keyMatchups": [{"battle": "P1 vs P2", "impact": "Crucial", "detail": "why"}], "advisor": {"captain": "Name", "viceCaptain": "Name", "bestXI": [{"name": "P1", "team": "${match.homeTeam.name}", "rating": 8.9, "reason": "why"}]}}`;

    // ✅ FIX: Correct Gemini model names
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let parsedData = null;

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        parsedData = JSON.parse(response.text || '{}');
        break;
      } catch (err) {
        continue;
      }
    }

    if (!parsedData) throw new Error("All Gemini models exhausted.");

    predictionCache[matchId] = { data: parsedData, timestamp: now, scoreHash: currentScoreHash };
    res.json({ prediction: parsedData, cached: false });
  } catch (error: any) {
    res.status(500).json({ error: 'Gemini Analysis Interrupted', details: error.message });
  }
});

// ✅ FIX: Pure Express Server (No Vite/Rollup imports to prevent Vercel crashes)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Server running on port ${PORT}`);
  });
}

// Vercel Serverless Export
export default app;
module.exports = app;