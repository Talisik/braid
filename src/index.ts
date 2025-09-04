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

import { VideoDownloader } from './VideoDownloader';

// Main exports - Primary classes users will interact with
export { VideoDownloader } from './VideoDownloader';
export { M3U8Processor } from './utils/M3U8Processor';

// Browser implementations
export { FirefoxBrowser } from './browsers/FirefoxBrowser';
export { BraveBrowser } from './browsers/BraveBrowser';
export { ChromiumBrowser } from './browsers/ChromiumBrowser';

// Specialized handlers for different scenarios
export { RouteHandler } from './handlers/RouteHandler';
export { RequestHandler } from './handlers/RequestHandler';
export { StreamButtonHandler } from './handlers/StreamButtonHandler';
export { PopupHandler } from './handlers/PopupHandler';
export { PlayButtonHandler } from './handlers/PlayButtonHandler';

// Utility classes for advanced usage
export { IFrameMonitor } from './utils/IFrameMonitor';
export { AdBlocker } from './utils/AdBlocker';
export { NetworkMonitor } from './utils/NetworkMonitor';
export { StreamHandler } from './utils/StreamHandler';

// Helper classes for browser automation
export { BaseHelper } from './helpers/BaseHelper';
export { BrowserHelper } from './helpers/BrowserHelper';
export { DownloadHelper } from './helpers/DownloadHelper';
export { PageHelper } from './helpers/PageHelper';

// Type definitions for TypeScript users
export * from './types';

// Default export for convenience
export default VideoDownloader;
