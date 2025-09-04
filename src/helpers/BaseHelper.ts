import { Logger } from 'winston';
import { createLogger } from '../utils/Logger';

export abstract class BaseHelper {
  protected logger: Logger;
  private statusCallback?: (status: string) => void;

  constructor(statusCallback?: (status: string) => void) {
    this.logger = createLogger(this.constructor.name);
    this.statusCallback = statusCallback;
  }

  protected updateStatus(status: string): void {
    this.logger.info(status);
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  }

  protected extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  protected extractOriginFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return 'https://jav.guru';
    }
  }

  protected isValidVideoUrl(url: string): boolean {
    if (!url || url.length < 10) {
      return false;
    }

    const urlLower = url.toLowerCase();

    // PRIORITY: Direct turbovidhls.com/t/ URLs are ALWAYS valid
    if (urlLower.includes('turbovidhls.com/t/')) {
      this.logger.info(`✅ PRIORITY DIRECT VIDEO URL DETECTED: ${url}`);
      return true;
    }

    // Check for video file extensions or streaming indicators
    const videoIndicators = [
      '.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.m4v',
      '.m3u8', 'stream', 'video', '/t/', '/v/', 'turbovidhls.com'
    ];

    // Must have at least one video indicator
    const hasIndicator = videoIndicators.some(indicator => urlLower.includes(indicator));
    if (!hasIndicator) {
      return false;
    }

    // Exclude obvious non-video URLs
    const exclusions = [
      'google', 'facebook', 'twitter', 'analytics', 'ads', 'popup',
      '.js', '.css', '.png', '.jpg', '.gif', 'fonts.', 'cdn-cgi'
    ];

    // Must not have exclusions
    const hasExclusion = exclusions.some(exclusion => urlLower.includes(exclusion));
    return !hasExclusion;
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected generateTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  protected sanitizeFilename(filename: string): string {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
  }
}
