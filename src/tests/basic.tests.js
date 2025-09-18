const request = require('supertest');
const app = require('../src/app');

describe('Social Media Scraper API', () => {

    describe('Health Endpoints', () => {
        test('GET /api/health should return 200', async () => {
            const response = await request(app)
                .get('/api/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('supportedPlatforms');
            expect(response.body.supportedPlatforms).toContain('twitter');
            expect(response.body.supportedPlatforms).toContain('facebook');
        });

        test('GET /api/platforms should return supported platforms', async () => {
            const response = await request(app)
                .get('/api/platforms')
                .expect(200);

            expect(response.body).toHaveProperty('platforms');
            expect(response.body.platforms).toEqual(['twitter', 'facebook']);
            expect(response.body).toHaveProperty('timeframes');
            expect(response.body.timeframes).toContain('7d');
        });
    });

    describe('Validation', () => {
        test('POST /api/scrape/test-credentials should validate required fields', async () => {
            const response = await request(app)
                .post('/api/scrape/test-credentials')
                .send({
                    // Missing required fields
                })
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body).toHaveProperty('error');
        });

        test('POST /api/scrape/test-credentials should accept valid data', async () => {
            const response = await request(app)
                .post('/api/scrape/test-credentials')
                .send({
                    email: 'test@example.com',
                    password: 'testpass',
                    platform: 'twitter'
                });

            // Should return 200 even if login fails (it's just a test)
            expect([200, 401]).toContain(response.status);
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('loginSuccessful');
        });

        test('POST /api/scrape/test-credentials should reject invalid platform', async () => {
            const response = await request(app)
                .post('/api/scrape/test-credentials')
                .send({
                    email: 'test@example.com',
                    password: 'testpass',
                    platform: 'invalid-platform'
                })
                .expect(400);

            expect(response.body).toHaveProperty('success', false);
            expect(response.body.error).toContain('Platform must be one of');
        });
    });

    describe('Session Management', () => {
        test('GET /api/sessions should return sessions list', async () => {
            const response = await request(app)
                .get('/api/sessions')
                .expect(200);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('sessions');
            expect(response.body).toHaveProperty('totalSessions');
            expect(Array.isArray(response.body.sessions)).toBe(true);
        });
    });

    describe('API Documentation', () => {
        test('GET /api/docs.json should return swagger spec', async () => {
            const response = await request(app)
                .get('/api/docs.json')
                .expect(200);

            expect(response.body).toHaveProperty('openapi');
            expect(response.body).toHaveProperty('info');
            expect(response.body.info.title).toContain('Social Media Scraper');
        });
    });

    describe('Root Endpoint', () => {
        test('GET / should return API information', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('supportedPlatforms');
            expect(response.body.supportedPlatforms).toEqual(['twitter', 'facebook']);
        });
    });

});

describe('Error Handling', () => {
    test('404 for unknown endpoints', async () => {
        const response = await request(app)
            .get('/api/nonexistent')
            .expect(404);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'Endpoint not found');
        expect(response.body).toHaveProperty('availableEndpoints');
    });
});

describe('Rate Limiting', () => {
    test('Rate limiting should be applied to scraping endpoints', async () => {
        const testRequest = {
            email: 'test@example.com',
            password: 'testpass',
            targetUser: 'testuser',
            platform: 'twitter'
        };

        // Make multiple requests to trigger rate limiting
        const requests = Array(6).fill().map(() =>
            request(app)
                .post('/api/scrape/credentials')
                .send(testRequest)
        );

        const responses = await Promise.all(requests);

        // At least one should be rate limited (429)
        const rateLimitedResponses = responses.filter(r => r.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
});