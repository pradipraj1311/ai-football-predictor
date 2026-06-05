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
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
    throw new Error('GEMINI_API_KEY is not configured in environment variables.');
  }
  return new GoogleGenAI({ apiKey });
}

app.post('/api/predict', async (req, res) => {
  try {
    const { match } = req.body;
    if (!match) {
      res.status(400).json({ error: 'Match data is required.' });
      return;
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch {
      res.json({
        isMock: true,
        prediction: {
          matchId: match.id,
          winProbability: { home: 45, draw: 30, away: 25 },
          suggestedScore: "2-1",
          analysis: "Configure your GEMINI_API_KEY as a secret to activate state-of-the-art predictive intelligence.",
          keyMatchups: ["Tactical battle across default layouts"],
          tacticalInsight: "This is a simulated analytics frame preview."
        }
      });
      return;
    }

    const prompt = `Classify tactical battles for this tournament match:
    Home: ${match.homeTeam.name}, Away: ${match.awayTeam.name}. Status: ${match.status}.
    Provide realistic outcome prediction percentage odds, a suggested score, and tactical insight in exact JSON format.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['winProbability', 'suggestedScore', 'analysis', 'keyMatchups', 'tacticalInsight'],
          properties: {
            winProbability: {
              type: Type.OBJECT,
              required: ['home', 'draw', 'away'],
              properties: {
                home: { type: Type.INTEGER },
                draw: { type: Type.INTEGER },
                away: { type: Type.INTEGER },
              }
            },
            suggestedScore: { type: Type.STRING },
            analysis: { type: Type.STRING },
            keyMatchups: { type: Type.ARRAY, items: { type: Type.STRING } },
            tacticalInsight: { type: Type.STRING }
          }
        }
      }
    });

    const prediction = JSON.parse(response.text || '{}');
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || 'Web Context',
      uri: chunk.web?.uri || '#'
    })).filter((src: any) => src.uri !== '#').slice(0, 4);

    res.json({ isMock: false, prediction, sources });
  } catch (error: any) {
    res.status(500).json({ error: 'Failure', details: error.message });
  }
});

app.post('/api/fantasy-advisor', async (req, res) => {
  try {
    const { match } = req.body;
    let ai;
    try {
      ai = getGeminiClient();
    } catch {
      res.json({
        isMock: true,
        advisor: {
          bestXI: [{ name: "Star Forward", position: "FWD", team: match.homeTeam.name, role: "Target Man", rating: 9.2, reason: "Excellent form." }],
          captain: "Star Forward",
          viceCaptain: "Solid Mid"
        }
      });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `Propose best fantasy squad of 4 composite starters from ${match.homeTeam.name} and ${match.awayTeam.name}.`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['bestXI', 'captain', 'viceCaptain'],
          properties: {
            bestXI: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['name', 'position', 'team', 'role', 'rating', 'reason'],
                properties: {
                  name: { type: Type.STRING },
                  position: { type: Type.STRING },
                  team: { type: Type.STRING },
                  role: { type: Type.STRING },
                  rating: { type: Type.NUMBER },
                  reason: { type: Type.STRING }
                }
              }
            },
            captain: { type: Type.STRING },
            viceCaptain: { type: Type.STRING }
          }
        }
      }
    });

    res.json({ isMock: false, advisor: JSON.parse(response.text || '{}') });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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