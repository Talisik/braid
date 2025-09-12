export interface NetworkRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    timestamp: number;
    resourceType: string;
}
export interface NetworkResponse {
    url: string;
    status: number;
    headers: Record<string, string>;
    timestamp: number;
    size: number;
}
export interface BrowserConfig {
    headless?: boolean;
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
    };
}
export interface NetworkMonitorConfig {
    filterUrls?: string[];
    captureResponses?: boolean;
    logRequests?: boolean;
}
export interface VideoStream {
    url: string;
    quality: number;
    isMainVideo: boolean;
    source: string;
}
export interface StreamQuality {
    url: string;
    resolution: string;
    bandwidth: number;
}
export interface M3U8ProcessorConfig {
    outputDir?: string;
    maxConcurrentDownloads?: number;
    persistentRetry?: boolean;
}
export interface SegmentDownloadConfig {
    maxConcurrentDownloads?: number;
    persistentRetry?: boolean;
}
//# sourceMappingURL=index.d.ts.map