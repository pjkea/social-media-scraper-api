/**
 * Utility functions for the scraping service
 */

/**
 * Parse timeframe string into milliseconds
 * @param {string} timeframe - Timeframe string (e.g., '1h', '7d', '30d')
 * @returns {number} Timeframe in milliseconds
 */
function parseTimeframe(timeframe) {
    const timeMap = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '12h': 12 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '3d': 3 * 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
    };

    return timeMap[timeframe] || timeMap['7d'];
}

/**
 * Detect platform from URL
 * @param {string} url - URL to analyze
 * @returns {string} Platform name
 */
function detectPlatform(url) {
    if (url.includes('twitter.com') || url.includes('x.com')) {return 'twitter';}
    if (url.includes('instagram.com')) {return 'instagram';}
    if (url.includes('linkedin.com')) {return 'linkedin';}
    if (url.includes('facebook.com')) {return 'facebook';}
    if (url.includes('tiktok.com')) {return 'tiktok';}
    return 'unknown';
}

/**
 * Parse social media stats from text with platform-specific patterns
 * @param {string} statsText - Text containing stats information
 * @param {string} platform - Platform name for specific parsing
 * @returns {object} Parsed stats object
 */
function parseStats(statsText, platform = 'unknown') {
    const stats = {};

    if (!statsText || typeof statsText !== 'string') {
        return stats;
    }

    // Platform-specific patterns
    const platformPatterns = {
        twitter: {
            likes: [
                /(\d+[\d,]*)\s*(like|heart|👍|♥️)/i,
                /(\d+[\d,]*)\s*likes?/i
            ],
            retweets: [
                /(\d+[\d,]*)\s*(retweet|repost|🔄)/i,
                /(\d+[\d,]*)\s*retweets?/i
            ],
            replies: [
                /(\d+[\d,]*)\s*(repl|comment|💬)/i,
                /(\d+[\d,]*)\s*replies?/i
            ]
        },

        facebook: {
            likes: [
                /(\d+[\d,]*)\s*(like|👍|reaction)/i,
                /(\d+[\d,]*)\s*people reacted/i
            ],
            comments: [
                /(\d+[\d,]*)\s*(comment|💬)/i,
                /(\d+[\d,]*)\s*comments?/i
            ],
            shares: [
                /(\d+[\d,]*)\s*(share|🔄)/i,
                /(\d+[\d,]*)\s*shares?/i
            ]
        },

        instagram: {
            likes: [
                /(\d+[\d,]*)\s*(like|❤️)/i,
                /(\d+[\d,]*)\s*likes?/i
            ],
            comments: [
                /(\d+[\d,]*)\s*(comment|💬)/i,
                /(\d+[\d,]*)\s*comments?/i
            ],
            views: [
                /(\d+[\d,]*)\s*(view|👁️)/i,
                /(\d+[\d,]*)\s*views?/i
            ]
        },

        tiktok: {
            likes: [
                /(\d+[\d,]*)\s*(like|❤️)/i,
                /(\d+[\d,]*)\s*likes?/i
            ],
            comments: [
                /(\d+[\d,]*)\s*(comment|💬)/i,
                /(\d+[\d,]*)\s*comments?/i
            ],
            shares: [
                /(\d+[\d,]*)\s*(share|↗️)/i,
                /(\d+[\d,]*)\s*shares?/i
            ],
            views: [
                /(\d+[\d,]*)\s*(view|play)/i,
                /(\d+[\d,]*)\s*views?/i
            ]
        },

        youtube: {
            likes: [
                /(\d+[\d,]*)\s*(like|👍)/i,
                /(\d+[\d,]*)\s*likes?/i
            ],
            dislikes: [
                /(\d+[\d,]*)\s*(dislike|👎)/i,
                /(\d+[\d,]*)\s*dislikes?/i
            ],
            views: [
                /(\d+[\d,]*)\s*(view|👁️)/i,
                /(\d+[\d,]*)\s*views?/i
            ],
            subscribers: [
                /(\d+[\d,]*)\s*(subscriber|sub)/i,
                /(\d+[\d,]*)\s*subscribers?/i
            ]
        }
    };

    // Common patterns (fallback)
    const commonPatterns = {
        likes: [
            /(\d+[\d,]*)\s*(like|heart|👍|♥️|❤️)/i,
            /(\d+[\d,]*)\s*likes?/i,
            /like.*?(\d+[\d,]*)/i
        ],
        comments: [
            /(\d+[\d,]*)\s*(comment|reply|💬)/i,
            /(\d+[\d,]*)\s*comments?/i,
            /comment.*?(\d+[\d,]*)/i
        ],
        shares: [
            /(\d+[\d,]*)\s*(share|retweet|repost|🔄)/i,
            /(\d+[\d,]*)\s*(shares?|retweets?|reposts?)/i,
            /share.*?(\d+[\d,]*)/i
        ],
        views: [
            /(\d+[\d,]*)\s*(view|impression|👁️)/i,
            /(\d+[\d,]*)\s*views?/i,
            /view.*?(\d+[\d,]*)/i
        ]
    };

    // Use platform-specific patterns if available, otherwise use common patterns
    const patterns = platformPatterns[platform] || commonPatterns;

    // Try each pattern for each stat type
    Object.entries(patterns).forEach(([key, patternArray]) => {
        for (const pattern of patternArray) {
            const match = statsText.match(pattern);
            if (match && match[1]) {
                const number = parseInt(match[1].replace(/,/g, ''));
                if (!isNaN(number)) {
                    stats[key] = number;
                    break; // Use first successful match
                }
            }
        }
    });

    return stats;
}

/**
 * Clean and normalize text content
 * @param {string} text - Raw text content
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    if (!text || typeof text !== 'string') {return '';}

    return text
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
        .replace(/\n\s*\n/g, '\n') // Remove empty lines
        .substring(0, 2000); // Limit length to prevent excessive content
}

/**
 * Parse date string from various social media formats
 * @param {string} dateStr - Date string from social media
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
    if (!dateStr) {return null;}

    // Common date formats from social media platforms
    const formats = [
        // ISO format
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
        // Relative times
        /(\d+)\s*(s|sec|second)s?\s*ago/i,
        /(\d+)\s*(m|min|minute)s?\s*ago/i,
        /(\d+)\s*(h|hr|hour)s?\s*ago/i,
        /(\d+)\s*(d|day)s?\s*ago/i,
        /(\d+)\s*(w|week)s?\s*ago/i,
        // Social media specific formats
        /\b(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i,
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{1,2})\b/i
    ];

    // Try to parse as ISO date first
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // Handle relative times
    const now = new Date();

    // Seconds ago
    let match = dateStr.match(/(\d+)\s*(s|sec|second)s?\s*ago/i);
    if (match) {
        return new Date(now.getTime() - parseInt(match[1]) * 1000);
    }

    // Minutes ago
    match = dateStr.match(/(\d+)\s*(m|min|minute)s?\s*ago/i);
    if (match) {
        return new Date(now.getTime() - parseInt(match[1]) * 60 * 1000);
    }

    // Hours ago
    match = dateStr.match(/(\d+)\s*(h|hr|hour)s?\s*ago/i);
    if (match) {
        return new Date(now.getTime() - parseInt(match[1]) * 60 * 60 * 1000);
    }

    // Days ago
    match = dateStr.match(/(\d+)\s*(d|day)s?\s*ago/i);
    if (match) {
        return new Date(now.getTime() - parseInt(match[1]) * 24 * 60 * 60 * 1000);
    }

    // Weeks ago
    match = dateStr.match(/(\d+)\s*(w|week)s?\s*ago/i);
    if (match) {
        return new Date(now.getTime() - parseInt(match[1]) * 7 * 24 * 60 * 60 * 1000);
    }

    // If all parsing fails, return null
    return null;
}

/**
 * Generate unique post ID
 * @param {string} platform - Platform name
 * @param {string} author - Post author
 * @param {number} timestamp - Post timestamp
 * @param {number} index - Post index
 * @returns {string} Unique post ID
 */
function generatePostId(platform, author, timestamp, index) {
    return `${platform}_${author}_${timestamp}_${index}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid URL
 */
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Extract username from social media URL
 * @param {string} url - Social media profile URL
 * @returns {string|null} Username or null if not found
 */
function extractUsernameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;

        // Common patterns for different platforms
        const patterns = [
            /^\/([^\/]+)\/?$/, // Simple username: /username
            /^\/(?:in|user)\/([^\/]+)\/?$/, // LinkedIn: /in/username
            /^\/([^\/]+)\/(?:profile|timeline)?\/?$/ // With profile suffix
        ];

        for (const pattern of patterns) {
            const match = pathname.match(pattern);
            if (match && match[1] && match[1] !== 'home' && match[1] !== 'profile') {
                return match[1];
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Sanitize text for safe storage and display
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
    if (!text || typeof text !== 'string') {return '';}

    return text
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/javascript:/gi, '') // Remove javascript: URLs
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim();
}

module.exports = {
    parseTimeframe,
    detectPlatform,
    parseStats,
    cleanText,
    parseDate,
    generatePostId,
    isValidUrl,
    extractUsernameFromUrl,
    sanitizeText
};