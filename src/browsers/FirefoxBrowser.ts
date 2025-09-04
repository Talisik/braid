import { firefox, Browser, BrowserContext, Page } from 'playwright';
import { BrowserConfig } from '../types';
import { Logger } from 'winston';
import { createLogger } from '../utils/Logger';

export class FirefoxBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private logger: Logger;

  constructor() {
    this.logger = createLogger('FirefoxBrowser');
  }

  async launch(config: BrowserConfig = {}): Promise<void> {
    try {
      this.browser = await firefox.launch({
        headless: config.headless ?? true,
        // Use minimal args - custom args were causing context closure issues
        args: [],
      });

      this.context = await this.browser.newContext({
        viewport: config.viewport ?? { width: 1920, height: 1080 },
        userAgent: config.userAgent ?? 
          'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
        ignoreHTTPSErrors: config.ignoreHTTPSErrors ?? true,
        javaScriptEnabled: config.javaScriptEnabled ?? true,
        // Firefox-specific settings
        permissions: [],
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      this.logger.info('Firefox browser launched with enhanced privacy settings');
    } catch (error) {
      this.logger.error('Failed to launch Firefox browser:', error);
      throw error;
    }
  }

  async getPage(url?: string): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() first.');
    }

    const page = await this.context.newPage();

    // Set up request/response logging
    page.on('request', (request) => this.logRequest(request));
    page.on('response', (response) => this.logResponse(response));

    if (url) {
      try {
        this.logger.info(`Navigating to: ${url}`);
        await page.goto(url, { 
          waitUntil: 'domcontentloaded', 
          timeout: 30000 
        });
        this.logger.info('Page loaded successfully');
        
        // Wait for dynamic content
        await page.waitForTimeout(3000);
      } catch (error) {
        this.logger.warn(`Page load timeout, but continuing anyway: ${error}`);
      }
    }

    return page;
  }

  private logRequest(request: any): void {
    const url = request.url();
    if (this.isVideoRelatedUrl(url)) {
      this.logger.info(`REQUEST: ${request.method()} ${url}`);
    }
  }

  private logResponse(response: any): void {
    const url = response.url();
    if (this.isVideoRelatedUrl(url)) {
      this.logger.info(`RESPONSE: ${response.status()} ${url}`);
    }
  }

  private isVideoRelatedUrl(url: string): boolean {
    // Block ALL sacdnssedge domains completely
    if (url.includes('sacdnssedge') || url.includes('tscprts.com') || url.includes('mnaspm.com') || url.includes('tsyndicate.com')) {
      return false;
    }
    
    return url.includes('.m3u8');
  }

  async close(): Promise<void> {
    try {
      if (this.browser) {
        await this.browser.close();
        this.logger.info('Firefox browser closed');
      }
    } catch (error) {
      this.logger.warn(`Error closing Firefox browser: ${error}`);
    }
  }
}
