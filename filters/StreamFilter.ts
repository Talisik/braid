import { NetworkRequest, VideoStream } from '../types/index.js';

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
    'adsafeprotected.com',
    'amazon-adsystem.com',
    'facebook.com',
    'connect.facebook.net',
    'twitter.com',
    'analytics.twitter.com'
  ]);

  private lowQualityIndicators = [
    'preview',
    'thumb',
    'thumbnail',
    'low',
    '240p',
    '360p',
    'mobile'
  ];

  private highQualityIndicators = [
    '720p',
    '1080p',
    '4k',
    'hd',
    'high',
    'master',
    'main'
  ];

  /**
   * Filter out advertisement and tracking requests
   */
  public filterOutAds(requests: NetworkRequest[]): NetworkRequest[] {
    return requests.filter(request => {
      try {
        const url = new URL(request.url);
        return !this.adDomains.has(url.hostname);
      } catch (error) {
        return true; // Keep if URL parsing fails
      }
    });
  }

  /**
   * Get video stream requests
   */
  public getVideoStreams(requests: NetworkRequest[]): NetworkRequest[] {
    const videoPatterns = [
      /\.m3u8(\?|$)/i,
      /\.mpd(\?|$)/i,
      /\.mp4(\?|$)/i,
      /\.webm(\?|$)/i,
      /\.ts(\?|$)/i,
      /hls/i,
      /dash/i,
      /video/i,
      /stream/i,
      /manifest/i
    ];

    return requests.filter(request => 
      videoPatterns.some(pattern => pattern.test(request.url))
    );
  }

  /**
   * Filter and analyze video streams with quality detection
   */
  public filterVideoStreams(requests: NetworkRequest[]): VideoStream[] {
    console.log(`Analyzing ${requests.length} network requests for video streams...`);
    
    // First filter out ads
    const cleanRequests = this.filterOutAds(requests);
    console.log(`After ad filtering: ${cleanRequests.length} requests`);
    
    // Get video streams
    const videoStreams = this.getVideoStreams(cleanRequests);
    console.log(`Found ${videoStreams.length} potential video streams`);

    // Convert to VideoStream objects with quality analysis
    const streams: VideoStream[] = videoStreams.map(request => {
      const quality = this.extractQuality(request.url);
      const isMainVideo = this.isMainVideoStream(request.url);
      const source = this.extractSource(request.url);

      return {
        url: request.url,
        quality,
        isMainVideo,
        source
      };
    });

    // Sort by quality (highest first) and main video preference
    return streams.sort((a, b) => {
      // Prioritize main video streams
      if (a.isMainVideo && !b.isMainVideo) return -1;
      if (!a.isMainVideo && b.isMainVideo) return 1;
      
      // Then sort by quality
      return b.quality - a.quality;
    });
  }

  /**
   * Get the best video stream from filtered results
   */
  public getBestVideoStream(requests: NetworkRequest[]): VideoStream | null {
    const streams = this.filterVideoStreams(requests);
    
    if (streams.length === 0) {
      return null;
    }

    // Return the first stream (highest quality main video)
    const bestStream = streams[0];
    console.log(`Best stream selected: ${bestStream.source} (${bestStream.quality}p) - ${bestStream.isMainVideo ? 'MAIN' : 'ALTERNATE'}`);
    
    return bestStream;
  }

  /**
   * Extract quality from URL
   */
  private extractQuality(url: string): number {
    const urlLower = url.toLowerCase();
    
    // Look for explicit quality indicators
    if (urlLower.includes('4k') || urlLower.includes('2160p')) return 2160;
    if (urlLower.includes('1080p') || urlLower.includes('fhd')) return 1080;
    if (urlLower.includes('720p') || urlLower.includes('hd')) return 720;
    if (urlLower.includes('480p')) return 480;
    if (urlLower.includes('360p')) return 360;
    if (urlLower.includes('240p')) return 240;
    
    // Look for resolution patterns in URL
    const resolutionMatch = url.match(/(\d{3,4})[px]/i);
    if (resolutionMatch) {
      return parseInt(resolutionMatch[1]);
    }
    
    // Look for bandwidth indicators (higher bandwidth = higher quality)
    const bandwidthMatch = url.match(/(\d+)k/i);
    if (bandwidthMatch) {
      const bandwidth = parseInt(bandwidthMatch[1]);
      if (bandwidth > 5000) return 1080;
      if (bandwidth > 3000) return 720;
      if (bandwidth > 1500) return 480;
      if (bandwidth > 800) return 360;
      return 240;
    }
    
    // Check for quality indicators in filename/path
    if (this.highQualityIndicators.some(indicator => urlLower.includes(indicator))) {
      return 720; // Default high quality
    }
    
    if (this.lowQualityIndicators.some(indicator => urlLower.includes(indicator))) {
      return 360; // Default low quality
    }
    
    // Default quality if no indicators found
    return 480;
  }

  /**
   * Determine if this is likely the main video stream
   */
  private isMainVideoStream(url: string): boolean {
    const urlLower = url.toLowerCase();
    
    // Main video indicators
    const mainIndicators = [
      'master.m3u8',
      'index.m3u8',
      'playlist.m3u8',
      'main',
      'primary',
      'video',
      'stream',
      'manifest'
    ];
    
    // Secondary/ad indicators
    const secondaryIndicators = [
      'ad',
      'ads',
      'commercial',
      'promo',
      'trailer',
      'preview',
      'thumb',
      'poster'
    ];
    
    // Check for main indicators
    const hasMainIndicator = mainIndicators.some(indicator => urlLower.includes(indicator));
    
    // Check for secondary indicators
    const hasSecondaryIndicator = secondaryIndicators.some(indicator => urlLower.includes(indicator));
    
    // Main video if has main indicators and no secondary indicators
    if (hasMainIndicator && !hasSecondaryIndicator) {
      return true;
    }
    
    // Check for M3U8 files (usually main streams)
    if (urlLower.includes('.m3u8') && !hasSecondaryIndicator) {
      return true;
    }
    
    // Check URL structure - main videos often have simpler paths
    const pathParts = new URL(url).pathname.split('/').filter(part => part.length > 0);
    if (pathParts.length <= 3 && urlLower.includes('video')) {
      return true;
    }
    
    return false;
  }

  /**
   * Extract source/provider from URL
   */
  private extractSource(url: string): string {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Remove common prefixes
      const cleanHostname = hostname.replace(/^(www\.|m\.|mobile\.)/, '');
      
      // Extract main domain name
      const parts = cleanHostname.split('.');
      if (parts.length >= 2) {
        return parts[parts.length - 2]; // Get domain name without TLD
      }
      
      return cleanHostname;
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get M3U8 playlist URLs specifically
   */
  public getM3U8Streams(requests: NetworkRequest[]): NetworkRequest[] {
    return requests.filter(request => 
      request.url.toLowerCase().includes('.m3u8')
    );
  }

  /**
   * Get MP4 direct video URLs
   */
  public getMP4Streams(requests: NetworkRequest[]): NetworkRequest[] {
    return requests.filter(request => 
      request.url.toLowerCase().includes('.mp4')
    );
  }

  /**
   * Get streaming manifest files (M3U8, MPD)
   */
  public getManifestStreams(requests: NetworkRequest[]): NetworkRequest[] {
    return requests.filter(request => {
      const url = request.url.toLowerCase();
      return url.includes('.m3u8') || url.includes('.mpd') || url.includes('manifest');
    });
  }

  /**
   * Analyze and categorize all video streams
   */
  public analyzeStreams(requests: NetworkRequest[]): {
    m3u8Streams: NetworkRequest[];
    mp4Streams: NetworkRequest[];
    manifestStreams: NetworkRequest[];
    totalVideoStreams: number;
    recommendedStream: VideoStream | null;
  } {
    const cleanRequests = this.filterOutAds(requests);
    
    return {
      m3u8Streams: this.getM3U8Streams(cleanRequests),
      mp4Streams: this.getMP4Streams(cleanRequests),
      manifestStreams: this.getManifestStreams(cleanRequests),
      totalVideoStreams: this.getVideoStreams(cleanRequests).length,
      recommendedStream: this.getBestVideoStream(requests)
    };
  }
}
