import { Page } from 'playwright';
import { Logger } from 'winston';
import { createLogger } from './Logger';
import { VideoCandidate } from '../types';

export class NetworkMonitor {
  private logger: Logger;
  private capturedHeaders: Record<string, string> = {};
  private videoCandidates: VideoCandidate[] = [];

  constructor() {
    this.logger = createLogger('NetworkMonitor');
  }

  setupComprehensiveMonitoring(page: Page): void {
    this.logger.info('Setting up comprehensive network monitoring...');

    // Track all requests and responses like a real browser
    page.on('request', (request) => {
      const url = request.url().toLowerCase();

      // Log important requests that indicate proper page loading
      if (this.isImportantRequest(url)) {
        this.logger.info(`BROWSER-LIKE REQUEST: ${request.method()} ${request.url()}`);

        // Store headers for video-related requests
        if (this.isVideoRelatedUrl(url)) {
          this.capturedHeaders = {
            'User-Agent': request.headers()['user-agent'] || '',
            'Referer': request.headers()['referer'] || '',
            'Origin': request.headers()['origin'] || 'https://jav.guru',
            'Cookie': request.headers()['cookie'] || '',
            'Accept': request.headers()['accept'] || '*/*',
            'Accept-Language': request.headers()['accept-language'] || 'en-US,en;q=0.9',
          };
        }
      }
    });

    page.on('response', (response) => {
      const url = response.url().toLowerCase();

      // Log successful responses for important resources
      if (response.status() === 200 && this.isImportantRequest(url)) {
        this.logger.info(`SUCCESSFUL RESPONSE: ${response.status()} ${response.url()}`);

        // Special handling for M3U8 responses
        if (url.includes('.m3u8')) {
          this.logger.info(`M3U8 RESPONSE DETECTED: ${response.url()}`);
          
          const candidate: VideoCandidate = {
            url: response.url(),
            headers: { ...this.capturedHeaders },
            timestamp: Date.now(),
            domain: this.extractDomain(response.url()),
            source: 'comprehensive_monitoring',
            status: response.status(),
          };

          // Avoid duplicates
          if (!this.videoCandidates.some(c => c.url === response.url())) {
            this.videoCandidates.push(candidate);
          }
        }
      }
    });

    this.logger.info('Comprehensive network monitoring setup complete');
  }

  private isImportantRequest(url: string): boolean {
    // Block ALL sacdnssedge domains completely
    if (url.includes('sacdnssedge') || url.includes('tscprts.com') || url.includes('mnaspm.com') || url.includes('tsyndicate.com')) {
      return false;
    }
    
    // Only log jwplayer and M3U8 from clean domains
    return url.includes('jwplayer') || url.includes('.m3u8');
  }

  private isVideoRelatedUrl(url: string): boolean {
    // Block ALL sacdnssedge domains completely
    if (url.includes('sacdnssedge') || url.includes('tscprts.com') || url.includes('mnaspm.com') || url.includes('tsyndicate.com')) {
      return false;
    }
    
    return url.includes('.m3u8');
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  getVideoCandidates(): VideoCandidate[] {
    return [...this.videoCandidates];
  }

  getCapturedHeaders(): Record<string, string> {
    return { ...this.capturedHeaders };
  }

  clearCandidates(): void {
    this.videoCandidates = [];
  }
}
