# Braid Video Downloader

A powerful TypeScript library for downloading videos from web pages, including M3U8/HLS streams, with intelligent browser automation and stream detection.

## Features

- 🎬 **Smart Video Detection**: Automatically detects video streams on web pages
- 📺 **M3U8/HLS Support**: Download and convert HLS streams to MP4
- 🌐 **Multi-Browser Support**: Works with Chromium, Firefox, and Brave
- 🚀 **Concurrent Downloads**: Parallel segment downloading for faster speeds
- 🔄 **Retry Logic**: Robust error handling with automatic retries
- 🎯 **Quality Selection**: Automatically selects the best available quality
- 🛡️ **Ad Blocking**: Built-in ad blocker for cleaner browsing
- 📱 **Mobile Simulation**: Can simulate mobile devices for mobile-specific streams
- 🔧 **CLI Interface**: Command-line tool for direct usage

## Installation

```bash
npm install braid-video-downloader
```

### Prerequisites

- **Node.js** 16+ 
- **curl** (for reliable downloads)

> **Note:** FFmpeg is now included automatically! No manual installation required.

## Quick Start

### Library Usage

```typescript
import { VideoDownloader, M3U8Processor } from 'braid-video-downloader';

// Download video from a web page
const downloader = new VideoDownloader({
  browserType: 'chromium',
  url: 'https://example.com/video-page',
  downloadConfig: {
    outputDir: 'downloads',
    maxWorkers: 4,
    retries: 3
  }
});

const success = await downloader.main();
console.log(success ? 'Download completed!' : 'Download failed');
```

### CLI Usage

```bash
# Download video from a web page
braid download "https://example.com/video-page" --output downloads

# Download M3U8 stream directly
braid m3u8 "https://example.com/stream.m3u8" --output my-video

# Use different browser
braid download "https://example.com/video" --browser firefox

# Increase concurrent workers
braid download "https://example.com/video" --workers 8
```

## Electron Compatibility

✅ **Fully compatible with Electron applications!**

This package includes automatic handling for Electron-specific issues like module resolution and FFmpeg path detection. See [ELECTRON.md](./ELECTRON.md) for detailed integration guide.

## API Reference

### VideoDownloader

Main class for downloading videos from web pages.

```typescript
import { VideoDownloader } from 'braid-video-downloader';

const downloader = new VideoDownloader({
  browserType: 'chromium', // 'firefox' | 'chromium' | 'brave'
  url: 'https://example.com/video-page',
  downloadConfig: {
    outputDir: 'downloads',     // Output directory
    maxWorkers: 4,              // Concurrent downloads
    timeout: 30000,             // Request timeout (ms)
    retries: 3                  // Retry attempts
  },
  browserConfig: {
    headless: true,             // Run headless browser
    viewport: { width: 1920, height: 1080 }
  },
  loggerConfig: {
    level: 'info'               // 'error' | 'warn' | 'info' | 'debug'
  }
});

await downloader.main();
```

### M3U8Processor

Direct M3U8/HLS stream processor.

```typescript
import { M3U8Processor } from 'braid-video-downloader';

const processor = new M3U8Processor({
  outputDir: 'downloads',
  maxWorkers: 4,
  timeout: 30000,
  retries: 3,
  ffmpegPath: 'ffmpeg'          // Custom FFmpeg path
});

// Process M3U8 with custom headers
await processor.processM3U8(
  'https://example.com/stream.m3u8',
  {
    'Referer': 'https://example.com/',
    'User-Agent': 'Custom User Agent'
  },
  'output-filename' // Optional custom filename
);
```

### Browser Classes

For advanced browser automation:

```typescript
import { ChromiumBrowser, FirefoxBrowser, BraveBrowser } from 'braid-video-downloader';

const browser = new ChromiumBrowser({
  headless: false,
  viewport: { width: 1280, height: 720 }
});

await browser.launch();
const page = await browser.newPage();
await page.goto('https://example.com');
// ... custom automation logic
await browser.close();
```

## Configuration Options

### BrowserConfig

```typescript
interface BrowserConfig {
  headless?: boolean;           // Run browser in headless mode (default: true)
  viewport?: {                 // Browser viewport size
    width: number;
    height: number;
  };
  userAgent?: string;          // Custom user agent
  ignoreHTTPSErrors?: boolean; // Ignore SSL certificate errors
  javaScriptEnabled?: boolean; // Enable/disable JavaScript
}
```

### DownloadConfig

```typescript
interface DownloadConfig {
  outputDir?: string;          // Output directory (default: 'downloads')
  maxWorkers?: number;         // Concurrent downloads (default: 4)
  timeout?: number;            // Request timeout in ms (default: 30000)
  retries?: number;            // Retry attempts (default: 3)
}
```

## CLI Reference

### Global Options

```bash
braid --help                 # Show help
braid --version             # Show version
```

### Download Command

```bash
braid download <url> [options]

Options:
  -b, --browser <type>       Browser type: firefox, chromium, brave (default: chromium)
  -o, --output <dir>         Output directory (default: downloads)
  -w, --workers <number>     Max concurrent workers (default: 4)
  -t, --timeout <ms>         Request timeout in milliseconds (default: 30000)
  -r, --retries <number>     Number of retries per segment (default: 3)
  --headless                 Run browser in headless mode (default: true)
  --no-headless             Run browser in headed mode
```

### M3U8 Command

```bash
braid m3u8 <url> [options]

Options:
  -o, --output <filename>    Output filename (without extension)
  -w, --workers <number>     Max concurrent workers (default: 4)
  -t, --timeout <ms>         Request timeout in milliseconds (default: 30000)
  -r, --retries <number>     Number of retries per segment (default: 3)
  --ffmpeg <path>           Path to ffmpeg binary (default: ffmpeg)
```

## Examples

### Basic Video Download

```typescript
import { VideoDownloader } from 'braid-video-downloader';

async function downloadVideo() {
  const downloader = new VideoDownloader({
    browserType: 'chromium',
    url: 'https://example.com/video-page'
  });
  
  const success = await downloader.main();
  if (success) {
    console.log('Video downloaded successfully!');
  }
}
```

### M3U8 Stream Download

```typescript
import { M3U8Processor } from 'braid-video-downloader';

async function downloadStream() {
  const processor = new M3U8Processor({
    outputDir: './videos',
    maxWorkers: 8
  });
  
  await processor.processM3U8(
    'https://example.com/stream.m3u8',
    {
      'Referer': 'https://example.com/',
      'Origin': 'https://example.com'
    }
  );
}
```

### Custom Browser Automation

```typescript
import { ChromiumBrowser, StreamHandler } from 'braid-video-downloader';

async function customDownload() {
  const browser = new ChromiumBrowser({ headless: false });
  await browser.launch();
  
  const page = await browser.newPage();
  await page.goto('https://example.com/video');
  
  // Wait for video to load
  await page.waitForSelector('video');
  
  // Use StreamHandler to detect and download streams
  const streamHandler = new StreamHandler();
  const streams = await streamHandler.detectStreams(page);
  
  if (streams.length > 0) {
    // Process the first detected stream
    const processor = new M3U8Processor();
    await processor.processM3U8(streams[0].url, streams[0].headers);
  }
  
  await browser.close();
}
```

## Advanced Features

### Custom Headers and Authentication

```typescript
const processor = new M3U8Processor();

await processor.processM3U8(
  'https://protected-stream.com/video.m3u8',
  {
    'Authorization': 'Bearer your-token',
    'Referer': 'https://protected-stream.com/',
    'User-Agent': 'Custom User Agent'
  }
);
```

### Quality Selection

The library automatically selects the highest quality stream available, but you can customize this behavior by extending the M3U8Processor class.

### Error Handling

```typescript
import { VideoDownloader } from 'braid-video-downloader';

try {
  const downloader = new VideoDownloader({
    browserType: 'chromium',
    url: 'https://example.com/video'
  });
  
  const success = await downloader.main();
  
  if (!success) {
    console.error('Download failed - check logs for details');
  }
} catch (error) {
  console.error('Fatal error:', error.message);
}
```

## Troubleshooting

### Common Issues

1. **Browser launch fails**: Run `npx playwright install` to install browser binaries
2. **Network errors**: Some sites require specific headers - check browser dev tools
3. **Slow downloads**: Increase `maxWorkers` but be mindful of server limits
4. **Progress bar issues**: Progress bar requires terminal support - disable with `--quiet` flag if needed

### Debug Mode

Enable debug logging to see detailed information:

```typescript
const downloader = new VideoDownloader({
  // ... other config
  loggerConfig: {
    level: 'debug'
  }
});
```

### Manual Browser Mode

For debugging, run with headed browser:

```bash
braid download "https://example.com/video" --no-headless
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT License - see LICENSE file for details.