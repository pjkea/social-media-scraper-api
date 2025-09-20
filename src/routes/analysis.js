// src/routes/analysis.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult, param } = require('express-validator');
const ScrapingService = require('../services/scrapingService');
const SocialMediaAnalysisService = require('../services/analysisService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();
const analysisService = new SocialMediaAnalysisService();

// Rate limiting - more restrictive for analysis due to computational cost
const analysisRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 analysis requests per hour
    message: {
        success: false,
        error: 'Too many analysis requests, please try again later',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * @swagger
 * tags:
 *   name: Analysis
 *   description: Social media behavioral analysis endpoints
 */

/**
 * @swagger
 * /api/analyze:
 *   post:
 *     summary: Scrape and analyze social media posts for behavioral patterns
 *     description: Combines scraping with AI-powered behavioral analysis for hiring decisions
 *     tags: [Analysis]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - targetUser
 *               - platform
 *               - candidateName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email/username for platform login
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 description: Password for platform login
 *                 example: "your_password"
 *               targetUser:
 *                 type: string
 *                 description: Username of the candidate's profile to analyze
 *                 example: "john_candidate"
 *               candidateName:
 *                 type: string
 *                 description: Full name of the candidate for reporting
 *                 example: "John Smith"
 *               platform:
 *                 type: string
 *                 enum: [twitter, facebook]
 *                 description: Social media platform to analyze
 *                 example: "twitter"
 *               timeframe:
 *                 type: string
 *                 enum: [1h, 6h, 12h, 1d, 3d, 7d, 30d]
 *                 default: "7d"
 *                 description: Time window for analysis
 *                 example: "7d"
 *               analysisOptions:
 *                 type: object
 *                 properties:
 *                   includeIndividualPosts:
 *                     type: boolean
 *                     default: true
 *                     description: Include individual post analysis in results
 *                   confidenceThreshold:
 *                     type: number
 *                     default: 0.6
 *                     description: Minimum confidence level for flagging content
 *                   analysisDepth:
 *                     type: string
 *                     enum: [standard, detailed, comprehensive]
 *                     default: standard
 *                     description: Depth of behavioral analysis
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 analysis_results:
 *                   type: object
 *                   description: Comprehensive behavioral analysis results
 *                 scraper_data:
 *                   type: object
 *                   description: Original scraped data
 *       400:
 *         description: Bad request - validation errors
 *       500:
 *         description: Server error during scraping or analysis
 */
router.post('/analyze',
    analysisRateLimit,
    [
        body('email').isEmail().normalizeEmail(),
        body('targetUser').isLength({ min: 1 }).trim().escape(),
        body('platform').isIn(['twitter', 'facebook']),
        body('candidateName').isLength({ min: 1, max: 100 }).trim(),
        body('timeframe').optional().isIn(['1h', '6h', '12h', '1d', '3d', '7d', '30d']),
        body('analysisOptions.includeIndividualPosts').optional().isBoolean(),
        body('analysisOptions.confidenceThreshold').optional().isFloat({ min: 0, max: 1 }),
        body('analysisOptions.analysisDepth').optional().isIn(['standard', 'detailed', 'comprehensive'])
    ],
    asyncHandler(async (req, res) => {
        // Validation
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const {
            email,
            password,
            targetUser,
            candidateName,
            platform,
            timeframe = '7d',
            analysisOptions = {}
        } = req.body;

        logger.info(`Starting scrape + analysis for candidate: ${candidateName} on ${platform}`);

        try {
            // Step 1: Scrape social media data
            const scrapingService = new ScrapingService();
            const scrapeResults = await scrapingService.scrapeProfile({
                email,
                password,
                targetUser,
                platform,
                timeframe
            });

            if (!scrapeResults.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to scrape social media data',
                    details: scrapeResults.error
                });
            }

            // Step 2: Analyze the scraped data
            const analysisResults = await analysisService.analyzeSocialMediaData(
                scrapeResults,
                candidateName,
                analysisOptions
            );

            // Step 3: Return combined results
            const response = {
                success: true,
                candidate: candidateName,
                platform,
                timeframe,
                analysis_performed: analysisResults.analysis_performed,
                analysis_results: analysisResults,
                scraper_metadata: {
                    posts_scraped: scrapeResults.data?.totalPosts || 0,
                    scraped_at: scrapeResults.data?.scrapedAt,
                    scraping_duration_ms: scrapeResults.metadata?.duration
                },
                timestamp: new Date().toISOString()
            };

            // Log significant findings
            if (analysisResults.analysis_summary?.risk_level === 'high') {
                logger.warn(`High risk candidate detected: ${candidateName}`);
            }

            res.json(response);

        } catch (error) {
            logger.error('Analysis endpoint error:', error);
            res.status(500).json({
                success: false,
                error: 'Analysis failed',
                details: error.message
            });
        }
    })
);

/**
 * @swagger
 * /api/analyze-existing:
 *   post:
 *     summary: Analyze existing scraped data
 *     description: Analyze social media data that has already been scraped
 *     tags: [Analysis]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - scrapedData
 *               - candidateName
 *             properties:
 *               scrapedData:
 *                 type: object
 *                 description: Previously scraped social media data
 *               candidateName:
 *                 type: string
 *                 description: Name of the candidate
 *               analysisOptions:
 *                 type: object
 *                 description: Analysis configuration options
 */
router.post('/analyze-existing',
    analysisRateLimit,
    [
        body('candidateName').isLength({ min: 1, max: 100 }).trim(),
        body('scrapedData').isObject(),
        body('analysisOptions.includeIndividualPosts').optional().isBoolean(),
        body('analysisOptions.confidenceThreshold').optional().isFloat({ min: 0, max: 1 })
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { scrapedData, candidateName, analysisOptions = {} } = req.body;

        try {
            const analysisResults = await analysisService.analyzeSocialMediaData(
                scrapedData,
                candidateName,
                analysisOptions
            );

            res.json({
                success: true,
                candidate: candidateName,
                analysis_performed: analysisResults.analysis_performed,
                analysis_results: analysisResults,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Existing data analysis error:', error);
            res.status(500).json({
                success: false,
                error: 'Analysis failed',
                details: error.message
            });
        }
    })
);

/**
 * @swagger
 * /api/analysis/health:
 *   get:
 *     summary: Check analysis service health
 *     description: Verify that the behavioral analysis service is available
 *     tags: [Analysis]
 */
router.get('/health', asyncHandler(async (req, res) => {
    const health = await analysisService.healthCheck();

    const statusCode = health.available ? 200 : 503;

    res.status(statusCode).json({
        success: health.available,
        service: 'social-media-analysis',
        status: health.status,
        timestamp: new Date().toISOString(),
        details: health
    });
}));

module.exports = router;