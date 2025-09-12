import { Page } from 'playwright';
import { NetworkRequest, NetworkResponse, NetworkMonitorConfig } from '../types/index.js';

export class NetworkMonitor {
  private requests: NetworkRequest[] = [];
  private responses: NetworkResponse[] = [];
  private responseContent: Map<string, string> = new Map(); // Store response content
  private config: NetworkMonitorConfig;

  constructor(config: NetworkMonitorConfig = {}) {
    this.config = {
      captureResponses: true,
      logRequests: false,
      ...config
    };
  }

  public async startMonitoring(page: Page): Promise<void> {
    console.log('Starting enhanced network monitoring...');

    page.on('request', (request) => {
      const networkRequest: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now(),
        resourceType: request.resourceType()
      };

      // Apply URL filtering if configured
      if (this.shouldCaptureRequest(networkRequest)) {
        this.requests.push(networkRequest);
        
        if (this.config.logRequests) {
          console.log(`[REQUEST] ${networkRequest.method} ${networkRequest.url}`);
        }

        // Log video-related requests immediately
        if (this.isVideoRelated(networkRequest.url)) {
          console.log(`[VIDEO REQUEST] ${networkRequest.url}`);
        }
      }
    });

    // Monitor responses if enabled
    if (this.config.captureResponses) {
      page.on('response', async (response) => {
        const networkResponse: NetworkResponse = {
          url: response.url(),
          status: response.status(),
          headers: response.headers(),
          timestamp: Date.now(),
          size: 0 // Will be updated if we can get the body
        };

        // Try to get response size and capture M3U8 content
        try {
          const body = await response.body();
          networkResponse.size = body.length;
          
          // Capture M3U8 content for later use
          if (response.url().includes('.m3u8') && response.status() === 200) {
            const content = body.toString('utf8');
            this.responseContent.set(response.url(), content);
            console.log(`[M3U8 CAPTURED] ${response.url()} (${content.length} chars)`);
          }
        } catch (error) {
          // Some responses can't be read, that's okay
        }

        if (this.shouldCaptureRequest({ url: networkResponse.url } as NetworkRequest)) {
          this.responses.push(networkResponse);
          
          if (this.config.logRequests) {
            console.log(`[RESPONSE] ${networkResponse.status} ${networkResponse.url} (${networkResponse.size} bytes)`);
          }

          // Log video-related responses immediately
          if (this.isVideoRelated(networkResponse.url)) {
            console.log(`[VIDEO RESPONSE] ${networkResponse.status} ${networkResponse.url} (${networkResponse.size} bytes)`);
          }
        }
      });
    }
  }

  /**
   * Check if URL is video-related
   */
  private isVideoRelated(url: string): boolean {
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

    return videoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Stop monitoring (cleanup listeners)
   */
  public stopMonitoring(page: Page): void {
    page.removeAllListeners('request');
    page.removeAllListeners('response');
    console.log('Network monitoring stopped.');
  }

  /**
   * Get all captured requests
   */
  public getRequests(): NetworkRequest[] {
    return [...this.requests];
  }

  /**
   * Get all captured responses
   */
  public getResponses(): NetworkResponse[] {
    return [...this.responses];
  }

  /**
   * Get captured M3U8 content by URL
   */
  public getM3U8Content(url: string): string | null {
    return this.responseContent.get(url) || null;
  }

  /**
   * Get all captured M3U8 URLs and their content
   */
  public getAllM3U8Content(): Map<string, string> {
    return new Map(this.responseContent);
  }

  /**
   * Get requests filtered by URL pattern
   */
  public getRequestsByPattern(pattern: string | RegExp): NetworkRequest[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return this.requests.filter(req => regex.test(req.url));
  }

  /**
   * Get video-related requests (common video file extensions and streaming protocols)
   */
  public getVideoRequests(): NetworkRequest[] {
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

    return this.requests.filter(req => 
      videoPatterns.some(pattern => pattern.test(req.url))
    );
  }

  /**
   * Get recent video requests (within last N seconds)
   */
  public getRecentVideoRequests(seconds: number = 30): NetworkRequest[] {
    const cutoffTime = Date.now() - (seconds * 1000);
    return this.getVideoRequests().filter(req => req.timestamp >= cutoffTime);
  }

  /**
   * Clear all captured data
   */
  public clear(): void {
    this.requests = [];
    this.responses = [];
  }

  /**
   * Check if request should be captured based on configuration
   */
  private shouldCaptureRequest(request: NetworkRequest): boolean {
    if (!this.config.filterUrls || this.config.filterUrls.length === 0) {
      return true;
    }

    return this.config.filterUrls.some(filter => 
      request.url.includes(filter)
    );
  }

  /**
   * Get summary statistics
   */
  public getStats(): {
    totalRequests: number;
    totalResponses: number;
    videoRequests: number;
    recentVideoRequests: number;
    uniqueDomains: number;
  } {
    const domains = new Set(this.requests.map(req => new URL(req.url).hostname));
    
    return {
      totalRequests: this.requests.length,
      totalResponses: this.responses.length,
      videoRequests: this.getVideoRequests().length,
      recentVideoRequests: this.getRecentVideoRequests().length,
      uniqueDomains: domains.size
    };
  }
}
