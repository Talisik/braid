import { Browser, BrowserContext, Page, firefox } from 'playwright';
import { BrowserConfig } from '../types/index.js';
import { NetworkMonitor } from '../monitors/NetworkMonitor.js';

export class FirefoxBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;
  private networkMonitor: NetworkMonitor;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: true,
      viewport: { width: 1280, height: 720 },
      ...config
    };
    this.networkMonitor = new NetworkMonitor();
  }

  /**
   * Launch Firefox browser with stealth mode
   */
  public async launch(): Promise<void> {
    console.log('Launching Firefox browser with stealth mode...');
    
    this.browser = await firefox.launch({
      headless: this.config.headless,
      firefoxUserPrefs: {
        // Disable automation indicators
        'dom.webdriver.enabled': false,
        'useAutomationExtension': false,
        'marionette.enabled': false,
        // Privacy and security settings
        'privacy.trackingprotection.enabled': false,
        'dom.webaudio.enabled': false,
        'media.navigator.enabled': false,
        'webgl.disabled': false,
        // Performance settings
        'browser.cache.disk.enable': false,
        'browser.cache.memory.enable': false,
        'network.http.use-cache': false
      },
      args: [
        '--no-remote',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-popup-blocking',
        '--disable-translate',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        '--disable-features=TranslateUI,BlinkGenPropertyTrees',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true
    });

    // Advanced stealth techniques
    await this.context.addInitScript(() => {
      // Completely remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
        configurable: true
      });

      // More realistic plugins array
      Object.defineProperty(navigator, 'plugins', {
        get: () => ({
          length: 5,
          0: { name: 'Chrome PDF Plugin' },
          1: { name: 'Chrome PDF Viewer' },
          2: { name: 'Native Client' },
          3: { name: 'WebKit built-in PDF' },
          4: { name: 'Widevine Content Decryption Module' }
        }),
      });

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Mock realistic hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8,
      });

      // Mock realistic device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // Override permissions with more realistic responses
      const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (parameters: any) => {
        const responses: Record<string, string> = {
          'notifications': 'granted',
          'geolocation': 'prompt',
          'camera': 'prompt',
          'microphone': 'prompt'
        };
        
        const state = responses[parameters.name] || 'prompt';
        return Promise.resolve({ 
          state,
          name: parameters.name,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true
        } as any);
      };

      // Add chrome object for compatibility
      if (!(window as any).chrome) {
        Object.defineProperty(window, 'chrome', {
          get: () => ({
            runtime: {
              onConnect: undefined,
              onMessage: undefined
            },
            loadTimes: () => ({
              commitLoadTime: Date.now() / 1000 - Math.random(),
              connectionInfo: 'h2',
              finishDocumentLoadTime: Date.now() / 1000 - Math.random(),
              finishLoadTime: Date.now() / 1000 - Math.random(),
              firstPaintAfterLoadTime: 0,
              firstPaintTime: Date.now() / 1000 - Math.random(),
              navigationType: 'Other',
              npnNegotiatedProtocol: 'h2',
              requestTime: Date.now() / 1000 - Math.random(),
              startLoadTime: Date.now() / 1000 - Math.random(),
              wasAlternateProtocolAvailable: false,
              wasFetchedViaSpdy: true,
              wasNpnNegotiated: true
            }),
            csi: () => ({})
          }),
        });
      }

      // Remove automation indicators
      const propsToDelete = [
        'webdriver',
        '__webdriver_script_fn',
        '__driver_evaluate',
        '__webdriver_evaluate',
        '__selenium_evaluate',
        '__fxdriver_evaluate',
        '__driver_unwrapped',
        '__webdriver_unwrapped',
        '__selenium_unwrapped',
        '__fxdriver_unwrapped',
        '_Selenium_IDE_Recorder',
        '_selenium',
        'calledSelenium',
        '$cdc_asdjflasutopfhvcZLmcfl_',
        '$chrome_asyncScriptInfo',
        '__$webdriverAsyncExecutor'
      ];

      propsToDelete.forEach(prop => {
        try {
          delete (window as any)[prop];
          delete (document as any)[prop];
        } catch (e) {
          // Ignore errors
        }
      });

      // Override toString methods
      try {
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
          if (parameter === 37445) {
            return 'Intel Inc.';
          }
          if (parameter === 37446) {
            return 'Intel(R) Iris(TM) Graphics 6100';
          }
          return originalGetParameter.call(this, parameter);
        };
      } catch (e) {
        // Ignore WebGL errors
      }

      // Mock realistic media devices
      Object.defineProperty(navigator, 'mediaDevices', {
        get: () => ({
          enumerateDevices: () => Promise.resolve([
            { deviceId: 'default', kind: 'audioinput', label: 'Default - Microphone', groupId: 'group1' },
            { deviceId: 'default', kind: 'audiooutput', label: 'Default - Speaker', groupId: 'group2' }
          ]),
          getUserMedia: () => Promise.reject(new Error('Permission denied'))
        }),
      });

      // Hide automation traces in Error stack traces
      try {
        const originalError = Error;
        const newError = function(...args: any[]) {
          const error = new originalError(...args);
          if (error.stack) {
            error.stack = error.stack.replace(/\s+at .*\/automation\/.*$/gm, '');
          }
          return error;
        } as any;
        Object.setPrototypeOf(newError, originalError);
        Object.defineProperty(newError, 'prototype', {
          value: originalError.prototype,
          writable: false
        });
        (window as any).Error = newError;
      } catch (e) {
        // Ignore errors
      }
    });

    this.page = await this.context.newPage();
    
    // Additional page-level stealth
    await this.page.addInitScript(() => {
      // Remove automation traces
      try {
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
        delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      } catch (e) {
        // Ignore errors
      }
    });

    console.log('Firefox browser launched successfully with stealth mode.');
  }

  /**
   * Navigate to a URL and start monitoring with stealth techniques
   */
  public async navigateAndMonitor(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    console.log(`Navigating to: ${url}`);
    
    // Start network monitoring before navigation
    await this.networkMonitor.startMonitoring(this.page);
    
    // Shorter delay to simulate human behavior
    await this.page.waitForTimeout(Math.random() * 1000 + 500); // Reduced from 2000+1000 to 1000+500
    
    // Navigate to the page with realistic options
    await this.page.goto(url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000  // Reduced from 45000 to 30000
    });

    // Shorter wait for additional resources
    await this.page.waitForTimeout(1000); // Reduced from 2000 to 1000
    
    // Try to wait for network to be idle with shorter timeout
    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 }); // Reduced from 10000 to 5000
    } catch (error) {
      console.log('Network idle timeout reached, continuing...');
    }

    console.log('Navigation completed and monitoring started.');
  }

  /**
   * Simulate human-like interactions to bypass detection
   */
  public async simulateHumanBehavior(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    // Random mouse movements
    await this.page.mouse.move(
      Math.random() * 800 + 100, 
      Math.random() * 600 + 100
    );
    
    // Random scroll
    await this.page.evaluate(() => {
      window.scrollTo(0, Math.random() * 500);
    });
    
    // Random wait
    await this.page.waitForTimeout(Math.random() * 3000 + 1000);
  }

  /**
   * Wait for a specific time while monitoring continues
   */
  public async waitAndMonitor(milliseconds: number): Promise<void> {
    console.log(`Monitoring for ${milliseconds}ms...`);
    await this.page?.waitForTimeout(milliseconds);
  }

  /**
   * Get the network monitor instance
   */
  public getNetworkMonitor(): NetworkMonitor {
    return this.networkMonitor;
  }

  /**
   * Get the current page instance
   */
  public getPage(): Page | null {
    return this.page;
  }

  /**
   * Execute JavaScript in the page context
   */
  public async evaluateScript<T>(script: string): Promise<T> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return await this.page.evaluate(script);
  }

  /**
   * Execute a function in the page context
   */
  public async evaluateFunction<T>(fn: () => T | Promise<T>): Promise<T> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return await this.page.evaluate(fn);
  }

  /**
   * Take a screenshot
   */
  public async screenshot(path?: string): Promise<Buffer> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    const screenshotOptions: any = { type: 'png' };
    if (path) {
      screenshotOptions.path = path;
    }
    
    return await this.page.screenshot(screenshotOptions);
  }

  /**
   * Click on an element
   */
  public async click(selector: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    await this.page.click(selector);
  }

  /**
   * Wait for an element to appear
   */
  public async waitForElement(selector: string, timeout: number = 10000): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    await this.page.waitForSelector(selector, { timeout });
  }

  /**
   * Get page title
   */
  public async getTitle(): Promise<string> {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    return await this.page.title();
  }

  /**
   * Get current URL
   */
  public getCurrentUrl(): string {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    
    return this.page.url();
  }

  /**
   * Stop network monitoring
   */
  public stopMonitoring(): void {
    if (this.page) {
      this.networkMonitor.stopMonitoring(this.page);
    }
  }

  /**
   * Close the browser
   */
  public async close(): Promise<void> {
    if (this.page) {
      this.stopMonitoring();
    }
    
    if (this.context) {
      await this.context.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    console.log('Firefox browser closed.');
  }

  /**
   * Get monitoring statistics
   */
  public getMonitoringStats() {
    return {
      ...this.networkMonitor.getStats(),
      currentUrl: this.getCurrentUrl(),
      isLaunched: this.browser !== null
    };
  }
}
