import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { M3U8Parser } from './M3U8Parser.js';
import { SegmentDownloader } from '../downloaders/SegmentDownloader.js';
import { FFmpegConverter } from '../converters/FFmpegConverter.js';

export interface M3U8ProcessorConfig {
  outputDir?: string;
  maxConcurrentDownloads?: number;
  persistentRetry?: boolean;
}

export class M3U8Processor {
  private config: M3U8ProcessorConfig;
  private parser: M3U8Parser;
  private downloader: SegmentDownloader;
  private converter: FFmpegConverter;

  constructor(config: M3U8ProcessorConfig = {}) {
    this.config = {
      outputDir: config.outputDir || './downloads',
      maxConcurrentDownloads: config.maxConcurrentDownloads || 3,
      persistentRetry: config.persistentRetry !== false, // Default true
      ...config
    };
    
    this.parser = new M3U8Parser();
    this.downloader = new SegmentDownloader({
      maxConcurrentDownloads: this.config.maxConcurrentDownloads,
      persistentRetry: this.config.persistentRetry
    });
    this.converter = new FFmpegConverter();
  }

  /**
   * Process M3U8 stream - download segments and convert to MP4
   */
  public async processM3U8(m3u8Url: string, outputFileName: string): Promise<string> {
    console.log(`\n=== Processing M3U8 Stream ===`);
    console.log(`Source: ${m3u8Url}`);
    console.log(`Output: ${outputFileName}`);

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir!)) {
      mkdirSync(this.config.outputDir!, { recursive: true });
    }

    const outputPath = join(this.config.outputDir!, outputFileName);

    try {
      // Parse the master M3U8 to get the best quality stream
      const bestStreamUrl = await this.parser.parseMasterM3U8(m3u8Url);
      console.log(`Selected stream: ${bestStreamUrl}`);

      // Get segment list
      const segments = await this.parser.parseSegmentM3U8(bestStreamUrl);
      console.log(`Found ${segments.length} video segments`);

      if (segments.length === 0) {
        throw new Error('No video segments found in M3U8');
      }

      // Set proper referer for segment downloads
      this.downloader.setReferer(bestStreamUrl);

      // Download segments with persistent retry
      const segmentFiles = await this.downloader.downloadSegments(segments, outputFileName, this.config.outputDir!);

      // Convert to MP4 using FFmpeg
      const finalOutput = await this.converter.convertToMP4(segmentFiles, outputPath);

      // Cleanup segment files
      this.converter.cleanupSegments(segmentFiles);

      console.log(`\nDownload completed: ${finalOutput}`);
      return finalOutput;

    } catch (error) {
      console.error(`Failed to process M3U8: ${error}`);
      throw error;
    }
  }

}
