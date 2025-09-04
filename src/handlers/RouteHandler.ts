import { Route, Request } from "playwright";
import { AdBlocker } from "../utils/AdBlocker.js";
import { Logger } from "winston";
import { createLogger } from "../utils/Logger.js";

export class RouteHandler {
    private adBlocker: AdBlocker;
    private logger: Logger;

    constructor() {
        this.adBlocker = new AdBlocker();
        this.logger = createLogger("RouteHandler");
    }

    async handleRoute(route: Route, request: Request): Promise<void> {
        const url = request.url();

        if (this.adBlocker.blockWebsites(url)) {
            this.logger.debug(`Blocked: ${url}`);
            await route.abort();
        } else {
            await route.continue();
        }
    }

    getAdBlocker(): AdBlocker {
        return this.adBlocker;
    }
}
