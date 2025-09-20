# Social Media Scraper API

A comprehensive Node.js API for scraping social media posts from Twitter, Instagram, and LinkedIn using Puppeteer. Features rate limiting, comprehensive logging, error handling, and full Swagger documentation.

## Features

- **Multi-Platform Support**: Twitter, Instagram, and LinkedIn
- **Flexible Timeframes**: 1h, 6h, 12h, 1d, 3d, 7d, 30d
- **Rate Limiting**: Built-in protection against abuse
- **Comprehensive Logging**: Winston-based logging with file rotation
- **Error Handling**: Robust error handling with custom error types
- **API Documentation**: Auto-generated Swagger/OpenAPI documentation
- **Docker Support**: Containerized deployment with Docker Compose
- **Health Checks**: Kubernetes-ready health and readiness probes
- **Security**: Helmet.js security headers and input validation
- **Performance**: Compression and optimized Puppeteer configuration

## Quick Start

### Prerequisites

- Node.js 16+
- npm 8+
- Chrome/Chromium (for Puppeteer)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/social-media-scraper-api.git
   cd social-media-scraper-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   cp .env .env
   # Edit .env file with your configuration
   ```

4. **Start the server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

5. **Access the API**
    - API: http://localhost:3000
    - Documentation: http://localhost:3000/api/docs
    - Health Check: http://localhost:3000/api/health

## Docker Deployment

### Quick Start with Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t social-scraper-api .
docker run -p 3000:3000 social-scraper-api
```

### Production Deployment

```bash
# Start with monitoring stack
docker-compose --profile monitoring up -d

# Scale the API service
docker-compose up -d --scale social-scraper-api=3
```

## API Usage

### Basic Scraping Request

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password",
    "targetUser": "elonmusk",
    "platform": "twitter",
    "timeframe": "7d"
  }'
```

### Response Format

```json
{
  "success": true,
  "data": {
    "platform": "twitter",
    "targetUser": "elonmusk",
    "timeframe": "7d",
    "totalPosts": 25,
    "scrapedAt": "2023-11-04T10:30:00.000Z",
    "posts": [
      {
        "id": "post_1_1699123456789",
        "text": "This is a sample post content",
        "author": "elonmusk",
        "date": "2023-11-04T10:30:00.000Z",
        "timestamp": 1699123456789,
        "stats": {
          "likes": 150,
          "comments": 25,
          "shares": 10,
          "views": 1000
        },
        "platform": "twitter",
        "url": "https://twitter.com/elonmusk/status/..."
      }
    ]
  }
}
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API information and available endpoints |
| `GET` | `/api/health` | Basic health check |
| `GET` | `/api/health/detailed` | Detailed system health information |
| `GET` | `/api/ready` | Readiness probe for Kubernetes |
| `GET` | `/api/platforms` | Supported platforms and configuration |
| `POST` | `/api/scrape` | Main scraping endpoint |
| `POST` | `/api/scrape/validate` | Validate scraping parameters |
| `GET` | `/api/docs` | Swagger API documentation |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `CORS_ORIGIN` | `*` | CORS allowed origins |
| `RATE_LIMIT_MAX` | `10` | Max requests per window |
| `LOG_LEVEL` | `debug` | Logging level |
| `PUPPETEER_HEADLESS` | `true` | Run browser in headless mode |

### Platform-Specific Settings

Each platform has configurable settings for delays, limits, and timeouts:

```javascript
const platformSettings = {
  twitter: {
    scrollDelay: 2000,
    maxScrolls: 5,
    postLimit: 50
  },
  instagram: {
    scrollDelay: 3000,
    maxScrolls: 3,
    postLimit: 30
  },
  linkedin: {
    scrollDelay: 2500,
    maxScrolls: 4,
    postLimit: 40
  }
};
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Credentials**: Never store login credentials in code or logs
2. **Rate Limiting**: Respect platform rate limits to avoid being blocked
3. **Legal Compliance**: Ensure compliance with platform Terms of Service
4. **Data Privacy**: Handle scraped data responsibly and in compliance with privacy laws
5. **Network Security**: Use HTTPS in production and secure API keys

### Recommended Security Practices

- Use environment variables for sensitive configuration
- Implement API key authentication for production use
- Set up proper CORS policies
- Use HTTPS/TLS encryption
- Monitor and log all API access
- Implement proper input validation and sanitization

## Error Handling

The API uses structured error responses:

```json
{
  "success": false,
  "error": "Error message",
  "details": "Additional error details",
  "validationErrors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    }
  ]
}
```

Common error status codes:
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (authentication required)
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error (scraping failures)

## Monitoring and Logging

### Log Levels

- `error`: Critical errors and failures
- `warn`: Warnings and rate limit hits
- `info`: General information and successful operations
- `http`: HTTP request logging
- `debug`: Detailed debugging information

### Log Files (Production)

- `logs/error.log`: Error-level logs only
- `logs/combined.log`: All log levels
- `logs/exceptions.log`: Uncaught exceptions

### Health Monitoring

The API provides several endpoints for monitoring:

- `/api/health`: Basic health status
- `/api/health/detailed`: System metrics and memory usage
- `/api/ready`: Kubernetes readiness probe

## Development

### Scripts

```bash
npm run dev          # Start development server with nodemon
npm run start        # Start production server
npm run test         # Run test suite
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint
npm run lint:fix     # Fix linting issues
npm run docs         # Generate API documentation
```

### Project Structure

```
social-media-scraper-api/
├── src/
│   ├── app.js                 # Main application file
│   ├── routes/
│   │   ├── scraper.js         # Scraping endpoints
│   │   └── health.js          # Health check endpoints
│   ├── services/
│   │   └── scrapingService.js # Core scraping logic
│   ├── middleware/
│   │   ├── validation.js      # Request validation
│   │   └── errorHandler.js    # Error handling
│   ├── config/
│   │   └── scraperConfigs.js  # Platform configurations
│   └── utils/
│       ├── logger.js          # Logging utilities
│       └── scraperUtils.js    # Scraping utilities
├── logs/                      # Log files (production)
├── docs/                      # Generated documentation
├── tests/                     # Test files
├── Dockerfile                 # Docker configuration
├── docker-compose.yml         # Docker Compose setup
├── package.json              # Dependencies and scripts
├── .env.example              # Environment template
└── README.md                 # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Run the test suite: `npm test`
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

### Code Standards

- Use ESLint for code linting
- Follow the existing code style
- Add tests for new features
- Update documentation for API changes
- Use meaningful commit messages

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Legal Notice

This tool is for educational and research purposes. Users are responsible for:

- Complying with platform Terms of Service
- Respecting rate limits and robots.txt
- Following applicable laws and regulations
- Obtaining necessary permissions for data collection
- Protecting user privacy and data

## Support

- 📚 **Documentation**: [API Docs](http://localhost:3000/api/docs)
- 🐛 **Issues**: [GitHub Issues](https://github.com/yourusername/social-media-scraper-api/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/social-media-scraper-api/discussions)

## Changelog

### v1.0.0 (2023-11-04)

- Initial release
- Support for Twitter, Instagram, and LinkedIn
- Comprehensive API documentation
- Docker support
- Rate limiting and security features
- Health monitoring endpoints