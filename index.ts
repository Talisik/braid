// WeebDL - Main Package Export
// OOP-organized anime video downloader with Firefox browser automation

// Core Classes
export { WeebDL } from './core/WeebDL.js';

// Browser Classes  
export { FirefoxBrowser } from './browsers/FirefoxBrowser.js';

// Monitor Classes
export { NetworkMonitor } from './monitors/NetworkMonitor.js';

// Parser Classes
export { M3U8Parser } from './parsers/M3U8Parser.js';
export { M3U8Processor } from './parsers/M3U8Processor.js';

// Downloader Classes
export { CurlDownloader } from './downloaders/CurlDownloader.js';
export { SegmentDownloader } from './downloaders/SegmentDownloader.js';

// Converter Classes
export { FFmpegConverter } from './converters/FFmpegConverter.js';

// Filter Classes
export { StreamFilter } from './filters/StreamFilter.js';

// Types and Interfaces
export * from './types/index.js';

// Default export for convenience
export { WeebDL as default } from './core/WeebDL.js';
