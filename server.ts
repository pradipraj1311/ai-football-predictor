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

  // GLOBAL TOURNAMENTS: Premier League, Champions League, La Liga
  const globalMatches = [
    {
      id: 'live-1', competition: 'UEFA Champions League', status: 'LIVE', minute: 72, time: '20:00', date: '2026-06-06',
      homeScore: 2, awayScore: 2, homeTeam: { id: 'rma', name: 'Real Madrid', code: 'RMA', logo: '👑', form: ['W', 'W', 'D'] },
      awayTeam: { id: 'mci', name: 'Manchester City', code: 'MCI', logo: '🔵', form: ['W', 'W', 'W'] }
    },
    {
      id: 'live-2', competition: 'Premier League', status: 'LIVE', minute: 18, time: '15:00', date: '2026-06-06',
      homeScore: 1, awayScore: 0, homeTeam: { id: 'ars', name: 'Arsenal', code: 'ARS', logo: '🔴', form: ['W', 'D', 'W'] },
      awayTeam: { id: 'liv', name: 'Liverpool', code: 'LIV', logo: '🦅', form: ['L', 'W', 'W'] }
    },
    {
      id: 'live-3', competition: 'La Liga', status: 'UPCOMING', time: '21:00', date: '2026-06-06',
      homeTeam: { id: 'bar', name: 'Barcelona', code: 'BAR', logo: '🔵', form: ['W', 'W', 'W'] },
      awayTeam: { id: 'atm', name: 'Atletico Madrid', code: 'ATM', logo: '⚪', form: ['D', 'W', 'L'] }
    }
  ];

  // For testing, we will bypass the /general/sports endpoint and feed the global matches directly 
  // until we map the exact live /events endpoint from SofaScore.
  matchCache = { data: globalMatches, timestamp: Date.now() };
  res.status(200).set(corsHeaders).json({ matches: globalMatches, cached: false });
});

app.post('/api/predict', async (req, res) => {
  try {
    const { match } = req.body;
    const ai = getGeminiClient();

    const prompt = `You are an elite football tactical analyst. Analyze this current match context:
    Competition: ${match.competition}
    Home Team: ${match.homeTeam.name} (Current Score: ${match.homeScore ?? 0})
    Away Team: ${match.awayTeam.name} (Current Score: ${match.awayScore ?? 0})
    Match Status: ${match.status} (Minute: ${match.minute ?? 'N/A'})

    Generate a highly realistic win probability split adding up to 100%, a projected final scoreline string, a sharp tactical evaluation, and a best 4-player fantasy roster recommendation from these teams.
    Respond strictly with a valid JSON object matching this schema structure:
    {
      "winProbability": { "home": 50, "draw": 25, "away": 25 },
      "suggestedScore": "2-1",
      "analysis": "Detailed tactical analysis paragraph goes here.",
      "advisor": {
        "captain": "Name of best player",
        "viceCaptain": "Name of second best player",
        "bestXI": [
          {"name": "Player 1", "team": "${match.homeTeam.name}", "rating": 8.9, "reason": "Reasoning"},
          {"name": "Player 2", "team": "${match.awayTeam.name}", "rating": 8.4, "reason": "Reasoning"}
        ]
      }
    }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsedData = JSON.parse(response.text || '{}');
    res.json({ prediction: parsedData });
  } catch (error: any) {
    // Return a safe error structure so the frontend doesn't crash
    console.error("Gemini Error:", error.message);
    res.status(500).json({ 
      error: 'Gemini Analysis Failed', 
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