import { Page } from "playwright";
import { Logger } from "winston";
import { createLogger } from "../utils/Logger.js";

export class PopupHandler {
    private logger: Logger;

    constructor() {
        this.logger = createLogger("PopupHandler");
    }

    async closePopups(page: Page): Promise<void> {
        this.logger.info("Checking for popups and modals to close...");

        const popupSelectors = [
            // Common modal close buttons
            ".modal-close",
            ".close-modal",
            ".modal .close",
            ".popup-close",
            ".close-popup",
            ".popup .close",

            // Generic close buttons
            '[aria-label*="close" i]',
            '[title*="close" i]',
            '[data-dismiss="modal"]',
            "[data-close]",

            // Common close button patterns
            "button.close",
            ".close-btn",
            ".btn-close",
            "#close-btn",
            ".close-button",

            // X buttons
            ".fa-times",
            ".fa-close",
            ".icon-close",
            ".icon-times",

            // Overlay close
            ".overlay-close",
            ".backdrop-close",

            // Ad close buttons
            ".ad-close",
            ".advertisement-close",
            ".banner-close",

            // Video player close buttons
            ".video-close",
            ".player-close",

            // Newsletter/subscription popups
            ".newsletter-close",
            ".subscription-close",
            ".email-close",

            // Cookie consent
            ".cookie-close",
            ".gdpr-close",
            ".consent-close",

            // Skip buttons for ads
            ".skip-ad",
            ".skip-button",
            '[aria-label*="skip" i]',

            // Continue buttons that might close popups
            ".continue-btn",
            ".proceed-btn",
            '[onclick*="proceed" i]',
        ];

        for (const selector of popupSelectors) {
            try {
                const elements = page.locator(selector);
                const count = await elements.count();

                if (count > 0) {
                    for (let i = 0; i < count; i++) {
                        try {
                            const element = elements.nth(i);

                            // Check if element is visible and clickable
                            const isVisible = await element.isVisible();
                            if (!isVisible) continue;

                            this.logger.info(
                                `Clicking popup close button: ${selector}`
                            );
                            await element.click({ timeout: 3000 });

                            // Wait a moment for the popup to close
                            await page.waitForTimeout(500);
                        } catch (error) {
                            this.logger.debug(
                                `Failed to click popup element ${i} with selector ${selector}: ${error}`
                            );
                        }
                    }
                }
            } catch (error) {
                this.logger.debug(
                    `Error with popup selector ${selector}: ${error}`
                );
            }
        }

        // Also handle page dialogs (alert, confirm, prompt)
        page.on("dialog", async (dialog) => {
            this.logger.info(
                `Handling dialog: ${dialog.type()} - ${dialog.message()}`
            );
            await dialog.dismiss();
        });

        // Close any new popup windows/tabs
        page.context().on("page", async (newPage) => {
            this.logger.info("New popup page detected, closing it");
            try {
                await newPage.close();
            } catch (error) {
                this.logger.debug(`Failed to close popup page: ${error}`);
            }
        });

        this.logger.info("Popup cleanup completed");
    }

    async closeSpecificPopup(page: Page, selector: string): Promise<boolean> {
        try {
            const element = page.locator(selector);
            const isVisible = await element.isVisible();

            if (isVisible) {
                this.logger.info(`Closing specific popup: ${selector}`);
                await element.click({ timeout: 3000 });
                await page.waitForTimeout(500);
                return true;
            }

            return false;
        } catch (error) {
            this.logger.debug(
                `Failed to close specific popup ${selector}: ${error}`
            );
            return false;
        }
    }

    async waitAndClosePopups(
        page: Page,
        timeout: number = 5000
    ): Promise<void> {
        this.logger.info(
            `Waiting ${timeout}ms for popups to appear and closing them...`
        );

        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            await this.closePopups(page);
            await page.waitForTimeout(1000);
        }

        this.logger.info("Popup monitoring period completed");
    }
}
