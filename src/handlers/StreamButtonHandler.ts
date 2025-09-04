import { Page } from "playwright";
import { Logger } from "winston";
import { createLogger } from "../utils/Logger.js";

export class StreamButtonHandler {
    private logger: Logger;

    constructor() {
        this.logger = createLogger("StreamButtonHandler");
    }

    async tryStreamButtonsSequentially(page: Page): Promise<boolean> {
        this.logger.info("Trying stream buttons sequentially...");

        // Define stream button selectors in order of preference
        const streamButtonSelectors = [
            'a[data-localize="iozdmrmvqd"]', // STREAM TV
            'a[data-localize="vsomupazip"]', // STREAM ST
            'a[data-localize="mppucpwmlr"]', // STREAM SB
            'a[data-localize="fnxaxpqtvb"]', // STREAM EA
            'a[data-localize="zvaqabbhei"]', // STREAM LU
            'a[data-localize="ctslwegyea"]', // STREAM JK
            "a.wp-btn-iframe__shortcode", // Generic fallback
        ];

        for (let i = 0; i < streamButtonSelectors.length; i++) {
            const selector = streamButtonSelectors[i];

            try {
                this.logger.info(
                    `Trying stream button ${i + 1}/${
                        streamButtonSelectors.length
                    }: ${selector}`
                );

                // Check if button exists
                const elements = page.locator(selector);
                const count = await elements.count();

                if (count === 0) {
                    this.logger.info(
                        `No buttons found with selector: ${selector}`
                    );
                    continue;
                }

                // Try each button with this selector
                for (let j = 0; j < count; j++) {
                    try {
                        // Check if page is still active
                        if (page.isClosed()) {
                            this.logger.warn(
                                "Page is closed, stopping button attempts"
                            );
                            return false;
                        }

                        const button = elements.nth(j);
                        const isVisible = await button.isVisible();

                        if (!isVisible) {
                            continue;
                        }

                        const buttonText = (await button.textContent()) || "";
                        const dataLocalize =
                            (await button.getAttribute("data-localize")) || "";

                        this.logger.info(
                            `Clicking button: ${buttonText} (${dataLocalize})`
                        );

                        // Click the button with human-like behavior
                        try {
                            // Wait longer to mimic human reading/decision time
                            await page.waitForTimeout(2000);

                            // Scroll button into view (human-like behavior)
                            await button.scrollIntoViewIfNeeded();
                            await page.waitForTimeout(500);

                            // Hover over button first (human-like behavior)
                            try {
                                await button.hover({ timeout: 3000 });
                                await page.waitForTimeout(800);
                            } catch {
                                // Hover not critical
                            }

                            // Click with longer timeout
                            this.logger.info(
                                `Clicking button: ${buttonText} with human-like behavior`
                            );
                            await button.click({ timeout: 10000 });

                            // Wait for click to register and page to respond
                            await page.waitForTimeout(1500);

                            return true; // Successfully clicked a button
                        } catch (clickError) {
                            this.logger.warn(
                                `Failed to click button ${buttonText}: ${clickError}`
                            );
                            continue;
                        }
                    } catch (error) {
                        this.logger.warn(
                            `Failed to click button ${
                                j + 1
                            } with selector ${selector}: ${error}`
                        );
                        continue;
                    }
                }
            } catch (error) {
                this.logger.warn(`Error with selector ${selector}: ${error}`);
                continue;
            }
        }

        return false;
    }

    async clickSpecificStreamButton(
        page: Page,
        selector: string
    ): Promise<boolean> {
        try {
            this.logger.info(
                `Attempting to click specific stream button: ${selector}`
            );

            const elements = page.locator(selector);
            const count = await elements.count();

            if (count === 0) {
                this.logger.info(`No button found with selector: ${selector}`);
                return false;
            }

            const button = elements.first();
            const isVisible = await button.isVisible();

            if (!isVisible) {
                this.logger.info(`Button not visible: ${selector}`);
                return false;
            }

            const buttonText = (await button.textContent()) || "";
            this.logger.info(`Clicking specific button: ${buttonText}`);

            // Human-like clicking behavior
            await page.waitForTimeout(1000);
            await button.scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);

            try {
                await button.hover({ timeout: 2000 });
                await page.waitForTimeout(500);
            } catch {
                // Hover not critical
            }

            await button.click({ timeout: 5000 });
            await page.waitForTimeout(1000);

            this.logger.info(`Successfully clicked button: ${buttonText}`);
            return true;
        } catch (error) {
            this.logger.error(
                `Failed to click specific stream button ${selector}: ${error}`
            );
            return false;
        }
    }

    async findAvailableStreamButtons(page: Page): Promise<string[]> {
        const streamButtonSelectors = [
            'a[data-localize="iozdmrmvqd"]', // STREAM TV
            'a[data-localize="vsomupazip"]', // STREAM ST
            'a[data-localize="mppucpwmlr"]', // STREAM SB
            'a[data-localize="fnxaxpqtvb"]', // STREAM EA
            'a[data-localize="zvaqabbhei"]', // STREAM LU
            'a[data-localize="ctslwegyea"]', // STREAM JK
            "a.wp-btn-iframe__shortcode", // Generic fallback
        ];

        const availableButtons: string[] = [];

        for (const selector of streamButtonSelectors) {
            try {
                const elements = page.locator(selector);
                const count = await elements.count();

                if (count > 0) {
                    const isVisible = await elements.first().isVisible();
                    if (isVisible) {
                        availableButtons.push(selector);
                        const buttonText =
                            (await elements.first().textContent()) || "";
                        this.logger.info(
                            `Found available stream button: ${buttonText} (${selector})`
                        );
                    }
                }
            } catch (error) {
                this.logger.debug(
                    `Error checking selector ${selector}: ${error}`
                );
            }
        }

        this.logger.info(
            `Found ${availableButtons.length} available stream buttons`
        );
        return availableButtons;
    }
}
