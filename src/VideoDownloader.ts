import { Page } from 'playwright';
import { Logger } from 'winston';
import { createLogger } from './utils/Logger';
import { FirefoxBrowser } from './browsers/FirefoxBrowser';
import { BraveBrowser } from './browsers/BraveBrowser';
import { ChromiumBrowser } from './browsers/ChromiumBrowser';
import { RouteHandler } from './handlers/RouteHandler';
import { RequestHandler } from './handlers/RequestHandler';
import { StreamButtonHandler } from './handlers/StreamButtonHandler';
import { PopupHandler } from './handlers/PopupHandler';
import { PlayButtonHandler } from './handlers/PlayButtonHandler';
import { M3U8Processor } from './utils/M3U8Processor';
import { IFrameMonitor } from './utils/IFrameMonitor';
import { NetworkMonitor } from './utils/NetworkMonitor';
import { StreamHandler } from './utils/StreamHandler';
import { BrowserHelper } from './helpers/BrowserHelper';
import { PageHelper } from './helpers/PageHelper';
import { VideoDownloaderConfig, VideoCandidate, BrowserType } from './types';

export class VideoDownloader {
  private logger: Logger;
  private config: VideoDownloaderConfig;
  private browser: FirefoxBrowser | BraveBrowser | ChromiumBrowser | null = null;
  private page: Page | null = null;
  
  // Core components
  private routeHandler: RouteHandler;
  private requestHandler: RequestHandler;
  private streamButtonHandler: StreamButtonHandler;
  private popupHandler: PopupHandler;
  private playButtonHandler: PlayButtonHandler;
  private m3u8Processor: M3U8Processor;
  private iframeMonitor: IFrameMonitor;
  private networkMonitor: NetworkMonitor;
  private streamHandler: StreamHandler;
  
  // Helpers
  private browserHelper: BrowserHelper;
  private pageHelper: PageHelper;
  
  // State
  private videoCandidates: VideoCandidate[] = [];
  private allVideoRequests: string[] = [];
  private capturedHeaders: Record<string, string> = {};
  private directUrlFound: boolean = false;

  constructor(config: VideoDownloaderConfig) {
    this.config = config;
    this.logger = createLogger('VideoDownloader', config.loggerConfig);
    
    // Initialize components
    this.routeHandler = new RouteHandler();
    this.requestHandler = new RequestHandler();
    this.streamButtonHandler = new StreamButtonHandler();
    this.popupHandler = new PopupHandler();
    this.playButtonHandler = new PlayButtonHandler();
    this.m3u8Processor = new M3U8Processor(config.downloadConfig);
    this.iframeMonitor = new IFrameMonitor();
    this.networkMonitor = new NetworkMonitor();
    this.streamHandler = new StreamHandler();
    
    // Initialize helpers
    this.browserHelper = new BrowserHelper();
    this.pageHelper = new PageHelper();
  }

  async main(): Promise<boolean> {
    const browserType = await this.browserHelper.selectBestBrowser(this.config.browserType);
    
    this.logger.info(`Starting downloader with ${browserType.toUpperCase()}...`);

    try {
      // Initialize browser
      await this.initializeBrowser(browserType);
      
      if (!this.page) {
        throw new Error('Failed to initialize page');
      }

      // Set up monitoring and routing
      await this.setupComprehensiveMonitoring();
      await this.page.route('**/*', (route, request) => 
        this.routeHandler.handleRoute(route, request)
      );

      // Set up iframe monitoring
      await this.iframeMonitor.setupMonitoring(this.page, this.requestHandler);

      // Wait for initial page load
      this.logger.info('Waiting for page to fully load...');
      await this.pageHelper.waitForJWPlayerInitialization(this.page);

      // Handle popups first before trying stream buttons
      this.logger.info('Handling popups and modals...');
      await this.popupHandler.closePopups(this.page);
      
      // Monitor for popups during initial load
      await this.popupHandler.waitAndClosePopups(this.page, 3000);
      
      this.logger.info('Starting stream button handling...');
      const success = await this.tryStreamButtonsWithMonitoring();

      if (success) {
        this.logger.info('Successfully found and downloaded video!');
        this.playButtonHandler.markDownloadCompleted();
        return true;
      } else {
        this.logger.warn('No video streams found or all contained ads after trying all buttons');
        await this.pageHelper.takeScreenshot(this.page, 'no_streams_found.png');
        return false;
      }

    } catch (error) {
      this.logger.error(`Error during execution: ${error}`);
      if (this.page) {
        await this.pageHelper.takeScreenshot(this.page, 'error.png');
      }
      return false;
    } finally {
      await this.cleanup();
    }
  }

  private async initializeBrowser(browserType: BrowserType): Promise<void> {
    if (browserType === 'firefox') {
      this.browser = new FirefoxBrowser();
    } else if (browserType === 'brave') {
      this.browser = new BraveBrowser();
    } else {
      this.browser = new ChromiumBrowser();
    }

    await this.browser.launch(this.config.browserConfig);
    this.page = await this.browser.getPage(this.config.url);
  }

  private async setupComprehensiveMonitoring(): Promise<void> {
    if (!this.page) return;

    this.logger.info('Setting up comprehensive monitoring...');
    
    // Set up network monitoring
    this.networkMonitor.setupComprehensiveMonitoring(this.page);
    
    // Set up request/response handlers
    this.page.on('request', async (request) => {
      await this.requestHandler.handleRequest(request);
    });

    this.page.on('response', async (response) => {
      await this.requestHandler.handleResponse(response);
    });
  }

  private async tryStreamButtonsWithMonitoring(): Promise<boolean> {
    if (!this.page) return false;

    this.logger.info('Trying stream buttons with monitoring...');

    // Get available stream buttons from the handler
    const availableButtons = await this.streamButtonHandler.findAvailableStreamButtons(this.page);
    
    if (availableButtons.length === 0) {
      this.logger.warn('No stream buttons found on page');
      return false;
    }

    this.logger.info(`Found ${availableButtons.length} available stream buttons - will try all of them`);

    // Try each button with monitoring
    for (const selector of availableButtons) {
      try {
        this.logger.info(`Trying stream button: ${selector}`);

        // Clear previous candidates
        this.videoCandidates = [];

        // Use StreamButtonHandler to click the button
        const buttonClicked = await this.streamButtonHandler.clickSpecificStreamButton(this.page, selector);
        
        if (!buttonClicked) {
          this.logger.warn(`Failed to click button with selector: ${selector}`);
          continue;
        }

        // Wait for iframe then check if it's an ad
        this.logger.info('⏳ Waiting for iframe to load...');
        await this.page.waitForTimeout(3000);
        
        // Handle any popups that appeared after clicking stream button
        await this.popupHandler.closePopups(this.page);
        
        // Check if we got redirected to an ad
        if (await this.isAdRedirect()) {
          this.logger.warn('Ad redirect detected - attempting to click through ad...');
          
          // Try multiple times to click through the ad
          let adClickedThrough = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            this.logger.info(`Ad click-through attempt ${attempt}/3`);
            
            adClickedThrough = await this.clickThroughAd();
            if (adClickedThrough) {
              this.logger.info('Clicked through ad, waiting for video iframe...');
              // Close any popups that appeared after ad click-through
              await this.popupHandler.closePopups(this.page);
              
              // Wait longer for video iframe to appear
              await this.page.waitForTimeout(5000);
              
              // Check if video iframe appeared
              const videoIframeNow = await this.checkForVideoIframe();
              if (videoIframeNow) {
                this.logger.info('Video iframe found after ad click-through!');
                break;
              } else {
                this.logger.warn(`No video iframe after attempt ${attempt}, trying again...`);
                adClickedThrough = false;
              }
            } else {
              this.logger.warn(`Ad click-through attempt ${attempt} failed`);
              await this.page.waitForTimeout(2000);
            }
          }
          
          if (!adClickedThrough) {
            this.logger.warn('Could not click through ad after 3 attempts');
          }
        }
        
        // Check if we already have a video iframe (from initial page load)
        const existingVideoIframes = this.page.frames().filter(frame => {
          const url = frame.url();
          return (url.includes('turbovidhls.com') || 
                  url.includes('turboviplay.com') ||
                  url.includes('jwplayer') ||
                  url.includes('/player/') ||
                  url.includes('/video/') ||
                  url.includes('streamtape') ||
                  url.includes('mixdrop') ||
                  url.includes('doodstream') ||
                  url.includes('upstream')) && 
                 !url.includes('searcho') && 
                 !url.includes('/ads/');
        });

        let videoIframeFound = existingVideoIframes.length > 0;
        
        if (videoIframeFound) {
          this.logger.info(`Video iframe already present: ${existingVideoIframes[0].url()}`);
        } else {
          // Wait longer for the video iframe to appear after ad click-through
          this.logger.info('⏳ Waiting for video iframe to appear (may take 30 seconds after ad click-through)...');
          videoIframeFound = await this.waitForVideoIframe(30000); // Wait 30 seconds instead of 15
          
          if (!videoIframeFound) {
            this.logger.warn('❌ No video iframe found after 30 seconds');
            
            // Check if we have any M3U8 candidates from network monitoring
            const networkCandidates = this.networkMonitor.getVideoCandidates();
            const requestCandidates = this.requestHandler.getVideoCandidates();
            const allCandidates = [...networkCandidates, ...requestCandidates];
            
            if (allCandidates.length > 0) {
              this.logger.info(`🎯 Found ${allCandidates.length} M3U8 candidates from network monitoring - processing them`);
              
              // Add them to our candidates and try to process
              for (const candidate of allCandidates) {
                if (!this.videoCandidates.some(c => c.url === candidate.url)) {
                  this.videoCandidates.push(candidate);
                }
              }
              
              // Try to process the M3U8 candidates we found
              const downloadSuccess = await this.processResults();
              if (downloadSuccess) {
                this.logger.info(`✅ SUCCESS! Downloaded video using M3U8 candidates from button: ${selector}`);
                this.playButtonHandler.markDownloadCompleted();
                return true;
              }
            }
            
            this.logger.warn('❌ No video iframe and no M3U8 candidates - trying next stream button');
            continue;
          }
        }
        
        // Try to click play buttons in video iframes - be more persistent
        this.logger.info('🎮 Looking for play buttons in video iframes...');
        let playButtonClicked = false;
        
        // Try multiple times to find and click play button
        for (let attempt = 1; attempt <= 3; attempt++) {
          this.logger.info(`🎮 Play button attempt ${attempt}/3...`);
          playButtonClicked = await this.tryClickPlayButtonInIframes();
          
          if (playButtonClicked) {
            this.logger.info('Play button clicked - monitoring for streams...');
            break;
          } else {
            this.logger.warn(`Play button attempt ${attempt} failed, waiting 2s...`);
            await this.page.waitForTimeout(2000);
          }
        }
        
        if (!playButtonClicked) {
          this.logger.warn('No play button found after 3 attempts - still monitoring...');
        }

        // Check if we already have video candidates from initial page load
        const networkCandidates = this.networkMonitor.getVideoCandidates();
        const requestCandidates = this.requestHandler.getVideoCandidates();
        const initialCandidates = [...networkCandidates, ...requestCandidates];
        
        if (initialCandidates.length > 0) {
          this.logger.info(`Found ${initialCandidates.length} video candidates from initial page load - processing immediately`);
          
          // Add them to our candidates
          for (const candidate of initialCandidates) {
            if (!this.videoCandidates.some(c => c.url === candidate.url)) {
              this.videoCandidates.push(candidate);
            }
          }
          
          // Sort candidates by quality/preference and try the best one first
          const sortedCandidates = initialCandidates.sort((a, b) => {
            // Prefer higher quality (720p > 480p > default)
            const aHasQuality = a.url.includes('720') || a.url.includes('1080');
            const bHasQuality = b.url.includes('720') || b.url.includes('1080');
            if (aHasQuality && !bHasQuality) return -1;
            if (!aHasQuality && bHasQuality) return 1;
            return 0;
          });
          
          // Try to process the best candidate immediately
          for (const candidate of sortedCandidates) {
            this.logger.info(`🚀 IMMEDIATE PROCESSING: ${candidate.url}`);
            
            let success = false;
            if (candidate.url.includes('.m3u8')) {
              success = await this.processM3U8Directly(candidate.url, candidate.headers);
            } else if (candidate.url.endsWith('.mp4') || candidate.url.endsWith('.mkv')) {
              success = await this.downloadDirectVideo(candidate.url, candidate.headers);
            }
            
            if (success) {
              this.logger.info(`✅ SUCCESS! Downloaded video immediately using: ${candidate.url}`);
              this.playButtonHandler.markDownloadCompleted();
              return true;
            } else {
              this.logger.warn(`❌ Immediate processing failed for: ${candidate.url}`);
            }
          }
          
          this.logger.warn('Immediate processing failed for all candidates, falling back to monitoring...');
        }

        // Monitor for video streams
        const success = await this.monitorForVideoStreams(selector, 60);

        if (success) {
          // Check if success was due to direct URL
          if (this.directUrlFound) {
            this.logger.info(`SUCCESS! Direct video URL found with button: ${selector}`);
            return true;
          }

          this.logger.info(`Found video streams with button: ${selector}`);

          // Try to process the results using StreamHandler and M3U8Processor
          const downloadSuccess = await this.processResults();

          if (downloadSuccess) {
            this.logger.info(`SUCCESS! Downloaded video using button: ${selector}`);
            this.playButtonHandler.markDownloadCompleted();
            return true;
          } else {
            this.logger.warn(`❌ Button ${selector} found streams but all contained ads - trying next button`);
            continue;
          }
        } else {
          this.logger.warn(`❌ Button ${selector} did not find any video streams - trying next button`);
          continue;
        }

      } catch (error) {
        this.logger.warn(`❌ Error with button ${selector}: ${error} - trying next button`);
        continue;
      }
    }

    this.logger.error(`❌ All ${availableButtons.length} stream buttons failed - no video found`);
    return false;
  }

  private async tryClickPlayButtonInIframes(): Promise<boolean> {
    if (!this.page) return false;
    
    const frames = this.page.frames();
    let playButtonClicked = false;
    
    for (const frame of frames) {
      if (frame === this.page.mainFrame()) continue; // Skip main frame
      
      try {
        const frameUrl = frame.url();
        if (!frameUrl || frameUrl === 'about:blank' || frameUrl.includes('searcho')) continue;
        
        this.logger.info(`🔍 Checking iframe for play button: ${frameUrl}`);
        
        // Wait for iframe to fully load
        await this.page.waitForTimeout(1000);
        
        const playButtonSelectors = [
          // Exact match from screenshot - highest priority
          'div.playbutton[onclick="start_player()"]',
          'div.playbutton',
          '.playbutton',
          '[onclick="start_player()"]',
          '[onclick*="start_player"]',
          'div[onclick*="start_player"]',
          
          // Common video player patterns
          '.jw-display-icon-container',
          '.jw-icon-play',
          '.jwplayer .jw-display-icon-container',
          '.vjs-big-play-button',
          '.video-js .vjs-big-play-button',
          
          // Generic play buttons
          'button[data-action="play"]',
          '.video-play-button',
          '.play-btn',
          '.play-button',
          'button.play',
          'button[aria-label*="play" i]',
          'button[title*="play" i]',
          '[role="button"][aria-label*="play" i]',
          'div[class*="play" i][role="button"]',
          'button[class*="play" i]',
          '.video-overlay-play-button',
          '.plyr__control--overlaid',
          
          // More generic selectors
          'div[style*="cursor: pointer"][class*="play"]',
          'span[class*="play"]',
          '.fa-play',
          '.icon-play',
          '[data-toggle="play"]',
          
          // Last resort - any clickable element in video context
          'video + *[onclick]',
          '.video-container [onclick]',
          '.player-container [onclick]'
        ];

        for (const selector of playButtonSelectors) {
          try {
            const buttons = frame.locator(selector);
            const count = await buttons.count();
            
            for (let i = 0; i < count; i++) {
              try {
                const button = buttons.nth(i);
                const isVisible = await button.isVisible({ timeout: 1000 });
                
                if (isVisible) {
                  this.logger.info(`🎮 Found play button: ${selector} in ${frameUrl}`);
                  
                  try {
                    this.logger.info(`🎯 Attempting to click play button with ${selector}`);
                    
                    // Strategy 1: Execute start_player function if it exists
                    await button.evaluate((el) => {
                      try {
                        if (typeof (window as any).start_player === 'function') {
                          (window as any).start_player();
                          console.log('start_player() function executed');
                          return true;
                        }
                      } catch (e) {
                        console.log('start_player() not available:', e);
                      }
                      return false;
                    });
                    
                    await frame.waitForTimeout(500);
                    
                    // Strategy 2: Direct JavaScript click
                    await button.evaluate((el) => {
                      if (el && 'click' in el) {
                        (el as any).click();
                        console.log('Direct JS click executed');
                      }
                    });
                    
                    await frame.waitForTimeout(500);
                    
                    // Strategy 3: onclick handler execution
                    await button.evaluate((el) => {
                      if (el && el.onclick) {
                        try {
                          const event = new PointerEvent('click', { bubbles: true });
                          el.onclick(event);
                          console.log('onclick handler executed');
                        } catch (e) {
                          console.log('onclick failed:', e);
                        }
                      }
                    });
                    
                    await frame.waitForTimeout(500);
                    
                    // Strategy 4: Force click with position
                    try {
                      await button.click({ force: true, timeout: 3000 });
                      console.log('Force click executed');
                    } catch (forceError) {
                      // Continue with other strategies
                    }
                    
                    // Strategy 5: Dispatch comprehensive events
                    await button.evaluate((el) => {
                      const events = ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'];
                      events.forEach(eventType => {
                        try {
                          let event;
                          if (eventType.startsWith('touch')) {
                            event = new TouchEvent(eventType, { bubbles: true, cancelable: true });
                          } else {
                            event = new MouseEvent(eventType, { bubbles: true, cancelable: true });
                          }
                          el.dispatchEvent(event);
                        } catch (e) {
                          console.log(`Event ${eventType} failed:`, e);
                        }
                      });
                      console.log('All mouse/touch events dispatched');
                    });
                    
                    this.logger.info(`Play button click attempts completed for ${selector}`);
                    playButtonClicked = true;
                    
                    // Wait a bit to see if video starts
                    await this.page.waitForTimeout(2000);
                    
                    // Check if we can detect video playback starting
                    try {
                      const hasPlayingVideo = await frame.locator('video[autoplay], video:not([paused]), .jwplayer.jw-state-playing').count();
                      if (hasPlayingVideo > 0) {
                        this.logger.info(`🎬 Video playback detected!`);
                        return true;
                      }
                    } catch (videoCheckError) {
                      // Continue anyway
                    }
                    
                  } catch (clickError) {
                    this.logger.warn(`All click strategies failed for ${selector}: ${clickError}`);
                    continue;
                  }
                }
              } catch (elementError) {
                continue;
              }
            }
          } catch (selectorError) {
            continue;
          }
        }
        
      } catch (frameError) {
        this.logger.warn(`Error checking iframe ${frame.url()}: ${frameError}`);
        continue;
      }
    }
    
    if (playButtonClicked) {
      this.logger.info(`Play button interaction completed`);
      return true;
    }
    
    this.logger.warn(`❌ No play buttons found or clicked successfully`);
    return false;
  }

  private async isAdRedirect(): Promise<boolean> {
    if (!this.page) return false;
    
    const frames = this.page.frames();
    for (const frame of frames) {
      const url = frame.url();
      
      // Check for known ad domains/patterns
      if (url.includes('searcho') || 
          url.includes('/ads/') || 
          url.includes('redirect') ||
          url.includes('popup') ||
          url.includes('promo')) {
        this.logger.info(`Ad detected: ${url}`);
        return true;
      }
    }
    
    return false;
  }

  private async checkForVideoIframe(): Promise<boolean> {
    if (!this.page) return false;
    
    const frames = this.page.frames();
    for (const frame of frames) {
      const url = frame.url();
      
      // Look for video hosting domains
      if ((url.includes('turbovidhls.com') || 
          url.includes('turboviplay.com') ||
          url.includes('jwplayer') ||
          url.includes('/player/') ||
          url.includes('/video/') ||
          url.includes('streamtape') ||
          url.includes('mixdrop') ||
          url.includes('doodstream') ||
          url.includes('upstream')) && 
          !url.includes('searcho') && 
          !url.includes('/ads/')) {
        this.logger.info(`🎬 Video iframe detected: ${url}`);
        return true;
      }
    }
    
    return false;
  }

  private async clickThroughAd(): Promise<boolean> {
    if (!this.page) return false;
    
    const frames = this.page.frames();
    for (const frame of frames) {
      const url = frame.url();
      
      // Look for ad iframes that need to be clicked through
      if (url.includes('searcho') || url.includes('/ads/') || url.includes('redirect')) {
        this.logger.info(`🔗 Attempting to click through ad iframe: ${url}`);
        
        try {
          // Wait a bit for ad to fully load
          await this.page.waitForTimeout(1000);
          
          // Try different strategies for ad click-through
          const clickSelectors = [
            // Look for specific turbo/video links first
            'a[href*="turbo"]',
            'a[href*="video"]', 
            'a[href*="play"]',
            'a[href*="stream"]',
            // Look for skip/continue buttons
            '.skip-ad',
            '.skip-button',
            '[data-action="skip"]',
            '.continue',
            '.proceed',
            // General clickable elements
            'button:not([disabled])',
            'a[href]:not([href="#"])',
            '[onclick]',
            '.btn:not(.disabled)',
            '.button:not(.disabled)',
            '[role="button"]',
            // Last resort - any clickable element
            '*[onclick]',
            'div[style*="cursor: pointer"]'
          ];
          
          let clickedSuccessfully = false;
          
          for (const selector of clickSelectors) {
            try {
              const elements = frame.locator(selector);
              const count = await elements.count();
              
              if (count > 0) {
                for (let i = 0; i < Math.min(count, 3); i++) {
                  try {
                    const element = elements.nth(i);
                    const isVisible = await element.isVisible({ timeout: 1000 });
                    
                    if (isVisible) {
                      this.logger.info(`🎯 Clicking ${selector} in ad iframe`);
                      
                      // Try multiple click strategies
                      try {
                        // Strategy 1: Regular click
                        await element.click({ force: true, timeout: 3000 });
                        this.logger.info(`✅ Regular click succeeded on ${selector}`);
                      } catch {
                        try {
                          // Strategy 2: JavaScript click
                          await element.evaluate((el) => {
                            if (el && 'click' in el) {
                              (el as any).click();
                            }
                          });
                          this.logger.info(`✅ JavaScript click succeeded on ${selector}`);
                        } catch {
                          // Strategy 3: Dispatch click event
                          await element.evaluate((el) => {
                            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
                            el.dispatchEvent(event);
                          });
                          this.logger.info(`✅ Event dispatch succeeded on ${selector}`);
                        }
                      }
                      
                      await this.page.waitForTimeout(2000);
                      clickedSuccessfully = true;
                      break;
                    }
                  } catch (elementError) {
                    continue;
                  }
                }
                
                if (clickedSuccessfully) break;
              }
            } catch (selectorError) {
              continue;
            }
          }
          
          // If no specific elements worked, try clicking different areas of the iframe
          if (!clickedSuccessfully) {
            this.logger.info(`🎯 No specific elements found, trying to click iframe areas directly`);
            
            try {
              const iframeSelector = `iframe[src*="${new URL(url).hostname}"]`;
              const iframeElement = this.page.locator(iframeSelector).first();
              
              if (await iframeElement.isVisible()) {
                // Get iframe dimensions
                const box = await iframeElement.boundingBox();
                if (box) {
                  // Try clicking different strategic positions
                  const clickPositions = [
                    { x: box.width / 2, y: box.height / 2 }, // Center (where play button usually is)
                    { x: box.width * 0.3, y: box.height * 0.3 }, // Upper left area
                    { x: box.width * 0.7, y: box.height * 0.3 }, // Upper right area
                    { x: box.width * 0.5, y: box.height * 0.7 }, // Lower center
                  ];
                  
                  for (const position of clickPositions) {
                    try {
                      this.logger.info(`🎯 Clicking iframe at position (${Math.round(position.x)}, ${Math.round(position.y)})`);
                      
                      await iframeElement.click({ 
                        position: position, 
                        force: true,
                        timeout: 2000 
                      });
                      
                      await this.page.waitForTimeout(2000);
                      clickedSuccessfully = true;
                      this.logger.info(`✅ Iframe position click succeeded`);
                      break;
                      
                    } catch (positionClickError) {
                      this.logger.warn(`❌ Position click failed: ${positionClickError}`);
                      continue;
                    }
                  }
                } else {
                  // Fallback to default center click
                  await iframeElement.click({ 
                    position: { x: 200, y: 150 }, 
                    force: true,
                    timeout: 3000 
                  });
                  clickedSuccessfully = true;
                  this.logger.info(`✅ Fallback iframe click succeeded`);
                }
                
                if (clickedSuccessfully) {
                  await this.page.waitForTimeout(3000);
                }
              }
            } catch (iframeClickError) {
              this.logger.warn(`❌ Iframe area click failed: ${iframeClickError}`);
            }
          }
          
          if (clickedSuccessfully) {
            this.logger.info(`✅ Ad click-through completed, checking for video iframe...`);
            return true;
          }
          
        } catch (error) {
          this.logger.warn(`Failed to click through ad: ${error}`);
        }
      }
    }
    
    this.logger.warn(`Could not click through ad`);
    return false;
  }

  private async waitForVideoIframe(timeoutMs: number = 10000): Promise<boolean> {
    if (!this.page) return false;
    
    const startTime = Date.now();
    const endTime = startTime + timeoutMs;
    
    while (Date.now() < endTime) {
      const frames = this.page.frames();
      for (const frame of frames) {
        const url = frame.url();
        
        // Look for video hosting domains (expanded list)
        if ((url.includes('turbovidhls.com') || 
            url.includes('turboviplay.com') ||
            url.includes('jwplayer') ||
            url.includes('/player/') ||
            url.includes('/video/') ||
            url.includes('streamtape') ||
            url.includes('mixdrop') ||
            url.includes('doodstream') ||
            url.includes('upstream')) && 
            !url.includes('searcho') && // Exclude ad domains
            !url.includes('/ads/')) {
          this.logger.info(`🎬 Video iframe found: ${url}`);
          
          // Wait a bit for iframe content to load
          await this.page.waitForTimeout(2000);
          
          // Try to verify the iframe has video content
          try {
            const hasVideoElements = await frame.locator('video, .video-player, .jwplayer, [class*="player"]').count();
            if (hasVideoElements > 0) {
              this.logger.info(`✅ Video elements detected in iframe`);
              return true;
            }
          } catch (error) {
            // Continue anyway, might still be loading
          }
          
          return true;
        }
      }
      
      const elapsed = Date.now() - startTime;
      if (elapsed % 3000 === 0) { // Log every 3 seconds
        this.logger.info(`⏳ Still waiting for video iframe... ${elapsed/1000}s elapsed`);
        
        // Log current iframe URLs for debugging
        const currentFrames = this.page.frames();
        for (const frame of currentFrames) {
          const url = frame.url();
          if (url && url !== 'about:blank' && !url.includes('searcho')) {
            this.logger.info(`Current iframe: ${url}`);
          }
        }
      }
      
      await this.page.waitForTimeout(1000);
    }
    
    this.logger.warn(`Video iframe not found after ${timeoutMs/1000} seconds`);
    return false;
  }

  private async clickButtonWithHumanBehavior(button: any, buttonText: string): Promise<void> {
    // Wait longer to mimic human reading/decision time
    await this.page!.waitForTimeout(2000);

    // Scroll button into view
    await button.scrollIntoViewIfNeeded();
    await this.page!.waitForTimeout(500);

    // Hover over button first
    try {
      await button.hover({ timeout: 3000 });
      await this.page!.waitForTimeout(800);
    } catch {
      // Hover not critical
    }

    // Click with longer timeout
    this.logger.info(`Clicking button: ${buttonText} with human-like behavior`);
    await button.click({ timeout: 10000 });

    // Wait for click to register
    await this.page!.waitForTimeout(1500);
  }

  private async monitorForVideoStreams(buttonName: string, timeout: number = 180): Promise<boolean> {
    this.logger.info(`Monitoring for video streams after clicking ${buttonName}...`);

    const startTime = Date.now();
    let framesBeforeCount = this.page!.frames().length;
    let playButtonClicked = false;
    let downloadStarted = false;

    // Set up download monitoring
    const downloadPromise = this.setupDownloadMonitoring();

    while (Date.now() - startTime < timeout * 1000) {
      // Check if play button handler suggests stopping
      if (!this.playButtonHandler.shouldContinueNavigation()) {
        this.logger.info('Play button handler suggests stopping navigation');
        break;
      }

      // Check if download started
      if (downloadStarted) {
        this.logger.info('Download detected, waiting for completion...');
        const downloadSuccess = await downloadPromise;
        if (downloadSuccess) {
          this.logger.info('Download completed successfully!');
          return true;
        }
      }

      // Try to click play buttons if we haven't found streams yet
      if (!playButtonClicked && this.videoCandidates.length === 0 && !this.directUrlFound) {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed > 5) {
          this.logger.info('🎮 Trying play buttons during monitoring...');
          const playSuccess = await this.tryClickPlayButtonInIframes();
          if (playSuccess) {
            this.logger.info('✅ Play button clicked successfully');
            playButtonClicked = true;
            // Give more time for streams to appear after play button click
            await this.page!.waitForTimeout(3000);
          } else {
            // Fallback to old play button handler
            await this.playButtonHandler.handlePlayButtons(this.page!, 1);
            playButtonClicked = true;
          }
        }
      }

      // Check if direct URL was found
      if (this.directUrlFound) {
        this.logger.info('🎯 DIRECT URL FOUND - STOPPING ALL M3U8 PROCESSING!');
        return true;
      }

      await this.page!.waitForTimeout(2000);

      // Update iframe monitoring for new frames
      const framesAfterCount = this.page!.frames().length;
      if (framesAfterCount > framesBeforeCount) {
        this.logger.info(`🆕 New iframe(s) detected: ${framesAfterCount - framesBeforeCount}`);
        await this.iframeMonitor.setupMonitoring(this.page!, this.requestHandler);
        await this.iframeMonitor.waitForIframeContentLoad(this.page!);
        framesBeforeCount = framesAfterCount;
        
        // Try clicking play buttons in new iframes
        if (playButtonClicked) {
          this.logger.info('🎮 Trying play buttons in new iframes...');
          await this.tryClickPlayButtonInIframes();
        }
      }

      // Extract video URLs directly from DOM
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > 3) {
        const domVideos = await this.pageHelper.extractVideoUrlsFromDOM(this.page!);
        if (domVideos.length > 0) {
          this.logger.info('FOUND VIDEO URL IN DOM - Processing immediately!');
          
          // Convert DOM videos to candidates
          for (const video of domVideos) {
            const candidate: VideoCandidate = {
              url: video.url,
              headers: this.capturedHeaders,
              timestamp: Date.now(),
              domain: this.extractDomain(video.url),
              source: `dom_extraction_${video.frame}`,
              type: video.type,
            };

            if (!this.videoCandidates.some(c => c.url === video.url)) {
              this.videoCandidates.push(candidate);
            }
          }
          
          // If we found direct video URLs, try to download them immediately
          for (const video of domVideos) {
            if (video.type === 'direct' && (video.url.endsWith('.mp4') || video.url.endsWith('.mkv') || video.url.endsWith('.avi'))) {
              this.logger.info(`Attempting direct download of: ${video.url}`);
              const directSuccess = await this.downloadDirectVideo(video.url);
              if (directSuccess) {
                return true;
              }
            } else if (video.type === 'm3u8' || video.url.includes('.m3u8')) {
              this.logger.info(`Attempting M3U8 processing of: ${video.url}`);
              const m3u8Success = await this.processM3U8Directly(video.url);
              if (m3u8Success) {
                return true;
              }
            }
          }
          
          return true;
        }
      }

      // Check if we found M3U8 candidates
      const networkCandidates = this.networkMonitor.getVideoCandidates();
      const requestCandidates = this.requestHandler.getVideoCandidates();
      
      this.videoCandidates = [
        ...this.videoCandidates,
        ...networkCandidates.filter(nc => !this.videoCandidates.some(vc => vc.url === nc.url)),
        ...requestCandidates.filter(rc => !this.videoCandidates.some(vc => vc.url === rc.url))
      ];

      if (this.videoCandidates.length > 0) {
        this.logger.info(`Found ${this.videoCandidates.length} video candidates!`);
        
        // Wait a bit more if we just found candidates after play button click
        if (playButtonClicked && elapsed < 20) {
          this.logger.info('Found candidates after play button click, collecting more sources...');
          continue;
        }
        
        return true;
      }

      // Show progress
      this.logger.info(`Monitoring... ${elapsed.toFixed(1)}s elapsed`);
    }

    this.logger.info(`No video streams found after ${timeout}s monitoring`);
    return false;
  }

  private async processResults(): Promise<boolean> {
    try {
      // Combine all candidates
      const allCandidates = [
        ...this.videoCandidates,
        ...this.networkMonitor.getVideoCandidates(),
        ...this.requestHandler.getVideoCandidates()
      ];

      // Remove duplicates
      const uniqueCandidates = allCandidates.filter((candidate, index, array) => 
        array.findIndex(c => c.url === candidate.url) === index
      );

      if (uniqueCandidates.length === 0) {
        this.logger.warn('No video candidates found to process');
        return false;
      }

      this.logger.info(`Processing ${uniqueCandidates.length} unique video candidates`);

      // Try direct processing first for known video formats
      for (const candidate of uniqueCandidates) {
        try {
          if (candidate.url.endsWith('.mp4') || candidate.url.endsWith('.mkv') || candidate.url.endsWith('.avi')) {
            this.logger.info(`Trying direct download for: ${candidate.url}`);
            const directSuccess = await this.downloadDirectVideo(candidate.url, candidate.headers);
            if (directSuccess) {
              return true;
            }
          } else if (candidate.url.includes('.m3u8') || candidate.type === 'm3u8') {
            this.logger.info(`Trying M3U8 processing for: ${candidate.url}`);
            const m3u8Success = await this.processM3U8Directly(candidate.url, candidate.headers);
            if (m3u8Success) {
              return true;
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to process candidate ${candidate.url}: ${error}`);
          continue;
        }
      }

      // Fallback to stream handler for complex processing
      this.logger.info('Falling back to stream handler for complex processing');
      return await this.streamHandler.processResults(uniqueCandidates);

    } catch (error) {
      this.logger.error(`Error in processResults: ${error}`);
      return false;
    }
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        console.log('VideoDownloader: Cleaning up browser...');
        await this.browser.close();
        console.log('VideoDownloader: Browser cleanup completed');
      }
    } catch (error) {
      this.logger.warn(`Error during cleanup: ${error}`);
      console.error('VideoDownloader: Cleanup error:', error instanceof Error ? error.message : String(error));
    }
    
    // Also cleanup M3U8 processor if needed
    try {
      // The M3U8Processor handles its own cleanup internally
      this.logger.info('VideoDownloader cleanup completed');
    } catch (error) {
      this.logger.warn(`Error during M3U8 cleanup: ${error}`);
    }
  }

  // Public cleanup method for external use
  public async forceCleanup(): Promise<void> {
    await this.cleanup();
  }

  // Public methods for external use
  public getVideoCandidates(): VideoCandidate[] {
    return [...this.videoCandidates];
  }

  public getAllVideoRequests(): string[] {
    return [...this.allVideoRequests];
  }

  public isDirectUrlFound(): boolean {
    return this.directUrlFound;
  }

  public setDirectUrlFound(found: boolean): void {
    this.directUrlFound = found;
  }

  // Download monitoring setup
  private async setupDownloadMonitoring(): Promise<boolean> {
    if (!this.page) return false;
    
    return new Promise((resolve) => {
      let downloadDetected = false;
      
      // Monitor for download events in browser context
      this.page!.context().on('page', async (newPage) => {
        try {
          const url = newPage.url();
          if (url.includes('download') || url.includes('.mp4') || url.includes('.mkv')) {
            this.logger.info(`Download page detected: ${url}`);
            downloadDetected = true;
            resolve(true);
          }
        } catch (error) {
          // Continue monitoring
        }
      });
      
      // Monitor for response headers indicating downloads
      this.page!.on('response', async (response) => {
        try {
          const headers = response.headers();
          const contentDisposition = headers['content-disposition'];
          const contentType = headers['content-type'];
          
          if (contentDisposition && contentDisposition.includes('attachment')) {
            this.logger.info(`Download response detected: ${response.url()}`);
            downloadDetected = true;
            resolve(true);
          }
          
          if (contentType && (contentType.includes('video/') || contentType.includes('application/octet-stream'))) {
            const url = response.url();
            if (url.includes('.mp4') || url.includes('.mkv') || url.includes('.avi')) {
              this.logger.info(`📥 Video file response detected: ${url}`);
              downloadDetected = true;
              resolve(true);
            }
          }
        } catch (error) {
          // Continue monitoring
        }
      });
      
      // Set timeout for download monitoring
      setTimeout(() => {
        if (!downloadDetected) {
          resolve(false);
        }
      }, 30000); // 30 second timeout
    });
  }

  // Direct M3U8 processing methods for easier access
  public async processM3U8Directly(m3u8Url: string, headers: Record<string, string> = {}, outputFilename?: string): Promise<boolean> {
    this.logger.info(`Processing M3U8 directly: ${m3u8Url}`);
    
    try {
      // Use captured headers if no headers provided, and add browser context headers
      const finalHeaders = Object.keys(headers).length > 0 ? headers : this.capturedHeaders;
      
      // Add additional headers that match the browser session - using EXACT Python headers
      const enhancedHeaders = {
        ...finalHeaders,
        'Referer': this.config.url, // Use the original page URL as referer
        'Origin': this.extractDomain(this.config.url),
        // Use EXACT same User-Agent as Python script
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
      };
      
      // First attempt with M3U8Processor (pass browser page for session context)
      let success = await this.m3u8Processor.processM3U8(m3u8Url, enhancedHeaders, outputFilename, this.page);
      
      // If that fails, try using the browser to fetch the M3U8 content
      if (!success && this.page) {
        this.logger.info('M3U8Processor failed, trying browser-based approach...');
        success = await this.procesM3U8WithBrowser(m3u8Url, outputFilename);
      }
      
      // If browser approach fails, try direct TypeScript approach
      if (!success) {
        this.logger.info('Browser-based approach failed, trying TypeScript M3U8 processor...');
        success = await this.m3u8Processor.processM3U8(m3u8Url, this.capturedHeaders, outputFilename);
      }
      
      if (success) {
        this.logger.info('Direct M3U8 processing completed successfully');
        this.playButtonHandler.markDownloadCompleted();
      } else {
        this.logger.error('Direct M3U8 processing failed with all methods');
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error in direct M3U8 processing: ${error}`);
      return false;
    }
  }

  private async procesM3U8WithBrowser(m3u8Url: string, outputFilename?: string): Promise<boolean> {
    if (!this.page) return false;
    
    try {
      this.logger.info(`Trying browser-based M3U8 processing: ${m3u8Url}`);
      
      // Use the browser to fetch the M3U8 content (this uses the same session/cookies)
      const response = await this.page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            method: 'GET',
            credentials: 'include', // Include cookies
            headers: {
              // Use EXACT same headers as Python script for consistency
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Cache-Control': 'max-age=0'
            }
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const text = await response.text();
          return { success: true, content: text, status: response.status };
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }, m3u8Url);
      
      if (response.success && response.content) {
        this.logger.info(`Successfully fetched M3U8 content via browser (${response.content.length} chars)`);
        
        // Process the M3U8 content directly using Python-style approach
        return await this.processPythonStyleM3U8(m3u8Url, response.content, outputFilename);
      } else {
        this.logger.warn(`Browser-based M3U8 fetch failed: ${response.error}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Error in browser-based M3U8 processing: ${error}`);
      return false;
    }
  }

  private async processPythonStyleM3U8(baseUrl: string, m3u8Content: string, outputFilename?: string): Promise<boolean> {
    try {
      this.logger.info(`Processing M3U8 with Python-style approach`);
      
      // Parse M3U8 content manually (like Python version)
      const lines = m3u8Content.split('\n').map(line => line.trim()).filter(line => line);
      const segments: string[] = [];
      let isPlaylist = false;
      
      // Check if this is a master playlist
      for (const line of lines) {
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
          isPlaylist = true;
          break;
        }
      }
      
      if (isPlaylist) {
        this.logger.info(`Master playlist detected, selecting best quality`);
        
        // Find the best quality variant
        let bestBandwidth = 0;
        let bestVariantUrl = '';
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1]) : 0;
            
            if (bandwidth > bestBandwidth && i + 1 < lines.length) {
              const nextLine = lines[i + 1];
              if (!nextLine.startsWith('#')) {
                bestBandwidth = bandwidth;
                bestVariantUrl = nextLine;
              }
            }
          }
        }
        
        if (bestVariantUrl) {
          const fullVariantUrl = this.resolveUrl(bestVariantUrl, baseUrl);
          this.logger.info(`Selected best quality variant: ${fullVariantUrl}`);
          
          // Fetch the variant playlist using browser
          const variantResponse = await this.page!.evaluate(async (url) => {
            try {
              const response = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                  // Use EXACT same headers as Python script for consistency
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.9',
                  'Accept-Encoding': 'gzip, deflate, br',
                  'DNT': '1',
                  'Connection': 'keep-alive',
                  'Upgrade-Insecure-Requests': '1',
                  'Sec-Fetch-Dest': 'document',
                  'Sec-Fetch-Mode': 'navigate',
                  'Sec-Fetch-Site': 'none',
                  'Sec-Fetch-User': '?1',
                  'Cache-Control': 'max-age=0'
                }
              });
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const text = await response.text();
              return { success: true, content: text };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
          }, fullVariantUrl);
          
          if (variantResponse.success && variantResponse.content) {
            return await this.processPythonStyleM3U8(fullVariantUrl, variantResponse.content, outputFilename);
          } else {
            this.logger.error(`Failed to fetch variant playlist: ${variantResponse.error}`);
            return false;
          }
        }
      } else {
        // Extract segments from the playlist
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('#EXTINF:') && i + 1 < lines.length) {
            const nextLine = lines[i + 1];
            if (!nextLine.startsWith('#')) {
              const segmentUrl = this.resolveUrl(nextLine, baseUrl);
              segments.push(segmentUrl);
            }
          }
        }
        
        if (segments.length === 0) {
          this.logger.error(`No segments found in M3U8 playlist`);
          return false;
        }
        
        this.logger.info(`Found ${segments.length} segments to download`);
        
        // Use TypeScript M3U8 processor for actual downloading
        return await this.m3u8Processor.processM3U8(baseUrl, this.capturedHeaders, outputFilename, this.page);
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Error in TypeScript M3U8 processing: ${error}`);
      return false;
    }
  }



  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http')) {
      return url;
    }
    
    try {
      return new URL(url, baseUrl).toString();
    } catch {
      // Fallback for malformed URLs
      const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
      return base + url;
    }
  }

  public async downloadDirectVideo(videoUrl: string, headers: Record<string, string> = {}): Promise<boolean> {
    this.logger.info(`Downloading direct video: ${videoUrl}`);
    
    try {
      // Use captured headers if no headers provided
      const finalHeaders = Object.keys(headers).length > 0 ? headers : this.capturedHeaders;
      
      const success = await this.m3u8Processor.downloadDirectVideo(videoUrl, finalHeaders);
      
      if (success) {
        this.logger.info('Direct video download completed successfully');
        this.playButtonHandler.markDownloadCompleted();
        this.directUrlFound = true;
      } else {
        this.logger.error('Direct video download failed');
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Error in direct video download: ${error}`);
      return false;
    }
  }

  public async handlePopupsManually(): Promise<void> {
    if (!this.page) {
      this.logger.warn('No page available for popup handling');
      return;
    }

    this.logger.info('Manual popup handling requested');
    
    try {
      await this.popupHandler.closePopups(this.page);
      this.logger.info('Manual popup handling completed');
    } catch (error) {
      this.logger.error(`Error in manual popup handling: ${error}`);
    }
  }

  public async closeSpecificPopup(selector: string): Promise<boolean> {
    if (!this.page) {
      this.logger.warn('No page available for popup handling');
      return false;
    }

    this.logger.info(`Closing specific popup: ${selector}`);
    
    try {
      return await this.popupHandler.closeSpecificPopup(this.page, selector);
    } catch (error) {
      this.logger.error(`Error closing specific popup: ${error}`);
      return false;
    }
  }
}
