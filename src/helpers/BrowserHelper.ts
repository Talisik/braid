import * as fs from 'fs';
import { BaseHelper } from './BaseHelper';
import { BrowserType } from '../types';

export class BrowserHelper extends BaseHelper {
  
  async isBraveAvailable(): Promise<boolean> {
    const bravePaths = [
      '/usr/bin/brave-browser',  // Linux
      '/usr/bin/brave',
      '/opt/brave.com/brave/brave-browser',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',  // macOS
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',  // Windows
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];

    for (const path of bravePaths) {
      if (fs.existsSync(path)) {
        this.logger.info(`Found Brave browser at: ${path}`);
        return true;
      }
    }

    // Also try which command on Linux/macOS
    try {
      const { execSync } = await import('child_process');
      const result = execSync('which brave-browser', { encoding: 'utf8' });
      if (result.trim()) {
        this.logger.info(`Found Brave browser via which: ${result.trim()}`);
        return true;
      }
    } catch {
      // Command failed
    }

    this.logger.warn('Brave browser not found on system');
    return false;
  }

  getBravePath(): string | null {
    const bravePaths = [
      '/usr/bin/brave-browser',  // Linux
      '/usr/bin/brave',
      '/opt/brave.com/brave/brave-browser',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',  // macOS
      'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',  // Windows
      'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];

    for (const path of bravePaths) {
      if (fs.existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  async selectBestBrowser(preferredType: BrowserType): Promise<BrowserType> {
    // Firefox is always available with Playwright, so prefer it
    if (preferredType === 'firefox') {
      return 'firefox';
    } else if (preferredType === 'brave' && await this.isBraveAvailable()) {
      return 'brave';
    } else if (preferredType === 'brave') {
      this.logger.warn('Brave browser not found, falling back to Firefox');
      return 'firefox';
    }

    return preferredType === 'chromium' ? 'chromium' : 'firefox';
  }

  generateUserAgent(browserType: BrowserType): string {
    switch (browserType) {
      case 'firefox':
        return 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0';
      case 'brave':
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/1.60';
      case 'chromium':
      default:
        return 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }
  }

  getBrowserLaunchArgs(browserType: BrowserType): string[] {
    if (browserType === 'firefox') {
      return [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        // Firefox-specific args
        '--enable-logging',
        '--new-instance',
        '--no-remote',
        '--safe-mode=false',
      ];
    }

    const commonArgs = [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-features=VizDisplayCompositor',
      '--block-new-web-contents',
      '--disable-popup-blocking=false',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--enable-logging',
      '--log-level=0',
      '--enable-network-service-logging',
    ];

    if (browserType === 'brave') {
      return [
        ...commonArgs,
        // Brave-specific privacy and ad-blocking enhancements
        '--enable-aggressive-domstorage-flushing',
        '--disable-client-side-phishing-detection',
        '--disable-component-extensions-with-background-pages',
        '--disable-default-apps',
        '--disable-extensions-http-throttling',
        '--disable-ipc-flooding-protection',
      ];
    }

    return commonArgs;
  }
}
