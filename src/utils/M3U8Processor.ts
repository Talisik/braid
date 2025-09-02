import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { Logger } from 'winston';
import { createLogger } from './Logger';
import { M3U8ProcessorConfig } from '../types';


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

export class M3U8Processor {
  private logger: Logger;
  private session: AxiosInstance;
  private tempDir: string | null = null;
  private segmentFiles: string[] = [];
  private config: M3U8ProcessorConfig;

  constructor(config: M3U8ProcessorConfig = {}) {
    this.logger = createLogger('M3U8Processor');
    this.config = {
      outputDir: config.outputDir || 'downloads',
      maxWorkers: config.maxWorkers || 4,
      timeout: config.timeout || 30000, // Python default timeout
      retries: config.retries || 3,
      ffmpegPath: config.ffmpegPath || 'ffmpeg',
      segmentTimeout: config.segmentTimeout || 30000,
    };

    // Create axios session exactly like Python requests.Session() with EXACT same headers
    this.session = axios.create({
      timeout: 60000, // Increase timeout to 60 seconds (streaming servers can be slow)
      maxRedirects: 10,
      validateStatus: (status) => status < 500,
      // Configure for better network compatibility
      httpAgent: new (require('http').Agent)({
        keepAlive: true,
        timeout: 60000,
        keepAliveMsecs: 1000,
        maxSockets: 256,
        maxFreeSockets: 256
      }),
      httpsAgent: new (require('https').Agent)({
        keepAlive: true,
        timeout: 60000,
        keepAliveMsecs: 1000,
        maxSockets: 256,
        maxFreeSockets: 256,
        rejectUnauthorized: false // Allow self-signed certificates (like streaming servers)
      }),
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
  }



  /**
   * Configure session headers - EXACT equivalent of Python session.headers.update()
   */
  private configureSessionHeaders(headers: Record<string, string>, m3u8Url?: string): void {
    // Start with EXACT Python session headers (lines 26-38 in m3u8_downloader.py)
    this.session.defaults.headers.common = {
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
      this.session.defaults.headers.common['Referer'] = headers['Referer'];
    } else if (m3u8Url) {
      // If no referer provided, use the M3U8 domain as referer (common requirement)
      try {
        const url = new URL(m3u8Url);
        this.session.defaults.headers.common['Referer'] = `${url.protocol}//${url.host}/`;
      } catch (e) {
        // Ignore URL parsing errors
      }
    }
    
    if (headers['Origin']) {
      this.session.defaults.headers.common['Origin'] = headers['Origin'];
    } else if (m3u8Url) {
      // If no origin provided, use the M3U8 domain as origin (common requirement)
      try {
        const url = new URL(m3u8Url);
        this.session.defaults.headers.common['Origin'] = `${url.protocol}//${url.host}`;
      } catch (e) {
        // Ignore URL parsing errors
      }
    }
    
    // Add any other captured headers that might be important
    for (const [key, value] of Object.entries(headers)) {
      if (value && !['Referer', 'Origin'].includes(key)) {
        // Only add non-conflicting headers
        if (!['User-Agent', 'Accept', 'Accept-Language', 'Accept-Encoding', 'DNT', 'Connection', 'Upgrade-Insecure-Requests', 'Sec-Fetch-Dest', 'Sec-Fetch-Mode', 'Sec-Fetch-Site', 'Sec-Fetch-User', 'Cache-Control'].includes(key)) {
          this.session.defaults.headers.common[key] = value;
        }
      }
    }
  }

  /**
   * Parse M3U8 playlist - Using browser context for session-dependent servers
   */
  private async parsePlaylist(m3u8Url: string, browserPage?: any): Promise<Playlist | null> {
    try {
      this.logger.info(`Fetching M3U8 playlist from: ${m3u8Url}`);
      
      let playlistContent: string = '';
      
      // If we have browser page context, use it (like the successful browser requests in logs)
      if (browserPage) {
        this.logger.info('🌐 Using browser context for M3U8 fetch (session-aware)');
        this.logger.info(`🔗 Fetching: ${m3u8Url}`);
        
        const response = await browserPage.evaluate(async (url: string) => {
          try {
            console.log(`Browser: Fetching ${url}`);
            const response = await fetch(url, {
              method: 'GET',
              credentials: 'include',
              headers: {
                // Use EXACT same headers as Python script for consistency
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
            
            console.log(`Browser: Response status ${response.status}`);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            console.log(`Browser: Received ${text.length} characters`);
            return { success: true, content: text, status: response.status };
          } catch (error) {
            console.error(`Browser: Fetch failed:`, error);
            return { success: false, error: error instanceof Error ? error.message : String(error) };
          }
        }, m3u8Url);
        
        if (!response.success) {
          this.logger.error(`❌ Browser fetch failed: ${response.error}`);
          this.logger.info('🔄 Falling back to direct HTTP request...');
        } else {
          this.logger.info(`✅ Browser fetch successful: ${response.status} (${response.content.length} chars)`);
          playlistContent = response.content;
        }
      }
      
      // If browser context failed or not available, try direct HTTP request
      if (!playlistContent) {
        this.logger.info('📡 Using direct HTTP request (Python-style)');
        try {
          // Add more debugging info
          this.logger.info(`🔗 Requesting: ${m3u8Url}`);
          this.logger.info(`📋 Headers: ${JSON.stringify(this.session.defaults.headers.common, null, 2)}`);
          
          // Add retry logic for better reliability
          let response;
          let lastError;
          
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              this.logger.info(`📡 Attempt ${attempt}/3: Requesting M3U8 playlist`);
              
              response = await this.session.get(m3u8Url, {
                timeout: 60000, // 60 second timeout
                maxRedirects: 10, // Allow redirects like Python
                validateStatus: (status) => status < 500,
                // Add additional options for better compatibility
                withCredentials: false, // Don't send cookies for cross-origin
                responseType: 'text'
              });
              
              break; // Success, exit retry loop
              
            } catch (error) {
              lastError = error;
              this.logger.warn(`📡 Attempt ${attempt}/3 failed: ${error}`);
              
              if (attempt < 3) {
                const delay = attempt * 2000; // 2s, 4s delays
                this.logger.info(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
            }
          }
          
          if (!response) {
            throw lastError || new Error('All retry attempts failed');
          }
          
          this.logger.info(`📡 Response status: ${response.status}`);
          this.logger.info(`📡 Response headers: ${JSON.stringify(response.headers, null, 2)}`);
          
          if (response.status !== 200) {
            if (response.status === 403) {
              this.logger.error('Access forbidden (403). The server may be blocking requests.');
              this.logger.warn('This might be due to missing Referer or Origin headers');
            } else if (response.status === 404) {
              this.logger.error('Playlist not found (404). Check if the URL is correct.');
            } else if (response.status >= 300 && response.status < 400) {
              this.logger.warn(`Redirect ${response.status}: ${response.headers.location}`);
            } else {
              this.logger.error(`HTTP Error ${response.status}: ${response.statusText}`);
            }
            return null;
          }
          
          playlistContent = response.data;
          this.logger.info(`✅ Direct HTTP successful: ${response.status} (${playlistContent.length} chars)`);
          
          // Log first few lines of playlist for debugging
          const firstLines = playlistContent.split('\n').slice(0, 5).join('\n');
          this.logger.info(`📋 Playlist preview:\n${firstLines}`);
          
        } catch (directError) {
          this.logger.error(`❌ Direct HTTP failed: ${directError}`);
          if (axios.isAxiosError(directError)) {
            this.logger.error(`   Status: ${directError.response?.status}`);
            this.logger.error(`   Message: ${directError.message}`);
            this.logger.error(`   Code: ${directError.code}`);
          }
          return null;
        }
      }
      
      if (!playlistContent) {
        this.logger.error('Empty playlist content received');
        return null;
      }
      
      this.logger.info(`M3U8 content received: ${playlistContent.length} characters`);
      return this.parseM3U8Content(playlistContent, m3u8Url);
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          this.logger.error('Connection error. Check your internet connection and try again.');
        } else if (error.code === 'ETIMEDOUT') {
          this.logger.error('Request timeout. The server may be slow or unresponsive.');
        } else {
          this.logger.error(`Network error: ${error.message}`);
        }
      } else {
        this.logger.error(`Error parsing playlist: ${error}`);
      }
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
   * Download video segments - EXACT copy of Python _download_segments method
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
    this.logger.info(`Downloading ${playlist.segments.length} segments...`);
    
    let successCount = 0;
    const totalSegments = playlist.segments.length;
    
    // Download function for a single segment (like Python)
    const downloadSegment = async (segment: Segment, index: number): Promise<boolean> => {
      try {
        const segmentUrl = this.resolveUrl(segment.uri, baseUrl);
        const response = await this.session.get(segmentUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        
        const segmentFile = path.join(this.tempDir!, `segment_${index.toString().padStart(5, '0')}.ts`);
        fs.writeFileSync(segmentFile, response.data);
        
        this.segmentFiles.push(segmentFile);
        
        // Progress callback like Python tqdm
        if (progressCallback) {
          progressCallback(successCount + 1, totalSegments);
        }
        
        return true;
      } catch (error) {
        this.logger.warn(`Error downloading segment ${index}: ${error}`);
        return false;
      }
    };
    
    // Use Promise.all with concurrency limit exactly like Python ThreadPoolExecutor
    const semaphore = Array(maxWorkers).fill(0);
    const downloadPromises = playlist.segments.map((segment, index) => {
      return new Promise<boolean>((resolve) => {
        const execute = async () => {
          const result = await downloadSegment(segment, index);
          if (result) successCount++;
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
    
    if (successCount !== totalSegments) {
      this.logger.error(`Failed to download ${totalSegments - successCount} segments`);
      return false;
    }
    
    this.logger.info(`Successfully downloaded all ${successCount} segments`);
    return true;
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
      
      // Configure session with headers (including M3U8 URL for Referer/Origin) - exactly like Python
      this.configureSessionHeaders(headers, m3u8Url);
      
      // Step 1: Parse M3U8 playlist - try browser first if available, then direct HTTP
      this.logger.info(`🔗 Fetching M3U8 playlist from: ${m3u8Url}`);
      let playlist = null;
      
      if (browserPage) {
        // Try browser approach first (works better with CDN restrictions)
        playlist = await this.parsePlaylistWithBrowser(m3u8Url, browserPage);
        if (playlist) {
          this.logger.info('✅ Successfully parsed M3U8 playlist via browser');
        } else {
          this.logger.warn('🌐 Browser M3U8 fetch failed, trying direct HTTP...');
        }
      }
      
      if (!playlist) {
        // Fallback to direct HTTP (like Python)
        playlist = await this.parsePlaylist(m3u8Url);
        if (!playlist) {
          this.logger.error('❌ Failed to parse M3U8 playlist with both browser and direct HTTP');
          return false;
        } else {
          this.logger.info('✅ Successfully parsed M3U8 playlist via direct HTTP');
        }
      }
    
      // Step 2: Handle master playlist if needed
      let finalPlaylist = playlist;
      if (playlist.playlists && playlist.playlists.length > 0) {
        this.logger.info('🎯 This appears to be a master playlist with multiple qualities');
        const selectedUrl = this.selectBestQuality(playlist, m3u8Url);
        
        if (!selectedUrl) {
          return false;
        }
        
        this.logger.info(`🎯 Selected quality URL: ${selectedUrl}`);
        const selectedPlaylist = await this.parsePlaylist(selectedUrl);
        if (!selectedPlaylist) {
          return false;
        }
        finalPlaylist = selectedPlaylist;
      }
      
      // Step 3: Download segments - try browser first if available, then direct HTTP (like Python)
      let segmentSuccess = false;
      
      if (browserPage) {
        this.logger.info('🌐 Attempting segment download via browser (better for CDNs)...');
        segmentSuccess = await this.downloadSegmentsWithBrowser(finalPlaylist, m3u8Url, browserPage);
        if (segmentSuccess) {
          this.logger.info('✅ Successfully downloaded segments via browser');
        } else {
          this.logger.warn('🌐 Browser segment download failed, trying direct HTTP...');
        }
      }
      
      if (!segmentSuccess) {
        this.logger.info('📡 Attempting segment download via direct HTTP (like Python)...');
        segmentSuccess = await this.downloadSegments(finalPlaylist, m3u8Url, this.config.maxWorkers || 4);
        if (!segmentSuccess) {
          this.logger.error('❌ Failed to download segments with both browser and direct HTTP');
          return false;
        } else {
          this.logger.info('✅ Successfully downloaded segments via direct HTTP');
        }
      }
      
      // Step 4: Convert to MP4
      if (!await this.convertToMp4(fullPath)) {
        return false;
      }
      
      this.logger.info(`✅ Download completed successfully: ${fullPath}`);
      return true;

      
    } catch (error) {
      this.logger.error(`❌ M3U8 processing failed: ${error}`);
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
  private async processBrowserBased(playlist: Playlist, m3u8Url: string, browserPage: any, fullPath: string): Promise<boolean> {
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
      if (!await this.downloadSegmentsWithBrowser(finalPlaylist, m3u8Url, browserPage)) {
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
  private async downloadSegmentsWithBrowser(playlist: Playlist, baseUrl: string, browserPage: any): Promise<boolean> {
    if (!playlist.segments || playlist.segments.length === 0) {
      this.logger.error('No segments found in playlist');
      return false;
    }

    // Create temporary directory exactly like Python
    if (!this.tempDir) {
      this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm3u8_download_'));
    }
    this.logger.info(`🌐 Downloading ${playlist.segments.length} segments via browser (like Python)...`);

    let successCount = 0;
    const totalSegments = playlist.segments.length;

    // Download segments one by one (like Python) but using browser's network stack
    for (let i = 0; i < playlist.segments.length; i++) {
      const segment = playlist.segments[i];
      try {
        // Resolve segment URL (exactly like Python urljoin)
        const segmentUrl = this.resolveUrl(segment.uri, baseUrl);
        
        this.logger.info(`📥 Downloading segment ${i + 1}/${totalSegments}: ${segment.uri}`);
        
        // Use browser to download segment (has session context like Python)
        const segmentData = await browserPage.evaluate(async (url: string) => {
          try {
            const response = await fetch(url, {
              method: 'GET',
              credentials: 'include', // Include cookies like Python session
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
              }
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            return { success: true, data: Array.from(new Uint8Array(arrayBuffer)), size: arrayBuffer.byteLength };
          } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : String(error) };
          }
        }, segmentUrl);
        
        if (!segmentData.success) {
          this.logger.warn(`❌ Failed to download segment ${i}: ${segmentData.error}`);
          continue;
        }
        
        // Save segment to file (exactly like Python)
        const segmentFile = path.join(this.tempDir!, `segment_${i.toString().padStart(5, '0')}.ts`);
        fs.writeFileSync(segmentFile, Buffer.from(segmentData.data));
        this.segmentFiles.push(segmentFile);
        successCount++;
        
        this.logger.info(`✅ Downloaded segment ${i + 1}/${totalSegments} (${segmentData.size} bytes)`);
        
      } catch (error) {
        this.logger.warn(`Error downloading segment ${i}: ${error}`);
        continue;
      }
    }

    this.logger.info(`✅ Downloaded ${successCount}/${totalSegments} segments via browser`);

    if (successCount === 0) {
      this.logger.error('No segments were downloaded successfully');
      return false;
    }

    // Accept partial success like Python (at least 80% of segments)
    const successRate = successCount / totalSegments;
    if (successRate < 0.8) {
      this.logger.warn(`Partial success: ${(successRate * 100).toFixed(1)}% - continuing with conversion`);
    }

    return true;
  }


}