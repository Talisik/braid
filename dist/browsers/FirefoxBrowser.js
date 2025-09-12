import { firefox } from 'playwright';
import { NetworkMonitor } from '../monitors/NetworkMonitor.js';
import { PlayButtonDetector } from '../detectors/PlayButtonDetector.js';
export class FirefoxBrowser {
    browser = null;
    context = null;
    page = null;
    config;
    networkMonitor;
    playDetector;
    constructor(config = {}) {
        this.config = {
            headless: true,
            viewport: { width: 1280, height: 720 },
            ...config
        };
        this.networkMonitor = new NetworkMonitor();
        this.playDetector = new PlayButtonDetector();
    }
    /**
     * Launch Firefox browser with stealth mode
     */
    async launch() {
        console.log('Launching Firefox browser with stealth mode...');
        this.browser = await firefox.launch({
            headless: this.config.headless,
            firefoxUserPrefs: {
                // Disable automation indicators
                'dom.webdriver.enabled': false,
                'useAutomationExtension': false,
                'marionette.enabled': false,
                // Privacy and security settings
                'privacy.trackingprotection.enabled': true,
                'dom.webaudio.enabled': false,
                'media.navigator.enabled': false,
                'webgl.disabled': false,
                // Block ads and popups
                'dom.popup_allowed_events': '',
                'dom.disable_open_during_load': true,
                'browser.popup_blocker.enabled': true,
                // Performance settings
                'browser.cache.disk.enable': false,
                'browser.cache.memory.enable': false,
                'network.http.use-cache': false,
                // Media settings for video playback
                'media.autoplay.default': 0, // Allow autoplay
                'media.autoplay.blocking_policy': 0,
                'media.block-autoplay-until-in-foreground': false
            },
            args: [
                '--no-remote',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-translate',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-ipc-flooding-protection',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-blink-features=AutomationControlled',
                '--autoplay-policy=no-user-gesture-required'
            ]
        });
        this.context = await this.browser.newContext({
            viewport: this.config.viewport,
            userAgent: this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
            extraHTTPHeaders: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            },
            ignoreHTTPSErrors: true,
            javaScriptEnabled: true
        });
        // Advanced stealth techniques
        await this.context.addInitScript(() => {
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
                configurable: true
            });
            // More realistic plugins array
            Object.defineProperty(navigator, 'plugins', {
                get: () => ({
                    length: 5,
                    0: { name: 'Chrome PDF Plugin' },
                    1: { name: 'Chrome PDF Viewer' },
                    2: { name: 'Native Client' },
                    3: { name: 'WebKit built-in PDF' },
                    4: { name: 'Widevine Content Decryption Module' }
                }),
            });
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            // Mock realistic hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8,
            });
            // Mock realistic device memory
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
            });
            // Override permissions with more realistic responses
            const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
            window.navigator.permissions.query = (parameters) => {
                const responses = {
                    'notifications': 'granted',
                    'geolocation': 'prompt',
                    'camera': 'prompt',
                    'microphone': 'prompt'
                };
                const state = responses[parameters.name] || 'prompt';
                return Promise.resolve({
                    state,
                    name: parameters.name,
                    onchange: null,
                    addEventListener: () => { },
                    removeEventListener: () => { },
                    dispatchEvent: () => true
                });
            };
            // Add chrome object for compatibility
            if (!window.chrome) {
                Object.defineProperty(window, 'chrome', {
                    get: () => ({
                        runtime: {
                            onConnect: undefined,
                            onMessage: undefined
                        },
                        loadTimes: () => ({
                            commitLoadTime: Date.now() / 1000 - Math.random(),
                            connectionInfo: 'h2',
                            finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
                            finishLoadTime: Date.now() / 1000 - Math.random(),
                            firstPaintAfterLoadTime: 0,
                            firstPaintTime: Date.now() / 1000 - Math.random(),
                            navigationType: 'Other',
                            npnNegotiatedProtocol: 'h2',
                            requestTime: Date.now() / 1000 - Math.random(),
                            startLoadTime: Date.now() / 1000 - Math.random(),
                            wasAlternateProtocolAvailable: false,
                            wasFetchedViaSpdy: true,
                            wasNpnNegotiated: true
                        }),
                        csi: () => ({})
                    }),
                });
            }
            // Remove automation indicators
            const propsToDelete = [
                'webdriver',
                '__webdriver_script_fn',
                '__driver_evaluate',
                '__webdriver_evaluate',
                '__selenium_evaluate',
                '__fxdriver_evaluate',
                '__driver_unwrapped',
                '__webdriver_unwrapped',
                '__selenium_unwrapped',
                '__fxdriver_unwrapped',
                '_Selenium_IDE_Recorder',
                '_selenium',
                'calledSelenium',
                '$cdc_asdjflasutopfhvcZLmcfl_',
                '$chrome_asyncScriptInfo',
                '__$webdriverAsyncExecutor'
            ];
            propsToDelete.forEach(prop => {
                try {
                    delete window[prop];
                    delete document[prop];
                }
                catch (e) {
                    // Ignore errors
                }
            });
            // Override toString methods
            try {
                const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function (parameter) {
                    if (parameter === 37445) {
                        return 'Intel Inc.';
                    }
                    if (parameter === 37446) {
                        return 'Intel(R) Iris(TM) Graphics 6100';
                    }
                    return originalGetParameter.call(this, parameter);
                };
            }
            catch (e) {
                // Ignore WebGL errors
            }
            // Mock realistic media devices
            Object.defineProperty(navigator, 'mediaDevices', {
                get: () => ({
                    enumerateDevices: () => Promise.resolve([
                        { deviceId: 'default', kind: 'audioinput', label: 'Default - Microphone', groupId: 'group1' },
                        { deviceId: 'default', kind: 'audiooutput', label: 'Default - Speaker', groupId: 'group2' }
                    ]),
                    getUserMedia: () => Promise.reject(new Error('Permission denied'))
                }),
            });
            // Hide automation traces in Error stack traces
            try {
                const originalError = Error;
                const newError = function (...args) {
                    const error = new originalError(...args);
                    if (error.stack) {
                        error.stack = error.stack.replace(/\s+at .*\/automation\/.*$/gm, '');
                    }
                    return error;
                };
                Object.setPrototypeOf(newError, originalError);
                Object.defineProperty(newError, 'prototype', {
                    value: originalError.prototype,
                    writable: false
                });
                window.Error = newError;
            }
            catch (e) {
                // Ignore errors
            }
        });
        this.page = await this.context.newPage();
        // Block popup and ad-related requests
        await this.page.route('**/*', (route) => {
            const url = route.request().url();
            const resourceType = route.request().resourceType();
            // Block known popup/ad domains and patterns
            const blockPatterns = [
                'googleadservices.com',
                'googlesyndication.com',
                'doubleclick.net',
                'adsystem.com',
                'popads.net',
                'popunder',
                'popup',
                'verification',
                'captcha',
                '/ads/',
                '/popup/',
                '/verify/',
                'age-verification',
                'age_verification',
                'confirm-age',
                'adult-verification'
            ];
            // Block if URL contains popup/ad patterns
            if (blockPatterns.some(pattern => url.toLowerCase().includes(pattern))) {
                console.log(`Blocked popup/ad request: ${url}`);
                route.abort();
                return;
            }
            // Block certain resource types that are often used for ads/popups
            if (['image', 'font', 'stylesheet'].includes(resourceType) &&
                (url.includes('banner') || url.includes('ad') || url.includes('popup'))) {
                route.abort();
                return;
            }
            // Allow all other requests
            route.continue();
        });
        // Additional page-level stealth
        await this.page.addInitScript(() => {
            // Remove automation traces
            try {
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
            }
            catch (e) {
                // Ignore errors
            }
        });
        console.log('Firefox browser launched successfully with stealth mode.');
    }
    /**
     * Navigate to a URL and start monitoring with enhanced video detection
     */
    async navigateAndMonitor(url) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        console.log(`Navigating to: ${url}`);
        // Start network monitoring before navigation
        await this.networkMonitor.startMonitoring(this.page);
        // Navigate to the page with realistic options
        await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        // Wait for additional resources
        await this.page.waitForTimeout(2000);
        // Try to wait for network to be idle
        try {
            await this.page.waitForLoadState('networkidle', { timeout: 8000 });
        }
        catch (error) {
            console.log('Network idle timeout reached, continuing...');
        }
        console.log('Navigation completed and monitoring started.');
    }
    /**
     * Enhanced method that finds and clicks play button, then monitors for video streams
     */
    async findAndClickPlay(monitorDuration = 15000) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        console.log('Starting enhanced play button detection and clicking...');
        // Simulate human behavior first
        await this.playDetector.simulateUserInteraction(this.page);
        // Detect and click play button
        const playClicked = await this.playDetector.detectAndClickPlay(this.page);
        if (!playClicked) {
            console.log('No play button detected or clicked');
            return false;
        }
        // Wait a moment for the video to start loading
        await this.page.waitForTimeout(3000);
        // Monitor for video playback
        console.log('Monitoring for video streams after play click...');
        const startTime = Date.now();
        while (Date.now() - startTime < monitorDuration) {
            // Check if video is actually playing
            const isPlaying = await this.playDetector.waitForPlayback(this.page, 2000);
            if (isPlaying) {
                console.log('Video playback confirmed - continuing to monitor streams...');
                break;
            }
            // If not playing yet, try clicking again
            await this.page.waitForTimeout(2000);
        }
        return true;
    }
    /**
     * Simulate human-like interactions to bypass detection
     */
    async simulateHumanBehavior() {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        console.log('Simulating human behavior...');
        // Random mouse movements
        await this.page.mouse.move(Math.random() * 800 + 100, Math.random() * 600 + 100);
        // Random scroll
        await this.page.evaluate(() => {
            window.scrollTo(0, Math.random() * 500);
        });
        // Random wait
        await this.page.waitForTimeout(Math.random() * 3000 + 1000);
    }
    /**
     * Wait for a specific time while monitoring continues
     */
    async waitAndMonitor(milliseconds) {
        console.log(`Monitoring for ${milliseconds}ms...`);
        await this.page?.waitForTimeout(milliseconds);
    }
    /**
     * Get the network monitor instance
     */
    getNetworkMonitor() {
        return this.networkMonitor;
    }
    /**
     * Get the play button detector instance
     */
    getPlayDetector() {
        return this.playDetector;
    }
    /**
     * Get the current page instance
     */
    getPage() {
        return this.page;
    }
    /**
     * Execute JavaScript in the page context
     */
    async evaluateScript(script) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        return await this.page.evaluate(script);
    }
    /**
     * Execute a function in the page context
     */
    async evaluateFunction(fn) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        return await this.page.evaluate(fn);
    }
    /**
     * Take a screenshot
     */
    async screenshot(path) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        const screenshotOptions = { type: 'png' };
        if (path) {
            screenshotOptions.path = path;
        }
        return await this.page.screenshot(screenshotOptions);
    }
    /**
     * Click on an element
     */
    async click(selector) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        await this.page.click(selector);
    }
    /**
     * Wait for an element to appear
     */
    async waitForElement(selector, timeout = 10000) {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        await this.page.waitForSelector(selector, { timeout });
    }
    /**
     * Get page title
     */
    async getTitle() {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        return await this.page.title();
    }
    /**
     * Get current URL
     */
    getCurrentUrl() {
        if (!this.page) {
            throw new Error('Browser not launched. Call launch() first.');
        }
        return this.page.url();
    }
    /**
     * Stop network monitoring
     */
    stopMonitoring() {
        if (this.page) {
            this.networkMonitor.stopMonitoring(this.page);
        }
    }
    /**
     * Close the browser
     */
    async close() {
        if (this.page) {
            this.stopMonitoring();
        }
        if (this.context) {
            await this.context.close();
        }
        if (this.browser) {
            await this.browser.close();
        }
        console.log('Firefox browser closed.');
    }
    /**
     * Get monitoring statistics
     */
    getMonitoringStats() {
        return {
            ...this.networkMonitor.getStats(),
            currentUrl: this.getCurrentUrl(),
            isLaunched: this.browser !== null
        };
    }
}
//# sourceMappingURL=FirefoxBrowser.js.map