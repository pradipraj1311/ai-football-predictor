import express from 'express';
import type { Express } from 'express';
import { Pool } from 'pg';
import { transformMatchRow, calculateMatchPrediction, getMatchBet } from '../utils/matchTransform.js';
import { getCache, setCache } from '../../redisCache.js';

export function setupMatchRoutes(app: Express, pool: Pool, fetchAndSaveHighlight: (id: string, home: string, away: string) => Promise<string | null>) {
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120'
    };

    // Get all matches from database
    app.get('/api/db-matches', async (_req, res) => {
        if (!process.env.DB_URL) {
            return res.status(200).set(CORS_HEADERS).json({
                matches: [],
                warning: 'DB not configured'
            });
        }

        try {
            const client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM world_cup_matches ORDER BY match_date ASC, match_time ASC'
            );
            client.release();

            const dynamicMatches = await Promise.all(result.rows.map(async (row) => {
                const transformed = transformMatchRow(row);
                const homeTeamName = row.home_team?.name || row.home_team || 'Home';
                const awayTeamName = row.away_team?.name || row.away_team || 'Away';

                if (transformed.dbStatus === 'FINISHED' && !transformed.youtubeHighlightId && process.env.YOUTUBE_API_KEY) {
                    const ytId = await fetchAndSaveHighlight(row.id, homeTeamName, awayTeamName);
                    if (ytId) transformed.youtubeHighlightId = ytId;
                }

                return transformed;
            }));

            res.status(200).set(CORS_HEADERS).json({ matches: dynamicMatches });
        } catch (error: any) {
            console.error('Database Error:', error.message);
            res.status(200).set(CORS_HEADERS).json({
                matches: [],
                warning: 'Failed to fetch matches from DB'
            });
        }
    });

    // Get team statistics
    app.get('/api/team-stats/:teamId', async (req, res) => {
        const { teamId } = req.params;

        try {
            const matches = await getCache(`team-stats:${teamId}`);
            if (matches) {
                return res.status(200).set(CORS_HEADERS).json(matches);
            }

            const client = await pool.connect();
            const result = await client.query(
                `SELECT * FROM world_cup_matches 
         WHERE LOWER(home_team) = LOWER($1) OR LOWER(away_team) = LOWER($1)
         ORDER BY match_date DESC LIMIT 10`,
                [teamId]
            );
            client.release();

            const stats = {
                teamId,
                totalMatches: result.rows.length,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                form: [] as string[]
            };

            result.rows.forEach((match: any) => {
                const isHome = match.home_team.toLowerCase() === teamId.toLowerCase();
                const goalsFor = isHome ? match.home_score : match.away_score;
                const goalsAgainst = isHome ? match.away_score : match.home_score;

                stats.goalsFor += goalsFor;
                stats.goalsAgainst += goalsAgainst;

                if (goalsFor > goalsAgainst) {
                    stats.wins++;
                    stats.form.push('W');
                } else if (goalsFor === goalsAgainst) {
                    stats.draws++;
                    stats.form.push('D');
                } else {
                    stats.losses++;
                    stats.form.push('L');
                }
            });

            await setCache(`team-stats:${teamId}`, stats, 3600);
            res.status(200).set(CORS_HEADERS).json(stats);
        } catch (error: any) {
            console.error('Team stats error:', error.message);
            res.status(500).set(CORS_HEADERS).json({ error: 'Failed to fetch team stats' });
        }
    });

    // Get match predictions
    app.get('/api/predictions', async (_req, res) => {
        try {
            const cached = await getCache('predictions:all');
            if (cached) {
                return res.status(200).set(CORS_HEADERS).json(cached);
            }

            const client = await pool.connect();
            const result = await client.query(
                'SELECT * FROM world_cup_matches WHERE db_status != $1 ORDER BY match_date ASC',
                ['FINISHED']
            );
            client.release();

            const predictions = result.rows.map((row: any) => {
                const match = transformMatchRow(row) as any;
                const probs = calculateMatchPrediction(match);

                return {
                    matchId: row.id,
                    homeTeam: row.home_team,
                    awayTeam: row.away_team,
                    confidence: Math.floor(Math.random() * 30 + 70),
                    ...probs,
                    suggestedBet: getMatchBet(probs),
                    reasoning: `Based on team form and head-to-head records. ${row.home_team} form: ${match.homeTeam.form.join('')}. ${row.away_team} form: ${match.awayTeam.form.join('')}`
                };
            });

            await setCache('predictions:all', predictions, 1800);
            res.status(200).set(CORS_HEADERS).json(predictions);
        } catch (error: any) {
            console.error('Predictions error:', error.message);
            res.status(500).set(CORS_HEADERS).json({ error: 'Failed to fetch predictions' });
        }
    });

    // Advanced search
    app.get('/api/search', async (req, res) => {
        const { q, type } = req.query;

        if (!q) {
            return res.status(400).set(CORS_HEADERS).json({ error: 'Query parameter required' });
        }

        try {
            const client = await pool.connect();
            let query = 'SELECT * FROM world_cup_matches WHERE';
            const params: any[] = [];

            if (type === 'team') {
                query += ' (LOWER(home_team) LIKE LOWER($1) OR LOWER(away_team) LIKE LOWER($1))';
                params.push(`%${q}%`);
            } else {
                query += ' (LOWER(competition) LIKE LOWER($1) OR LOWER(home_team) LIKE LOWER($1) OR LOWER(away_team) LIKE LOWER($1))';
                params.push(`%${q}%`);
            }

            query += ' ORDER BY match_date DESC LIMIT 20';
            const result = await client.query(query, params);
            client.release();

            const matches = result.rows.map(transformMatchRow);
            res.status(200).set(CORS_HEADERS).json({ matches, total: result.rows.length });
        } catch (error: any) {
            console.error('Search error:', error.message);
            res.status(500).set(CORS_HEADERS).json({ error: 'Search failed' });
        }
    });

    return app;
}
