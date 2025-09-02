import { Page, Frame } from 'playwright';
import { Logger } from 'winston';
import { createLogger } from './Logger';
import { RequestHandler } from '../handlers/RequestHandler';

export class IFrameMonitor {
  private logger: Logger;
  private monitoredFrames: Set<string> = new Set();

  constructor() {
    this.logger = createLogger('IFrameMonitor');
  }

  async setupMonitoring(page: Page, requestHandler: RequestHandler): Promise<void> {
    this.logger.info('Setting up iframe monitoring...');

    // Monitor existing frames
    await this.monitorExistingFrames(page, requestHandler);

    // Monitor new frames as they are created
    page.on('frameattached', async (frame) => {
      this.logger.info(`New iframe attached: ${frame.url()}`);
      await this.monitorFrame(frame, requestHandler);
    });

    // Monitor frame navigation
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) {
        this.logger.info(`Iframe navigated: ${frame.url()}`);
        await this.monitorFrame(frame, requestHandler);
      }
    });

    this.logger.info('Iframe monitoring setup complete');
  }

  private async monitorExistingFrames(page: Page, requestHandler: RequestHandler): Promise<void> {
    const frames = page.frames();
    
    for (const frame of frames) {
      if (frame !== page.mainFrame()) {
        await this.monitorFrame(frame, requestHandler);
      }
    }
  }

  private async monitorFrame(frame: Frame, requestHandler: RequestHandler): Promise<void> {
    const frameUrl = frame.url();
    
    if (!frameUrl || this.monitoredFrames.has(frameUrl)) {
      return;
    }

    this.monitoredFrames.add(frameUrl);

    if (this.isVideoRelatedFrame(frameUrl)) {
      this.logger.info(`Monitoring video iframe: ${frameUrl}`);
      
      // Note: Frame doesn't have 'on' method in Playwright
      // Request/response monitoring is handled at the page level
      // This is just for content analysis
      
      // Analyze the frame content
      await this.analyzeFrameContent(frame);
    }
  }

  private isVideoRelatedFrame(url: string): boolean {
    const videoIndicators = [
      'embed',
      'player',
      '/e/',
      '/t/',
      '/v/',
      'javplaya.com',
      'streamhihi.com',
      'maxstream.org',
      'emturbovid.com',
      'streamtape.com',
      'vidhide.com',
      'turbovidhls.com',
      'turboviplay.com',
    ];

    const urlLower = url.toLowerCase();
    return videoIndicators.some(indicator => urlLower.includes(indicator));
  }

  private async analyzeFrameContent(frame: Frame): Promise<void> {
    try {
      this.logger.info(`Analyzing iframe content: ${frame.url()}`);

      // Wait for frame to load
      await frame.waitForLoadState('domcontentloaded', { timeout: 5000 });

      // Look for video elements
      const videoElements = await frame.evaluate(() => {
        const videos: any[] = [];
        
        // Check video tags
        document.querySelectorAll('video').forEach(video => {
          if (video.src && video.src.length > 0 && !video.src.startsWith('blob:')) {
            videos.push({
              type: 'video_src',
              url: video.src,
              element: 'video'
            });
          }
          if (video.currentSrc && video.currentSrc.length > 0 && !video.currentSrc.startsWith('blob:')) {
            videos.push({
              type: 'video_currentSrc',
              url: video.currentSrc,
              element: 'video'
            });
          }
        });

        // Check for JWPlayer
        if (typeof (window as any).jwplayer !== 'undefined') {
          try {
            const instances = (window as any).jwplayer().getContainer();
            if (instances) {
              const playlist = (window as any).jwplayer().getPlaylist();
              if (playlist && playlist.length > 0) {
                playlist.forEach((item: any) => {
                  if (item.file) {
                    videos.push({
                      type: 'jwplayer_file',
                      url: item.file,
                      element: 'jwplayer'
                    });
                  }
                  if (item.sources) {
                    item.sources.forEach((source: any) => {
                      if (source.file) {
                        videos.push({
                          type: 'jwplayer_source',
                          url: source.file,
                          element: 'jwplayer'
                        });
                      }
                    });
                  }
                });
              }
            }
          } catch (e) {
            console.log('JWPlayer check failed:', e);
          }
        }

        // Check source elements
        document.querySelectorAll('source').forEach(source => {
          if (source.src && source.src.length > 0) {
            videos.push({
              type: 'source_src',
              url: source.src,
              element: 'source'
            });
          }
        });

        return videos;
      });

      if (videoElements.length > 0) {
        this.logger.info(`Found ${videoElements.length} video elements in iframe`);
        
        for (const element of videoElements) {
          this.logger.info(`${element.type} (${element.element}): ${element.url}`);
        }
      }

    } catch (error) {
      this.logger.debug(`Error analyzing iframe content: ${error}`);
    }
  }

  async waitForIframeContentLoad(page: Page): Promise<void> {
    this.logger.info('Waiting for iframe content to fully load...');

    const frames = page.frames();
    
    for (const frame of frames) {
      if (frame !== page.mainFrame() && frame.url()) {
        try {
          // Wait for iframe to be ready
          await frame.waitForLoadState('domcontentloaded', { timeout: 5000 });

          // Check if iframe has video player elements
          const hasVideoElements = await frame.evaluate(() => {
            const videoElements = document.querySelectorAll('video, .jwplayer, [id*="player"], [class*="player"]');
            return videoElements.length > 0;
          });

          if (hasVideoElements) {
            this.logger.info(`Video player elements found in iframe: ${frame.url()}`);
            // Wait additional time for video player initialization
            await page.waitForTimeout(3000);
          }

        } catch (error) {
          this.logger.debug(`Could not check iframe content: ${error}`);
        }
      }
    }
  }

  getMonitoredFrames(): string[] {
    return Array.from(this.monitoredFrames);
  }

  clearMonitoredFrames(): void {
    this.monitoredFrames.clear();
  }
}
