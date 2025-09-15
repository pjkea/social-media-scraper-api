const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue'
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
    )
);

// Define which logs to write to file vs console based on environment
const transports = [
    // Console transport
    new winston.transports.Console({
        level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    })
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
    // Create logs directory if it doesn't exist
    const fs = require('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    transports.push(
        // Error log file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            format: winston.format.combine(
                winston.format.uncolorize(),
                winston.format.json()
            ),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),

        // Combined log file
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            format: winston.format.combine(
                winston.format.uncolorize(),
                winston.format.json()
            ),
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    );
}

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    levels,
    format,
    transports,
    exitOnError: false
});

// Create a stream object for Morgan HTTP logging
logger.stream = {
    write: (message) => {
        logger.http(message.trim());
    }
};

// Add helper methods for structured logging
logger.logRequest = (req, res, responseTime) => {
    logger.http('HTTP Request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        responseTime: `${responseTime}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
};

logger.logScrapeStart = (platform, targetUser, options = {}) => {
    logger.info('Scrape started', {
        platform,
        targetUser,
        timeframe: options.timeframe,
        customUrl: options.customUrl,
        timestamp: new Date().toISOString()
    });
};

logger.logScrapeEnd = (platform, targetUser, result) => {
    logger.info('Scrape completed', {
        platform,
        targetUser,
        postsFound: result.totalPosts || 0,
        success: result.success || false,
        duration: result.duration,
        timestamp: new Date().toISOString()
    });
};

logger.logScrapeError = (platform, targetUser, error) => {
    logger.error('Scrape failed', {
        platform,
        targetUser,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
};

logger.logValidationError = (field, value, message) => {
    logger.warn('Validation error', {
        field,
        value: typeof value === 'object' ? JSON.stringify(value) : value,
        message,
        timestamp: new Date().toISOString()
    });
};

logger.logRateLimit = (ip, endpoint) => {
    logger.warn('Rate limit exceeded', {
        ip,
        endpoint,
        timestamp: new Date().toISOString()
    });
};

// Handle uncaught exceptions and rejections
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
        filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
        handleExceptions: true,
        handleRejections: true,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.errors({ stack: true }),
            winston.format.json()
        )
    }));
}

module.exports = logger;