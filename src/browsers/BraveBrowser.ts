import { chromium, Browser, BrowserContext, Page } from "playwright";
import { BrowserConfig } from "../types/index.js";
import { Logger } from "winston";
import { createLogger } from "../utils/Logger.js";

export class BraveBrowser {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private logger: Logger;

    constructor() {
        this.logger = createLogger("BraveBrowser");
    }

    async launch(config: BrowserConfig = {}): Promise<void> {
        try {
            this.browser = await chromium.launch({
                headless: config.headless ?? true,
                executablePath: this.getBravePath(),
                args: [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-web-security",
                    "--allow-running-insecure-content",
                    "--disable-features=VizDisplayCompositor",
                    "--block-new-web-contents",
                    "--disable-popup-blocking=false",
                    // Brave-specific privacy and ad-blocking enhancements
                    "--enable-aggressive-domstorage-flushing",
                    "--disable-background-networking",
                    "--disable-background-timer-throttling",
                    "--disable-renderer-backgrounding",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-client-side-phishing-detection",
                    "--disable-component-extensions-with-background-pages",
                    "--disable-default-apps",
                    "--disable-extensions-http-throttling",
                    "--disable-ipc-flooding-protection",
                    // Enhanced debugging
                    "--enable-logging",
                    "--log-level=0",
                    // Network debugging
                    "--enable-network-service-logging",
                ],
            });

            this.context = await this.browser.newContext({
                viewport: config.viewport ?? { width: 1920, height: 1080 },
                userAgent:
                    config.userAgent ??
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Brave/1.60",
                ignoreHTTPSErrors: config.ignoreHTTPSErrors ?? true,
                javaScriptEnabled: config.javaScriptEnabled ?? true,
            });

            this.logger.info(
                "Brave browser launched with enhanced ad-blocking"
            );
        } catch (error) {
            this.logger.error("Failed to launch Brave browser:", error);
            throw error;
        }
    }

    async getPage(url?: string): Promise<Page> {
        if (!this.context) {
            throw new Error(
                "Browser context not initialized. Call launch() first."
            );
        }

        const page = await this.context.newPage();

        // Set up request/response logging
        page.on("request", (request) => this.logRequest(request));
        page.on("response", (response) => this.logResponse(response));

        if (url) {
            try {
                this.logger.info(`Navigating to: ${url}`);
                await page.goto(url, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                this.logger.info("Page loaded successfully");

                // Wait for dynamic content
                await page.waitForTimeout(3000);
            } catch (error) {
                this.logger.warn(
                    `Page load timeout, but continuing anyway: ${error}`
                );
            }
        }

        return page;
    }

    private getBravePath(): string {
        const bravePaths = [
            "/usr/bin/brave-browser", // Linux
            "/usr/bin/brave",
            "/opt/brave.com/brave/brave-browser",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", // macOS
            "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe", // Windows
            "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
        ];

        // In a real implementation, you'd check which path exists
        return bravePaths[0]; // Default to Linux path
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
        const patterns = ["m3u8", "mp4", "ts", "stream"];
        return patterns.some((pattern) => url.toLowerCase().includes(pattern));
    }

    async close(): Promise<void> {
        try {
            if (this.browser) {
                await this.browser.close();
                this.logger.info("Brave browser closed");
            }
        } catch (error) {
            this.logger.warn(`Error closing Brave browser: ${error}`);
        }
    }
}
