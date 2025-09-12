import { Page } from 'playwright';
export interface PlayButtonConfig {
    waitTimeout?: number;
    clickDelay?: number;
    retryAttempts?: number;
}
export interface DetectedPlayer {
    element: any;
    type: 'video' | 'iframe' | 'custom';
    selector: string;
    confidence: number;
}
export declare class PlayButtonDetector {
    private config;
    private playButtonSelectors;
    constructor(config?: PlayButtonConfig);
    /**
     * Detect and click play button on the current page
     */
    detectAndClickPlay(page: Page): Promise<boolean>;
    /**
     * Detect various types of video players on the page
     */
    private detectVideoPlayers;
    /**
     * Attempt to click play on a detected player
     */
    private attemptPlayClick;
    /**
     * Handle HTML5 video elements
     */
    private handleVideoElement;
    /**
     * Handle iframe video players
     */
    private handleIframeElement;
    /**
     * Handle custom video players
     */
    private handleCustomPlayer;
    /**
     * Try generic play button detection when specific players aren't found
     */
    private tryGenericPlayButtons;
    /**
     * Wait for video to start playing
     */
    waitForPlayback(page: Page, timeout?: number): Promise<boolean>;
    /**
     * Simulate human-like interaction before clicking play
     */
    simulateUserInteraction(page: Page): Promise<void>;
}
//# sourceMappingURL=PlayButtonDetector.d.ts.map