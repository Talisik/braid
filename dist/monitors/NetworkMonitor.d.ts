import { Page } from 'playwright';
import { NetworkRequest, NetworkResponse, NetworkMonitorConfig } from '../types/index.js';
export declare class NetworkMonitor {
    private requests;
    private responses;
    private responseContent;
    private config;
    constructor(config?: NetworkMonitorConfig);
    startMonitoring(page: Page): Promise<void>;
    /**
     * Check if URL is video-related
     */
    private isVideoRelated;
    /**
     * Stop monitoring (cleanup listeners)
     */
    stopMonitoring(page: Page): void;
    /**
     * Get all captured requests
     */
    getRequests(): NetworkRequest[];
    /**
     * Get all captured responses
     */
    getResponses(): NetworkResponse[];
    /**
     * Get captured M3U8 content by URL
     */
    getM3U8Content(url: string): string | null;
    /**
     * Get all captured M3U8 URLs and their content
     */
    getAllM3U8Content(): Map<string, string>;
    /**
     * Get requests filtered by URL pattern
     */
    getRequestsByPattern(pattern: string | RegExp): NetworkRequest[];
    /**
     * Get video-related requests (common video file extensions and streaming protocols)
     */
    getVideoRequests(): NetworkRequest[];
    /**
     * Get recent video requests (within last N seconds)
     */
    getRecentVideoRequests(seconds?: number): NetworkRequest[];
    /**
     * Clear all captured data
     */
    clear(): void;
    /**
     * Check if request should be captured based on configuration
     */
    private shouldCaptureRequest;
    /**
     * Get summary statistics
     */
    getStats(): {
        totalRequests: number;
        totalResponses: number;
        videoRequests: number;
        recentVideoRequests: number;
        uniqueDomains: number;
    };
}
//# sourceMappingURL=NetworkMonitor.d.ts.map