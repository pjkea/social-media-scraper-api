const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Social Media Scraper API',
            version: '1.0.0',
            description: 'A comprehensive API for scraping social media posts from Twitter and Facebook using credential-based authentication.',
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
                url: process.env.NODE_ENV === 'production'
                    ? 'https://your-api.herokuapp.com'
                    : `http://localhost:${process.env.PORT || 3000}`,
                description: process.env.NODE_ENV === 'production'
                    ? 'Production server'
                    : 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key'
                }
            }
        }
    },
    apis: ['./src/routes/*.js'] // Path to the API files
};

const specs = swaggerJsdoc(options);

module.exports = specs;