// Enhanced routes with session management and realistic scraping
const express = require('express');
const rateLimit = require('express-rate-limit');
const { validateScrapeRequest } = require('../middleware/validation');
const RealisticScrapingService = require('../services/scrapingService');
const logger = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

const router = express.Router();

// More lenient rate limiting for credential-based scraping
const scrapeLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 5, // 5 requests per hour (more conservative for credential scraping)
    message: {
        success: false,
        error: 'Rate limit exceeded for credential-based scraping',
        details: 'Maximum 5 scraping requests per hour. This limit helps prevent account suspension.',
        retryAfter: '1 hour'
    }
});

const scrapingService = new RealisticScrapingService();

/**
 * @swagger
 * /api/scrape/credentials:
 *   post:
 *     summary: Scrape with email/password credentials (Session-Persistent)
 *     description: |
 *       Advanced scraping using login credentials with session persistence and anti-detection measures.
 *
 *       **Important Notes:**
 *       - Uses persistent browser sessions to avoid repeated logins
 *       - Handles 2FA prompts in development mode (manual intervention required)
 *       - Rate limited to prevent account suspension
 *       - Works best for scraping your own accounts
 *
 *       **Session Management:**
 *       - First request: Performs login and saves session
 *       - Subsequent requests: Reuses saved session (faster, less detection)
 *       - Sessions are platform and user-specific
 *     tags: [Enhanced Scraper]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - targetUser
 *               - platform
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Account email/username
 *                 example: "your-email@example.com"
 *               password:
 *                 type: string
 *                 description: Account password
 *                 example: "your-password"
 *               targetUser:
 *                 type: string
 *                 description: Username to scrape (can be your own username)
 *                 example: "elonmusk"
 *               platform:
 *                 type: string
 *                 enum: [twitter, instagram, linkedin]
 *                 description: Social media platform
 *                 example: "twitter"
 *               timeframe:
 *                 type: string
 *                 enum: [1h, 6h, 12h, 1d, 3d, 7d, 30d]
 *                 default: "7d"
 *                 description: Time window for scraping
 *                 example: "7d"
 *               sessionId:
 *                 type: string
 *                 description: Optional custom session ID for session management
 *                 example: "my-session-1"
 *     responses:
 *       200:
 *         description: Successfully scraped posts using credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     platform:
 *                       type: string
 *                       example: "twitter"
 *                     targetUser:
 *                       type: string
 *                       example: "elonmusk"
 *                     timeframe:
 *                       type: string
 *                       example: "7d"
 *                     totalPosts:
 *                       type: integer
 *                       example: 15
 *                     sessionUsed:
 *                       type: boolean
 *                       description: Whether an existing session was reused
 *                       example: true
 *                     scrapedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-11-04T10:30:00.000Z"
 *                     posts:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Post'
 *       400:
 *         description: Invalid credentials or parameters
 *       401:
 *         description: Authentication failed (invalid login or 2FA required)
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Scraping failed
 */
router.post('/scrape/credentials', scrapeLimit, validateScrapeRequest, async (req, res, next) => {
    const { email, password, targetUser, platform, timeframe = '7d', sessionId } = req.body;

    try {
        logger.info(`Starting credential-based scrape for ${targetUser} on ${platform}`, {
            targetUser,
            platform,
            timeframe,
            sessionId: sessionId || 'auto',
            ip: req.ip
        });

        const result = await scrapingService.scrapeWithCredentials({
            email,
            password,
            targetUser,
            platform: platform.toLowerCase(),
            timeframe,
            sessionId
        });

        logger.info(`Credential scrape completed for ${targetUser}`, {
            platform,
            postsCount: result.data.totalPosts,
            sessionReused: result.data.sessionUsed
        });

        res.json(result);
    } catch (error) {
        logger.error('Credential scraping failed', {
            error: error.message,
            targetUser,
            platform,
            stack: error.stack
        });

        // Provide specific error guidance
        let statusCode = 500;
        let userMessage = error.message;

        if (error.message.includes('Authentication failed')) {
            statusCode = 401;
            userMessage = 'Login failed. Please check your credentials and try again.';
        } else if (error.message.includes('2FA')) {
            statusCode = 401;
            userMessage = 'Two-factor authentication required. Please disable 2FA or run in development mode for manual entry.';
        } else if (error.message.includes('Rate limit')) {
            statusCode = 429;
            userMessage = 'Platform rate limit reached. Please wait before trying again.';
        }

        res.status(statusCode).json({
            success: false,
            error: userMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
            suggestions: [
                'Ensure your credentials are correct',
                'Check if 2FA is enabled on your account',
                'Verify the target username exists',
                'Try again with a longer delay between requests'
            ]
        });
    }
});

/**
 * @swagger
 * /api/sessions:
 *   get:
 *     summary: List active sessions
 *     description: Get information about saved browser sessions for different platforms
 *     tags: [Enhanced Scraper]
 *     responses:
 *       200:
 *         description: List of active sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                         example: "twitter_abc123"
 *                       platform:
 *                         type: string
 *                         example: "twitter"
 *                       email:
 type: string
 example: "user@example.com"
 lastLogin:
 type: string
 format: date-time
 example: "2023-11-04T10:30:00.000Z"
 size:
 type: string
 example: "25.6 MB"
 */
router.get('/sessions', async (req, res) => {
    try {
        const sessionsDir = path.join(__dirname, '../sessions');

        if (!await fs.pathExists(sessionsDir)) {
            return res.json({
                success: true,
                sessions: [],
                totalSessions: 0
            });
        }

        const sessionDirs = await fs.readdir(sessionsDir);
        const sessions = [];

        for (const sessionDir of sessionDirs) {
            try {
                const sessionPath = path.join(sessionsDir, sessionDir);
                const sessionInfoPath = path.join(sessionPath, 'session_info.json');

                if (await fs.pathExists(sessionInfoPath)) {
                    const sessionInfo = await fs.readJson(sessionInfoPath);
                    const stats = await fs.stat(sessionPath);
                    const size = await this.getDirectorySize(sessionPath);

                    sessions.push({
                        sessionId: sessionDir,
                        platform: sessionInfo.platform,
                        email: sessionInfo.email,
                        lastLogin: sessionInfo.lastLogin,
                        created: stats.birthtime,
                        size: this.formatBytes(size)
                    });
                }
            } catch (error) {
                // Skip invalid session directories
                continue;
            }
        }

        // Sort by last login (most recent first)
        sessions.sort((a, b) => new Date(b.lastLogin) - new Date(a.lastLogin));

        res.json({
            success: true,
            sessions,
            totalSessions: sessions.length
        });
    } catch (error) {
        logger.error('Error listing sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list sessions',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/sessions/{sessionId}:
 *   delete:
 *     summary: Delete a specific session
 *     description: Remove a saved browser session and all associated data
 *     tags: [Enhanced Scraper]
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session identifier to delete
 *     responses:
 *       200:
 *         description: Session deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Session deleted successfully"
 *       404:
 *         description: Session not found
 *       500:
 *         description: Failed to delete session
 */
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionPath = path.join(__dirname, '../sessions', sessionId);

        if (!await fs.pathExists(sessionPath)) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        await fs.remove(sessionPath);

        logger.info(`Session deleted: ${sessionId}`);

        res.json({
            success: true,
            message: 'Session deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete session',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/sessions/cleanup:
 *   post:
 *     summary: Clean up old sessions
 *     description: Remove sessions older than specified days
 *     tags: [Enhanced Scraper]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanDays:
 *                 type: integer
 *                 default: 30
 *                 description: Remove sessions older than this many days
 *                 example: 30
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 deletedSessions:
 *                   type: integer
 *                   example: 3
 *                 freedSpace:
 *                   type: string
 *                   example: "125.4 MB"
 */
router.post('/sessions/cleanup', async (req, res) => {
    try {
        const { olderThanDays = 30 } = req.body;
        const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000));

        const sessionsDir = path.join(__dirname, '../sessions');

        if (!await fs.pathExists(sessionsDir)) {
            return res.json({
                success: true,
                deletedSessions: 0,
                freedSpace: '0 B'
            });
        }

        const sessionDirs = await fs.readdir(sessionsDir);
        let deletedCount = 0;
        let freedBytes = 0;

        for (const sessionDir of sessionDirs) {
            try {
                const sessionPath = path.join(sessionsDir, sessionDir);
                const sessionInfoPath = path.join(sessionPath, 'session_info.json');

                if (await fs.pathExists(sessionInfoPath)) {
                    const sessionInfo = await fs.readJson(sessionInfoPath);
                    const lastLogin = new Date(sessionInfo.lastLogin);

                    if (lastLogin < cutoffDate) {
                        const size = await this.getDirectorySize(sessionPath);
                        await fs.remove(sessionPath);
                        deletedCount++;
                        freedBytes += size;
                        logger.info(`Deleted old session: ${sessionDir}`);
                    }
                }
            } catch (error) {
                // Skip problematic sessions
                continue;
            }
        }

        res.json({
            success: true,
            deletedSessions: deletedCount,
            freedSpace: this.formatBytes(freedBytes),
            olderThanDays
        });
    } catch (error) {
        logger.error('Error cleaning up sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to cleanup sessions',
            details: error.message
        });
    }
});

/**
 * @swagger
 * /api/scrape/test-credentials:
 *   post:
 *     summary: Test login credentials without scraping
 *     description: Verify that login credentials work without performing a full scrape
 *     tags: [Enhanced Scraper]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - platform
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               platform:
 *                 type: string
 *                 enum: [twitter, instagram, linkedin]
 *               sessionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login test completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 loginSuccessful:
 *                   type: boolean
 *                 requires2FA:
 *                   type: boolean
 *                 sessionSaved:
 *                   type: boolean
 */
router.post('/scrape/test-credentials', async (req, res) => {
    const { email, password, platform, sessionId } = req.body;

    try {
        // Basic validation
        if (!email || !password || !platform) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, and platform'
            });
        }

        logger.info(`Testing credentials for ${platform}`, {
            email: email.replace(/(.{2}).*@/, '$1***@'), // Mask email for logging
            platform
        });

        // Attempt login test with minimal scraping
        const testResult = await scrapingService.testCredentials({
            email,
            password,
            platform: platform.toLowerCase(),
            sessionId
        });

        res.json({
            success: true,
            loginSuccessful: testResult.loginSuccessful,
            requires2FA: testResult.requires2FA,
            sessionSaved: testResult.sessionSaved,
            message: testResult.loginSuccessful ?
                'Login successful - credentials are valid' :
                'Login failed - please check credentials'
        });

    } catch (error) {
        logger.error('Credential test failed:', error);

        res.json({
            success: true, // Don't return 500 for test endpoint
            loginSuccessful: false,
            requires2FA: error.message.includes('2FA'),
            sessionSaved: false,
            error: error.message,
            suggestions: [
                'Verify email and password are correct',
                'Check if 2FA is enabled',
                'Ensure account is not locked or suspended'
            ]
        });
    }
});

// Helper methods for the router class
function getDirectorySize(dirPath) {
    return new Promise(async (resolve) => {
        try {
            let totalSize = 0;
            const files = await fs.readdir(dirPath, { withFileTypes: true });

            for (const file of files) {
                const fullPath = path.join(dirPath, file.name);
                if (file.isDirectory()) {
                    totalSize += await getDirectorySize(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                }
            }

            resolve(totalSize);
        } catch (error) {
            resolve(0);
        }
    });
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Attach helper methods to router for access in route handlers
router.getDirectorySize = getDirectorySize;
router.formatBytes = formatBytes;

module.exports = router;