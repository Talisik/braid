/**
 * Main entry point for the web navigator backend package
 * TypeScript equivalent of main.py
 */

export { VideoDownloader } from './VideoDownloader';

// Browser exports
export { FirefoxBrowser } from './browsers/FirefoxBrowser';
export { BraveBrowser } from './browsers/BraveBrowser';
export { ChromiumBrowser } from './browsers/ChromiumBrowser';

// Handler exports
export { RouteHandler } from './handlers/RouteHandler';
export { RequestHandler } from './handlers/RequestHandler';
export { StreamButtonHandler } from './handlers/StreamButtonHandler';
export { PopupHandler } from './handlers/PopupHandler';
export { PlayButtonHandler } from './handlers/PlayButtonHandler';

// Utility exports
export { M3U8Processor } from './utils/M3U8Processor';
export { IFrameMonitor } from './utils/IFrameMonitor';
export { AdBlocker } from './utils/AdBlocker';
export { NetworkMonitor } from './utils/NetworkMonitor';
export { StreamHandler } from './utils/StreamHandler';

// Helper exports
export { BaseHelper } from './helpers/BaseHelper';
export { BrowserHelper } from './helpers/BrowserHelper';
export { DownloadHelper } from './helpers/DownloadHelper';
export { PageHelper } from './helpers/PageHelper';

// Types
export * from './types';
