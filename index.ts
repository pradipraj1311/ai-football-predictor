import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { getCache, setCache, hasRedis } from './redisCache.js';
import { setupMatchRoutes } from './src/routes/matchRoutes.js';
import { sendFirebaseTopicNotification } from './src/utils/firebaseAdmin.js';
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

// ============= TEST & DEBUG ROUTES =============
// This route was in the old server.ts file. It's added here to align with the new structure.
app.get('/api/test-noti', async (_req, res) => {
    try {
        await sendFirebaseTopicNotification(
            'global_goal_alerts',
            '🚀 VERCEL TEST (New Structure)!',
            'This is a High-Priority notification from your new API structure!'
        );
        res.status(200).send('<h1>Notification Fired from index.ts! Check your device.</h1>');
    } catch (error) {
        res.status(500).send('Error firing notification');
    }
});

// ============= SEO & SITEMAP ROUTES =============
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

app.get('/sitemap.xml', (_req, res) => {
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
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
        `<url><loc>${baseUrl}${url}</loc><lastmod>${today}</lastmod></url>`
    ).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlset}</urlset>`;
    res.status(200).send(xml);
});

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
