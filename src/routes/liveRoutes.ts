import express from 'express';
import type { Express } from 'express';
import { Pool } from 'pg';
import { transformMatchRow } from '../utils/matchTransform.js';
import { getCache, setCache } from '../../redisCache.js';

export function setupLiveRoutes(app: Express, pool: Pool) {
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
    };

    // Get live matches
    app.get('/api/live-matches', async (_req, res) => {
        const redisKey = 'live-matches:v1';
        const LIVE_CACHE_DURATION = 60 * 1000;

        try {
            const cached = await getCache(redisKey);
            if (cached && cached.timestamp) {
                const age = Date.now() - cached.timestamp;
                if (age < LIVE_CACHE_DURATION) {
                    return res.status(200).set(CORS_HEADERS).json({
                        matches: cached.data,
                        cached: true,
                        source: 'redis',
                        age
                    });
                }
            }
        } catch (e) {
            console.warn('Redis cache read failed:', e);
        }

        // Fallback: Return demo live matches
        const demoLive = [{
            id: 'demo-live-1',
            competition: 'FIFA World Cup 2026',
            dbStatus: 'LIVE',
            time: 'LIVE',
            minute: 45,
            date: new Date().toISOString().split('T')[0],
            youtubeHighlightId: null,
            homeTeam: {
                id: 'argentina',
                name: 'Argentina',
                code: 'ARG',
                logo: '🇦🇷',
                form: ['W', 'W', 'D', 'W', 'W']
            },
            awayTeam: {
                id: 'france',
                name: 'France',
                code: 'FRA',
                logo: '🇫🇷',
                form: ['W', 'D', 'W', 'W', 'D']
            },
            homeScore: 1,
            awayScore: 0,
            stats: {
                possession: { home: 55, away: 45 },
                shots: { home: 8, away: 4 },
                shotsOnTarget: { home: 3, away: 1 },
                fouls: { home: 5, away: 7 },
                yellowCards: { home: 1, away: 0 },
                redCards: { home: 0, away: 0 },
                corners: { home: 3, away: 1 }
            },
            events: [
                { minute: 12, type: 'goal' as const, team: 'home' as const, player: 'Lionel Messi', description: 'Goal! Argentina scores' }
            ],
            h2h: { matchesPlayed: 6, homeWins: 2, awayWins: 2, draws: 2, lastResults: ['D', 'W', 'W', 'L', 'L'] }
        }];

        res.status(200).set(CORS_HEADERS).json({
            matches: demoLive,
            cached: false,
            source: 'fallback'
        });
    });

    // Get match timeline/events
    app.get('/api/match/:matchId/events', async (req, res) => {
        const { matchId } = req.params;
        const cacheKey = `match-events:${matchId}`;

        try {
            const cached = await getCache(cacheKey);
            if (cached) {
                return res.status(200).set(CORS_HEADERS).json(cached);
            }
        } catch (e) {
            console.warn('Cache read failed:', e);
        }

        // Demo events
        const events = [
            { minute: 12, type: 'goal', team: 'home', player: 'Messi', description: 'Goal' },
            { minute: 34, type: 'card', team: 'away', player: 'Griezmann', description: 'Yellow card' },
            { minute: 45, type: 'substitution', team: 'home', player: 'Di Maria', description: 'Substitution' }
        ];

        try {
            await setCache(cacheKey, events, 300);
        } catch (e) {
            console.warn('Cache write failed:', e);
        }

        res.status(200).set(CORS_HEADERS).json(events);
    });

    // Get upcoming matches
    app.get('/api/upcoming-matches', async (_req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                `SELECT * FROM world_cup_matches 
         WHERE match_date >= NOW() 
         ORDER BY match_date ASC 
         LIMIT 10`
            );
            client.release();

            const matches = result.rows.map(transformMatchRow);
            res.status(200).set(CORS_HEADERS).json({
                matches,
                count: result.rows.length
            });
        } catch (error: any) {
            console.error('Upcoming matches error:', error.message);
            res.status(200).set(CORS_HEADERS).json({
                matches: [],
                warning: 'Could not fetch upcoming matches'
            });
        }
    });

    // Get completed matches
    app.get('/api/completed-matches', async (_req, res) => {
        try {
            const client = await pool.connect();
            const result = await client.query(
                `SELECT * FROM world_cup_matches 
         WHERE db_status = 'FINISHED' 
         ORDER BY match_date DESC 
         LIMIT 10`
            );
            client.release();

            const matches = result.rows.map(transformMatchRow);
            res.status(200).set(CORS_HEADERS).json({
                matches,
                count: result.rows.length
            });
        } catch (error: any) {
            console.error('Completed matches error:', error.message);
            res.status(200).set(CORS_HEADERS).json({
                matches: [],
                warning: 'Could not fetch completed matches'
            });
        }
    });

    return app;
}
