import { NetworkRequest } from '../types/index.js';

export interface VideoStream {
  url: string;
  quality: number;
  isMainVideo: boolean;
  source: string;
}

export class StreamFilter {
  private adDomains = new Set([
    'googlesyndication.com',
    'googletagservices.com',
    'doubleclick.net',
    'googleadservices.com',
    'google-analytics.com',
    'googletagmanager.com',
    'ads.yahoo.com',
    'advertising.com',
    'adsystem.com',
    'adscdn.com',
    'adnxs.com',
    'amazon-adsystem.com',
    'jwpltx.com', // JWPlayer analytics
    'jwplayer.com',
    'ping.gif' // Analytics pixels
  ]);

  private adPatterns = [
    /\/ads?\//i,
    /\/ad\//i,
    /\/advertising\//i,
    /\/analytics\//i,
    /\/tracking\//i,
    /\/ping\.gif/i,
    /\/beacon/i,
    /\/telemetry/i,
    /\/metrics/i,
    /\/stats/i,
    /preroll/i,
    /midroll/i,
    /postroll/i
  ];

  /**
   * Filter M3U8 requests to find main video streams
   */
  public filterVideoStreams(requests: NetworkRequest[]): VideoStream[] {
    const m3u8Requests = requests.filter(req => 
      req.url.includes('.m3u8') && !this.isAdRelated(req.url)
    );

    const videoStreams: VideoStream[] = [];

    for (const request of m3u8Requests) {
      const stream = this.analyzeM3U8Stream(request);
      if (stream) {
        videoStreams.push(stream);
      }
    }

    // Sort by quality and main video preference
    return videoStreams.sort((a, b) => {
      if (a.isMainVideo !== b.isMainVideo) {
        return a.isMainVideo ? -1 : 1;
      }
      return b.quality - a.quality;
    });
  }

  /**
   * Get the best main video stream
   */
  public getBestVideoStream(requests: NetworkRequest[]): VideoStream | null {
    const streams = this.filterVideoStreams(requests);
    return streams.find(s => s.isMainVideo) || streams[0] || null;
  }

  /**
   * Check if URL is ad-related
   */
  private isAdRelated(url: string): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check domain
      if (this.adDomains.has(urlObj.hostname)) {
        return true;
      }

      // Check patterns
      if (this.adPatterns.some(pattern => pattern.test(url))) {
        return true;
      }

      // Check for analytics/tracking parameters
      const params = urlObj.searchParams;
      const trackingParams = ['utm_', 'gclid', 'fbclid', 'tracking', 'analytics', 'ad_', 'ads_'];
      if (trackingParams.some(param => 
        Array.from(params.keys()).some(key => key.includes(param))
      )) {
        return true;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze M3U8 stream to determine quality and type
   */
  private analyzeM3U8Stream(request: NetworkRequest): VideoStream | null {
    const url = request.url;
    
    // Determine if this is a main video stream
    const isMainVideo = this.isMainVideoStream(url);
    
    // Extract quality information
    const quality = this.extractQuality(url);
    
    // Extract source information
    const source = this.extractSource(url);

    return {
      url,
      quality,
      isMainVideo,
      source
    };
  }

  /**
   * Determine if this is a main video stream (not ad/preview)
   */
  private isMainVideoStream(url: string): boolean {
    // Main video streams typically have these characteristics
    const mainVideoIndicators = [
      /master\.m3u8/i,
      /index.*\.m3u8/i,
      /playlist\.m3u8/i,
      /stream.*\.m3u8/i,
      /video.*\.m3u8/i
    ];

    // Ad/preview indicators
    const adIndicators = [
      /preroll/i,
      /ad[_-]?break/i,
      /preview/i,
      /trailer/i,
      /promo/i,
      /commercial/i
    ];

    // Check for main video indicators
    const hasMainIndicator = mainVideoIndicators.some(pattern => pattern.test(url));
    
    // Check for ad indicators
    const hasAdIndicator = adIndicators.some(pattern => pattern.test(url));
    
    // If it has main indicators and no ad indicators, likely main video
    if (hasMainIndicator && !hasAdIndicator) {
      return true;
    }

    // Check URL structure - main videos often have longer, more complex URLs
    try {
      const urlObj = new URL(url);
      const pathSegments = urlObj.pathname.split('/').filter(s => s.length > 0);
      
      // Main video URLs often have more path segments and longer hashes
      if (pathSegments.length >= 3) {
        const hasLongHash = pathSegments.some(segment => segment.length > 20);
        if (hasLongHash) {
          return true;
        }
      }
    } catch (error) {
      // Ignore URL parsing errors
    }

    return false;
  }

  /**
   * Extract quality information from URL
   */
  private extractQuality(url: string): number {
    // Look for quality indicators in URL
    const qualityPatterns = [
      /(\d{3,4})p/i,      // 720p, 1080p, etc.
      /(\d{3,4})x(\d{3,4})/i, // 1280x720, etc.
      /quality[=_](\d+)/i,     // quality=720
      /res[=_](\d+)/i,         // res=1080
    ];

    for (const pattern of qualityPatterns) {
      const match = url.match(pattern);
      if (match) {
        const quality = parseInt(match[1]);
        if (quality >= 240 && quality <= 4320) { // Valid video resolutions
          return quality;
        }
      }
    }

    // Default quality based on URL characteristics
    if (url.includes('hd') || url.includes('high')) return 1080;
    if (url.includes('sd') || url.includes('low')) return 480;
    
    return 720; // Default assumption
  }

  /**
   * Extract source information from URL
   */
  private extractSource(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Extract meaningful source name
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        return parts[parts.length - 2]; // e.g., "stormshade84" from "stormshade84.live"
      }
      
      return hostname;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Log filtered results for debugging
   */
  public logFilterResults(requests: NetworkRequest[]): void {
    const allM3U8 = requests.filter(req => req.url.includes('.m3u8'));
    const filtered = this.filterVideoStreams(requests);
    const best = this.getBestVideoStream(requests);

    console.log(`\n=== Stream Filter Results ===`);
    console.log(`Total M3U8 requests: ${allM3U8.length}`);
    console.log(`Filtered video streams: ${filtered.length}`);
    console.log(`Best stream: ${best ? best.source : 'none'}`);

    if (filtered.length > 0) {
      console.log(`\nVideo streams found:`);
      filtered.forEach((stream, i) => {
        console.log(`${i + 1}. ${stream.isMainVideo ? '[MAIN]' : '[OTHER]'} ${stream.quality}p - ${stream.source}`);
        console.log(`   ${stream.url.substring(0, 80)}...`);
      });
    }
  }
}
