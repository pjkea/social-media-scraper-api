// Scraper configurations for different social media platforms
const scraperConfigs = {
    twitter: {
        loginUrl: 'https://twitter.com/login',
        profileUrl: (username) => `https://twitter.com/${username}`,
        selectors: {
            usernameInput: 'input[name="text"]',
            passwordInput: 'input[name="password"]',
            loginButton: '[data-testid="LoginForm_Login_Button"]',
            posts: '[data-testid="tweet"]',
            postText: '[data-testid="tweetText"]',
            postDate: 'time',
            postAuthor: '[data-testid="User-Names"] a',
            postStats: '[role="group"]'
        },
        alternativeSelectors: {
            posts: 'article[role="article"], [data-testid="tweet"], .tweet',
            postText: '[data-testid="tweetText"], .tweet-text, [lang]',
            postDate: 'time, [data-testid="Time"]',
            postAuthor: '[data-testid="User-Names"] a, .username, [data-testid="User-Name"]'
        }
    },

    instagram: {
        loginUrl: 'https://www.instagram.com/accounts/login/',
        profileUrl: (username) => `https://www.instagram.com/${username}/`,
        selectors: {
            usernameInput: 'input[name="username"]',
            passwordInput: 'input[name="password"]',
            loginButton: 'button[type="submit"]',
            posts: 'article',
            postText: '[data-testid="post-text"]',
            postDate: 'time',
            postAuthor: 'header a',
            postStats: '[data-testid="post-stats"]'
        },
        alternativeSelectors: {
            posts: 'article, .post, [role="presentation"]',
            postText: '.caption, ._a9zs, [data-testid="post-text"]',
            postDate: 'time, ._a9ze',
            postAuthor: 'header a, .username'
        }
    },

    linkedin: {
        loginUrl: 'https://www.linkedin.com/login',
        profileUrl: (username) => `https://www.linkedin.com/in/${username}/`,
        selectors: {
            usernameInput: '#username',
            passwordInput: '#password',
            loginButton: '.btn__primary--large',
            posts: '.feed-shared-update-v2',
            postText: '.feed-shared-text',
            postDate: '.feed-shared-actor__sub-description',
            postAuthor: '.feed-shared-actor__name',
            postStats: '.social-actions-buttons'
        },
        alternativeSelectors: {
            posts: '.feed-shared-update-v2, .occludable-update, [data-urn]',
            postText: '.feed-shared-text, .break-words',
            postDate: 'time, .feed-shared-actor__sub-description',
            postAuthor: '.feed-shared-actor__name, .update-components-actor__name'
        }
    }
};

// Platform-specific configurations and settings
const platformSettings = {
    twitter: {
        scrollDelay: 2000,
        maxScrolls: 5,
        postLimit: 50,
        loginTimeout: 30000,
        pageLoadTimeout: 15000
    },

    instagram: {
        scrollDelay: 3000,
        maxScrolls: 3,
        postLimit: 30,
        loginTimeout: 30000,
        pageLoadTimeout: 20000
    },

    linkedin: {
        scrollDelay: 2500,
        maxScrolls: 4,
        postLimit: 40,
        loginTimeout: 25000,
        pageLoadTimeout: 18000
    },

    facebook: {
        scrollDelay: 3500,
        maxScrolls: 6,
        postLimit: 40,
        loginTimeout: 35000,
        pageLoadTimeout: 25000
    },

    threads: {
        scrollDelay: 2000,
        maxScrolls: 4,
        postLimit: 35,
        loginTimeout: 25000,
        pageLoadTimeout: 15000
    },

    tiktok: {
        scrollDelay: 4000,
        maxScrolls: 3,
        postLimit: 20,
        loginTimeout: 30000,
        pageLoadTimeout: 20000
    },

    youtube: {
        scrollDelay: 3000,
        maxScrolls: 5,
        postLimit: 50,
        loginTimeout: 40000,
        pageLoadTimeout: 25000
    },

    pinterest: {
        scrollDelay: 2500,
        maxScrolls: 6,
        postLimit: 60,
        loginTimeout: 25000,
        pageLoadTimeout: 18000
    }
};

// Common selectors that might appear across platforms
const commonSelectors = {
    cookieBanner: [
        '[aria-label="Accept cookies"]',
        '[aria-label="Accept all cookies"]',
        '#accept-cookie-banner',
        '.cookie-banner button',
        '[data-testid="cookie-banner-accept"]',
        'button:contains("Accept")',
        'button:contains("Allow")',
        '[data-cookiebanner="accept_button"]'
    ],

    closeButtons: [
        '[aria-label="Close"]',
        '[data-testid="close"]',
        '.close-button',
        '[aria-label="Dismiss"]',
        '.modal-close',
        '[data-dismiss="modal"]'
    ],

    loadMoreButtons: [
        '[data-testid="loadMore"]',
        '.load-more',
        '[aria-label="Load more"]',
        '.show-more-button',
        'button:contains("See more")',
        'button:contains("Load more")',
        '[data-testid="show-more"]'
    ],

    notifications: [
        '[data-testid="notification-banner"]',
        '.notification-banner',
        '[role="banner"]',
        '.alert-banner',
        '.info-banner'
    ]
};

// Platform-specific special handling
const platformSpecialHandling = {
    facebook: {
        requiresCookieHandling: true,
        hasAgeVerification: true,
        requiresScrollPause: true,
        hasInfiniteScroll: true,
        commonPopups: [
            'div[role="dialog"]', // Various popups
            '[data-testid="cookie-policy-manage-dialog"]',
            '.fbNubFlyoutOuter', // Chat popup
            '._n1s' // Location prompt
        ]
    },

    instagram: {
        requiresCookieHandling: true,
        hasStoryPrompts: true,
        requiresScrollPause: true,
        hasInfiniteScroll: true,
        commonPopups: [
            'div[role="dialog"]',
            '[data-testid="app-install-banner"]',
            '._ac69' // Turn on notifications
        ]
    },

    threads: {
        usesInstagramAuth: true,
        requiresCookieHandling: true,
        isNewPlatform: true,
        hasInfiniteScroll: true,
        commonPopups: [
            'div[role="dialog"]',
            '[data-testid="login-interstitial"]'
        ]
    },

    tiktok: {
        requiresCookieHandling: true,
        hasAgeVerification: true,
        hasVideoAutoplay: true,
        hasInfiniteScroll: true,
        commonPopups: [
            'div[role="dialog"]',
            '[data-e2e="browse-mode-modal"]',
            '[data-e2e="login-modal"]'
        ]
    },

    youtube: {
        usesGoogleAuth: true,
        requiresCookieHandling: true,
        hasVideoAutoplay: true,
        hasSubscriptionPrompts: true,
        commonPopups: [
            'div[role="dialog"]',
            'tp-yt-paper-dialog',
            '.ytd-consent-bump-v2-lightbox'
        ]
    },

    pinterest: {
        requiresCookieHandling: true,
        hasSignupPrompts: true,
        hasInfiniteScroll: true,
        requiresScrollPause: true,
        commonPopups: [
            'div[role="dialog"]',
            '[data-test-id="unauth-signup-modal"]',
            '.signupFormContainer'
        ]
    }
};

module.exports = {
    scraperConfigs,
    platformSettings,
    commonSelectors,
    platformSpecialHandling
};