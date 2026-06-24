import express from 'express';
import type { Express, Request, Response, NextFunction } from 'express';
import { getCache, setCache } from '../redisCache.js';

export function setupAdminRoutes(app: Express) {
    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    };

    // Admin password validation middleware
    const checkAdminPassword = (req: Request, res: Response, next: NextFunction) => {
        const { password } = req.body;
        const adminPass = process.env.ADMIN_PASSWORD;
        if (!adminPass || password !== adminPass) {
            return res.status(403).json({ message: 'Forbidden: Invalid admin password.' });
        }
        next();
    };

    // Get maintenance status
    app.get('/api/maintenance/status', async (_req, res) => {
        try {
            const status = await getCache('maintenance_mode');
            res.status(200).set(CORS_HEADERS).json({
                maintenance: status === true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(200).set(CORS_HEADERS).json({
                maintenance: false,
                error: 'Could not determine status'
            });
        }
    });

    // Enable maintenance mode
    app.post('/api/maintenance/enable', checkAdminPassword, async (_req, res) => {
        try {
            await setCache('maintenance_mode', true, 86400);
            res.status(200).set(CORS_HEADERS).json({
                message: 'Maintenance mode enabled',
                maintenance: true
            });
        } catch (error: any) {
            res.status(500).set(CORS_HEADERS).json({
                error: 'Failed to enable maintenance mode',
                details: error.message
            });
        }
    });

    // Disable maintenance mode
    app.post('/api/maintenance/disable', checkAdminPassword, async (_req, res) => {
        try {
            await setCache('maintenance_mode', false, 0);
            res.status(200).set(CORS_HEADERS).json({
                message: 'Maintenance mode disabled',
                maintenance: false
            });
        } catch (error: any) {
            res.status(500).set(CORS_HEADERS).json({
                error: 'Failed to disable maintenance mode',
                details: error.message
            });
        }
    });

    // Health check
    app.get('/api/health', async (req, res) => {
        try {
            const maintenance = await getCache('maintenance_mode');
            res.status(200).set(CORS_HEADERS).json({
                status: 'healthy',
                maintenance: maintenance === true,
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        } catch (error: any) {
            res.status(503).set(CORS_HEADERS).json({
                status: 'degraded',
                error: error.message
            });
        }
    });

    // Cache info
    app.get('/api/admin/cache-info', checkAdminPassword, async (_req, res) => {
        res.status(200).set(CORS_HEADERS).json({
            message: 'Cache stats endpoint',
            cacheType: 'Redis + Memory hybrid',
            timestamp: new Date().toISOString()
        });
    });

    return app;
}
