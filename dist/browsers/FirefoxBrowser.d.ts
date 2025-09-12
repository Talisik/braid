import { Page } from 'playwright';
import { BrowserConfig } from '../types/index.js';
import { NetworkMonitor } from '../monitors/NetworkMonitor.js';
import { PlayButtonDetector } from '../detectors/PlayButtonDetector.js';
export declare class FirefoxBrowser {
    private browser;
    private context;
    private page;
    private config;
    private networkMonitor;
    private playDetector;
    constructor(config?: BrowserConfig);
    /**
     * Launch Firefox browser with stealth mode
     */
    launch(): Promise<void>;
    /**
     * Navigate to a URL and start monitoring with enhanced video detection
     */
    navigateAndMonitor(url: string): Promise<void>;
    /**
     * Enhanced method that finds and clicks play button, then monitors for video streams
     */
    findAndClickPlay(monitorDuration?: number): Promise<boolean>;
    /**
     * Simulate human-like interactions to bypass detection
     */
    simulateHumanBehavior(): Promise<void>;
    /**
     * Wait for a specific time while monitoring continues
     */
    waitAndMonitor(milliseconds: number): Promise<void>;
    /**
     * Get the network monitor instance
     */
    getNetworkMonitor(): NetworkMonitor;
    /**
     * Get the play button detector instance
     */
    getPlayDetector(): PlayButtonDetector;
    /**
     * Get the current page instance
     */
    getPage(): Page | null;
    /**
     * Execute JavaScript in the page context
     */
    evaluateScript<T>(script: string): Promise<T>;
    /**
     * Execute a function in the page context
     */
    evaluateFunction<T>(fn: () => T | Promise<T>): Promise<T>;
    /**
     * Take a screenshot
     */
    screenshot(path?: string): Promise<Buffer>;
    /**
     * Click on an element
     */
    click(selector: string): Promise<void>;
    /**
     * Wait for an element to appear
     */
    waitForElement(selector: string, timeout?: number): Promise<void>;
    /**
     * Get page title
     */
    getTitle(): Promise<string>;
    /**
     * Get current URL
     */
    getCurrentUrl(): string;
    /**
     * Stop network monitoring
     */
    stopMonitoring(): void;
    /**
     * Close the browser
     */
    close(): Promise<void>;
    /**
     * Get monitoring statistics
     */
    getMonitoringStats(): {
        currentUrl: string;
        isLaunched: boolean;
        totalRequests: number;
        totalResponses: number;
        videoRequests: number;
        recentVideoRequests: number;
        uniqueDomains: number;
    };
}
//# sourceMappingURL=FirefoxBrowser.d.ts.map