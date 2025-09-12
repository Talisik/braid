export interface SegmentDownloadConfig {
    maxConcurrentDownloads?: number;
    retryAttempts?: number;
    tmpDirectory?: string;
}
export declare class SegmentDownloader {
    private config;
    private downloadedSegments;
    constructor(config?: SegmentDownloadConfig);
    /**
     * Download all segments from a list of URLs
     */
    downloadSegments(segmentUrls: string[], outputPrefix?: string): Promise<string[]>;
    /**
     * Download a single segment with retry logic
     */
    private downloadSegment;
    /**
     * Get list of downloaded segment paths
     */
    getDownloadedSegments(): string[];
    /**
     * Clean up downloaded segments
     */
    cleanup(): void;
    /**
     * Get temporary directory path
     */
    getTmpDirectory(): string;
    /**
     * Utility function for delays
     */
    private delay;
    /**
     * Estimate download progress
     */
    getProgress(): {
        downloaded: number;
        total: number;
        percentage: number;
    };
    /**
     * Download M3U8 content using curl with proper headers
     */
    downloadM3U8WithCurl(url: string, headers: Record<string, string>): Promise<string | null>;
    /**
     * Download segments using curl with custom headers (for protected streams)
     */
    downloadSegmentsWithCurl(segmentUrls: string[], headers: Record<string, string>, outputPrefix?: string): Promise<string[]>;
    /**
     * Download a single segment using curl
     */
    private downloadSegmentWithCurl;
}
//# sourceMappingURL=SegmentDownloader.d.ts.map