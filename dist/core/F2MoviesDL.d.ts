import { FirefoxBrowser } from '../browsers/FirefoxBrowser.js';
import { StreamFilter } from '../filters/StreamFilter.js';
import { M3U8Processor } from '../parsers/M3U8Processor.js';
import { BrowserConfig } from '../types/index.js';
export declare class F2MoviesDL {
    private browser;
    private streamFilter;
    private m3u8Processor;
    constructor(config?: BrowserConfig);
    /**
     * F2Movies workflow: Enter website → Click play → Transfer to player → Stop clicking → Listen for M3U8 → Download
     */
    downloadVideo(url: string, outputFileName?: string, monitorDuration?: number): Promise<string | null>;
    /**
     * Smart M3U8 content analysis to identify master playlists
     * Downloads and analyzes the M3U8 content instead of relying on URL patterns
     */
    private analyzeM3U8Content;
    /**
     * Handle only critical popups during monitoring (minimal overhead)
     */
    private handleCriticalPopups;
    /**
     * Handle F2Movies popups and ads automatically (comprehensive)
     */
    private handlePopups;
    /**
     * Check if URL is ad-related (to filter out noise)
     */
    private isAdRelated;
    /**
     * Advanced monitoring method that just finds streams without downloading
     */
    findVideoStreams(url: string, monitorDuration?: number, clickPlay?: boolean): Promise<any[]>;
    /**
     * Test play button detection on a page
     */
    testPlayButtonDetection(url: string): Promise<boolean>;
    /**
     * Get the browser instance for advanced usage
     */
    getBrowser(): FirefoxBrowser;
    /**
     * Get the stream filter instance
     */
    getStreamFilter(): StreamFilter;
    /**
     * Get the M3U8 processor instance
     */
    getM3U8Processor(): M3U8Processor;
}
//# sourceMappingURL=F2MoviesDL.d.ts.map