export declare class FFmpegConverter {
    private ffmpegPath;
    constructor();
    /**
     * Detect available FFmpeg installation
     */
    private detectFFmpeg;
    /**
     * Convert segments to final video file
     */
    convertSegmentsToVideo(segmentPaths: string[], outputPath: string, options?: {
        cleanup?: boolean;
        videoCodec?: string;
        audioCodec?: string;
        quality?: string;
    }): Promise<boolean>;
    /**
     * Run FFmpeg with given arguments
     */
    private runFFmpeg;
    /**
     * Clean up segment files
     */
    private cleanupSegments;
    /**
     * Check if FFmpeg is available
     */
    isFFmpegAvailable(): Promise<boolean>;
    /**
     * Get FFmpeg version information
     */
    getFFmpegVersion(): Promise<string>;
}
//# sourceMappingURL=FFmpegConverter.d.ts.map