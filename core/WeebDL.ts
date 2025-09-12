import { FirefoxBrowser } from '../browsers/FirefoxBrowser.js';
import { M3U8Processor } from '../parsers/M3U8Processor.js';
import { StreamFilter } from '../filters/StreamFilter.js';
import { BrowserConfig } from '../types/index.js';

export class WeebDL {
  private browser: FirefoxBrowser;
  private m3u8Processor: M3U8Processor;
  private streamFilter: StreamFilter;

  constructor(config: BrowserConfig = {}) {
    this.browser = new FirefoxBrowser(config);
    this.m3u8Processor = new M3U8Processor();
    this.streamFilter = new StreamFilter();
  }

  /**
   * Download anime video from URL - monitors, finds M3U8, and downloads automatically
   */
  public async downloadAnime(url: string, outputFileName?: string, monitorDuration: number = 30000): Promise<string | null> {
    try {
      console.log(`=== WeebDL Anime Downloader ===`);
      console.log(`Target URL: ${url}`);
      console.log(`Monitor Duration: ${monitorDuration}ms\n`);

      // Launch browser and navigate
      await this.browser.launch();
      await this.browser.navigateAndMonitor(url);

      // Simulate human behavior briefly
      console.log('Simulating human behavior...');
      await this.browser.simulateHumanBehavior();

      // Monitor for video streams with shorter intervals
      console.log('Monitoring for video streams...');
      const startTime = Date.now();
      let bestStream = null;

      while (Date.now() - startTime < monitorDuration && !bestStream) {
        await this.browser.waitAndMonitor(2000); // Reduced from 5000ms to 2000ms
        
        const monitor = this.browser.getNetworkMonitor();
        const requests = monitor.getRequests();
        
        // Check for video streams
        bestStream = this.streamFilter.getBestVideoStream(requests);
        
        if (bestStream) {
          console.log(`Found main video stream: ${bestStream.source} (${bestStream.quality}p)`);
          break;
        }
      }

      // Close browser - we don't need it anymore
      console.log('Closing browser...');
      await this.browser.close();

      if (!bestStream) {
        console.log('No video streams found');
        return null;
      }

      // Generate output filename if not provided
      if (!outputFileName) {
        const urlParts = url.split('/');
        const pagePart = urlParts[urlParts.length - 1] || 'anime_video';
        outputFileName = `${pagePart.split('?')[0]}.mp4`;
      }

      // Process the M3U8 stream
      console.log(`\nStarting download: ${outputFileName}`);
      const outputPath = await this.m3u8Processor.processM3U8(bestStream.url, outputFileName);
      
      return outputPath;

    } catch (error) {
      console.error('Download failed:', error);
      return null;
    } finally {
      // Ensure browser is closed
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }


  /**
   * Get the browser instance for advanced usage
   */
  public getBrowser(): FirefoxBrowser {
    return this.browser;
  }

  /**
   * Get the M3U8 processor instance
   */
  public getM3U8Processor(): M3U8Processor {
    return this.m3u8Processor;
  }

  /**
   * Get the stream filter instance
   */
  public getStreamFilter(): StreamFilter {
    return this.streamFilter;
  }
}

// Export types and classes for external use
export { FirefoxBrowser } from '../browsers/FirefoxBrowser.js';
export { NetworkMonitor } from '../monitors/NetworkMonitor.js';
export { M3U8Processor } from '../parsers/M3U8Processor.js';
export { StreamFilter } from '../filters/StreamFilter.js';
export * from '../types/index.js';
