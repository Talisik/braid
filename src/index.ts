/**
 * Braid Video Downloader - A powerful TypeScript library for downloading videos from web pages
 *
 * @example
 * ```typescript
 * import { VideoDownloader, M3U8Processor } from 'braid-video-downloader';
 *
 * // Download video from a web page
 * const downloader = new VideoDownloader({
 *   browserType: 'chromium',
 *   url: 'https://example.com/video-page',
 *   downloadConfig: { outputDir: 'downloads' }
 * });
 * await downloader.start();
 *
 * // Process M3U8 stream directly
 * const processor = new M3U8Processor({ outputDir: 'downloads' });
 * await processor.processM3U8('https://example.com/stream.m3u8', {});
 * ```
 */

import { VideoDownloader } from "./VideoDownloader.js";

// Main exports - Primary classes users will interact with
export { VideoDownloader } from "./VideoDownloader.js";
export { M3U8Processor } from "./utils/M3U8Processor.js";

// Browser implementations
export { FirefoxBrowser } from "./browsers/FirefoxBrowser.js";
export { BraveBrowser } from "./browsers/BraveBrowser.js";
export { ChromiumBrowser } from "./browsers/ChromiumBrowser.js";

// Specialized handlers for different scenarios
export { RouteHandler } from "./handlers/RouteHandler.js";
export { RequestHandler } from "./handlers/RequestHandler.js";
export { StreamButtonHandler } from "./handlers/StreamButtonHandler.js";
export { PopupHandler } from "./handlers/PopupHandler.js";
export { PlayButtonHandler } from "./handlers/PlayButtonHandler.js";

// Utility classes for advanced usage
export { IFrameMonitor } from "./utils/IFrameMonitor.js";
export { AdBlocker } from "./utils/AdBlocker.js";
export { NetworkMonitor } from "./utils/NetworkMonitor.js";
export { StreamHandler } from "./utils/StreamHandler.js";

// Helper classes for browser automation
export { BaseHelper } from "./helpers/BaseHelper.js";
export { BrowserHelper } from "./helpers/BrowserHelper.js";
export { DownloadHelper } from "./helpers/DownloadHelper.js";
export { PageHelper } from "./helpers/PageHelper.js";

// Type definitions for TypeScript users
export * from "./types/index.js";

// Default export for convenience
export default VideoDownloader;
