require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const scraperRoutes = require('./routes/scraper');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Swagger configuration
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Social Media Scraper API',
            version: '1.0.0',
            description: 'A comprehensive API for scraping social media posts from various platforms including Twitter, Instagram, and LinkedIn.',
            contact: {
                name: 'API Support',
                url: 'https://github.com/yourusername/social-media-scraper-api',
                email: 'support@example.com'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: process.env.NODE_ENV === 'production' ? 'https://your-api.herokuapp.com' : `http://localhost:${PORT}`,
                description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key'
                }
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: false
                        },
                        error: {
                            type: 'string',
                            example: 'Error message'
                        },
                        details: {
                            type: 'string',
                            example: 'Additional error details'
                        }
                    }
                },
                Post: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            example: 'post_1_1699123456789'
                        },
                        text: {
                            type: 'string',
                            example: 'This is a sample post content'
                        },
                        author: {
                            type: 'string',
                            example: 'john_doe'
                        },
                        date: {
                            type: 'string',
                            format: 'date-time',
                            example: '2023-11-04T10:30:00.000Z'
                        },
                        timestamp: {
                            type: 'number',
                            example: 1699123456789
                        },
                        stats: {
                            type: 'object',
                            properties: {
                                likes: {
                                    type: 'number',
                                    example: 150
                                },
                                comments: {
                                    type: 'number',
                                    example: 25
                                },
                                shares: {
                                    type: 'number',
                                    example: 10
                                },
                                views: {
                                    type: 'number',
                                    example: 1000
                                }
                            }
                        },
                        platform: {
                            type: 'string',
                            enum: ['twitter', 'instagram', 'linkedin'],
                            example: 'twitter'
                        }
                    }
                },
                ScrapeResponse: {
                    type: 'object',
                    properties: {
                        success: {
                            type: 'boolean',
                            example: true
                        },
                        data: {
                            type: 'object',
                            properties: {
                                platform: {
                                    type: 'string',
                                    enum: ['twitter', 'instagram', 'linkedin'],
                                    example: 'twitter'
                                },
                                targetUser: {
                                    type: 'string',
                                    example: 'elonmusk'
                                },
                                timeframe: {
                                    type: 'string',
                                    example: '7d'
                                },
                                totalPosts: {
                                    type: 'number',
                                    example: 25
                                },
                                scrapedAt: {
                                    type: 'string',
                                    format: 'date-time',
                                    example: '2023-11-04T10:30:00.000Z'
                                },
                                posts: {
                                    type: 'array',
                                    items: {
                                        $ref: '#/components/schemas/Post'
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP for Swagger UI
}));

// General middleware
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${req.ip}`);
    next();
});

// API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Social Media Scraper API Documentation'
}));

// Serve swagger.json
app.get('/api/docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Routes
app.use('/api', healthRoutes);
app.use('/api', scraperRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Social Media Scraper API',
        version: '1.0.0',
        documentation: '/api/docs',
        health: '/api/health',
        supportedPlatforms: ['twitter', 'instagram', 'linkedin', 'facebook', 'threads', 'tiktok', 'youtube', 'pinterest']
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: {
            documentation: '/api/docs',
            health: '/api/health',
            scrape: '/api/scrape',
            platforms: '/api/platforms'
        }
    });
});

// Start server
const server = app.listen(PORT, () => {
    logger.info(`🚀 Social Media Scraper API running on port ${PORT}`);
    logger.info(`📊 Health check: http://localhost:${PORT}/api/health`);
    logger.info(`📱 Supported platforms: http://localhost:${PORT}/api/platforms`);
    logger.info(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
    });
});

module.exports = app;