export class NetworkMonitor {
    requests = [];
    responses = [];
    responseContent = new Map(); // Store response content
    config;
    constructor(config = {}) {
        this.config = {
            captureResponses: true,
            logRequests: false,
            ...config
        };
    }
    async startMonitoring(page) {
        console.log('Starting enhanced network monitoring...');
        page.on('request', (request) => {
            const networkRequest = {
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                timestamp: Date.now(),
                resourceType: request.resourceType()
            };
            // Apply URL filtering if configured
            if (this.shouldCaptureRequest(networkRequest)) {
                this.requests.push(networkRequest);
                if (this.config.logRequests) {
                    console.log(`[REQUEST] ${networkRequest.method} ${networkRequest.url}`);
                }
                // Log video-related requests immediately
                if (this.isVideoRelated(networkRequest.url)) {
                    console.log(`[VIDEO REQUEST] ${networkRequest.url}`);
                }
            }
        });
        // Monitor responses if enabled
        if (this.config.captureResponses) {
            page.on('response', async (response) => {
                const networkResponse = {
                    url: response.url(),
                    status: response.status(),
                    headers: response.headers(),
                    timestamp: Date.now(),
                    size: 0 // Will be updated if we can get the body
                };
                // Try to get response size and capture M3U8 content
                try {
                    const body = await response.body();
                    networkResponse.size = body.length;
                    // Capture M3U8 content for later use
                    if (response.url().includes('.m3u8') && response.status() === 200) {
                        const content = body.toString('utf8');
                        this.responseContent.set(response.url(), content);
                        console.log(`[M3U8 CAPTURED] ${response.url()} (${content.length} chars)`);
                    }
                }
                catch (error) {
                    // Some responses can't be read, that's okay
                }
                if (this.shouldCaptureRequest({ url: networkResponse.url })) {
                    this.responses.push(networkResponse);
                    if (this.config.logRequests) {
                        console.log(`[RESPONSE] ${networkResponse.status} ${networkResponse.url} (${networkResponse.size} bytes)`);
                    }
                    // Log video-related responses immediately
                    if (this.isVideoRelated(networkResponse.url)) {
                        console.log(`[VIDEO RESPONSE] ${networkResponse.status} ${networkResponse.url} (${networkResponse.size} bytes)`);
                    }
                }
            });
        }
    }
    /**
     * Check if URL is video-related
     */
    isVideoRelated(url) {
        const videoPatterns = [
            /\.m3u8(\?|$)/i,
            /\.mpd(\?|$)/i,
            /\.mp4(\?|$)/i,
            /\.webm(\?|$)/i,
            /\.ts(\?|$)/i,
            /hls/i,
            /dash/i,
            /video/i,
            /stream/i,
            /manifest/i
        ];
        return videoPatterns.some(pattern => pattern.test(url));
    }
    /**
     * Stop monitoring (cleanup listeners)
     */
    stopMonitoring(page) {
        page.removeAllListeners('request');
        page.removeAllListeners('response');
        console.log('Network monitoring stopped.');
    }
    /**
     * Get all captured requests
     */
    getRequests() {
        return [...this.requests];
    }
    /**
     * Get all captured responses
     */
    getResponses() {
        return [...this.responses];
    }
    /**
     * Get captured M3U8 content by URL
     */
    getM3U8Content(url) {
        return this.responseContent.get(url) || null;
    }
    /**
     * Get all captured M3U8 URLs and their content
     */
    getAllM3U8Content() {
        return new Map(this.responseContent);
    }
    /**
     * Get requests filtered by URL pattern
     */
    getRequestsByPattern(pattern) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        return this.requests.filter(req => regex.test(req.url));
    }
    /**
     * Get video-related requests (common video file extensions and streaming protocols)
     */
    getVideoRequests() {
        const videoPatterns = [
            /\.m3u8(\?|$)/i,
            /\.mpd(\?|$)/i,
            /\.mp4(\?|$)/i,
            /\.webm(\?|$)/i,
            /\.ts(\?|$)/i,
            /hls/i,
            /dash/i,
            /video/i,
            /stream/i,
            /manifest/i
        ];
        return this.requests.filter(req => videoPatterns.some(pattern => pattern.test(req.url)));
    }
    /**
     * Get recent video requests (within last N seconds)
     */
    getRecentVideoRequests(seconds = 30) {
        const cutoffTime = Date.now() - (seconds * 1000);
        return this.getVideoRequests().filter(req => req.timestamp >= cutoffTime);
    }
    /**
     * Clear all captured data
     */
    clear() {
        this.requests = [];
        this.responses = [];
    }
    /**
     * Check if request should be captured based on configuration
     */
    shouldCaptureRequest(request) {
        if (!this.config.filterUrls || this.config.filterUrls.length === 0) {
            return true;
        }
        return this.config.filterUrls.some(filter => request.url.includes(filter));
    }
    /**
     * Get summary statistics
     */
    getStats() {
        const domains = new Set(this.requests.map(req => new URL(req.url).hostname));
        return {
            totalRequests: this.requests.length,
            totalResponses: this.responses.length,
            videoRequests: this.getVideoRequests().length,
            recentVideoRequests: this.getRecentVideoRequests().length,
            uniqueDomains: domains.size
        };
    }
}
//# sourceMappingURL=NetworkMonitor.js.map