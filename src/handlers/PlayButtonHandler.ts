import { Page } from 'playwright';
import { Logger } from 'winston';
import { createLogger } from '../utils/Logger';

export class PlayButtonHandler {
  private logger: Logger;
  private downloadCompleted: boolean = false;
  private shouldTerminate: boolean = false;

  constructor() {
    this.logger = createLogger('PlayButtonHandler');
  }

  async handlePlayButtons(page: Page, maxAttempts: number = 2): Promise<void> {
    this.logger.info('Starting automatic play button handling...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.info(`Play button attempt ${attempt}/${maxAttempts}`);
      
      // Try main page first
      let clicked = await this.tryClickPlayButton(page);
      
      // If not found in main page, try iframes
      if (!clicked) {
        clicked = await this.tryClickPlayButtonInIframes(page);
      }
      
      if (clicked) {
        this.logger.info('Play button clicked! Waiting for video streams to load...');
        // Wait longer for video initialization
        await page.waitForTimeout(12000);
        
        // Try clicking additional play buttons if needed
        this.logger.info('Checking if additional play button clicks needed...');
        const additionalClick = await this.tryClickPlayButton(page, true) || 
                                await this.tryClickPlayButtonInIframes(page, true);
        if (additionalClick) {
          this.logger.info('Additional play button clicked!');
          await page.waitForTimeout(8000);
        }
        
        break;
      } else {
        await page.waitForTimeout(2000);
      }
    }
  }

  private async tryClickPlayButton(page: Page, quickCheck: boolean = false): Promise<boolean> {
    const playButtonSelectors = [
      // Specific selectors from the actual page (highest priority)
      'div.playbutton',
      '.playbutton',
      '[onclick*="start_player"]',
      '[onclick="start_player()"]',
      'div[onclick*="start_player"]',
      // Other common selectors
      '[onclick*="start_player" i]',
      // Common play button selectors
      '.jw-display-icon-container',
      '.jw-display-icon-play',
      '.jwplayer .jw-icon-play',
      '.video-js .vjs-big-play-button',
      '.plyr__control--overlaid',
      '[aria-label*="play" i]',
      '[title*="play" i]',
      'button[class*="play"]',
      '.play-button',
      '.play-btn',
      '#play-button',
      // SVG play buttons
      'svg[class*="play"]',
      // Generic play indicators
      '[data-role="play"]',
      '[onclick*="play"]',
      // Video elements that might be clickable
      '#vplayer',
      '.video-container',
    ];

    if (quickCheck) {
      this.logger.info('Quick check for additional play buttons...');
      // For quick check, only try the most common selectors
      playButtonSelectors.splice(8);
    } else {
      this.logger.info('Looking for play button...');
    }

    // Try play button in main frame first
    for (const selector of playButtonSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();
        
        if (count > 0) {
          for (let i = 0; i < count; i++) {
            try {
              const button = elements.nth(i);
              const isVisible = await button.isVisible();
              
              if (isVisible) {
                this.logger.info(`Clicking play button with selector: ${selector}`);
                await button.click({ timeout: 3000 });
                await page.waitForTimeout(3000);
                return true;
              }
            } catch (error) {
              this.logger.debug(`Failed to click play button ${i}: ${error}`);
            }
          }
        }
      } catch (error) {
        this.logger.debug(`Error with play button selector ${selector}: ${error}`);
      }
    }

    // Try play button in iframes
    const frames = page.frames();
    for (const frame of frames) {
      if (frame !== page.mainFrame()) {
        try {
          for (const selector of playButtonSelectors) {
            try {
              const elements = frame.locator(selector);
              const count = await elements.count();
              
              if (count > 0) {
                for (let i = 0; i < count; i++) {
                  try {
                    const button = elements.nth(i);
                    const isVisible = await button.isVisible();
                    
                    if (isVisible) {
                      this.logger.info(`Clicking play button in iframe with selector: ${selector}`);
                      await button.click({ timeout: 3000 });
                      await page.waitForTimeout(3000);
                      return true;
                    }
                  } catch (error) {
                    this.logger.debug(`Failed to click iframe play button ${i}: ${error}`);
                  }
                }
              }
            } catch (error) {
              this.logger.debug(`Error with iframe play button selector ${selector}: ${error}`);
            }
          }
        } catch (error) {
          this.logger.debug(`Error accessing iframe for play button: ${error}`);
        }
      }
    }

    this.logger.info('No play button found or clicked');
    return false;
  }

  private async tryClickPlayButtonInIframes(page: Page, quickCheck: boolean = false): Promise<boolean> {
    this.logger.info('Looking for play button in iframes...');
    
    const frames = page.frames();
    
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue; // Skip main frame
      
      try {
        const frameUrl = frame.url();
        if (!frameUrl || frameUrl === 'about:blank') continue;
        
        this.logger.info(`Checking iframe for play button: ${frameUrl}`);
        
        // Use the same selectors as main page
        const playButtonSelectors = [
          'div.playbutton',
          '.playbutton',
          '[onclick*="start_player"]',
          '[onclick="start_player()"]',
          'div[onclick*="start_player"]',
          'button[data-action="play"]',
          '.video-play-button',
          '.play-btn',
          '.play-button',
          'button.play',
          '.jw-display-icon-container',
          '.jw-icon-play',
          '.vjs-big-play-button',
          'button[aria-label*="play" i]',
          'button[title*="play" i]',
          '[role="button"][aria-label*="play" i]',
          'div[class*="play" i][role="button"]',
          'button[class*="play" i]',
          '.video-overlay-play-button',
          '.plyr__control--overlaid',
        ];

        for (const selector of playButtonSelectors) {
          try {
            const button = frame.locator(selector).first();
            const isVisible = await button.isVisible({ timeout: quickCheck ? 1000 : 3000 });
            
            if (isVisible) {
              this.logger.info(`Found play button in iframe with selector: ${selector}`);
              
              try {
                // Scroll into view if needed
                await button.scrollIntoViewIfNeeded({ timeout: 2000 });
                await frame.waitForTimeout(500);
                
                // Click the button
                await button.click({ timeout: 5000 });
                this.logger.info(`Successfully clicked play button in iframe: ${frameUrl}`);
                
                // Wait for video to start
                await frame.waitForTimeout(3000);
                return true;
                
              } catch (clickError) {
                this.logger.warn(`Failed to click play button in iframe: ${clickError}`);
                continue;
              }
            }
          } catch (selectorError) {
            // Selector not found, continue to next
            continue;
          }
        }
        
      } catch (frameError) {
        this.logger.warn(`Error checking iframe ${frame.url()}: ${frameError}`);
        continue;
      }
    }
    
    this.logger.info('No play button found in any iframe');
    return false;
  }

  shouldContinueNavigation(): boolean {
    return !this.downloadCompleted && !this.shouldTerminate;
  }

  markDownloadCompleted(): void {
    this.downloadCompleted = true;
    this.shouldTerminate = true;
    this.logger.info('Download marked as completed');
  }

  shouldTerminateScript(): boolean {
    return this.shouldTerminate;
  }

  reset(): void {
    this.downloadCompleted = false;
    this.shouldTerminate = false;
  }
}
