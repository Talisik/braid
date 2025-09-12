export interface StreamQuality {
  url: string;
  resolution: string;
  bandwidth: number;
  quality: number; // numeric quality like 1080, 720, etc.
}

export class M3U8Parser {
  
  /**
   * Parse master M3U8 playlist and extract quality streams
   */
  public async parseMasterM3U8(masterUrl: string): Promise<StreamQuality[]> {
    console.log('Parsing master M3U8 playlist...');
    
    try {
      const response = await fetch(masterUrl);
      const content = await response.text();
      
      console.log(`Master playlist content length: ${content.length} bytes`);
      
      return this.extractQualityStreams(content, masterUrl);
    } catch (error) {
      console.error('Failed to fetch master M3U8:', error);
      return [];
    }
  }

  /**
   * Extract quality streams from M3U8 content
   */
  public extractQualityStreams(content: string, baseUrl: string): StreamQuality[] {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const streams: StreamQuality[] = [];
    
    console.log(`Parsing M3U8 with ${lines.length} lines:`);
    lines.slice(0, 10).forEach((line, i) => console.log(`  ${i + 1}: ${line}`));
    if (lines.length > 10) console.log(`  ... and ${lines.length - 10} more lines`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for EXT-X-STREAM-INF lines
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        console.log(`Found EXT-X-STREAM-INF at line ${i + 1}: ${line}`);
        const nextLine = lines[i + 1];
        if (nextLine && !nextLine.startsWith('#')) {
          const streamInfo = this.parseStreamInfo(line);
          const streamUrl = this.resolveUrl(nextLine, baseUrl);
          
          if (streamInfo && streamUrl) {
            streams.push({
              url: streamUrl,
              resolution: streamInfo.resolution,
              bandwidth: streamInfo.bandwidth,
              quality: streamInfo.quality
            });
          }
        }
      }
    }
    
    // Sort by quality (highest first)
    streams.sort((a, b) => b.quality - a.quality);
    
    console.log(`Found ${streams.length} quality streams:`);
    streams.forEach((stream, i) => {
      console.log(`  ${i + 1}. ${stream.quality}p (${stream.bandwidth} bps) - ${stream.resolution}`);
    });
    
    return streams;
  }

  /**
   * Parse EXT-X-STREAM-INF line to extract stream information
   */
  private parseStreamInfo(line: string): { resolution: string; bandwidth: number; quality: number } | null {
    try {
      // Extract bandwidth
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
      
      // Extract resolution
      const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
      const resolution = resolutionMatch ? resolutionMatch[1] : '';
      
      // Extract quality from resolution
      let quality = 480; // default
      if (resolution) {
        const heightMatch = resolution.match(/\d+x(\d+)/);
        if (heightMatch) {
          quality = parseInt(heightMatch[1]);
        }
      }
      
      // If no resolution but high bandwidth, estimate quality
      if (!resolution && bandwidth > 0) {
        if (bandwidth > 5000000) quality = 1080;
        else if (bandwidth > 3000000) quality = 720;
        else if (bandwidth > 1500000) quality = 480;
        else quality = 360;
      }
      
      return {
        resolution: resolution || `${Math.round(quality * 16/9)}x${quality}`,
        bandwidth,
        quality
      };
    } catch (error) {
      console.error('Error parsing stream info:', error);
      return null;
    }
  }

  /**
   * Resolve relative URL against base URL
   */
  private resolveUrl(url: string, baseUrl: string): string {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }
      
      const base = new URL(baseUrl);
      if (url.startsWith('/')) {
        return `${base.protocol}//${base.host}${url}`;
      } else {
        const basePath = base.pathname.split('/').slice(0, -1).join('/');
        return `${base.protocol}//${base.host}${basePath}/${url}`;
      }
    } catch (error) {
      console.error('Error resolving URL:', error);
      return url;
    }
  }

  /**
   * Get the highest quality stream
   */
  public getBestQualityStream(streams: StreamQuality[]): StreamQuality | null {
    if (streams.length === 0) return null;
    
    // Already sorted by quality in extractQualityStreams
    const best = streams[0];
    console.log(`Selected best quality: ${best.quality}p (${best.bandwidth} bps)`);
    
    return best;
  }

  /**
   * Check if content is a master playlist or media playlist
   */
  public isMasterPlaylist(content: string): boolean {
    return content.includes('#EXT-X-STREAM-INF');
  }

  /**
   * Parse media playlist to get segment URLs
   */
  public extractSegmentUrls(content: string, baseUrl: string): string[] {
    // Check if content is actually HTML (Cloudflare block page)
    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
      console.error('ERROR: M3U8 content is HTML (likely Cloudflare block page)');
      console.log('Content preview:', content.substring(0, 200));
      return [];
    }
    
    // Check if content is a valid M3U8
    if (!content.includes('#EXTM3U') && !content.includes('#EXT-X-')) {
      console.error('ERROR: Content does not appear to be a valid M3U8 playlist');
      console.log('Content preview:', content.substring(0, 200));
      return [];
    }
    
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const segments: string[] = [];
    
    console.log('Valid M3U8 content detected, extracting segments...');
    for (const line of lines) {
      // Skip comment lines and empty lines
      if (!line.startsWith('#') && line.length > 0) {
        segments.push(this.resolveUrl(line, baseUrl));
      }
    }
    
    console.log(`Found ${segments.length} segments in media playlist`);
    return segments;
  }
}
