const express = require('express');
const os = require('os');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Health
 *   description: Health check and system status endpoints
 */

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check if the API is running and get basic system information
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   example: "2023-11-04T10:30:00.000Z"
 *                 uptime:
 *                   type: number
 *                   description: Process uptime in seconds
 *                   example: 3600.5
 *                 environment:
 *                   type: string
 *                   example: "development"
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 *                 supportedPlatforms:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["twitter", "instagram", "linkedin"]
 */
router.get('/health', (req, res) => {
    const healthInfo = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        supportedPlatforms: ['twitter', 'instagram', 'linkedin', 'facebook', 'threads', 'tiktok', 'youtube', 'pinterest']
    };

    res.json(healthInfo);
});

/**
 * @swagger
 * /api/health/detailed:
 *   get:
 *     summary: Detailed health check
 *     description: Get comprehensive system health information including memory usage and system stats
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "healthy"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 environment:
 *                   type: string
 *                 version:
 *                   type: string
 *                 system:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                       example: "linux"
 *                     arch:
 *                       type: string
 *                       example: "x64"
 *                     nodeVersion:
 *                       type: string
 *                       example: "v18.17.0"
 *                     totalMemory:
 *                       type: string
 *                       example: "8.00 GB"
 *                     freeMemory:
 *                       type: string
 *                       example: "4.32 GB"
 *                     loadAverage:
 *                       type: array
 *                       items:
 *                         type: number
 *                       example: [0.5, 0.6, 0.7]
 *                 process:
 *                   type: object
 *                   properties:
 *                     pid:
 *                       type: number
 *                       example: 12345
 *                     memoryUsage:
 *                       type: object
 *                       properties:
 *                         rss:
 *                           type: string
 *                           example: "45.2 MB"
 *                         heapTotal:
 *                           type: string
 *                           example: "25.6 MB"
 *                         heapUsed:
 *                           type: string
 *                           example: "18.4 MB"
 *                         external:
 *                           type: string
 *                           example: "1.2 MB"
 *                 supportedPlatforms:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/health/detailed', (req, res) => {
    const formatBytes = (bytes) => {
        const gb = bytes / (1024 ** 3);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;
        const mb = bytes / (1024 ** 2);
        return `${mb.toFixed(1)} MB`;
    };

    const memoryUsage = process.memoryUsage();
    const systemMemory = {
        total: os.totalmem(),
        free: os.freemem()
    };

    const healthInfo = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        system: {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            totalMemory: formatBytes(systemMemory.total),
            freeMemory: formatBytes(systemMemory.free),
            loadAverage: os.loadavg()
        },
        process: {
            pid: process.pid,
            memoryUsage: {
                rss: formatBytes(memoryUsage.rss),
                heapTotal: formatBytes(memoryUsage.heapTotal),
                heapUsed: formatBytes(memoryUsage.heapUsed),
                external: formatBytes(memoryUsage.external)
            }
        },
        supportedPlatforms: ['twitter', 'instagram', 'linkedin']
    };

    res.json(healthInfo);
});

/**
 * @swagger
 * /api/ready:
 *   get:
 *     summary: Readiness probe
 *     description: Check if the API is ready to handle requests (useful for Kubernetes readiness probes)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       503:
 *         description: API is not ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ready:
 *                   type: boolean
 *                   example: false
 *                 reason:
 *                   type: string
 *                   example: "Service unavailable"
 */
router.get('/ready', (req, res) => {
    // Add any readiness checks here (database connections, external services, etc.)
    const isReady = true; // Replace with actual readiness logic

    if (isReady) {
        res.json({
            ready: true,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(503).json({
            ready: false,
            reason: 'Service unavailable',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;