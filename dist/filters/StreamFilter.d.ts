import { NetworkRequest, VideoStream } from '../types/index.js';
export declare class StreamFilter {
    private adDomains;
    private lowQualityIndicators;
    private highQualityIndicators;
    /**
     * Filter out advertisement and tracking requests
     */
    filterOutAds(requests: NetworkRequest[]): NetworkRequest[];
    /**
     * Get video stream requests
     */
    getVideoStreams(requests: NetworkRequest[]): NetworkRequest[];
    /**
     * Filter and analyze video streams with quality detection
     */
    filterVideoStreams(requests: NetworkRequest[]): VideoStream[];
    /**
     * Get the best video stream from filtered results
     */
    getBestVideoStream(requests: NetworkRequest[]): VideoStream | null;
    /**
     * Extract quality from URL
     */
    private extractQuality;
    /**
     * Determine if this is likely the main video stream
     */
    private isMainVideoStream;
    /**
     * Extract source/provider from URL
     */
    private extractSource;
    /**
     * Get M3U8 playlist URLs specifically
     */
    getM3U8Streams(requests: NetworkRequest[]): NetworkRequest[];
    /**
     * Get MP4 direct video URLs
     */
    getMP4Streams(requests: NetworkRequest[]): NetworkRequest[];
    /**
     * Get streaming manifest files (M3U8, MPD)
     */
    getManifestStreams(requests: NetworkRequest[]): NetworkRequest[];
    /**
     * Analyze and categorize all video streams
     */
    analyzeStreams(requests: NetworkRequest[]): {
        m3u8Streams: NetworkRequest[];
        mp4Streams: NetworkRequest[];
        manifestStreams: NetworkRequest[];
        totalVideoStreams: number;
        recommendedStream: VideoStream | null;
    };
}
//# sourceMappingURL=StreamFilter.d.ts.map