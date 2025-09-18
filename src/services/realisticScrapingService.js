const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const { scraperConfigs, platformSettings, commonSelectors, platformSpecialHandling } = require('../config/scraperConfigs');
const { parseTimeframe, detectPlatform, parseStats, cleanText, parseDate, generatePostId, sanitizeText } = require('../utils/scraperUtils');

class RealisticScrapingService {
    constructor() {
        this.sessionDir = path.join(__dirname, '../../sessions');
        this.stealthConfig = {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            timeouts: {
                navigation: 45000,
                selector: 15000,
                typing: 100
            }
        };
    }

    /**
     * Main scraping method that routes expect
     */
    async scrapeWithCredentials({ email, password, targetUser, platform, timeframe = '7d', sessionId }) {
        const config = scraperConfigs[platform];
        if (!config) {
            throw new Error(`Unsupported platform: ${platform}. Supported platforms: ${Object.keys(scraperConfigs).join(', ')}`);
        }

        let browser;
        let page;

        try {
            // Ensure session directory exists
            await fs.ensureDir(this.sessionDir);

            // Use persistent session directory
            const userDataDir = sessionId ?
                path.join(this.sessionDir, `${platform}_${sessionId}`) :
                path.join(this.sessionDir, `${platform}_${Buffer.from(email).toString('base64').slice(0, 8)}`);

            logger.info(`Using session directory: ${userDataDir}`);

            browser = await this.launchStealthBrowser(userDataDir);
            page = await this.createStealthPage(browser);

            // Check if we have a valid existing session
            const isLoggedIn = await this.checkExistingSession(page, platform);

            if (!isLoggedIn) {
                logger.info('No valid session found, performing login...');
                await this.performStealthLogin(page, platform, email, password);

                // Save successful login state
                await this.saveSessionState(userDataDir, {
                    email,
                    platform,
                    lastLogin: new Date().toISOString()
                });
            } else {
                logger.info('Found valid existing session, skipping login');
            }

            // Navigate to target profile and scrape
            const posts = await this.scrapeTargetProfile(page, platform, targetUser, timeframe);

            return {
                success: true,
                data: {
                    platform,
                    targetUser,
                    timeframe,
                    totalPosts: posts.length,
                    scrapedAt: new Date().toISOString(),
                    sessionUsed: !!isLoggedIn,
                    posts
                }
            };

        } catch (error) {
            logger.error('Realistic scraping error:', error);

            // If login failed, clean session and suggest retry
            if (error.message.includes('login') || error.message.includes('authentication')) {
                await this.cleanSession(userDataDir);
                throw new Error(`Authentication failed: ${error.message}. Session cleared - please retry.`);
            }

            throw error;
        } finally {
            // Keep browser open for session persistence in development
            if (browser && process.env.NODE_ENV === 'production') {
                await browser.close();
            }
        }
    }

    /**
     * Test credentials without full scraping
     */
    async testCredentials({ email, password, platform, sessionId }) {
        let browser;
        let page;

        try {
            const userDataDir = sessionId ?
                path.join(this.sessionDir, `test_${platform}_${sessionId}`) :
                path.join(this.sessionDir, `test_${platform}_${Date.now()}`);

            browser = await this.launchStealthBrowser(userDataDir);
            page = await this.createStealthPage(browser);

            // Try to login
            const config = scraperConfigs[platform];
            await page.goto(config.loginUrl, { waitUntil: 'networkidle2' });

            await this.handlePlatformSpecificPopups(page, platform);

            // Attempt login
            await this.performLoginSteps(page, platform, email, password);

            // Check if login was successful
            await this.randomDelay(3000, 5000);
            const loginSuccessful = await this.checkLoginSuccess(page, platform);

            return {
                loginSuccessful,
                requires2FA: false, // Will be detected during login attempt
                sessionSaved: loginSuccessful
            };

        } catch (error) {
            return {
                loginSuccessful: false,
                requires2FA: error.message.includes('2FA') || error.message.includes('verification'),
                sessionSaved: false
            };
        } finally {
            if (browser) {
                await browser.close();
            }
        }
    }

    async launchStealthBrowser(userDataDir) {
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-web-security',
            '--disable-extensions-except',
            '--disable-plugins-discovery',
            '--disable-preconnect',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--mute-audio',
            '--disable-client-side-phishing-detection',
            '--disable-sync',
            '--disable-background-networking',
            '--metrics-recording-only',
            '--safebrowsing-disable-auto-update',
            '--password-store=basic',
            '--use-mock-keychain'
        ];

        return await puppeteer.launch({
            headless: process.env.NODE_ENV === 'production' ? 'new' : false,
            userDataDir,
            args,
            defaultViewport: this.stealthConfig.viewport,
            ignoreDefaultArgs: ['--enable-automation'],
            executablePath: undefined,
        });
    }

    async createStealthPage(browser) {
        const page = await browser.newPage();

        await page.setUserAgent(this.stealthConfig.userAgent);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Cache-Control': 'max-age=0',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        });

        // Remove automation indicators
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });

            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            window.chrome = {
                runtime: {},
            };
        });

        await page.setViewport(this.stealthConfig.viewport);

        return page;
    }

    async checkExistingSession(page, platform) {
        const homeUrls = {
            twitter: 'https://twitter.com/home',
            facebook: 'https://www.facebook.com/',
            instagram: 'https://www.instagram.com/',
            linkedin: 'https://www.linkedin.com/feed/'
        };

        const loggedInSelectors = {
            twitter: '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]',
            facebook: '[data-testid="left_nav_menu_list"], .fbxWelcomeBoxName, [role="navigation"]',
            instagram: '[aria-label="Home"], nav[role="navigation"]',
            linkedin: '.global-nav__me, .feed-shared-update-v2'
        };

        try {
            await page.goto(homeUrls[platform], {
                waitUntil: 'networkidle2',
                timeout: this.stealthConfig.timeouts.navigation
            });

            await new Promise(resolve => setTimeout(resolve, 3000));

            const isLoggedIn = await page.$(loggedInSelectors[platform]) !== null;
            logger.info(`Session check for ${platform}: ${isLoggedIn ? 'VALID' : 'INVALID'}`);

            return isLoggedIn;
        } catch (error) {
            logger.warn('Session check failed:', error.message);
            return false;
        }
    }

    async performStealthLogin(page, platform, email, password) {
        logger.info('Performing stealth login...');

        const config = scraperConfigs[platform];

        await page.goto(config.loginUrl, { waitUntil: 'networkidle2' });
        await this.handlePlatformSpecificPopups(page, platform);

        await this.performLoginSteps(page, platform, email, password);
        await this.handlePostLoginFlow(page, platform);

        logger.info('Stealth login completed');
    }

    async performLoginSteps(page, platform, email, password) {
        const config = scraperConfigs[platform];

        // Wait for login form
        await this.waitForSelector(page, config.selectors.usernameInput, 10000);

        // Enter credentials with human-like behavior
        await this.humanLikeTyping(page, config.selectors.usernameInput, email);
        await this.randomDelay(1000, 2000);

        // Handle password field (might appear after username)
        await this.waitForSelector(page, config.selectors.passwordInput, 5000);
        await this.humanLikeTyping(page, config.selectors.passwordInput, password);
        await this.randomDelay(1000, 2000);

        // Click login button
        await this.humanLikeClick(page, config.selectors.loginButton);

        // Wait for navigation or login response
        try {
            await page.waitForNavigation({
                waitUntil: 'networkidle2',
                timeout: 30000
            });
        } catch (error) {
            // Some platforms don't navigate, just update the page
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    async handlePostLoginFlow(page, platform) {
        const twoFASelectors = {
            twitter: '[data-testid="ocfEnterTextTextInput"], input[name="challenge_response"]',
            facebook: 'input[name="approvals_code"], [data-testid="verification_code_input"]',
            instagram: 'input[name="verificationCode"], input[aria-label="Security code"]',
            linkedin: '#challenge-form input, input[name="challengeId"]'
        };

        const successSelectors = {
            twitter: '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]',
            facebook: '[data-testid="left_nav_menu_list"], .fbxWelcomeBoxName',
            instagram: '[aria-label="Home"], nav[role="navigation"]',
            linkedin: '.global-nav__me, .feed-shared-update-v2'
        };

        try {
            const result = await Promise.race([
                page.waitForSelector(twoFASelectors[platform], { timeout: 10000 }).then(() => '2fa'),
                page.waitForSelector(successSelectors[platform], { timeout: 10000 }).then(() => 'success'),
                await new Promise(resolve => setTimeout(resolve, 3000)).then(() => 'timeout')
            ]);

            if (result === '2fa') {
                await this.handle2FAPrompt(page, platform);
            } else if (result === 'success') {
                logger.info('Login successful - no 2FA required');
            } else {
                const currentUrl = page.url();
                if (currentUrl.includes('challenge') || currentUrl.includes('checkpoint') || currentUrl.includes('verify')) {
                    throw new Error('Additional verification required - please complete manually');
                }
            }
        } catch (error) {
            logger.error('Post-login flow error:', error.message);
            throw new Error(`Login verification failed: ${error.message}`);
        }
    }

    async handle2FAPrompt(page, platform) {
        logger.warn(`2FA detected for ${platform}`);

        if (process.env.NODE_ENV !== 'production') {
            console.log('\n🔐 2FA CODE REQUIRED:');
            console.log('Please enter your 2FA code in the browser window.');
            console.log('Waiting up to 2 minutes for completion...\n');

            try {
                await page.waitForNavigation({
                    waitUntil: 'networkidle2',
                    timeout: 120000
                });
                logger.info('2FA completed successfully');
            } catch (error) {
                throw new Error('2FA timeout - please complete verification within 2 minutes');
            }
        } else {
            throw new Error('2FA required but running in production mode - manual intervention needed');
        }
    }

    async handlePlatformSpecificPopups(page, platform) {
        const platformPopups = {
            facebook: [
                '[data-cookiebanner="accept_button"]',
                'button[data-cookiebanner="accept_button"]',
                '[aria-label="Allow all cookies"]',
                '._n1s button',
                '[data-testid="cookie-policy-manage-dialog"] button',
                'div[role="dialog"] [aria-label="Close"]',
                '.fbNubFlyoutOuter ._4_j1'
            ],
            twitter: [
                '[aria-label="Accept cookies"]',
                '[data-testid="cookie-banner-accept"]',
                '[data-testid="close"]',
                'div[role="dialog"] [aria-label="Close"]'
            ],
            instagram: [
                'button[data-cookiebanner="accept_button"]',
                '[data-testid="app-install-banner"] button',
                'button[data-testid="ig-close-button"]',
                '._ac69 button',
                'button[aria-label="Close"]'
            ]
        };

        const selectors = platformPopups[platform] || [];

        for (const selector of selectors) {
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
                        logger.info(`Closed ${platform} popup`);
                        break;
                    }
                }
            } catch (error) {
                // Continue if popup handling fails
            }
        }
    }

    async scrapeTargetProfile(page, platform, targetUser, timeframe) {
        const config = scraperConfigs[platform];
        const profileUrl = config.profileUrl(targetUser);

        logger.info(`Navigating to profile: ${profileUrl}`);
        await page.goto(profileUrl, {
            waitUntil: 'networkidle2',
            timeout: this.stealthConfig.timeouts.navigation
        });

        // Wait for content to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Platform-specific scraping
        switch (platform) {
            case 'twitter':
                return await this.scrapeTwitterPosts(page, timeframe);
            case 'facebook':
                return await this.scrapeFacebookPosts(page, timeframe);
            default:
                throw new Error(`Scraping not implemented for platform: ${platform}`);
        }
    }

    async scrapeTwitterPosts(page, timeframe) {
        const posts = [];
        const cutoffDate = new Date(Date.now() - parseTimeframe(timeframe));

        // Handle Twitter-specific popups
        await this.handlePlatformSpecificPopups(page, 'twitter');

        // Wait for tweets to load
        await page.waitForSelector('[data-testid="tweet"]', { timeout: 15000 }).catch(() => {
            logger.warn('Twitter posts not found');
        });

        let scrollAttempts = 0;
        const maxScrolls = 10;

        while (scrollAttempts < maxScrolls && posts.length < 50) {
            console.log('Looking for tweets...');
            const tweets = await page.$$('[data-testid="tweet"]');
            console.log(`Found ${tweets.length} tweet elements`);

            for (const tweet of tweets) {
                try {
                    const tweetData = await this.extractTwitterPostData(page, tweet, cutoffDate);
                    if (tweetData && !posts.find(p => p.id === tweetData.id)) {
                        posts.push(tweetData);
                    }
                } catch (error) {
                    logger.warn('Error extracting tweet:', error.message);
                }
            }

            // Scroll to load more
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await this.randomDelay(2000, 4000);
            scrollAttempts++;
        }

        return posts.filter(post => new Date(post.date) >= cutoffDate);
    }

    async scrapeFacebookPosts(page, timeframe) {
        const posts = [];
        const cutoffDate = new Date(Date.now() - parseTimeframe(timeframe));

        // Handle Facebook-specific popups
        await this.handlePlatformSpecificPopups(page, 'facebook');

        // Wait for posts to load
        await page.waitForSelector('[data-pagelet="FeedUnit"], [role="article"]', { timeout: 15000 }).catch(() => {
            logger.warn('Facebook posts not found');
        });

        let scrollAttempts = 0;
        const maxScrolls = 8;

        while (scrollAttempts < maxScrolls && posts.length < 40) {
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

    async extractTwitterPostData(page, tweetElement, cutoffDate) {
        try {
            const textElement = await tweetElement.$('[data-testid="tweetText"]');
            const timeElement = await tweetElement.$('time');
            const authorElement = await tweetElement.$('[data-testid="User-Names"] a');

            if (!timeElement) {return null;}

            const text = textElement ? await page.evaluate(el => el.textContent?.trim() || '', textElement) : '';
            const dateStr = await page.evaluate(el => el.getAttribute('datetime'), timeElement);
            const postDate = new Date(dateStr);

            if (postDate < cutoffDate) {return null;}

            const author = authorElement ? await page.evaluate(el => el.textContent?.trim() || '', authorElement) : '';
            const postUrl = await page.evaluate(el => {
                const link = el.querySelector('a[href*="/status/"]');
                return link ? link.href : '';
            }, tweetElement);

            const stats = await this.extractTwitterStats(page, tweetElement);

            return {
                id: generatePostId('twitter', author, postDate.getTime(), 0),
                text: sanitizeText(text),
                author: sanitizeText(author),
                date: postDate.toISOString(),
                timestamp: postDate.getTime(),
                platform: 'twitter',
                url: postUrl,
                stats
            };

        } catch (error) {
            return null;
        }
    }

    async extractFacebookPostData(page, postElement, cutoffDate) {
        try {
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
            let postDate = null;
            for (const selector of dateSelectors) {
                try {
                    const dateElement = await postElement.$(selector);
                    if (dateElement) {
                        const utime = await page.evaluate(el => el.getAttribute('data-utime'), dateElement);
                        if (utime) {
                            postDate = new Date(parseInt(utime) * 1000);
                            break;
                        }

                        const dateText = await page.evaluate(el => el.textContent?.trim() || el.getAttribute('title') || '', dateElement);
                        if (dateText) {
                            postDate = this.parseFacebookDate(dateText);
                            if (postDate) {break;}
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

            const stats = await this.extractFacebookStats(page, postElement);

            return {
                id: generatePostId('facebook', author, postDate.getTime(), 0),
                text: sanitizeText(text),
                author: sanitizeText(author),
                date: postDate.toISOString(),
                timestamp: postDate.getTime(),
                platform: 'facebook',
                url: postUrl,
                stats
            };

        } catch (error) {
            return null;
        }
    }

    async extractTwitterStats(page, tweetElement) {
        try {
            const statsContainer = await tweetElement.$('[role="group"]');
            if (!statsContainer) {return {};}

            const statsText = await page.evaluate(el => el.textContent, statsContainer);
            return parseStats(statsText, 'twitter');
        } catch (error) {
            return {};
        }
    }

    async extractFacebookStats(page, postElement) {
        try {
            const statsSelectors = [
                '._3-8y',
                '._1g06',
                '.UFILikesCount',
                '._4arz',
                '[data-testid="fbFeedStoryUFI"]'
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

            return parseStats(statsText, 'facebook');
        } catch (error) {
            return {};
        }
    }

    parseFacebookDate(dateText) {
        try {
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

    async checkLoginSuccess(page, platform) {
        const successSelectors = {
            twitter: '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Home_Link"]',
            facebook: '[data-testid="left_nav_menu_list"], .fbxWelcomeBoxName',
            instagram: '[aria-label="Home"], nav[role="navigation"]',
            linkedin: '.global-nav__me'
        };

        try {
            const isSuccess = await page.$(successSelectors[platform]) !== null;
            return isSuccess;
        } catch (error) {
            return false;
        }
    }

    async humanLikeTyping(page, selector, text) {
        await page.waitForSelector(selector, { timeout: this.stealthConfig.timeouts.selector });

        // Clear existing content
        await page.click(selector);
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');

        // Type with human-like delays
        for (const char of text) {
            await page.type(selector, char, { delay: this.randomBetween(50, 150) });
        }

        await this.randomDelay(500, 1000);
    }

    async humanLikeClick(page, selector) {
        await page.waitForSelector(selector, { timeout: this.stealthConfig.timeouts.selector });

        const element = await page.$(selector);
        const box = await element.boundingBox();

        if (box) {
            const x = box.x + box.width / 2 + this.randomBetween(-5, 5);
            const y = box.y + box.height / 2 + this.randomBetween(-5, 5);

            await page.mouse.move(x, y, { steps: this.randomBetween(5, 10) });
            await this.randomDelay(100, 300);
            await page.mouse.click(x, y);
        } else {
            await page.click(selector);
        }
    }

    async waitForSelector(page, selector, timeout = 5000) {
        try {
            await page.waitForSelector(selector, { timeout });
            return true;
        } catch (error) {
            logger.warn(`Selector not found within timeout: ${selector}`);
            return false;
        }
    }

    randomBetween(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async randomDelay(min, max) {
        const delay = this.randomBetween(min, max);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async saveSessionState(userDataDir, sessionData) {
        try {
            const sessionFile = path.join(userDataDir, 'session_info.json');
            await fs.writeJson(sessionFile, sessionData);
            logger.info('Session state saved');
        } catch (error) {
            logger.warn('Failed to save session state:', error.message);
        }
    }

    async cleanSession(userDataDir) {
        try {
            await fs.remove(userDataDir);
            logger.info('Session directory cleaned');
        } catch (error) {
            logger.warn('Failed to clean session:', error.message);
        }
    }

    // Helper method to get directory size (used by routes)
    static async getDirectorySize(dirPath) {
        try {
            let totalSize = 0;
            const files = await fs.readdir(dirPath, { withFileTypes: true });

            for (const file of files) {
                const fullPath = path.join(dirPath, file.name);
                if (file.isDirectory()) {
                    totalSize += await RealisticScrapingService.getDirectorySize(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                }
            }

            return totalSize;
        } catch (error) {
            return 0;
        }
    }

    // Helper method to format bytes (used by routes)
    static formatBytes(bytes) {
        if (bytes === 0) {return '0 B';}
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

module.exports = RealisticScrapingService;