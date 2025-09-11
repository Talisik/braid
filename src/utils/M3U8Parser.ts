import { CurlDownloader } from './CurlDownloader.js';

export interface StreamQuality {
  url: string;
  resolution: string;
  bandwidth: number;
}

export class M3U8Parser {
  private downloader: CurlDownloader;

  constructor() {
    this.downloader = new CurlDownloader();
  }

  public async parseMasterM3U8(masterUrl: string): Promise<string> {
    console.log('Parsing master M3U8...');
    
    const content = await this.downloader.downloadAsString(masterUrl);
    const lines = content.split('\n');
    let bestQuality = 0;
    let bestUrl = '';
    const baseUrl = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        
        if (resolutionMatch && bandwidthMatch) {
          const width = parseInt(resolutionMatch[1]);
          const height = parseInt(resolutionMatch[2]);
          const quality = width * height;
          
          if (quality > bestQuality) {
            bestQuality = quality;
            const nextLine = lines[i + 1]?.trim();
            if (nextLine && !nextLine.startsWith('#')) {
              bestUrl = nextLine.startsWith('http') ? nextLine : baseUrl + nextLine;
            }
          }
        }
      }
    }

    if (!bestUrl) {
      // If no quality variants, use the master URL itself
      bestUrl = masterUrl;
    }

    return bestUrl;
  }

  /**
   * Parse segment M3U8 to get individual segment URLs
   */
  public async parseSegmentM3U8(segmentUrl: string): Promise<string[]> {
    console.log('Parsing segment M3U8...');
    
    const content = await this.downloader.downloadAsString(segmentUrl);
    const lines = content.split('\n');
    const segments: string[] = [];
    const baseUrl = segmentUrl.substring(0, segmentUrl.lastIndexOf('/') + 1);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const segmentUrl = trimmedLine.startsWith('http') ? trimmedLine : baseUrl + trimmedLine;
        segments.push(segmentUrl);
      }
    }

    return segments;
  }
}
