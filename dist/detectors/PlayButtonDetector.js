export class PlayButtonDetector {
    config;
    // Common play button selectors used across different video players
    playButtonSelectors = [
        // Generic video element controls
        'video',
        'video + .controls .play-button',
        'video + .controls button[aria-label*="play"]',
        // Common video player frameworks
        '.video-js .vjs-big-play-button',
        '.video-js .vjs-play-control',
        '.jwplayer .jw-display-icon-container',
        '.jwplayer .jw-icon-play',
        '.plyr__control--overlaid',
        '.plyr__control[data-plyr="play"]',
        // Custom players - generic patterns
        '.play-button',
        '.play-btn',
        '.btn-play',
        'button[class*="play"]',
        'div[class*="play"]',
        '[data-action="play"]',
        '[data-role="play"]',
        // Streaming site specific selectors
        '.dplayer-play-icon',
        '.dplayer-big-play',
        '.artplayer-play-button',
        '.fp-play',
        '.fp-engine',
        // Generic button with play icons
        'button svg[class*="play"]',
        'button .fa-play',
        'button .icon-play',
        'div[role="button"][aria-label*="play"]',
        // Iframe video players
        'iframe[src*="player"]',
        'iframe[src*="embed"]',
        'iframe[src*="video"]',
        // Large overlay play buttons
        '.overlay-play',
        '.video-overlay .play',
        '.poster .play-button',
        // Mobile/responsive play buttons
        '.mobile-play-button',
        '.touch-play-button',
        // F2Movies specific (based on your screenshot)
        '.dp-w-cover',
        '.dp-w-c-play',
        'div[class*="play"][class*="cover"]',
        // Generic large center play buttons
        'div[style*="play"]',
        'div[class*="center"][class*="play"]',
        '.video-container .play',
        '.player-container .play'
    ];
    constructor(config = {}) {
        this.config = {
            waitTimeout: 10000,
            clickDelay: 2000,
            retryAttempts: 3,
            ...config
        };
    }
    /**
     * Detect and click play button on the current page
     */
    async detectAndClickPlay(page) {
        console.log('Detecting video players and play buttons...');
        try {
            // Wait for page to be ready
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(2000);
            // First, try to find video elements
            const players = await this.detectVideoPlayers(page);
            console.log(`Found ${players.length} potential video players`);
            // Try to click play buttons in order of confidence
            for (const player of players) {
                console.log(`Attempting to activate ${player.type} player: ${player.selector}`);
                const success = await this.attemptPlayClick(page, player);
                if (success) {
                    console.log(`Successfully activated player: ${player.selector}`);
                    return true;
                }
            }
            // If no specific players found, try generic play button detection
            console.log('No specific players found, trying generic play button detection...');
            return await this.tryGenericPlayButtons(page);
        }
        catch (error) {
            console.error('Error detecting play button:', error);
            return false;
        }
    }
    /**
     * Detect various types of video players on the page
     */
    async detectVideoPlayers(page) {
        const players = [];
        // Check for HTML5 video elements
        try {
            const videoElements = await page.$$('video');
            for (let i = 0; i < videoElements.length; i++) {
                const video = videoElements[i];
                const isVisible = await video.isVisible();
                if (isVisible) {
                    players.push({
                        element: video,
                        type: 'video',
                        selector: `video:nth-child(${i + 1})`,
                        confidence: 0.9
                    });
                }
            }
        }
        catch (error) {
            // Ignore errors
        }
        // Check for iframe players
        try {
            const iframes = await page.$$('iframe');
            for (let i = 0; i < iframes.length; i++) {
                const iframe = iframes[i];
                const src = await iframe.getAttribute('src') || '';
                const isVisible = await iframe.isVisible();
                if (isVisible && (src.includes('player') || src.includes('embed') || src.includes('video'))) {
                    players.push({
                        element: iframe,
                        type: 'iframe',
                        selector: `iframe:nth-child(${i + 1})`,
                        confidence: 0.7
                    });
                }
            }
        }
        catch (error) {
            // Ignore errors
        }
        // Check for custom players using common selectors
        for (const selector of this.playButtonSelectors) {
            try {
                const elements = await page.$$(selector);
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    const isVisible = await element.isVisible();
                    if (isVisible) {
                        players.push({
                            element: element,
                            type: 'custom',
                            selector: selector,
                            confidence: 0.6
                        });
                    }
                }
            }
            catch (error) {
                // Continue to next selector
            }
        }
        // Sort by confidence (highest first)
        return players.sort((a, b) => b.confidence - a.confidence);
    }
    /**
     * Attempt to click play on a detected player
     */
    async attemptPlayClick(page, player) {
        try {
            if (player.type === 'video') {
                // For HTML5 video, try multiple approaches
                return await this.handleVideoElement(page, player);
            }
            else if (player.type === 'iframe') {
                // For iframe, click on it to focus and try to trigger play
                return await this.handleIframeElement(page, player);
            }
            else {
                // For custom players, try direct click
                return await this.handleCustomPlayer(page, player);
            }
        }
        catch (error) {
            console.log(`Failed to click ${player.selector}:`, error.message);
            return false;
        }
    }
    /**
     * Handle HTML5 video elements
     */
    async handleVideoElement(page, player) {
        try {
            // Method 1: Try to play via JavaScript
            await page.evaluate((selector) => {
                const video = document.querySelector(selector);
                if (video && video.play) {
                    video.play().catch(() => { });
                    return true;
                }
                return false;
            }, player.selector);
            await page.waitForTimeout(1000);
            // Method 2: Click on the video element
            await page.click(player.selector);
            await page.waitForTimeout(1000);
            // Method 3: Look for play button overlays
            const playOverlays = [
                `${player.selector} + .play-button`,
                `${player.selector} + .controls .play`,
                `.video-container .play-button`
            ];
            for (const overlay of playOverlays) {
                try {
                    const element = await page.$(overlay);
                    if (element && await element.isVisible()) {
                        await element.click();
                        await page.waitForTimeout(1000);
                    }
                }
                catch (error) {
                    // Continue to next overlay
                }
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Handle iframe video players
     */
    async handleIframeElement(page, player) {
        try {
            // Click on the iframe to focus it
            await page.click(player.selector);
            await page.waitForTimeout(1000);
            // Try to send spacebar to trigger play
            await page.keyboard.press('Space');
            await page.waitForTimeout(1000);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Handle custom video players
     */
    async handleCustomPlayer(page, player) {
        try {
            // Direct click approach
            await page.click(player.selector);
            await page.waitForTimeout(this.config.clickDelay || 2000);
            // For some players, we might need a double-click
            if (player.selector.includes('overlay') || player.selector.includes('cover')) {
                await page.click(player.selector);
                await page.waitForTimeout(1000);
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Try generic play button detection when specific players aren't found
     */
    async tryGenericPlayButtons(page) {
        const genericSelectors = [
            // Look for any clickable element with "play" in text or aria-label
            'button:has-text("Play")',
            'button:has-text("▶")',
            '[aria-label*="play" i]',
            '[title*="play" i]',
            // Look for large centered elements (common for play overlays)
            'div[style*="position: absolute"][style*="center"]',
            'div[class*="overlay"]:visible',
            // Try clicking in the center of video containers
            '.video-container',
            '.player-container',
            '.video-wrapper'
        ];
        for (const selector of genericSelectors) {
            try {
                const element = await page.$(selector);
                if (element && await element.isVisible()) {
                    console.log(`Trying generic selector: ${selector}`);
                    await element.click();
                    await page.waitForTimeout(2000);
                    return true;
                }
            }
            catch (error) {
                // Continue to next selector
            }
        }
        // Last resort: try clicking in the center of the page
        console.log('Last resort: clicking center of page');
        try {
            const viewport = page.viewportSize() || { width: 1280, height: 720 };
            await page.mouse.click(viewport.width / 2, viewport.height / 2);
            await page.waitForTimeout(2000);
            return true;
        }
        catch (error) {
            console.log('Center click failed:', error.message);
        }
        return false;
    }
    /**
     * Wait for video to start playing
     */
    async waitForPlayback(page, timeout = 10000) {
        try {
            // Wait for any video element to start playing
            await page.waitForFunction(() => {
                const videos = document.querySelectorAll('video');
                return Array.from(videos).some(video => !video.paused && video.currentTime > 0);
            }, { timeout });
            console.log('Video playback detected');
            return true;
        }
        catch (error) {
            console.log('No video playback detected within timeout');
            return false;
        }
    }
    /**
     * Simulate human-like interaction before clicking play
     */
    async simulateUserInteraction(page) {
        console.log('Simulating human interaction...');
        // Move mouse around
        const viewport = page.viewportSize() || { width: 1280, height: 720 };
        await page.mouse.move(Math.random() * viewport.width, Math.random() * viewport.height);
        // Random scroll
        await page.evaluate(() => {
            window.scrollTo(0, Math.random() * 300);
        });
        // Wait a bit
        await page.waitForTimeout(Math.random() * 2000 + 1000);
        // Move mouse to center (where play button likely is)
        await page.mouse.move(viewport.width / 2, viewport.height / 2);
        await page.waitForTimeout(500);
    }
}
//# sourceMappingURL=PlayButtonDetector.js.map