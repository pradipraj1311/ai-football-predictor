import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache.js';
import { setupMatchRoutes } from './src/routes/matchRoutes.js';
import { setupAdminRoutes } from './src/routes/adminRoutes.js';
import { setupLiveRoutes } from './src/routes/liveRoutes.js';

dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

// ============= DATABASE SETUP =============
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

// ============= MIDDLEWARE =============
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

app.use(checkMaintenance);

// ============= UTILITY FUNCTIONS =============
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
                if (err?.code === '42703') {
                    console.warn('YouTube column missing in DB');
                } else {
                    console.error('Failed to save YouTube ID to DB:', err?.message || err);
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

// ============= ROUTE SETUP =============
setupMatchRoutes(app, pool, fetchAndSaveHighlight);
setupAdminRoutes(app);
setupLiveRoutes(app, pool);

// ============= FALLBACK ROUTES =============
app.get('/api/status', async (_req, res) => {
    try {
        const maintenance = await getCache('maintenance_mode');
        res.json({
            status: 'operational',
            maintenance: maintenance === true,
            timestamp: new Date().toISOString(),
            redis: hasRedis(),
            database: !!dbUrl
        });
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ============= ROOT ROUTE =============
app.get('/', (_req, res) => {
    res.json({
        name: 'AI Football Predictor API',
        version: '2.0.0',
        endpoints: {
            matches: '/api/db-matches',
            liveMatches: '/api/live-matches',
            predictions: '/api/predictions',
            teamStats: '/api/team-stats/:teamId',
            search: '/api/search',
            upcomingMatches: '/api/upcoming-matches',
            completedMatches: '/api/completed-matches',
            matchEvents: '/api/match/:matchId/events',
            health: '/api/health',
            status: '/api/status'
        },
        admin: {
            maintenanceStatus: '/api/maintenance/status',
            enableMaintenance: '/api/maintenance/enable',
            disableMaintenance: '/api/maintenance/disable'
        }
    });
});

// ============= ERROR HANDLING =============
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found', path: _req.path });
});

// ============= SERVER START =============
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  AI Football Predictor API Server     ║
║  Running on port ${PORT}                ║
║  Status: OPERATIONAL ✅                 ║
║  Redis: ${hasRedis() ? 'CONNECTED ✅' : 'DISCONNECTED ⚠️'}  ║
║  Database: ${dbUrl ? 'CONFIGURED ✅' : 'MISSING ⚠️'}  ║
╚════════════════════════════════════════╝
  `);
});

export default app;
