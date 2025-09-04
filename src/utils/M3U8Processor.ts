import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import { Logger } from 'winston';
import { createLogger } from './Logger';
import { M3U8ProcessorConfig } from '../types';
import * as cliProgress from 'cli-progress';
// Import ffmpeg-static with error handling for Electron environments
let ffmpegStatic: string | null = null;
try {
  // This may fail in Electron environments due to package.json resolution issues
  ffmpegStatic = require('ffmpeg-static');
} catch (error) {
  // Fallback to system ffmpeg in Electron or other problematic environments
  console.warn('Warning: ffmpeg-static could not be loaded (common in Electron apps). Using system ffmpeg.');
}


// Direct TypeScript port of Python m3u8_downloader.py
interface Segment {
  uri: string;
  duration?: number;
}

interface Playlist {
  segments: Segment[];
  playlists?: PlaylistInfo[];
}

interface PlaylistInfo {
  uri: string;
  streamInfo: {
    bandwidth?: number;
    resolution?: string;
    codecs?: string;
  };
}

// Simple curl-based downloader - more reliable than custom HTTP implementation
class SimpleDownloader {
  private defaultHeaders: Record<string, string> = {};

  constructor(config: {
    headers?: Record<string, string>;
  } = {}) {
    this.defaultHeaders = config.headers || {};
  }

  get defaults() {
    return {
      headers: {
        common: this.defaultHeaders
      }
    };
  }

  /**
   * Download file using curl - much more reliable than custom HTTP implementation
   */
  async downloadFile(url: string, outputPath: string, headers?: Record<string, string>): Promise<boolean> {
    try {
      const allHeaders = { ...this.defaultHeaders, ...headers };
      
      // Build curl arguments array (avoid shell parsing issues)
      const curlArgs = [
        '-L', // Follow redirects
        '--fail', // Fail on HTTP errors
        '--silent', // Silent mode
        '--show-error', // Show errors
        '--max-time', '60', // 60 second timeout
        '--retry', '3', // Retry 3 times
        '--retry-delay', '2', // 2 second delay between retries
      ];

      // Add headers (properly escaped)
      for (const [key, value] of Object.entries(allHeaders)) {
        if (value) {
          curlArgs.push('-H', `${key}: ${value}`);
        }
      }

      // Add URL and output
      curlArgs.push('-o', outputPath, url);

      // Silent mode - don't log to avoid interfering with progress bar

      // Execute curl using spawn (avoids shell parsing issues)
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const curlProcess = spawn('curl', curlArgs, {
          stdio: 'pipe'
        });

        let errorOutput = '';

        curlProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        curlProcess.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `Exit code ${code}: ${errorOutput}` });
          }
        });

        curlProcess.on('error', (error) => {
          resolve({ success: false, error: error.message });
        });

        // Set timeout
        setTimeout(() => {
          curlProcess.kill();
          resolve({ success: false, error: 'Timeout after 90 seconds' });
        }, 90000);
      });

      if (!result.success) {
        // Don't log curl errors to avoid interfering with progress bar
        return false;
      }

      // Check if file was created and has content
      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        // Don't log individual successes to avoid interfering with progress bar
        return true;
      } else {
        // Don't log individual failures to avoid interfering with progress bar
        return false;
      }

    } catch (error: any) {
      // Don't log curl errors to avoid interfering with progress bar
      return false;
    }
  }

  /**
   * Download text content using curl
   */
  async downloadText(url: string, headers?: Record<string, string>): Promise<string | null> {
    try {
      const tempFile = path.join(os.tmpdir(), `temp_download_${Date.now()}.txt`);
      
      if (await this.downloadFile(url, tempFile, headers)) {
        const content = fs.readFileSync(tempFile, 'utf8');
        fs.unlinkSync(tempFile); // Clean up temp file
        return content;
      }
      
      return null;
    } catch (error) {
      this.logger?.error(`❌ Text download failed: ${error}`);
      return null;
    }
  }

  private logger?: Logger;

  setLogger(logger: Logger) {
    this.logger = logger;
  }
}

export class M3U8Processor {
  private logger: Logger;
  private downloader: SimpleDownloader;
  private tempDir: string | null = null;
  private segmentFiles: string[] = [];
  private config: M3U8ProcessorConfig;
  private progressBar: cliProgress.SingleBar | null = null;
  private progressUpdateLock: boolean = false;
  private completedSegments: number = 0;
  private totalSegments: number = 0;
  private downloadStartTime: number = 0;

  constructor(config: M3U8ProcessorConfig = {}) {
    this.logger = createLogger('M3U8Processor');
    this.config = {
      outputDir: config.outputDir || 'downloads',
      maxWorkers: config.maxWorkers || 4,
      timeout: config.timeout || 30000, // Python default timeout
      retries: config.retries || 3,
      ffmpegPath: config.ffmpegPath || ffmpegStatic || 'ffmpeg',
      segmentTimeout: config.segmentTimeout || 30000,
    };

    // Create simple curl-based downloader with EXACT same headers as Python script
    this.downloader = new SimpleDownloader({
      // EXACT headers from working Python script (lines 26-38 in m3u8_downloader.py)
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      }
    });
    
    // Set logger for downloader
    this.downloader.setLogger(this.logger);
  }



  /**
   * Configure downloader headers - EXACT equivalent of Python session.headers.update()
   */
  private configureDownloaderHeaders(headers: Record<string, string>, m3u8Url?: string): void {
    // Start with EXACT Python session headers (lines 26-38 in m3u8_downloader.py)
    this.downloader.defaults.headers.common = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    };

    // Add any custom headers from browser context (like Python custom_headers logic)
    if (headers['Referer']) {
      this.downloader.defaults.headers.common['Referer'] = headers['Referer'];
    } else if (m3u8Url) {
      // If no referer provided, use the M3U8 domain as referer (common requirement)
      try {
        const url = new URL(m3u8Url);
        this.downloader.defaults.headers.common['Referer'] = `${url.protocol}//${url.host}/`;
      } catch (e) {
        // Ignore URL parsing errors
      }
    }
    
    if (headers['Origin']) {
      this.downloader.defaults.headers.common['Origin'] = headers['Origin'];
    } else if (m3u8Url) {
      // If no origin provided, use the M3U8 domain as origin (common requirement)
      try {
        const url = new URL(m3u8Url);
        this.downloader.defaults.headers.common['Origin'] = `${url.protocol}//${url.host}`;
      } catch (e) {
        // Ignore URL parsing errors
      }
    }
    
    // Add any other captured headers that might be important
    for (const [key, value] of Object.entries(headers)) {
      if (value && !['Referer', 'Origin'].includes(key)) {
        // Only add non-conflicting headers
        if (!['User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding', 'DNT', 'Connection', 'Upgrade-Insecure-Requests', 'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User', 'Cache-Control'].includes(key)) {
          this.downloader.defaults.headers.common[key] = value;
        }
      }
    }
  }

  /**
   * Parse M3U8 playlist - Download file locally then parse it
   */
  private async parsePlaylist(m3u8Url: string, browserPage?: any): Promise<Playlist | null> {
    try {
      this.logger.info(`📡 Downloading M3U8 playlist: ${m3u8Url}`);
      
      // Download M3U8 content using curl (much more reliable)
      const playlistContent = await this.downloader.downloadText(m3u8Url);
      
      if (!playlistContent) {
        this.logger.error('❌ Failed to download M3U8 playlist');
        return null;
      }
      
      this.logger.info(`✅ M3U8 content downloaded: ${playlistContent.length} characters`);
      
      // Log first few lines of playlist for debugging
      const firstLines = playlistContent.split('\n').slice(0, 5).join('\n');
      this.logger.info(`📋 Playlist preview:\n${firstLines}`);
      
      return this.parseM3U8Content(playlistContent, m3u8Url);
      
    } catch (error: any) {
      this.logger.error(`❌ Error parsing playlist: ${error.message || error}`);
      return null;
    }
  }

  private extractOrigin(url: string): string {
    try {
      const urlObj = new URL(url);
      return `${urlObj.protocol}//${urlObj.host}`;
    } catch {
      return '';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse M3U8 content - EXACT replication of Python m3u8.loads() behavior
   */
  private parseM3U8Content(content: string, baseUrl: string): Playlist {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const playlist: Playlist = { segments: [], playlists: [] };
    
    // First pass - determine if this is a master playlist or media playlist
    let isMasterPlaylist = false;
    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        isMasterPlaylist = true;
        break;
      }
    }
    
    if (isMasterPlaylist) {
      // Parse master playlist exactly like Python m3u8 library
      this.logger.info('Parsing master playlist (multiple quality streams)');
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          const streamInfo = this.parseStreamInfo(line);
          const nextLine = lines[i + 1];
          if (nextLine && !nextLine.startsWith('#')) {
            playlist.playlists = playlist.playlists || [];
            playlist.playlists.push({
              uri: nextLine,
              streamInfo
            });
          }
          i += 2;
        } else {
          i++;
        }
      }
      
      this.logger.info(`Found ${playlist.playlists?.length || 0} quality variants`);
    } else {
      // Parse media playlist exactly like Python m3u8 library
      this.logger.info('Parsing media playlist (video segments)');
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        
        if (line.startsWith('#EXTINF:')) {
          const duration = this.extractDuration(line);
          const nextLine = lines[i + 1];
          if (nextLine && !nextLine.startsWith('#')) {
            playlist.segments.push({
              uri: nextLine,
              duration
            });
          }
          i += 2;
        } else {
          i++;
        }
      }
      
      this.logger.info(`Found ${playlist.segments.length} video segments`);
    }

    return playlist;
  }

  /**
   * Parse stream info from EXT-X-STREAM-INF line
   */
  private parseStreamInfo(line: string): { bandwidth?: number; resolution?: string; codecs?: string } {
    const streamInfo: any = {};
    
    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
    if (bandwidthMatch) {
      streamInfo.bandwidth = parseInt(bandwidthMatch[1]);
    }

    const resolutionMatch = line.match(/RESOLUTION=([^,\s]+)/);
    if (resolutionMatch) {
      streamInfo.resolution = resolutionMatch[1];
    }

    const codecsMatch = line.match(/CODECS="([^"]+)"/);
    if (codecsMatch) {
      streamInfo.codecs = codecsMatch[1];
    }

    return streamInfo;
  }

  /**
   * Extract duration from EXTINF line
   */
  private extractDuration(line: string): number | undefined {
    const match = line.match(/#EXTINF:([\d.]+)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  /**
   * Select best quality stream - EXACT copy of Python _select_quality method
   */
  private selectBestQuality(masterPlaylist: Playlist, baseUrl: string): string | null {
    if (!masterPlaylist.playlists || masterPlaylist.playlists.length === 0) {
      this.logger.error('No quality variants found in master playlist');
      return null;
    }

    // Extract available qualities exactly like Python
    const qualities: Array<{
      url: string;
      resolution: string;
      bandwidth: number;
      playlist: PlaylistInfo;
    }> = [];

    for (const playlist of masterPlaylist.playlists) {
      const resolution = playlist.streamInfo.resolution;
      const bandwidth = playlist.streamInfo.bandwidth || 0;
      
      if (resolution) {
        // Parse resolution like Python (width x height)
        const [width, height] = resolution.split('x').map(Number);
        qualities.push({
          url: playlist.uri,
          resolution: `${width}x${height}`,
          bandwidth: bandwidth,
          playlist: playlist
        });
      }
    }

    // Sort by resolution (height) exactly like Python
    qualities.sort((a, b) => {
      const heightA = parseInt(a.resolution.split('x')[1]);
      const heightB = parseInt(b.resolution.split('x')[1]);
      return heightB - heightA; // Descending order (best first)
    });

    this.logger.info('Available qualities:');
    qualities.forEach((q, i) => {
      this.logger.info(`${i + 1}. ${q.resolution} (${q.bandwidth} bps)`);
    });

    // Auto-select best quality (like Python quality_preference='best')
    const selected = qualities[0];
    this.logger.info(`Selected quality: ${selected.resolution}`);
    
    return this.resolveUrl(selected.url, baseUrl);
  }

  /**
   * Initialize progress tracking with single updating line
   */
  private initializeProgressBar(totalSegments: number): void {
    // Stop any existing progress bar first
    this.stopProgressBar();
    
    // Initialize the progress display
    this.updateProgressDisplay(0, totalSegments, '0.0', '0.0');
  }

  /**
   * Update progress display with single overwriting line
   */
  private updateProgressDisplay(completed: number, total: number, speed: string, percentage: string): void {
    // Create a visual progress bar
    const barWidth = 40;
    const filledWidth = Math.round((completed / total) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    
    // Calculate ETA
    const speedNum = parseFloat(speed);
    const remainingSegments = total - completed;
    const etaSeconds = speedNum > 0 ? Math.round(remainingSegments / speedNum) : 0;
    const eta = etaSeconds > 0 ? `${etaSeconds}s` : 'N/A';
    
    // Create the progress line with padding to clear previous content
    const progressLine = `📥 Downloading |${bar}| ${percentage}% || ${completed}/${total} segments || ETA: ${eta} || Speed: ${speed} seg/s`;
    const paddedLine = progressLine.padEnd(120, ' '); // Pad to 120 chars to clear any leftover text
    
    // Clear line and write new content
    process.stdout.write(`\r${paddedLine}\r${progressLine}`);
    
    // Add newline only when complete
    if (completed === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Increment completed segments counter and log progress periodically
   */
  private incrementProgress(): void {
    if (this.progressUpdateLock) {
      return;
    }
    
    this.progressUpdateLock = true;
    
    try {
      this.completedSegments++;
      const elapsed = (Date.now() - this.downloadStartTime) / 1000;
      const speed = elapsed > 0 ? (this.completedSegments / elapsed).toFixed(1) : '0.0';
      const percentage = ((this.completedSegments / this.totalSegments) * 100).toFixed(1);
      
      // Update progress bar that overwrites itself
      this.updateProgressDisplay(this.completedSegments, this.totalSegments, speed, percentage);
    } catch (error) {
      this.logger.debug(`Progress update error: ${error}`);
    } finally {
      this.progressUpdateLock = false;
    }
  }

  /**
   * Update progress bar with current status (thread-safe with simple locking)
   */
  private updateProgressBar(current: number, total: number, speed?: string): void {
    if (this.progressUpdateLock || !this.progressBar) {
      return; // Skip if already updating or no progress bar
    }
    
    if (this.progressBar && !this.progressBar.isActive) {
      return; // Don't update if progress bar is stopped
    }
    
    this.progressUpdateLock = true;
    
    try {
      if (this.progressBar) {
        this.progressBar.update(current, {
          speed: speed || "N/A"
        });
      }
    } catch (error) {
      // Ignore progress bar update errors to prevent crashes
      this.logger.debug(`Progress bar update error: ${error}`);
    } finally {
      this.progressUpdateLock = false;
    }
  }

  /**
   * Stop and cleanup progress tracking (safe)
   */
  private stopProgressBar(): void {
    // No visual progress bar to stop, just reset counters
    this.progressBar = null;
    this.progressUpdateLock = false;
  }

  /**
   * Download video segments using curl - Much more reliable than custom HTTP
   */
  private async downloadSegments(
    playlist: Playlist,
    baseUrl: string,
    maxWorkers: number,
    progressCallback?: (current: number, total: number) => void
  ): Promise<boolean> {
    if (!playlist.segments || playlist.segments.length === 0) {
      this.logger.error('No segments found in playlist');
      return false;
    }
    
    // Create temporary directory exactly like Python
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm3u8_download_'));
    
    // Initialize progress tracking
    this.totalSegments = playlist.segments.length;
    this.completedSegments = 0;
    this.downloadStartTime = Date.now();
    
    this.logger.info(`📥 Starting download of ${this.totalSegments} segments using curl...`);
    
    // Initialize progress bar
    this.initializeProgressBar(this.totalSegments);
    
    let successCount = 0;
    
    // Download function for a single segment using curl with 10x retry
    const downloadSegment = async (segment: Segment, index: number): Promise<boolean> => {
      const maxRetries = 10;
      const segmentUrl = this.resolveUrl(segment.uri, baseUrl);
      const segmentFile = path.join(this.tempDir!, `segment_${index.toString().padStart(5, '0')}.ts`);
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Don't log individual downloads to avoid interfering with progress bar
          
          // Use curl to download segment
          const success = await this.downloader.downloadFile(segmentUrl, segmentFile);
          
          if (success) {
            this.segmentFiles.push(segmentFile);
            successCount++;
            
            // Update progress bar atomically
            this.incrementProgress();
            
            // Progress callback like Python tqdm
            if (progressCallback) {
              progressCallback(successCount, this.totalSegments);
            }
            
            return true;
          } else {
            if (attempt < maxRetries) {
              const delay = Math.min(attempt * 300, 3000); // Progressive delays: 300ms, 600ms, 900ms... max 3s
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
        } catch (error) {
          // Don't log retry attempts to avoid interfering with progress bar
          
          if (attempt < maxRetries) {
            const delay = Math.min(attempt * 300, 3000); // Progressive delays: 300ms, 600ms, 900ms... max 3s
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // Don't log final failure to avoid interfering with progress bar
      return false;
    };
    
    // Use Promise.all with concurrency limit exactly like Python ThreadPoolExecutor
    const semaphore = Array(maxWorkers).fill(0);
    const downloadPromises = playlist.segments.map((segment, index) => {
      return new Promise<boolean>((resolve) => {
        const execute = async () => {
          const result = await downloadSegment(segment, index);
          resolve(result);
        };
        
        // Wait for available worker slot
        const waitForSlot = () => {
          const availableIndex = semaphore.findIndex(slot => slot === 0);
          if (availableIndex !== -1) {
            semaphore[availableIndex] = 1;
            execute().finally(() => {
              semaphore[availableIndex] = 0;
            });
          } else {
            setTimeout(waitForSlot, 10);
          }
        };
        
        waitForSlot();
      });
    });
    
    // Wait for all downloads like Python
    await Promise.all(downloadPromises);
    
    // Stop progress bar and show summary
    this.stopProgressBar();
    
    const totalTime = (Date.now() - this.downloadStartTime) / 1000;
    const avgSpeed = totalTime > 0 ? (successCount / totalTime).toFixed(1) : 'N/A';
    
    // Clear the progress line and show completion message
    process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear the line
    this.logger.info(`📥 Download completed: ${successCount}/${this.totalSegments} segments successful in ${totalTime.toFixed(1)}s (avg: ${avgSpeed} seg/s)`);
    
    if (successCount === 0) {
      this.logger.error('No segments were downloaded successfully');
      return false;
    }
    
        // Accept partial success like Python (at least 80% of segments)
    const successRate = successCount / this.totalSegments;
    if (successRate < 0.8) {
      this.logger.warn(`Partial success: ${(successRate * 100).toFixed(1)}% - will try curl fallback`);
      return false; // Force fallback to curl method
    } else {
      this.logger.info(`Successfully downloaded ${successCount} segments via direct HTTP`);
      return true;
    }

    return successCount > 0; // Return true if we got at least some segments
  }

  /**
   * Convert downloaded segments to MP4 - equivalent of Python _convert_to_mp4
   */
  private async convertToMp4(outputFilename: string): Promise<boolean> {
    if (this.segmentFiles.length === 0) {
      this.logger.error('No segments to convert');
      return false;
    }

    this.logger.info(`Converting ${this.segmentFiles.length} segments to MP4: ${outputFilename}`);

    try {
      // Ensure output directory exists
      const outputDir = path.dirname(outputFilename);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Create concatenation file for ffmpeg
      const concatFile = path.join(this.tempDir!, 'concat.txt');
      const sortedSegments = this.segmentFiles.sort();
      const concatContent = sortedSegments.map(file => `file '${file}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Use ffmpeg to concatenate and convert
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c:v', 'copy',  // Copy video codec
        '-c:a', 'copy',  // Copy audio codec
        '-f', 'mp4',
        '-y',  // Overwrite output
        outputFilename
      ];

      const success = await this.runFFmpeg(ffmpegArgs);
      
      if (success) {
        this.logger.info('Conversion completed successfully');
        return true;
      } else {
        // Try alternative conversion method
        return await this.convertAlternative(outputFilename);
      }

    } catch (error) {
      this.logger.error(`Error during conversion: ${error}`);
      return await this.convertAlternative(outputFilename);
    }
  }

  /**
   * Alternative conversion method - equivalent of Python _convert_alternative
   */
  private async convertAlternative(outputFilename: string): Promise<boolean> {
    try {
      this.logger.info('Trying alternative conversion method...');

      const concatFile = path.join(this.tempDir!, 'concat.txt');
      const sortedSegments = this.segmentFiles.sort();
      const concatContent = sortedSegments.map(file => `file '${file}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c:v', 'libx264',  // Use h264 codec
        '-c:a', 'aac',      // Use AAC audio codec
        '-f', 'mp4',
        '-y',  // Overwrite output
        outputFilename
      ];

      const success = await this.runFFmpeg(ffmpegArgs);
      
      if (success) {
        this.logger.info('Alternative conversion completed successfully');
        return true;
      } else {
        this.logger.error('Alternative conversion also failed');
        return false;
      }

    } catch (error) {
      this.logger.error(`Alternative conversion also failed: ${error}`);
      return false;
    }
  }

  /**
   * Run FFmpeg with given arguments
   */
  private async runFFmpeg(args: string[]): Promise<boolean> {
    return new Promise((resolve) => {
      const ffmpeg = spawn(this.config.ffmpegPath || 'ffmpeg', args);

      let hasError = false;

      ffmpeg.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('Error')) {
          this.logger.error(`FFmpeg error: ${output}`);
          hasError = true;
        }
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && !hasError) {
          resolve(true);
        } else {
          this.logger.error(`FFmpeg failed with code: ${code}`);
          resolve(false);
        }
      });

      ffmpeg.on('error', (error) => {
        this.logger.error(`FFmpeg process error: ${error}`);
        resolve(false);
      });
    });
  }

  /**
   * Clean up temporary files - equivalent of Python _cleanup
   */
  private cleanup(): void {
    // Stop progress bar if still running
    this.stopProgressBar();
    
    if (this.tempDir && fs.existsSync(this.tempDir)) {
      try {
        fs.rmSync(this.tempDir, { recursive: true, force: true });
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp directory: ${error}`);
      }
    }
    this.segmentFiles = [];
  }

  /**
   * Resolve URL relative to base URL
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      // Fallback for malformed URLs
      const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      return base + url;
    }
  }

  // Hybrid approach: Use browser session + TypeScript processing
  async processM3U8(m3u8Url: string, headers: Record<string, string>, outputFilename?: string, browserPage?: any): Promise<boolean> {
    try {
      if (!outputFilename) {
        const timestamp = Math.floor(Date.now() / 1000);
        outputFilename = `pokemon_video_${timestamp}.mp4`;
      }

      const outputDir = this.config.outputDir || 'downloads';
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const fullPath = path.join(outputDir, outputFilename);
      
      // Always try to replicate Python behavior exactly
      this.logger.info(`🐍 Replicating Python M3U8 downloader behavior for: ${m3u8Url}`);
      this.logger.info(`📁 Output path: ${fullPath}`);
      
      // Configure downloader with headers (including M3U8 URL for Referer/Origin) - exactly like Python
      this.configureDownloaderHeaders(headers, m3u8Url);
      
      // Step 1: Parse M3U8 playlist - try browser first if available, then direct HTTP
      this.logger.info(`🔗 Fetching M3U8 playlist from: ${m3u8Url}`);
      let playlist = null;
      
      if (browserPage) {
        // Try browser approach first (works better with CDN restrictions)
        playlist = await this.parsePlaylistWithBrowser(m3u8Url, browserPage);
        if (playlist) {
          this.logger.info('Successfully parsed M3U8 playlist via browser');
        } else {
          this.logger.warn('Browser M3U8 fetch failed, trying direct HTTP...');
        }
      }
      
      if (!playlist) {
        // Fallback to direct HTTP (like Python)
        playlist = await this.parsePlaylist(m3u8Url);
        if (!playlist) {
          this.logger.error('Failed to parse M3U8 playlist with both browser and direct HTTP');
          return false;
        } else {
          this.logger.info('Successfully parsed M3U8 playlist via direct HTTP');
        }
      }
    
      // Step 2: Handle master playlist if needed
      let finalPlaylist = playlist;
      if (playlist.playlists && playlist.playlists.length > 0) {
        this.logger.info('This appears to be a master playlist with multiple qualities');
        const selectedUrl = this.selectBestQuality(playlist, m3u8Url);
        
        if (!selectedUrl) {
          return false;
        }
        
        this.logger.info(`Selected quality URL: ${selectedUrl}`);
        const selectedPlaylist = await this.parsePlaylist(selectedUrl);
        if (!selectedPlaylist) {
          return false;
        }
        finalPlaylist = selectedPlaylist;
      }

      
      const segmentSuccess = await this.downloadSegments(finalPlaylist, m3u8Url, this.config.maxWorkers || 4);
      if (!segmentSuccess) {
        this.logger.error('Failed to download segments via direct HTTP');
        return false;
      } else {
        this.logger.info('Successfully downloaded segments via direct HTTP (like Python)');
      }
      
      // Step 4: Convert to MP4
      if (!await this.convertToMp4(fullPath)) {
        return false;
      }
      
      this.logger.info(`Download completed successfully: ${fullPath}`);
      return true;

      
    } catch (error) {
      this.logger.error(`M3U8 processing failed: ${error}`);
      return false;
    } finally {
      this.cleanup();
    }
  }

  async downloadDirectVideo(videoUrl: string, headers: Record<string, string>): Promise<boolean> {
    try {
      this.logger.info(`Downloading direct video: ${videoUrl}`);

      const timestamp = Math.floor(Date.now() / 1000);
      const outputFilename = `pokemon_video_${timestamp}.mp4`;
      const outputDir = this.config.outputDir || 'downloads';
      const outputPath = path.join(outputDir, outputFilename);

      // Ensure downloads directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Build ffmpeg command with headers
      const ffmpegHeaders: string[] = [];
      for (const [key, value] of Object.entries(headers)) {
        if (value) {
          ffmpegHeaders.push('-headers', `${key}: ${value}`);
        }
      }

      const ffmpegArgs = [
        '-y', // Overwrite output files
        '-loglevel', 'info',
        ...ffmpegHeaders,
        '-i', videoUrl,
        '-c', 'copy', // Copy without re-encoding
        '-f', 'mp4',
        outputPath,
      ];

      const success = await this.runFFmpeg(ffmpegArgs);
      
      if (success) {
        this.logger.info(`Direct video download successful: ${outputPath}`);
        return true;
      } else {
        this.logger.error('Direct video download failed');
        return false;
      }

    } catch (error) {
      this.logger.error(`Error downloading direct video: ${error}`);
      return false;
    }
  }

  /**
   * Process M3U8 using browser-based approach (fallback when direct HTTP fails)
   */
  private async processBrowserBased(playlist: Playlist, m3u8Url: string, browserPage: any, fullPath: string, sessionHeaders?: Record<string, string>): Promise<boolean> {
    try {
      this.logger.info('🌐 Using browser-based processing approach');
      
      // Handle master playlist if needed
      let finalPlaylist = playlist;
      if (playlist.playlists && playlist.playlists.length > 0) {
        this.logger.info('🎯 This appears to be a master playlist with multiple qualities');
        const selectedUrl = this.selectBestQuality(playlist, m3u8Url);
        if (!selectedUrl) {
          return false;
        }
        
        // Clean the master URL and join properly
        const urlObj = new URL(m3u8Url);
        const cleanedMasterUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
        const fixedSelectedUrl = new URL(selectedUrl, cleanedMasterUrl).href;
        
        this.logger.info(`🎯 Selected quality URL: ${fixedSelectedUrl}`);
        const selectedPlaylist = await this.parsePlaylistWithBrowser(fixedSelectedUrl, browserPage);
        if (!selectedPlaylist) {
          return false;
        }
        finalPlaylist = selectedPlaylist;
      }
      
      // Download segments using browser session
      if (!await this.downloadSegmentsWithBrowser(finalPlaylist, m3u8Url, browserPage, sessionHeaders)) {
        return false;
      }
      
      // Convert to MP4
      if (!await this.convertToMp4(fullPath)) {
        return false;
      }
      
      this.logger.info(`✅ Browser-based download completed successfully: ${fullPath}`);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ Browser-based processing failed: ${error}`);
      return false;
    }
  }

  // Browser-based methods that use the browser's session context

  /**
   * Extract M3U8 playlist from video player (bypass direct fetch issues)
   */
  private async parsePlaylistWithBrowser(url: string, browserPage: any): Promise<Playlist | null> {
    try {
      this.logger.info(`🎯 Extracting M3U8 playlist from video player: ${url}`);
      
      // First, wait for video player to load and try to extract M3U8 URL
      const playerData = await browserPage.evaluate(async (targetUrl: string) => {
        try {
          // Wait longer for player to initialize and analytics to fire
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Method 1: Extract from JWPlayer analytics URLs (most reliable)
          console.log('🔍 Checking performance entries for JWPlayer analytics...');
          const performanceEntries = performance.getEntriesByType('resource');
          const jwAnalyticsPattern = /mu=([^&]+)/;
          
          // Log all jwpltx.com requests for debugging
          const jwRequests = performanceEntries.filter(entry => 
            entry.name && entry.name.includes('jwpltx.com')
          );
          console.log(`Found ${jwRequests.length} JWPlayer analytics requests:`, jwRequests.map(r => r.name));
          
          for (const entry of performanceEntries) {
            if (entry.name && entry.name.includes('jwpltx.com') && entry.name.includes('mu=')) {
              const match = entry.name.match(jwAnalyticsPattern);
              if (match && match[1]) {
                const decodedUrl = decodeURIComponent(match[1]);
                console.log('🎯 Found mu parameter:', decodedUrl);
                if (decodedUrl.includes('.m3u8')) {
                  return { success: true, m3u8Url: decodedUrl, method: 'jwplayer_analytics' };
                }
              }
            }
          }
          
          // Method 2: Look for JWPlayer instance with more detailed checking
          console.log('🔍 Checking JWPlayer instance...');
          if (typeof (window as any).jwplayer !== 'undefined') {
            try {
              const player = (window as any).jwplayer();
              console.log('JWPlayer found:', !!player);
              
              if (player && typeof player.getPlaylist === 'function') {
                const playlist = player.getPlaylist();
                console.log('JWPlayer playlist:', playlist);
                
                if (playlist && playlist.length > 0 && playlist[0].sources) {
                  for (const source of playlist[0].sources) {
                    console.log('JWPlayer source:', source);
                    if (source.file && source.file.includes('.m3u8')) {
                      return { success: true, m3u8Url: source.file, method: 'jwplayer_api' };
                    }
                  }
                }
              }
              
              // Try alternative JWPlayer methods
              if (player && typeof player.getConfig === 'function') {
                const config = player.getConfig();
                console.log('JWPlayer config:', config);
                if (config && config.playlist && config.playlist[0] && config.playlist[0].sources) {
                  for (const source of config.playlist[0].sources) {
                    if (source.file && source.file.includes('.m3u8')) {
                      return { success: true, m3u8Url: source.file, method: 'jwplayer_config' };
                    }
                  }
                }
              }
            } catch (e) {
              console.log('JWPlayer error:', e);
            }
          }
          
          // Method 3: Look for video elements with HLS sources
          console.log('🔍 Checking video elements...');
          const videoElements = document.querySelectorAll('video');
          console.log(`Found ${videoElements.length} video elements`);
          
          for (let i = 0; i < videoElements.length; i++) {
            const video = videoElements[i];
            console.log(`Video ${i}:`, { src: video.src, currentSrc: video.currentSrc });
            
            if (video.src && video.src.includes('.m3u8')) {
              return { success: true, m3u8Url: video.src, method: 'video_element' };
            }
            if (video.currentSrc && video.currentSrc.includes('.m3u8')) {
              return { success: true, m3u8Url: video.currentSrc, method: 'video_current_src' };
            }
          }
          
          // Method 4: Look in all network requests for M3U8 files
          console.log('🔍 Checking all network requests for M3U8...');
          const m3u8Requests = performanceEntries.filter(entry => 
            entry.name && entry.name.includes('.m3u8')
          );
          console.log(`Found ${m3u8Requests.length} M3U8 requests:`, m3u8Requests.map(r => r.name));
          
          for (const entry of performanceEntries) {
            if (entry.name && entry.name.includes('.m3u8')) {
              return { success: true, m3u8Url: entry.name, method: 'performance_api' };
            }
          }
          
          return { 
            success: false, 
            error: `No M3U8 source found. Checked ${performanceEntries.length} network requests, ${videoElements.length} video elements, JWPlayer: ${typeof (window as any).jwplayer !== 'undefined'}` 
          };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, url);
      
      if (!playerData.success) {
        this.logger.warn(`🎯 Player extraction failed: ${playerData.error}, trying direct fetch...`);
        
        // Fallback to direct fetch
        const response = await browserPage.evaluate(async (m3u8Url: string) => {
          try {
            const response = await fetch(m3u8Url, {
              method: 'GET',
              credentials: 'include',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache'
              }
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            return { success: true, content: text, status: response.status };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
          }
        }, url);
        
        if (!response.success) {
          this.logger.error(`❌ Browser M3U8 fetch also failed: ${response.error}`);
          return null;
        }
        
        this.logger.info(`✅ Browser M3U8 fetch successful: ${response.status} (${response.content.length} chars)`);
        return this.parseM3U8Content(response.content, url);
      }
      
      this.logger.info(`✅ Extracted M3U8 from player via ${playerData.method}: ${playerData.m3u8Url}`);
      
      // Now fetch the M3U8 content using the extracted URL
      const response = await browserPage.evaluate(async (m3u8Url: string) => {
        try {
          const response = await fetch(m3u8Url, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': '*/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const text = await response.text();
          return { success: true, content: text, status: response.status };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, playerData.m3u8Url);
      
      if (!response.success) {
        this.logger.error(`❌ Failed to fetch extracted M3U8: ${response.error}`);
        return null;
      }
      
      this.logger.info(`✅ Successfully fetched extracted M3U8: ${response.status} (${response.content.length} chars)`);
      return this.parseM3U8Content(response.content, playerData.m3u8Url);
      
    } catch (error) {
      this.logger.error(`Error in browser M3U8 extraction: ${error}`);
      return null;
    }
  }

  /**
   * Download segments using browser fetch (exactly like Python but through browser)
   */
  private async downloadSegmentsWithBrowser(playlist: Playlist, baseUrl: string, browserPage: any, sessionHeaders?: Record<string, string>): Promise<boolean> {
    if (!playlist.segments || playlist.segments.length === 0) {
      this.logger.error('No segments found in playlist');
      return false;
    }

    // Create temporary directory exactly like Python
    if (!this.tempDir) {
      this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm3u8_download_'));
    }
    
    // Initialize progress tracking for browser downloads
    this.totalSegments = playlist.segments.length;
    this.completedSegments = 0;
    this.downloadStartTime = Date.now();
    
    this.logger.info(`🌐 Starting browser download of ${this.totalSegments} segments...`);
    
    // Initialize progress bar for browser downloads too
    this.initializeProgressBar(this.totalSegments);
    
    let successCount = 0;
    const startTime = Date.now();

    // Download function for a single segment using browser with 10x retry
    const downloadSegmentWithBrowser = async (segment: Segment, index: number): Promise<boolean> => {
      const maxRetries = 10; // Increased to match curl retry count
      const segmentUrl = this.resolveUrl(segment.uri, baseUrl);
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Only log on first attempt to reduce verbosity
          if (attempt === 1) {
            this.logger.debug(`🌐 Browser downloading segment ${index + 1}/${this.totalSegments}: ${segment.uri}`);
          }
          
          // Use browser to download segment with session headers (has session context like Python)
          const segmentData = await browserPage.evaluate(async (params: { url: string; headers: Record<string, string> }) => {
            try {
              const response = await fetch(params.url, {
                method: 'GET',
                credentials: 'include', // Include cookies like Python session
                headers: params.headers
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const arrayBuffer = await response.arrayBuffer();
              return { success: true, data: Array.from(new Uint8Array(arrayBuffer)), size: arrayBuffer.byteLength };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
          }, {
            url: segmentUrl,
            headers: sessionHeaders || {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Cache-Control': 'max-age=0'
            }
          });
          
          if (segmentData.success) {
            // Save segment to file (exactly like Python)
            const segmentFile = path.join(this.tempDir!, `segment_${index.toString().padStart(5, '0')}.ts`);
            fs.writeFileSync(segmentFile, Buffer.from(segmentData.data));
            this.segmentFiles.push(segmentFile);
            successCount++;
            
            // Update progress atomically
            this.incrementProgress();
            return true; // Success, exit retry loop
          } else {
            this.logger.warn(`❌ Attempt ${attempt}/${maxRetries} failed for segment ${index + 1}/${this.totalSegments}: ${segmentData.error}`);
            
            // If we get NetworkError consistently, fail faster to trigger curl fallback
            if (segmentData.error.includes('NetworkError') && attempt >= 2) {
              this.logger.warn(`🚨 Consistent NetworkError detected - failing fast to trigger curl fallback`);
              break;
            }
            
            if (attempt < maxRetries) {
                          const delay = Math.min(attempt * 300, 3000); // Progressive delays: 300ms, 600ms, 900ms... max 3s
            this.logger.debug(`⏳ Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
          
        } catch (error) {
          this.logger.warn(`❌ Attempt ${attempt}/${maxRetries} error for segment ${index}: ${error}`);
          
          if (attempt < maxRetries) {
            const delay = Math.min(attempt * 300, 3000); // Progressive delays: 300ms, 600ms, 900ms... max 3s
            this.logger.debug(`⏳ Waiting ${delay}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      this.logger.error(`❌ Failed to download segment ${index + 1}/${this.totalSegments} after ${maxRetries} attempts`);
      return false;
    };

    // Use Promise.all with concurrency limit exactly like Python ThreadPoolExecutor
    const maxWorkers = 4; // Default concurrent downloads like Python
    const semaphore = Array(maxWorkers).fill(0);
    const downloadPromises = playlist.segments.map((segment, index) => {
      return new Promise<boolean>((resolve) => {
        const execute = async () => {
          const result = await downloadSegmentWithBrowser(segment, index);
          resolve(result);
        };
        
        // Wait for available worker slot
        const waitForSlot = () => {
          const availableIndex = semaphore.findIndex(slot => slot === 0);
          if (availableIndex !== -1) {
            semaphore[availableIndex] = 1;
            execute().finally(() => {
              semaphore[availableIndex] = 0;
            });
          } else {
            setTimeout(waitForSlot, 10);
          }
        };
        
        waitForSlot();
      });
    });
    
    // Wait for all downloads like Python
    await Promise.all(downloadPromises);

    // Stop progress bar and show summary
    this.stopProgressBar();
    
    const totalTime = (Date.now() - startTime) / 1000;
    const avgSpeed = totalTime > 0 ? (successCount / totalTime).toFixed(1) : 'N/A';
    
    this.logger.info(`Browser download completed: ${successCount}/${this.totalSegments} segments successful in ${totalTime.toFixed(1)}s (avg: ${avgSpeed} seg/s)`);

    if (successCount === 0) {
      this.logger.error('No segments were downloaded successfully via browser');
      return false;
    }

    // Accept partial success like Python (at least 80% of segments)
    const successRate = successCount / this.totalSegments;
    if (successRate < 0.8) {
      this.logger.warn(`Partial browser success: ${(successRate * 100).toFixed(1)}% - will try curl fallback`);
      return false; // Force fallback to curl method
    } else {
      this.logger.info(`Successfully downloaded ${successCount} segments via browser`);
      return true;
    }
  }


}