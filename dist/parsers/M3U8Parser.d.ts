export interface StreamQuality {
    url: string;
    resolution: string;
    bandwidth: number;
    quality: number;
}
export declare class M3U8Parser {
    /**
     * Parse master M3U8 playlist and extract quality streams
     */
    parseMasterM3U8(masterUrl: string): Promise<StreamQuality[]>;
    /**
     * Extract quality streams from M3U8 content
     */
    extractQualityStreams(content: string, baseUrl: string): StreamQuality[];
    /**
     * Parse EXT-X-STREAM-INF line to extract stream information
     */
    private parseStreamInfo;
    /**
     * Resolve relative URL against base URL
     */
    private resolveUrl;
    /**
     * Get the highest quality stream
     */
    getBestQualityStream(streams: StreamQuality[]): StreamQuality | null;
    /**
     * Check if content is a master playlist or media playlist
     */
    isMasterPlaylist(content: string): boolean;
    /**
     * Parse media playlist to get segment URLs
     */
    extractSegmentUrls(content: string, baseUrl: string): string[];
}
//# sourceMappingURL=M3U8Parser.d.ts.map