import { Page } from 'playwright';
import { NetworkRequest, NetworkResponse, NetworkMonitorConfig } from '../types/index.js';

export class NetworkMonitor {
  private requests: NetworkRequest[] = [];
  private responses: NetworkResponse[] = [];
  private config: NetworkMonitorConfig;

  constructor(config: NetworkMonitorConfig = {}) {
    this.config = {
      captureResponses: true,
      logRequests: false,
      ...config
    };
  }

  public async startMonitoring(page: Page): Promise<void> {
    console.log('Starting network monitoring...');

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

        // Try to get response size
        try {
          const body = await response.body();
          networkResponse.size = body.length;
        } catch (error) {
          // Some responses can't be read, that's okay
        }

        if (this.shouldCaptureRequest({ url: networkResponse.url } as NetworkRequest)) {
          this.responses.push(networkResponse);
          
          if (this.config.logRequests) {
            console.log(`[RESPONSE] ${networkResponse.status} ${networkResponse.url} (${networkResponse.size} bytes)`);
          }
        }
      });
    }
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
      /video/i
    ];

    return this.requests.filter(req => 
      videoPatterns.some(pattern => pattern.test(req.url))
    );
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
    uniqueDomains: number;
  } {
    const domains = new Set(this.requests.map(req => new URL(req.url).hostname));
    
    return {
      totalRequests: this.requests.length,
      totalResponses: this.responses.length,
      videoRequests: this.getVideoRequests().length,
      uniqueDomains: domains.size
    };
  }
}
