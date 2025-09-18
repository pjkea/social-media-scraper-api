const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const { scraperConfigs } = require('../config/scraperConfigs');
const { parseTimeframe, detectPlatform, parseStats } = require('../utils/scraperUtils');

class ScrapingService {
    static async scrapeProfile({ email, password, targetUser, platform, timeframe = '7d', customUrl }) {
        const config = scraperConfigs[platform];
        if (!config && !customUrl) {
            throw new Error(`Unsupported platform: ${platform}. Supported platforms: ${Object.keys(scraperConfigs).join(', ')}`);
        }

        let browser;
        let page;

        try {
            logger.info(`Starting scrape for ${targetUser} on ${platform}...`);

            // Launch browser with optimized settings
            browser = await puppeteer.launch({
                headless: process.env.NODE_ENV === 'production' ? 'new' : false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding'
                ],
                defaultViewport: { width: 1366, height: 768 }
            });

            page = await browser.newPage();

            // Set realistic user agent and headers
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
            });

            // Perform login if credentials provided
            if (password && config) {
                await this.performLogin(page, config, email, password);
            }

            // Navigate to target profile
            const targetUrl = customUrl || config.profileUrl(targetUser);
            logger.info(`Navigating to: ${targetUrl}`);

            await page.goto(targetUrl, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for content to load and scroll to load more posts
            await this.loadMoreContent(page);

            // Extract post data
            logger.info('Extracting post data...');
            const posts = await this.extractPostData(page, config, timeframe);

            logger.info(`Successfully scraped ${posts.length} posts`);

            return {
                success: true,
                data: {
                    platform,
                    targetUser,
                    timeframe,
                    totalPosts: posts.length,
                    scrapedAt: new Date().toISOString(),
                    posts
                }
            };

        } catch (error) {
            logger.error('Scraping error:', error);
            throw new Error(`Scraping failed: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    static async performLogin(page, config, email, password) {
        logger.info('Performing login...');

        await page.goto(config.loginUrl, { waitUntil: 'networkidle2' });

        // Wait for login form
        await this.waitForSelector(page, config.selectors.usernameInput, 10000);

        // Handle any initial popups or cookie banners
        await this.handlePopups(page);

        // Enter credentials
        await page.type(config.selectors.usernameInput, email, { delay: 100 });
        await page.waitForTimeout(1000);
        await page.type(config.selectors.passwordInput, password, { delay: 100 });
        await page.waitForTimeout(1000);

        // Click login button
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            page.click(config.selectors.loginButton)
        ]);

        // Check for 2FA or additional verification
        await this.handle2FA(page, config);

        logger.info('Login completed successfully');
    }

    static async handlePopups(page) {
        // Handle common popup selectors
        const popupSelectors = [
            '[aria-label="Close"]',
            '[data-testid="close"]',
            '.cookie-banner button',
            '#accept-cookie-banner',
            '[aria-label="Accept cookies"]'
        ];

        for (const selector of popupSelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    await element.click();
                    await page.waitForTimeout(1000);
                }
            } catch (error) {
                // Ignore popup handling errors
            }
        }
    }

    static async handle2FA(page, config) {
        // Check for 2FA prompts (platform-specific)
        const twoFASelectors = {
            twitter: '[data-testid="ocfEnterTextTextInput"]',
            instagram: 'input[name="verificationCode"]',
            linkedin: '#challenge-form input'
        };

        const platform = detectPlatform(page.url());
        const twoFASelector = twoFASelectors[platform];

        if (twoFASelector) {
            try {
                await page.waitForSelector(twoFASelector, { timeout: 5000 });
                logger.warn('2FA detected but not implemented. Manual intervention required.');
                throw new Error('2FA verification required. Please disable 2FA or implement 2FA handling.');
            } catch (error) {
                // No 2FA prompt found, continue
            }
        }
    }

    static async loadMoreContent(page) {
        logger.info('Loading additional content...');

        // Wait for initial content
        await page.waitForTimeout(3000);

        // Scroll to load more posts
        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await page.waitForTimeout(2000);

            // Check if "Load More" button exists and click it
            try {
                const loadMoreButton = await page.$('[data-testid="loadMore"], .load-more, [aria-label="Load more"]');
                if (loadMoreButton) {
                    await loadMoreButton.click();
                    await page.waitForTimeout(2000);
                }
            } catch (error) {
                // Continue if no load more button
            }
        }
    }

    static async extractPostData(page, config, timeframe) {
        const posts = [];

        try {
            await page.waitForSelector(config.selectors.posts, { timeout: 10000 });
        } catch (error) {
            logger.warn('No posts found or posts selector not found');
            return posts;
        }

        const postElements = await page.$$(config.selectors.posts);
        const timeframeMs = parseTimeframe(timeframe);
        const cutoffDate = new Date(Date.now() - timeframeMs);

        logger.info(`Found ${postElements.length} post elements, filtering by timeframe...`);

        for (let i = 0; i < Math.min(postElements.length, 50); i++) {
            try {
                const post = postElements[i];

                // Extract post data with error handling for each field
                const postData = await this.extractSinglePost(page, post, config, i);

                if (!postData) {continue;}

                // Parse and validate date
                const postDate = new Date(postData.dateStr);
                if (isNaN(postDate.getTime())) {
                    logger.warn(`Invalid date for post ${i}: ${postData.dateStr}`);
                    continue;
                }

                // Skip if post is older than timeframe
                if (postDate < cutoffDate) {
                    logger.debug(`Skipping old post from ${postDate.toISOString()}`);
                    continue;
                }

                posts.push({
                    id: `post_${i}_${Date.now()}`,
                    text: postData.text || '',
                    author: postData.author || '',
                    date: postDate.toISOString(),
                    timestamp: postDate.getTime(),
                    stats: postData.stats || {},
                    platform: detectPlatform(page.url()),
                    url: postData.url || ''
                });

            } catch (error) {
                logger.warn(`Error extracting post ${i}:`, error.message);
                continue;
            }
        }

        return posts;
    }

    static async extractSinglePost(page, postElement, config, index) {
        try {
            // Extract text content
            const textElement = await postElement.$(config.selectors.postText);
            const text = textElement ?
                await page.evaluate(el => el.textContent?.trim() || '', textElement) : '';

            // Extract date
            const dateElement = await postElement.$(config.selectors.postDate);
            const dateStr = dateElement ?
                await page.evaluate(el => el.getAttribute('datetime') || el.getAttribute('title') || el.textContent?.trim() || '', dateElement) : '';

            // Extract author
            const authorElement = await postElement.$(config.selectors.postAuthor);
            const author = authorElement ?
                await page.evaluate(el => el.textContent?.trim() || el.getAttribute('href')?.split('/').pop() || '', authorElement) : '';

            // Extract stats
            const statsElement = await postElement.$(config.selectors.postStats);
            let stats = {};
            if (statsElement) {
                const statsText = await page.evaluate(el => el.textContent || '', statsElement);
                stats = parseStats(statsText);
            }

            // Extract post URL if available
            const linkElement = await postElement.$('a[href*="/status/"], a[href*="/p/"], a[href*="/activity"]');
            const url = linkElement ?
                await page.evaluate(el => el.href, linkElement) : '';

            return {
                text,
                dateStr,
                author,
                stats,
                url
            };

        } catch (error) {
            logger.warn(`Error extracting individual post data:`, error.message);
            return null;
        }
    }

    static async waitForSelector(page, selector, timeout = 5000) {
        try {
            await page.waitForSelector(selector, { timeout });
            return true;
        } catch (error) {
            logger.warn(`Selector not found within timeout: ${selector}`);
            return false;
        }
    }

    // Facebook-specific scraping implementation
// Add to src/services/realisticScrapingService.js

    async scrapeFacebookPosts(page, timeframe) {
        const posts = [];
        const cutoffDate = new Date(Date.now() - this.parseTimeframe(timeframe));

        // Handle Facebook's specific popups and prompts
        await this.handleFacebookSpecificPopups(page);

        // Scroll and collect posts
        let scrollAttempts = 0;
        const maxScrolls = 8;

        while (scrollAttempts < maxScrolls && posts.length < 40) {
            // Extract current visible posts
            const fbPosts = await page.$$('[data-pagelet="FeedUnit"], [role="article"]');

            for (const post of fbPosts) {
                try {
                    const postData = await this.extractFacebookPostData(page, post, cutoffDate);
                    if (postData && !posts.find(p => p.id === postData.id)) {
                        posts.push(postData);
                    }
                } catch (error) {
                    logger.warn('Error extracting Facebook post:', error.message);
                }
            }

            // Facebook-specific scrolling (slower to avoid detection)
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight / 2);
            });
            await this.randomDelay(2000, 3000);

            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await this.randomDelay(3000, 5000);

            scrollAttempts++;
        }

        return posts.filter(post => new Date(post.date) >= cutoffDate);
    }

    async handleFacebookSpecificPopups(page) {
        const facebookPopups = [
            // Cookie/Privacy popups
            '[data-testid="cookie-policy-manage-dialog"] button[data-cookiebanner="accept_button"]',
            'button[data-cookiebanner="accept_button"]',
            '[aria-label="Allow all cookies"]',

            // Location prompts
            '._n1s button', // Location sharing prompt
            '[data-testid="location-sharing-permissions-modal"] button',

            // Notification prompts
            'button[data-testid="notification-banner-dismiss"]',
            '._5vas button', // Turn on notifications

            // Chat/Messenger popups
            '.fbNubFlyoutOuter ._4_j1', // Chat close button

            // Mobile app prompts
            '[data-testid="app-install-banner"] button',

            // General dialog close buttons
            'div[role="dialog"] [aria-label="Close"]',
            '._3ixn', // Generic close button

            // Privacy checkup prompts
            '[data-testid="privacy-checkup-modal"] button'
        ];

        for (const selector of facebookPopups) {
            try {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    const isVisible = await page.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' &&
                            style.visibility !== 'hidden' &&
                            style.opacity !== '0' &&
                            el.offsetWidth > 0 &&
                            el.offsetHeight > 0;
                    }, element);

                    if (isVisible) {
                        await element.click();
                        await this.randomDelay(1000, 2000);
                        logger.info('Closed Facebook popup');
                        break;
                    }
                }
            } catch (error) {
                // Continue if popup handling fails
            }
        }
    }

    async extractFacebookPostData(page, postElement, cutoffDate) {
        try {
            // Facebook has multiple post formats, try different selectors
            const textSelectors = [
                '[data-testid="post_message"]',
                '.userContent',
                '._5pbx',
                '.text_exposed_show',
                '[data-ad-preview="message"]'
            ];

            const dateSelectors = [
                'abbr[data-utime]',
                '._5ptz',
                '.timestampContent',
                '.livetimestamp',
                'a[role="link"] span[dir="auto"]'
            ];

            const authorSelectors = [
                '.fwb a',
                '._6qw4',
                '.profileLink',
                '.actorName a',
                'h3 a[role="link"]'
            ];

            // Extract text content
            let text = '';
            for (const selector of textSelectors) {
                try {
                    const textElement = await postElement.$(selector);
                    if (textElement) {
                        text = await page.evaluate(el => el.textContent?.trim() || '', textElement);
                        if (text) {break;}
                    }
                } catch (e) { continue; }
            }

            // Extract date
            let dateStr = '';
            let postDate = null;
            for (const selector of dateSelectors) {
                try {
                    const dateElement = await postElement.$(selector);
                    if (dateElement) {
                        // Try to get data-utime attribute first (Unix timestamp)
                        const utime = await page.evaluate(el => el.getAttribute('data-utime'), dateElement);
                        if (utime) {
                            postDate = new Date(parseInt(utime) * 1000);
                            dateStr = postDate.toISOString();
                            break;
                        }

                        // Fallback to text content
                        const dateText = await page.evaluate(el => el.textContent?.trim() || el.getAttribute('title') || '', dateElement);
                        if (dateText) {
                            postDate = this.parseFacebookDate(dateText);
                            if (postDate) {
                                dateStr = postDate.toISOString();
                                break;
                            }
                        }
                    }
                } catch (e) { continue; }
            }

            if (!postDate || postDate < cutoffDate) {return null;}

            // Extract author
            let author = '';
            for (const selector of authorSelectors) {
                try {
                    const authorElement = await postElement.$(selector);
                    if (authorElement) {
                        author = await page.evaluate(el => el.textContent?.trim() || '', authorElement);
                        if (author) {break;}
                    }
                } catch (e) { continue; }
            }

            // Extract post URL
            let postUrl = '';
            try {
                const linkElement = await postElement.$('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/story"]');
                if (linkElement) {
                    postUrl = await page.evaluate(el => el.href, linkElement);
                }
            } catch (e) { /* URL extraction failed */ }

            // Extract stats
            const stats = await this.extractFacebookStats(page, postElement);

            return {
                id: `facebook_${postDate.getTime()}_${text.slice(0, 20).replace(/\W/g, '')}`,
                text: text.trim(),
                author: author.trim(),
                date: dateStr,
                timestamp: postDate.getTime(),
                platform: 'facebook',
                url: postUrl,
                stats
            };

        } catch (error) {
            return null;
        }
    }

    async extractFacebookStats(page, postElement) {
        try {
            const statsSelectors = [
                '._3-8y', // Like count
                '._1g06', // Comment count
                '.UFILikesCount', // Legacy like count
                '._4arz', // Share count
                '[data-testid="fbFeedStoryUFI"]' // Unified feedback interface
            ];

            let statsText = '';
            for (const selector of statsSelectors) {
                try {
                    const statsContainer = await postElement.$(selector);
                    if (statsContainer) {
                        const text = await page.evaluate(el => el.textContent, statsContainer);
                        statsText += ' ' + text;
                    }
                } catch (e) { continue; }
            }

            // Facebook-specific stat parsing
            return this.parseStats(statsText, 'facebook');
        } catch (error) {
            return {};
        }
    }

    parseFacebookDate(dateText) {
        try {
            // Facebook date formats can be:
            // "2 hours ago", "Yesterday at 3:30 PM", "November 15 at 2:45 PM", "2023"

            const now = new Date();

            // Handle relative times
            if (dateText.includes('ago')) {
                const timeMatch = dateText.match(/(\d+)\s*(minute|hour|day|week)s?\s*ago/i);
                if (timeMatch) {
                    const value = parseInt(timeMatch[1]);
                    const unit = timeMatch[2].toLowerCase();

                    switch (unit) {
                        case 'minute':
                            return new Date(now.getTime() - value * 60 * 1000);
                        case 'hour':
                            return new Date(now.getTime() - value * 60 * 60 * 1000);
                        case 'day':
                            return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
                        case 'week':
                            return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
                    }
                }
            }

            // Handle "Yesterday"
            if (dateText.toLowerCase().includes('yesterday')) {
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            }

            // Handle month/day formats
            const monthMatch = dateText.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i);
            if (monthMatch) {
                const monthName = monthMatch[1];
                const day = parseInt(monthMatch[2]);
                const year = now.getFullYear();

                const date = new Date(`${monthName} ${day}, ${year}`);

                // If the date is in the future, assume it's from last year
                if (date > now) {
                    date.setFullYear(year - 1);
                }

                return date;
            }

            // Try standard date parsing as fallback
            const standardDate = new Date(dateText);
            if (!isNaN(standardDate.getTime())) {
                return standardDate;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

// Instagram scraper implementation (enhanced)
    async scrapeInstagramPosts(page, timeframe) {
        const posts = [];
        const cutoffDate = new Date(Date.now() - this.parseTimeframe(timeframe));

        // Handle Instagram's specific popups
        await this.handleInstagramSpecificPopups(page);

        // Wait for posts to load
        await page.waitForSelector('article, ._aa_c', { timeout: 15000 }).catch(() => {
            logger.warn('Instagram posts not found');
        });

        let scrollAttempts = 0;
        const maxScrolls = 6;

        while (scrollAttempts < maxScrolls && posts.length < 30) {
            const igPosts = await page.$$('article, ._aa_c');

            for (const post of igPosts) {
                try {
                    const postData = await this.extractInstagramPostData(page, post, cutoffDate);
                    if (postData && !posts.find(p => p.id === postData.id)) {
                        posts.push(postData);
                    }
                } catch (error) {
                    logger.warn('Error extracting Instagram post:', error.message);
                }
            }

            // Instagram-specific scrolling
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await this.randomDelay(3000, 5000);
            scrollAttempts++;
        }

        return posts.filter(post => new Date(post.date) >= cutoffDate);
    }

    async handleInstagramSpecificPopups(page) {
        const instagramPopups = [
            // Cookie banners
            'button[data-cookiebanner="accept_button"]',

            // App install prompts
            '[data-testid="app-install-banner"] button',
            'button[data-testid="ig-close-button"]',

            // Turn on notifications
            '._ac69 button',
            '[data-testid="turnOnNotifications"] button',

            // Login prompts for logged out users
            '[data-testid="login-modal"] button[data-testid="close"]',

            // Story prompts
            '[data-testid="story-close-button"]',

            // General dialog close
            'button[aria-label="Close"]',
            '[role="dialog"] button[aria-label="Close"]'
        ];

        for (const selector of instagramPopups) {
            try {
                const element = await page.$(selector);
                if (element) {
                    await element.click();
                    await this.randomDelay(1000, 2000);
                    logger.info('Closed Instagram popup');
                }
            } catch (error) {
                // Continue if popup handling fails
            }
        }
    }

    async extractInstagramPostData(page, postElement, cutoffDate) {
        try {
            // Instagram post selectors
            const textSelectors = [
                '._a9zs', // Caption text
                '.caption',
                '[data-testid="post-text"]',
                'span[dir="auto"]'
            ];

            const dateSelectors = [
                'time',
                '._a9ze', // Date element
                '[datetime]'
            ];

            const authorSelectors = [
                'header a',
                '.username',
                '[data-testid="post-author"]'
            ];

            // Extract text
            let text = '';
            for (const selector of textSelectors) {
                try {
                    const textElement = await postElement.$(selector);
                    if (textElement) {
                        text = await page.evaluate(el => el.textContent?.trim() || '', textElement);
                        if (text) {break;}
                    }
                } catch (e) { continue; }
            }

            // Extract date
            let dateStr = '';
            let postDate = null;
            for (const selector of dateSelectors) {
                try {
                    const dateElement = await postElement.$(selector);
                    if (dateElement) {
                        dateStr = await page.evaluate(el =>
                                el.getAttribute('datetime') ||
                                el.getAttribute('title') ||
                                el.textContent?.trim() || '',
                            dateElement
                        );

                        if (dateStr) {
                            postDate = new Date(dateStr);
                            if (!isNaN(postDate.getTime())) {break;}
                        }
                    }
                } catch (e) { continue; }
            }

            if (!postDate || postDate < cutoffDate) {return null;}

            // Extract author
            let author = '';
            for (const selector of authorSelectors) {
                try {
                    const authorElement = await postElement.$(selector);
                    if (authorElement) {
                        author = await page.evaluate(el => el.textContent?.trim() || '', authorElement);
                        if (author) {break;}
                    }
                } catch (e) { continue; }
            }

            // Extract post URL
            let postUrl = '';
            try {
                const linkElement = await postElement.$('a[href*="/p/"]');
                if (linkElement) {
                    postUrl = await page.evaluate(el => el.href, linkElement);
                }
            } catch (e) { /* URL extraction failed */ }

            return {
                id: `instagram_${postDate.getTime()}_${text.slice(0, 20).replace(/\W/g, '')}`,
                text: text.trim(),
                author: author.trim(),
                date: postDate.toISOString(),
                timestamp: postDate.getTime(),
                platform: 'instagram',
                url: postUrl,
                stats: await this.extractInstagramStats(page, postElement)
            };

        } catch (error) {
            return null;
        }
    }

    async extractInstagramStats(page, postElement) {
        try {
            // Instagram stats are often in buttons or spans
            const statsContainer = await postElement.$('section, .stats');
            if (!statsContainer) {return {};}

            const statsText = await page.evaluate(el => el.textContent, statsContainer);
            return this.parseStats(statsText, 'instagram');
        } catch (error) {
            return {};
        }
    }
}

module.exports = ScrapingService;