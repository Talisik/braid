import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { M3U8Parser, StreamQuality } from './M3U8Parser.js';
import { SegmentDownloader } from '../downloaders/SegmentDownloader.js';
import { FFmpegConverter } from '../converters/FFmpegConverter.js';
import { Page } from 'playwright';

export interface M3U8ProcessorConfig {
  outputDir?: string;
  maxConcurrentDownloads?: number;
  cleanup?: boolean;
  quality?: 'high' | 'medium' | 'fast';
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
      cleanup: config.cleanup !== false, // Default true
      quality: config.quality || 'high',
      ...config
    };

    this.parser = new M3U8Parser();
    this.downloader = new SegmentDownloader({
      maxConcurrentDownloads: this.config.maxConcurrentDownloads
    });
    this.converter = new FFmpegConverter();

    // Ensure output directory exists
    if (!existsSync(this.config.outputDir!)) {
      mkdirSync(this.config.outputDir!, { recursive: true });
      console.log(`Created output directory: ${this.config.outputDir}`);
    }
  }

  /**
   * Process M3U8 URL and download the video
   */
  public async processM3U8(m3u8Url: string, outputFileName: string): Promise<string | null> {
    try {
      console.log(`=== Starting M3U8 Processing ===`);
      console.log(`M3U8 URL: ${m3u8Url}`);
      console.log(`Output file: ${outputFileName}`);
      console.log(`Output directory: ${this.config.outputDir}`);

      // Step 1: Check if FFmpeg is available
      const ffmpegAvailable = await this.converter.isFFmpegAvailable();
      if (!ffmpegAvailable) {
        console.error('FFmpeg is not available. Please install FFmpeg to continue.');
        return null;
      }

      const ffmpegVersion = await this.converter.getFFmpegVersion();
      console.log(`Using FFmpeg version: ${ffmpegVersion}`);

      // Step 2: Parse master playlist
      console.log('\n=== Step 1: Parsing Master Playlist ===');
      const qualityStreams = await this.parser.parseMasterM3U8(m3u8Url);
      
      if (qualityStreams.length === 0) {
        console.error('No quality streams found in master playlist');
        return null;
      }

      // Step 3: Select best quality
      const bestStream = this.parser.getBestQualityStream(qualityStreams);
      if (!bestStream) {
        console.error('Could not select best quality stream');
        return null;
      }

      console.log(`\nSelected stream: ${bestStream.quality}p (${bestStream.bandwidth} bps)`);
      console.log(`Stream URL: ${bestStream.url}`);

      // Step 4: Parse media playlist to get segments
      console.log('\n=== Step 2: Parsing Media Playlist ===');
      const mediaResponse = await fetch(bestStream.url);
      const mediaContent = await mediaResponse.text();
      
      const segmentUrls = this.parser.extractSegmentUrls(mediaContent, bestStream.url);
      
      if (segmentUrls.length === 0) {
        console.error('No segments found in media playlist');
        return null;
      }

      console.log(`Found ${segmentUrls.length} segments to download`);

      // Step 5: Download segments
      console.log('\n=== Step 3: Downloading Segments ===');
      const segmentPaths = await this.downloader.downloadSegments(segmentUrls, 'f2movies');
      
      if (segmentPaths.length === 0) {
        console.error('No segments were downloaded successfully');
        return null;
      }

      if (segmentPaths.length < segmentUrls.length * 0.8) {
        console.log(`Warning: Only ${segmentPaths.length}/${segmentUrls.length} segments downloaded. Video may be incomplete.`);
      }

      // Step 6: Convert to final video
      console.log('\n=== Step 4: Converting to Final Video ===');
      const outputPath = join(this.config.outputDir!, outputFileName);
      
      const conversionSuccess = await this.converter.convertSegmentsToVideo(
        segmentPaths, 
        outputPath,
        {
          cleanup: this.config.cleanup,
          quality: this.config.quality
        }
      );

      if (!conversionSuccess) {
        console.error('Video conversion failed');
        return null;
      }

      // Step 7: Final cleanup if needed
      if (this.config.cleanup) {
        console.log('\n=== Step 5: Cleanup ===');
        this.downloader.cleanup();
      }

      console.log('\n=== M3U8 Processing Complete ===');
      console.log(`Final video saved to: ${outputPath}`);
      
      return outputPath;

    } catch (error) {
      console.error('M3U8 processing failed:', error);
      return null;
    }
  }

  /**
   * Process M3U8 with custom quality selection
   */
  public async processM3U8WithQuality(
    m3u8Url: string, 
    outputFileName: string, 
    preferredQuality: number
  ): Promise<string | null> {
    try {
      console.log(`Processing M3U8 with preferred quality: ${preferredQuality}p`);
      
      const qualityStreams = await this.parser.parseMasterM3U8(m3u8Url);
      
      if (qualityStreams.length === 0) {
        console.error('No quality streams found');
        return null;
      }

      // Find closest quality match
      let selectedStream = qualityStreams[0]; // Default to highest
      let qualityDiff = Math.abs(selectedStream.quality - preferredQuality);

      for (const stream of qualityStreams) {
        const diff = Math.abs(stream.quality - preferredQuality);
        if (diff < qualityDiff) {
          selectedStream = stream;
          qualityDiff = diff;
        }
      }

      console.log(`Selected ${selectedStream.quality}p (closest to requested ${preferredQuality}p)`);

      // Continue with normal processing but using selected stream
      const mediaResponse = await fetch(selectedStream.url);
      const mediaContent = await mediaResponse.text();
      const segmentUrls = this.parser.extractSegmentUrls(mediaContent, selectedStream.url);
      
      const segmentPaths = await this.downloader.downloadSegments(segmentUrls, 'f2movies');
      
      const outputPath = join(this.config.outputDir!, outputFileName);
      const success = await this.converter.convertSegmentsToVideo(segmentPaths, outputPath, {
        cleanup: this.config.cleanup,
        quality: this.config.quality
      });

      if (this.config.cleanup) {
        this.downloader.cleanup();
      }

      return success ? outputPath : null;

    } catch (error) {
      console.error('M3U8 processing with quality selection failed:', error);
      return null;
    }
  }

  /**
   * Get available quality options from M3U8
   */
  public async getAvailableQualities(m3u8Url: string): Promise<StreamQuality[]> {
    try {
      return await this.parser.parseMasterM3U8(m3u8Url);
    } catch (error) {
      console.error('Failed to get available qualities:', error);
      return [];
    }
  }

  /**
   * Process M3U8 URL using browser context for authenticated requests
   */
  public async processM3U8WithBrowser(m3u8Url: string, outputFileName: string, page: Page, networkMonitor?: any): Promise<string | null> {
    try {
      console.log(`=== Starting Browser-Based M3U8 Processing ===`);
      console.log(`M3U8 URL: ${m3u8Url}`);
      console.log(`Output file: ${outputFileName}`);
      console.log(`Output directory: ${this.config.outputDir}`);

      // Step 1: Get M3U8 master playlist content (from network capture or download)
      console.log('\n=== Step 1: Getting Master Playlist Content ===');
      let masterContent: string | null = null;
      
      // First try to get content from network monitor (already captured)
      if (networkMonitor && networkMonitor.getM3U8Content) {
        masterContent = networkMonitor.getM3U8Content(m3u8Url);
        if (masterContent) {
          console.log('Using captured M3U8 content from network monitor');
        }
      }
      
      // Fallback: try to download it with browser
      if (!masterContent) {
        console.log('Attempting to download M3U8 content with browser...');
        masterContent = await this.downloadM3U8WithBrowser(m3u8Url, page);
      }
      
      // Final fallback: try curl with proper headers
      if (!masterContent) {
        console.log('Attempting to download M3U8 content with curl...');
        const headers = await this.getBrowserHeaders(page);
        masterContent = await this.downloader.downloadM3U8WithCurl(m3u8Url, headers);
      }
      
      if (!masterContent) {
        console.error('Failed to get master M3U8 content');
        return null;
      }

      console.log(`Master playlist content length: ${masterContent.length} bytes`);
      console.log('Master playlist content preview:');
      console.log(masterContent.substring(0, 500) + (masterContent.length > 500 ? '...' : ''));

      // Step 2: Parse master playlist
      console.log('\n=== Step 2: Parsing Master Playlist ===');
      const streams = this.parser.extractQualityStreams(masterContent, m3u8Url);
      
      if (streams.length === 0) {
        console.error('No quality streams found in master playlist');
        return null;
      }

      console.log(`Found ${streams.length} quality streams:`);
      streams.forEach((stream, i) => {
        console.log(`  ${i + 1}. ${stream.resolution} - ${stream.bandwidth} bps - ${stream.url}`);
      });

      // Step 3: Select highest quality stream
      const selectedStream = streams.reduce((best, current) => 
        current.quality > best.quality ? current : best
      );
      
      console.log(`\nSelected stream: ${selectedStream.resolution} (${selectedStream.bandwidth} bps)`);

      // Step 4: Get segment playlist content (from network capture or download)
      console.log('\n=== Step 3: Getting Segment Playlist Content ===');
      let segmentContent: string | null = null;
      
      // First try to get content from network monitor (already captured)
      if (networkMonitor && networkMonitor.getM3U8Content) {
        segmentContent = networkMonitor.getM3U8Content(selectedStream.url);
        if (segmentContent) {
          console.log('Using captured segment playlist from network monitor');
        }
      }
      
      // Fallback: try to download it with browser
      if (!segmentContent) {
        console.log('Attempting to download segment playlist with browser...');
        segmentContent = await this.downloadM3U8WithBrowser(selectedStream.url, page);
      }
      
      // Final fallback: try curl with proper headers
      if (!segmentContent) {
        console.log('Attempting to download segment playlist with curl...');
        const headers = await this.getBrowserHeaders(page);
        segmentContent = await this.downloader.downloadM3U8WithCurl(selectedStream.url, headers);
      }
      
      if (!segmentContent) {
        console.error('Failed to get segment playlist content');
        return null;
      }

      // Step 5: Extract segment URLs
      const segmentUrls = this.parser.extractSegmentUrls(segmentContent, selectedStream.url);
      console.log(`Found ${segmentUrls.length} video segments to download`);

      if (segmentUrls.length === 0) {
        console.error('No video segments found in playlist');
        return null;
      }

      // Step 6: Download segments using curl with browser headers
      console.log('\n=== Step 4: Downloading Video Segments ===');
      const browserHeaders = await this.getBrowserHeaders(page);
      const segmentPaths = await this.downloader.downloadSegmentsWithCurl(segmentUrls, browserHeaders);
      
      if (segmentPaths.length === 0) {
        console.error('Failed to download any video segments');
        return null;
      }

      console.log(`Successfully downloaded ${segmentPaths.length} segments`);

      // Step 7: Convert segments to final video
      console.log('\n=== Step 5: Converting to Final Video ===');
      const outputPath = join(this.config.outputDir!, outputFileName);
      
      const conversionSuccess = await this.converter.convertSegmentsToVideo(
        segmentPaths, 
        outputPath,
        {
          cleanup: this.config.cleanup,
          quality: this.config.quality
        }
      );

      if (!conversionSuccess) {
        console.error('Video conversion failed');
        return null;
      }

      // Step 8: Final cleanup if needed
      if (this.config.cleanup) {
        console.log('\n=== Step 6: Cleanup ===');
        this.downloader.cleanup();
      }

      console.log('\n=== Browser-Based M3U8 Processing Complete ===');
      console.log(`Final video saved to: ${outputPath}`);
      
      return outputPath;

    } catch (error) {
      console.error('Browser-based M3U8 processing failed:', error);
      return null;
    }
  }

  /**
   * Download M3U8 content using browser navigation (bypasses Cloudflare protection)
   */
  private async downloadM3U8WithBrowser(url: string, page: Page): Promise<string | null> {
    try {
      console.log('Navigating to M3U8 URL with browser to bypass Cloudflare...');
      
      // Navigate directly to the M3U8 URL using the browser
      // This bypasses Cloudflare protection by executing JavaScript
      const response = await page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      if (!response || !response.ok()) {
        throw new Error(`Failed to navigate to M3U8: ${response?.status()}`);
      }
      
      // Get the page content (should be the M3U8 playlist)
      const content = await page.content();
      
      // Check if we got HTML (Cloudflare protection) instead of M3U8
      if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        throw new Error('Got HTML page instead of M3U8 content (Cloudflare protection)');
      }
      
      // Extract just the text content if it's wrapped in HTML
      const textContent = await page.evaluate(() => {
        // Try to get just the text content
        const body = document.body;
        if (body && body.textContent) {
          const text = body.textContent.trim();
          // Check if it looks like M3U8 content
          if (text.includes('#EXTM3U') || text.includes('#EXT-X-')) {
            return text;
          }
        }
        return document.documentElement.textContent || '';
      });
      
      return textContent;
      
    } catch (error) {
      console.error('Error downloading M3U8 with browser navigation:', error);
      
      // Fallback: try the old method
      try {
        console.log('Trying page.evaluate fallback...');
        const headers = await this.getBrowserHeaders(page);
        
        const content = await page.evaluate(async (args: { url: string, headers: Record<string, string> }) => {
          try {
            const response = await fetch(args.url, {
              headers: args.headers,
              credentials: 'include'
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.text();
          } catch (error) {
            throw new Error(`Fetch failed: ${(error as Error).message}`);
          }
        }, { url, headers }) as string;
        
        return content;
      } catch (evaluateError) {
        console.error('Page evaluate fallback also failed:', evaluateError);
        return null;
      }
    }
  }

  /**
   * Download M3U8 content using curl as fallback
   */
  private async downloadM3U8WithCurl(url: string, headers: Record<string, string>): Promise<string | null> {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve) => {
      try {
        const curlArgs = [
          '-L', // Follow redirects
          '-s', // Silent mode
          '-S', // Show errors
          '--max-time', '30', // 30 second timeout
        ];

        // Add headers
        for (const [key, value] of Object.entries(headers)) {
          curlArgs.push('-H', `${key}: ${value}`);
        }

        // Add URL
        curlArgs.push(url);

        const curlProcess = spawn('curl', curlArgs);
        let output = '';
        let errorOutput = '';
        
        curlProcess.stdout.on('data', (data) => {
          output += data.toString();
        });

        curlProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        curlProcess.on('close', (code: number) => {
          if (code === 0 && output.trim().length > 0) {
            resolve(output);
          } else {
            console.error(`Curl failed with code ${code}: ${errorOutput}`);
            resolve(null);
          }
        });

        curlProcess.on('error', (error) => {
          console.error(`Curl process error:`, error);
          resolve(null);
        });

      } catch (error) {
        console.error(`Error setting up curl:`, error);
        resolve(null);
      }
    });
  }

  /**
   * Get browser headers for curl requests
   */
  private async getBrowserHeaders(page: Page): Promise<Record<string, string>> {
    try {
      // Get cookies and user agent from browser
      const cookies = await page.context().cookies();
      const userAgent = await page.evaluate(() => navigator.userAgent);
      
      const headers: Record<string, string> = {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': page.url()
      };

      // Add cookies if any
      if (cookies.length > 0) {
        const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        headers['Cookie'] = cookieString;
      }

      return headers;
    } catch (error) {
      console.error('Error getting browser headers:', error);
      // Fallback headers that match your suggestion
      return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      };
    }
  }
}
