import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.json());
const PORT = 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error('GEMINI_API_KEY is missing.');
  }
  return new GoogleGenAI({ apiKey });
}

let matchCache: { data: any; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000;

app.get('/api/live-matches', async (req, res) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (matchCache && (Date.now() - matchCache.timestamp < CACHE_DURATION)) {
    return res.status(200).set(corsHeaders).json({ matches: matchCache.data, cached: true });
  }

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
    
    // Filter only football matches
    const footballEvents = liveEvents.filter((event: any) => 
        event.tournament?.category?.sport?.name?.toLowerCase() === 'football' || 
        event.sport?.name?.toLowerCase() === 'football' ||
        event.homeScore !== undefined 
    );

    // ✅ THE FIX: If 0 live matches, return strictly EMPTY array. No fake data.
    if (footballEvents.length === 0) {
      matchCache = { data: [], timestamp: Date.now() };
      return res.status(200).set(corsHeaders).json({ matches: [], cached: false, note: "Zero live matches." });
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
    console.warn("API Error:", error.message);
    res.status(200).set(corsHeaders).json({ matches: [], cached: false, warning: true });
  }
});

// 1. Initialize an independent prediction cache store
let predictionCache: {
  [matchId: string]: {
    data: any;
    timestamp: number;
    scoreHash: string
  }
} = {};

// 3 minutes is the optimal balance for static live periods
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

    // 2. Evaluate Context-Aware Cache Condition
    if (
      predictionCache[matchId] &&
      (now - predictionCache[matchId].timestamp < PREDICT_CACHE_DURATION) &&
      predictionCache[matchId].scoreHash === currentScoreHash
    ) {
      console.log(`[Cache Hit] Serving stored tactical analysis for match: ${matchId}`);
      return res.json({ prediction: predictionCache[matchId].data, cached: true });
    }

    console.log(`[Cache Miss/Invalidated] Fetching fresh analysis from Gemini 3.5 Flash for match: ${matchId}`);
    const ai = getGeminiClient();

    // Determine the match context
    const isEarlyGame = (match.minute ?? 0) < 30;
    const isLateGame = (match.minute ?? 0) > 75;
    const isDraw = (match.homeScore ?? 0) === (match.awayScore ?? 0);
    const scoreDiff = Math.abs((match.homeScore ?? 0) - (match.awayScore ?? 0));
    const isBlowout = scoreDiff >= 3;

    let tacticalContext = "";
    if (isEarlyGame) tacticalContext = "Focus on early tactical setups, formations, and how the teams are trying to establish control.";
    else if (isLateGame && isDraw) tacticalContext = "Focus on the desperation of a late draw, potential game-winning substitutions, fatigue, and end-to-end transitional threats.";
    else if (isLateGame && !isDraw && !isBlowout) tacticalContext = "Focus on the leading team's defensive structure ('parking the bus') versus the trailing team's attacking overload.";
    else if (isBlowout) tacticalContext = "Focus on game management for the leading team and damage limitation/pride for the trailing team.";
    else tacticalContext = "Focus on the ongoing midfield battle, structural adjustments, and key individual matchups.";

    const prompt = `You are a world-class football tactical analyst for a premium sports intelligence platform. Analyze this current match:
    Competition: ${match.competition}
    Home Team: ${match.homeTeam.name} (Current Score: ${match.homeScore ?? 0})
    Away Team: ${match.awayTeam.name} (Current Score: ${match.awayScore ?? 0})
    Match Status: ${match.status} (Minute: ${match.minute ?? 'N/A'})

    Critical Instruction: ${tacticalContext}

    Generate a highly realistic win probability split (adding up to 100%), a projected final scoreline, a sharp tactical evaluation (max 3 sentences), and a fantasy roster recommendation (the 3 best players on the pitch right now).
    
    Respond STRICTLY with a valid JSON object matching this exact schema:
    {
      "winProbability": { "home": 50, "draw": 25, "away": 25 },
      "suggestedScore": "2-1",
      "analysis": "Detailed tactical analysis paragraph goes here.",
      "advisor": {
        "captain": "Name of best player",
        "viceCaptain": "Name of second best player",
        "bestXI": [
          {"name": "Player 1", "team": "${match.homeTeam.name}", "rating": 8.9, "reason": "Reasoning (max 1 sentence)"},
          {"name": "Player 2", "team": "${match.awayTeam.name}", "rating": 8.4, "reason": "Reasoning (max 1 sentence)"},
          {"name": "Player 3", "team": "Either Team", "rating": 8.1, "reason": "Reasoning (max 1 sentence)"}
        ]
      }
    }`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsedData = JSON.parse(response.text || '{}');

    // 3. Store in cache alongside the current score state parameters
    predictionCache[matchId] = {
      data: parsedData,
      timestamp: now,
      scoreHash: currentScoreHash
    };

    res.json({ prediction: parsedData, cached: false });
  } catch (error: any) {
    console.error("Gemini Error:", error.message);

    // Fallback gracefully to prevent total application failure
    res.status(500).json({
      error: 'Gemini Analysis Interrupted',
      details: error.message
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on port ${PORT}`));
}

startServer();