import { FirefoxBrowser } from '../browsers/FirefoxBrowser.js';
import { StreamFilter } from '../filters/StreamFilter.js';
import { M3U8Processor } from '../parsers/M3U8Processor.js';
export class F2MoviesDL {
    browser;
    streamFilter;
    m3u8Processor;
    constructor(config = {}) {
        this.browser = new FirefoxBrowser(config);
        this.streamFilter = new StreamFilter();
        this.m3u8Processor = new M3U8Processor();
    }
    /**
     * F2Movies workflow: Enter website → Click play → Transfer to player → Stop clicking → Listen for M3U8 → Download
     */
    async downloadVideo(url, outputFileName, monitorDuration = 20000) {
        try {
            console.log(`=== F2MoviesDL Video Downloader ===`);
            console.log(`Target URL: ${url}`);
            console.log(`Monitor Duration: ${monitorDuration}ms\n`);
            // Step 1: Launch browser and navigate to F2Movies page
            console.log('Step 1: Launching browser and navigating to F2Movies...');
            await this.browser.launch();
            await this.browser.navigateAndMonitor(url);
            // Step 2: Simulate human behavior to avoid detection
            console.log('Step 2: Simulating human behavior...');
            await this.browser.simulateHumanBehavior();
            // Step 3: Handle popups and click play button
            console.log('Step 3: Handling popups and clicking play button...');
            const page = this.browser.getPage();
            if (!page) {
                throw new Error('Browser page not available');
            }
            // Handle any popups that might appear
            await this.handlePopups(page);
            // Focus on play button detection with extended timeout
            const playDetector = this.browser.getPlayDetector();
            console.log('Focusing on play button detection (max 20 seconds)...');
            // Give more time for play button detection since popups are blocked
            const playPromise = playDetector.detectAndClickPlay(page);
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), 20000));
            const playClicked = await Promise.race([playPromise, timeoutPromise]);
            if (playClicked) {
                console.log('Play button clicked successfully, waiting for video streams...');
                // Wait longer for video streams to appear after play button click
                await this.browser.waitAndMonitor(3000);
            }
            else {
                console.log('Play button not found or timeout reached, trying alternative approach...');
                // Try a more aggressive click approach
                console.log('Trying to click center of video area...');
                try {
                    await page.click('body', { position: { x: 640, y: 400 } });
                    await this.browser.waitAndMonitor(2000);
                }
                catch (error) {
                    console.log('Center click failed, continuing with monitoring...');
                }
            }
            // Step 4: Stop trying to click play button and focus on M3U8 detection
            console.log('Step 4: Monitoring network for M3U8 streams...');
            // Minimal popup handling during monitoring (popups should be blocked at network level)
            const popupHandlingInterval = setInterval(async () => {
                try {
                    // Only handle critical popups during monitoring
                    await this.handleCriticalPopups(page);
                }
                catch (error) {
                    // Ignore popup handling errors
                }
            }, 3000); // Check less frequently since network blocking should handle most popups
            const startTime = Date.now();
            let m3u8Found = false;
            let m3u8Url = '';
            try {
                while (Date.now() - startTime < monitorDuration && !m3u8Found) {
                    await this.browser.waitAndMonitor(1000);
                    // Minimal popup handling during monitoring (most should be blocked at network level)
                    const monitor = this.browser.getNetworkMonitor();
                    const requests = monitor.getRequests();
                    const responses = monitor.getResponses();
                    // Look specifically for M3U8 requests (ignore ads and other noise)
                    const allM3u8Requests = requests.filter(req => req.url.includes('.m3u8'));
                    const cleanM3u8Requests = allM3u8Requests.filter(req => !this.isAdRelated(req.url));
                    // Get corresponding responses for size information
                    const m3u8WithResponses = cleanM3u8Requests.map(req => {
                        const response = responses.find(res => res.url === req.url);
                        return { request: req, response };
                    });
                    console.log(`  Found ${allM3u8Requests.length} total M3U8 requests, ${cleanM3u8Requests.length} non-ad M3U8 requests`);
                    if (cleanM3u8Requests.length > 0) {
                        // Show all M3U8 URLs found for debugging
                        console.log('  M3U8 URLs found:');
                        m3u8WithResponses.forEach((item, i) => {
                            const url = item.request.url.length > 80 ? item.request.url.substring(0, 80) + '...' : item.request.url;
                            const size = item.response ? `(${item.response.size} bytes)` : '(no response yet)';
                            console.log(`    ${i + 1}. ${url} ${size}`);
                        });
                        // Smart M3U8 detection: analyze content and structure instead of hardcoded patterns
                        console.log('  Analyzing M3U8 files to identify master playlist...');
                        let masterM3u8Item = null;
                        // First, try to identify master playlist by analyzing content
                        for (const item of m3u8WithResponses) {
                            if (item.response) {
                                const isMasterPlaylist = await this.analyzeM3U8Content(item.request.url, item.response.size);
                                console.log(`    ${item.request.url.substring(item.request.url.lastIndexOf('/') + 1)} (${item.response.size} bytes) - Master: ${isMasterPlaylist}`);
                                if (isMasterPlaylist) {
                                    masterM3u8Item = item;
                                    break;
                                }
                            }
                        }
                        // Fallback: use heuristics if content analysis fails
                        if (!masterM3u8Item) {
                            console.log('  Using heuristics for M3U8 selection...');
                            masterM3u8Item = m3u8WithResponses.find(item => {
                                const url = item.request.url.toLowerCase();
                                const hasSmallResponse = item.response && item.response.size < 50000; // Increased threshold
                                const hasPlaylistIndicator = url.includes('playlist') || url.includes('master');
                                return hasPlaylistIndicator || hasSmallResponse;
                            }) || m3u8WithResponses[0]; // Ultimate fallback
                        }
                        m3u8Url = masterM3u8Item.request.url;
                        m3u8Found = true;
                        console.log(`Selected M3U8: ${m3u8Url.substring(0, 80)}...`);
                        if (masterM3u8Item.response) {
                            console.log(`Response size: ${masterM3u8Item.response.size} bytes`);
                        }
                        break;
                    }
                    // Show progress
                    const totalRequests = requests.length;
                    const videoRequests = requests.filter(req => req.url.includes('.m3u8') || req.url.includes('video') || req.url.includes('stream')).length;
                    console.log(`  Monitoring... Total requests: ${totalRequests}, Video-related: ${videoRequests}`);
                }
            }
            finally {
                // Clean up popup handling interval
                clearInterval(popupHandlingInterval);
            }
            if (!m3u8Found) {
                // Clean up popup handling interval
                clearInterval(popupHandlingInterval);
                console.log('No M3U8 master playlist found after monitoring');
                await this.browser.close();
                return null;
            }
            // Step 5: Keep browser open for M3U8 downloading, then close
            console.log('Step 5: M3U8 found! Preparing for download...');
            // Generate output filename if not provided
            if (!outputFileName) {
                const urlParts = url.split('/');
                const pagePart = urlParts[urlParts.length - 1] || 'f2movies_video';
                outputFileName = `${pagePart.split('?')[0]}.mp4`;
            }
            // Step 6: Process M3U8 and download highest quality video using browser context
            console.log('Step 6: Processing M3U8 and downloading highest quality...');
            // Use M3U8 processor with browser page and network monitor for captured content
            const networkMonitor = this.browser.getNetworkMonitor();
            const finalVideoPath = await this.m3u8Processor.processM3U8WithBrowser(m3u8Url, outputFileName, page, networkMonitor);
            // Step 7: Close browser after download (ensure all operations are complete)
            console.log('Step 7: Closing browser...');
            try {
                await this.browser.close();
            }
            catch (error) {
                // Browser might already be closed
                console.log('Browser already closed or error closing:', error.message);
            }
            if (finalVideoPath) {
                console.log(`\nDownload completed successfully!`);
                console.log(`Final video saved to: ${finalVideoPath}`);
                return finalVideoPath;
            }
            else {
                console.log('M3U8 processing failed');
                return null;
            }
        }
        catch (error) {
            console.error('Download failed:', error);
            return null;
        }
        finally {
            // Ensure browser is closed
            try {
                await this.browser.close();
            }
            catch (e) {
                // Ignore cleanup errors
            }
        }
    }
    /**
     * Smart M3U8 content analysis to identify master playlists
     * Downloads and analyzes the M3U8 content instead of relying on URL patterns
     */
    async analyzeM3U8Content(url, size) {
        try {
            // Quick heuristics first - if we can't download, use size-based heuristics
            if (size > 100000) {
                // Very large files are likely segment playlists, not master
                console.log(`      Large file (${size} bytes) - likely segment playlist`);
                return false;
            }
            if (size < 100) {
                // Very small files are unlikely to be useful
                console.log(`      Very small file (${size} bytes) - likely not useful`);
                return false;
            }
            // Files between 500-10000 bytes are most likely master playlists
            if (size >= 500 && size <= 10000) {
                console.log(`      Good size range (${size} bytes) - likely master playlist`);
                return true;
            }
            // Try to download and analyze content, but don't fail if we can't
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    // If we can't download, fall back to size heuristics
                    console.log(`      Can't download for analysis (${response.status}), using size heuristics`);
                    return size < 50000; // Smaller files are more likely to be master playlists
                }
                const content = await response.text();
                const lines = content.split('\n').map(line => line.trim()).filter(line => line);
                // Master playlist characteristics:
                let hasStreamInf = false;
                let hasResolution = false;
                let hasBandwidth = false;
                let hasSegmentLines = false;
                let segmentCount = 0;
                for (const line of lines) {
                    if (line.startsWith('#EXT-X-STREAM-INF:')) {
                        hasStreamInf = true;
                        if (line.includes('RESOLUTION=')) {
                            hasResolution = true;
                        }
                        if (line.includes('BANDWIDTH=')) {
                            hasBandwidth = true;
                        }
                    }
                    if (line.startsWith('#EXTINF:')) {
                        hasSegmentLines = true;
                        segmentCount++;
                    }
                    // If we have many segment lines, this is probably a segment playlist
                    if (segmentCount > 10) {
                        break;
                    }
                }
                // Master playlists have stream info but few/no segment lines
                const isMaster = hasStreamInf && (hasResolution || hasBandwidth) && segmentCount < 5;
                console.log(`      Content analysis: StreamInf=${hasStreamInf}, Resolution=${hasResolution}, Bandwidth=${hasBandwidth}, Segments=${segmentCount} -> Master=${isMaster}`);
                return isMaster;
            }
            catch (fetchError) {
                // If we can't fetch the content, use size-based heuristics
                console.log(`      Can't fetch content for analysis, using size heuristics`);
                return size < 50000; // Smaller files are more likely to be master playlists
            }
        }
        catch (error) {
            console.log(`      Failed to analyze M3U8 content: ${error.message}`);
            // Default to true for reasonably sized files
            return size < 50000;
        }
    }
    /**
     * Handle only critical popups during monitoring (minimal overhead)
     */
    async handleCriticalPopups(page) {
        try {
            // Only look for the most critical popups that block video loading
            const criticalSelectors = [
                'text="OK"',
                'text="Allow"',
                'text="ALLOW"',
                'button:visible:has-text("OK")',
                'button:visible:has-text("Allow")'
            ];
            for (const selector of criticalSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element && await element.isVisible()) {
                        console.log(`Clicking critical popup: ${selector}`);
                        await element.click();
                        await page.waitForTimeout(500);
                        return; // Only handle one popup at a time
                    }
                }
                catch (error) {
                    // Continue to next selector
                }
            }
        }
        catch (error) {
            // Ignore all popup handling errors during monitoring
        }
    }
    /**
     * Handle F2Movies popups and ads automatically (comprehensive)
     */
    async handlePopups(page) {
        console.log('Checking for and handling popups...');
        try {
            // Common popup selectors for F2Movies
            const popupSelectors = [
                // Modal dialogs
                '.modal',
                '.popup',
                '.overlay',
                '[role="dialog"]',
                '.verification-popup',
                '.swal2-container',
                '.sweet-alert',
                // Specific popup patterns (case insensitive)
                '*:has-text("Please Confirm To Continue")',
                '*:has-text("Continue now?")',
                '*:has-text("Confirm that you sent")',
                '*:has-text("I\'m not a robot")',
                '*:has-text("Verify")',
                '*:has-text("Click to continue")',
                '*:has-text("Human verification")',
                '*:has-text("You need to \'Allow\' in order to continue")',
                '*:has-text("Allow")',
                '*:has-text("Loading...")',
                // Generic popups with high z-index
                'div[style*="position: fixed"]',
                'div[style*="position: absolute"]',
                'div[style*="z-index: 9999"]',
                'div[style*="z-index: 999"]',
                'div[style*="z-index: 99999"]',
                // Common popup class patterns
                '.popup-overlay',
                '.modal-overlay',
                '.ad-overlay',
                '.verification-overlay'
            ];
            for (const selector of popupSelectors) {
                try {
                    const popup = await page.$(selector);
                    if (popup && await popup.isVisible()) {
                        console.log(`Found popup with selector: ${selector}`);
                        // Look for buttons within the popup
                        const buttons = [
                            'button:has-text("OK")',
                            'button:has-text("Continue")',
                            'button:has-text("Close")',
                            'button:has-text("Accept")',
                            'button:has-text("Agree")',
                            'button:has-text("Verify")',
                            'button:has-text("I\'m not a robot")',
                            '.btn:has-text("OK")',
                            '.btn:has-text("Continue")',
                            '.btn:has-text("Close")',
                            '.btn:has-text("Accept")',
                            'input[type="button"]',
                            'input[value*="OK"]',
                            'input[value*="Continue"]',
                            'input[value*="Close"]',
                            'a:has-text("OK")',
                            'a:has-text("Continue")',
                            'a:has-text("Close")',
                            // Generic button patterns
                            'button',
                            '.button',
                            '.btn',
                            'input[type="submit"]'
                        ];
                        let buttonClicked = false;
                        for (const buttonSelector of buttons) {
                            try {
                                const button = await popup.$(buttonSelector);
                                if (button && await button.isVisible()) {
                                    console.log(`Clicking popup button: ${buttonSelector}`);
                                    await button.click();
                                    await page.waitForTimeout(1000);
                                    buttonClicked = true;
                                    break;
                                }
                            }
                            catch (error) {
                                // Continue to next button
                            }
                        }
                        // If no button found, try clicking the popup itself to close it
                        if (!buttonClicked) {
                            console.log('No button found, trying to close popup by clicking it');
                            try {
                                await popup.click();
                                await page.waitForTimeout(500);
                            }
                            catch (error) {
                                // Ignore click errors
                            }
                        }
                    }
                }
                catch (error) {
                    // Continue to next selector
                }
            }
            // Try direct text-based popup detection
            try {
                const textSelectors = [
                    'text="Please Confirm To Continue"',
                    'text="Continue now?"',
                    'text="You need to \'Allow\' in order to continue"',
                    'text="OK"',
                    'text="Continue"',
                    'text="Close"',
                    'text="Accept"',
                    'text="Verify"',
                    'text="Allow"'
                ];
                for (const textSelector of textSelectors) {
                    try {
                        const element = await page.$(textSelector);
                        if (element && await element.isVisible()) {
                            console.log(`Found popup element with text: ${textSelector}`);
                            await element.click();
                            await page.waitForTimeout(1000);
                            break;
                        }
                    }
                    catch (error) {
                        // Continue to next selector
                    }
                }
            }
            catch (error) {
                // Ignore text selector errors
            }
            // Try to find and click any visible OK/Allow buttons directly
            try {
                const buttonSelectors = [
                    'button:visible:has-text("OK")',
                    'button:visible:has-text("Allow")',
                    'button:visible:has-text("Continue")',
                    '.btn:visible:has-text("OK")',
                    '.btn:visible:has-text("Allow")',
                    'input[type="button"]:visible[value*="OK"]',
                    'input[type="button"]:visible[value*="Allow"]'
                ];
                for (const selector of buttonSelectors) {
                    try {
                        const button = await page.$(selector);
                        if (button && await button.isVisible()) {
                            console.log(`Found and clicking visible button: ${selector}`);
                            await button.click();
                            await page.waitForTimeout(1000);
                            break;
                        }
                    }
                    catch (error) {
                        // Continue to next selector
                    }
                }
            }
            catch (error) {
                // Ignore button detection errors
            }
            // Also try to close any popups by pressing Escape
            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            }
            catch (error) {
                // Ignore escape errors
            }
            // Check for and close any new windows/tabs that might have opened
            try {
                const context = page.context();
                const pages = context.pages();
                if (pages.length > 1) {
                    console.log(`Found ${pages.length} tabs, closing extra tabs...`);
                    for (let i = 1; i < pages.length; i++) {
                        try {
                            await pages[i].close();
                        }
                        catch (error) {
                            // Ignore close errors
                        }
                    }
                }
            }
            catch (error) {
                // Ignore context errors
            }
        }
        catch (error) {
            console.error('Error handling popups:', error);
        }
    }
    /**
     * Check if URL is ad-related (to filter out noise)
     */
    isAdRelated(url) {
        const adIndicators = [
            'google-analytics',
            'googletagmanager',
            'googlesyndication',
            'doubleclick',
            'facebook.com',
            'twitter.com',
            '/ads/',
            '/ad/',
            'advertisement',
            'banner',
            'popup'
        ];
        return adIndicators.some(indicator => url.toLowerCase().includes(indicator));
    }
    /**
     * Advanced monitoring method that just finds streams without downloading
     */
    async findVideoStreams(url, monitorDuration = 20000, clickPlay = true) {
        try {
            console.log(`=== Video Stream Detection ===`);
            console.log(`Target URL: ${url}`);
            console.log(`Monitor Duration: ${monitorDuration}ms`);
            console.log(`Auto-click Play: ${clickPlay}\n`);
            // Launch browser and navigate
            await this.browser.launch();
            await this.browser.navigateAndMonitor(url);
            // Simulate human behavior
            await this.browser.simulateHumanBehavior();
            // Click play button if requested
            if (clickPlay) {
                console.log('Attempting to click play button...');
                await this.browser.findAndClickPlay(10000);
            }
            // Monitor for streams
            console.log('Monitoring network requests...');
            await this.browser.waitAndMonitor(monitorDuration);
            // Analyze results
            const monitor = this.browser.getNetworkMonitor();
            const requests = monitor.getRequests();
            const analysis = this.streamFilter.analyzeStreams(requests);
            console.log(`\n=== Stream Analysis Results ===`);
            console.log(`Total Video Streams: ${analysis.totalVideoStreams}`);
            console.log(`M3U8 Streams: ${analysis.m3u8Streams.length}`);
            console.log(`MP4 Streams: ${analysis.mp4Streams.length}`);
            console.log(`Manifest Streams: ${analysis.manifestStreams.length}`);
            if (analysis.recommendedStream) {
                console.log(`\nRecommended Stream:`);
                console.log(`   Source: ${analysis.recommendedStream.source}`);
                console.log(`   Quality: ${analysis.recommendedStream.quality}p`);
                console.log(`   Type: ${analysis.recommendedStream.isMainVideo ? 'Main Video' : 'Alternative'}`);
                console.log(`   🔗 URL: ${analysis.recommendedStream.url.substring(0, 100)}...`);
            }
            // Close browser
            await this.browser.close();
            return this.streamFilter.filterVideoStreams(requests);
        }
        catch (error) {
            console.error('Stream detection failed:', error);
            return [];
        }
        finally {
            try {
                await this.browser.close();
            }
            catch (e) {
                // Ignore cleanup errors
            }
        }
    }
    /**
     * Test play button detection on a page
     */
    async testPlayButtonDetection(url) {
        let browserLaunched = false;
        try {
            console.log(`=== Play Button Detection Test ===`);
            console.log(`Target URL: ${url}\n`);
            await this.browser.launch();
            browserLaunched = true;
            await this.browser.navigateAndMonitor(url);
            await this.browser.simulateHumanBehavior();
            // Check if page is still available
            const page = this.browser.getPage();
            if (!page) {
                throw new Error('Browser page is not available');
            }
            const playDetector = this.browser.getPlayDetector();
            // Test play button detection
            console.log('Attempting to detect and click play button...');
            const success = await playDetector.detectAndClickPlay(page);
            if (success) {
                console.log('Play button detection and clicking successful!');
                // Wait for playback to start
                const playbackStarted = await playDetector.waitForPlayback(page, 5000);
                console.log(`Video playback ${playbackStarted ? 'confirmed' : 'not detected'}`);
            }
            else {
                console.log('Play button detection failed');
            }
            return success;
        }
        catch (error) {
            console.error('Play button test failed:', error);
            return false;
        }
        finally {
            if (browserLaunched) {
                try {
                    await this.browser.close();
                }
                catch (e) {
                    // Ignore cleanup errors
                }
            }
        }
    }
    /**
     * Get the browser instance for advanced usage
     */
    getBrowser() {
        return this.browser;
    }
    /**
     * Get the stream filter instance
     */
    getStreamFilter() {
        return this.streamFilter;
    }
    /**
     * Get the M3U8 processor instance
     */
    getM3U8Processor() {
        return this.m3u8Processor;
    }
}
//# sourceMappingURL=F2MoviesDL.js.map