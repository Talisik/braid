import { Page } from "playwright";
import { BaseHelper } from "./BaseHelper.js";

export class PageHelper extends BaseHelper {
    async waitForJWPlayerInitialization(page: Page): Promise<void> {
        this.logger.info("⏳ Waiting for JWPlayer initialization...");

        // Wait for JWPlayer script to load
        try {
            await page.waitForSelector('script[src*="jwplayer"]', {
                timeout: 10000,
            });
            this.logger.info("✅ JWPlayer script detected");
        } catch {
            this.logger.warn(
                "⚠️ JWPlayer script not found, continuing anyway..."
            );
        }

        // Wait for page to be fully loaded
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(3000); // Additional wait for dynamic content

        // Check for JWPlayer initialization in page
        try {
            const jwplayerReady = await page.evaluate(() => {
                return (
                    typeof (window as any).jwplayer !== "undefined" &&
                    typeof (window as any).jwplayer.key !== "undefined"
                );
            });

            if (jwplayerReady) {
                this.logger.info("✅ JWPlayer is initialized and ready");
            } else {
                this.logger.warn("⚠️ JWPlayer may not be fully initialized");
            }
        } catch (error) {
            this.logger.warn(`⚠️ Could not check JWPlayer status: ${error}`);
        }

        // Wait for any initial video player setup
        await page.waitForTimeout(2000);
    }

    async extractVideoUrlsFromDOM(page: Page): Promise<any[]> {
        try {
            this.logger.info("🔍 SCANNING DOM FOR VIDEO URLs...");

            // Check all frames (main page and iframes)
            const allFrames = [
                page.mainFrame(),
                ...page.frames().filter((f) => f !== page.mainFrame()),
            ];
            const allVideoElements: any[] = [];

            for (
                let frameIndex = 0;
                frameIndex < allFrames.length;
                frameIndex++
            ) {
                const frame = allFrames[frameIndex];
                const frameName =
                    frameIndex === 0 ? "main" : `iframe-${frameIndex}`;

                try {
                    this.logger.info(
                        `🔍 Checking ${frameName} frame for video elements...`
                    );

                    const videoElements = await frame.evaluate(() => {
                        const videos: any[] = [];

                        // Check video tags
                        document.querySelectorAll("video").forEach((video) => {
                            const videoEl = video as HTMLVideoElement;
                            if (
                                videoEl.src &&
                                videoEl.src.length > 0 &&
                                !videoEl.src.startsWith("blob:")
                            ) {
                                videos.push({
                                    type: "video_src",
                                    url: videoEl.src,
                                    element: "video",
                                });
                            }
                            if (
                                videoEl.currentSrc &&
                                videoEl.currentSrc.length > 0 &&
                                !videoEl.currentSrc.startsWith("blob:")
                            ) {
                                videos.push({
                                    type: "video_currentSrc",
                                    url: videoEl.currentSrc,
                                    element: "video",
                                });
                            }
                        });

                        // Check for JWPlayer setup
                        if (typeof (window as any).jwplayer !== "undefined") {
                            try {
                                const instances = (window as any)
                                    .jwplayer()
                                    .getContainer();
                                if (instances) {
                                    const playlist = (window as any)
                                        .jwplayer()
                                        .getPlaylist();
                                    if (playlist && playlist.length > 0) {
                                        playlist.forEach((item: any) => {
                                            if (item.file) {
                                                videos.push({
                                                    type: "jwplayer_file",
                                                    url: item.file,
                                                    element: "jwplayer",
                                                });
                                            }
                                            if (item.sources) {
                                                item.sources.forEach(
                                                    (source: any) => {
                                                        if (source.file) {
                                                            videos.push({
                                                                type: "jwplayer_source",
                                                                url: source.file,
                                                                element:
                                                                    "jwplayer",
                                                            });
                                                        }
                                                    }
                                                );
                                            }
                                        });
                                    }
                                }
                            } catch (e) {
                                console.log("JWPlayer check failed:", e);
                            }
                        }

                        // Check for source elements
                        document
                            .querySelectorAll("source")
                            .forEach((source) => {
                                const sourceEl = source as HTMLSourceElement;
                                if (sourceEl.src && sourceEl.src.length > 0) {
                                    videos.push({
                                        type: "source_src",
                                        url: sourceEl.src,
                                        element: "source",
                                    });
                                }
                            });

                        return videos;
                    });

                    if (videoElements && videoElements.length > 0) {
                        this.logger.info(
                            `🎬 FOUND ${
                                videoElements.length
                            } VIDEO URLs IN ${frameName.toUpperCase()}:`
                        );

                        for (const videoInfo of videoElements) {
                            this.logger.info(
                                `  🎯 ${videoInfo.type} (${videoInfo.element}): ${videoInfo.url}`
                            );
                            allVideoElements.push({
                                ...videoInfo,
                                frame: frameName,
                                frameUrl: frame.url(),
                            });
                        }
                    }
                } catch (error) {
                    this.logger.debug(
                        `Error checking frame ${frameIndex}: ${error}`
                    );
                }
            }

            if (allVideoElements.length === 0) {
                this.logger.info("❌ No video URLs found in DOM");
            }

            return allVideoElements;
        } catch (error) {
            this.logger.warn(`Error extracting video URLs from DOM: ${error}`);
            return [];
        }
    }

    async takeScreenshot(
        page: Page,
        filename?: string
    ): Promise<string | null> {
        try {
            const screenshotPath =
                filename || `screenshot_${this.generateTimestamp()}.png`;
            await page.screenshot({ path: screenshotPath });
            this.logger.info(`Screenshot saved: ${screenshotPath}`);
            return screenshotPath;
        } catch (error) {
            this.logger.warn(`Could not take screenshot: ${error}`);
            return null;
        }
    }

    async scrollToElement(page: Page, selector: string): Promise<boolean> {
        try {
            const element = page.locator(selector);
            await element.scrollIntoViewIfNeeded();
            return true;
        } catch (error) {
            this.logger.debug(
                `Could not scroll to element ${selector}: ${error}`
            );
            return false;
        }
    }

    async waitForElement(
        page: Page,
        selector: string,
        timeout: number = 5000
    ): Promise<boolean> {
        try {
            await page.waitForSelector(selector, { timeout });
            return true;
        } catch {
            return false;
        }
    }

    async isElementVisible(page: Page, selector: string): Promise<boolean> {
        try {
            const element = page.locator(selector);
            return await element.isVisible();
        } catch {
            return false;
        }
    }

    async getElementText(page: Page, selector: string): Promise<string | null> {
        try {
            const element = page.locator(selector);
            return await element.textContent();
        } catch {
            return null;
        }
    }

    async clickElement(
        page: Page,
        selector: string,
        timeout: number = 3000
    ): Promise<boolean> {
        try {
            const element = page.locator(selector);
            await element.click({ timeout });
            return true;
        } catch (error) {
            this.logger.debug(`Could not click element ${selector}: ${error}`);
            return false;
        }
    }
}
