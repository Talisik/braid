import { StreamQuality } from './M3U8Parser.js';
import { Page } from 'playwright';
export interface M3U8ProcessorConfig {
    outputDir?: string;
    maxConcurrentDownloads?: number;
    cleanup?: boolean;
    quality?: 'high' | 'medium' | 'fast';
}
export declare class M3U8Processor {
    private config;
    private parser;
    private downloader;
    private converter;
    constructor(config?: M3U8ProcessorConfig);
    /**
     * Process M3U8 URL and download the video
     */
    processM3U8(m3u8Url: string, outputFileName: string): Promise<string | null>;
    /**
     * Process M3U8 with custom quality selection
     */
    processM3U8WithQuality(m3u8Url: string, outputFileName: string, preferredQuality: number): Promise<string | null>;
    /**
     * Get available quality options from M3U8
     */
    getAvailableQualities(m3u8Url: string): Promise<StreamQuality[]>;
    /**
     * Process M3U8 URL using browser context for authenticated requests
     */
    processM3U8WithBrowser(m3u8Url: string, outputFileName: string, page: Page, networkMonitor?: any): Promise<string | null>;
    /**
     * Download M3U8 content using browser navigation (bypasses Cloudflare protection)
     */
    private downloadM3U8WithBrowser;
    /**
     * Download M3U8 content using curl as fallback
     */
    private downloadM3U8WithCurl;
    /**
     * Get browser headers for curl requests
     */
    private getBrowserHeaders;
}
//# sourceMappingURL=M3U8Processor.d.ts.map