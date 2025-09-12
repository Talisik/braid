# F2MoviesDL

A TypeScript-based automated video downloader for F2Movies.to that uses browser automation to capture and download high-quality video streams.

## Features

- **Automated Browser Control**: Uses Playwright Firefox for stealth browsing
- **Smart Play Button Detection**: Automatically finds and clicks video play buttons
- **Network Request Monitoring**: Captures M3U8 video stream URLs in real-time
- **Ad/Popup Blocking**: Advanced network-level blocking and DOM-based popup handling
- **Quality Selection**: Automatically selects the highest quality video stream
- **M3U8 Processing**: Downloads master playlists and extracts video segments
- **Cloudflare Bypass**: Uses browser context for authenticated M3U8 downloads
- **Segment Downloading**: Parallel download of video segments using curl with proper headers
- **Video Conversion**: Converts segments to MP4 using FFmpeg
- **TypeScript**: Fully typed codebase for better development experience

## Architecture

The project follows an object-oriented architecture with clear separation of concerns:

```
├── core/           # Main orchestration logic
├── browsers/       # Browser automation and configuration
├── monitors/       # Network request/response monitoring
├── detectors/      # Play button and element detection
├── filters/        # Stream filtering and validation
├── parsers/        # M3U8 playlist parsing and processing
├── downloaders/    # Video segment downloading
├── converters/     # Video format conversion
└── types/          # TypeScript type definitions
```

## Requirements

- **Node.js**: v18 or higher
- **FFmpeg**: For video conversion
- **curl**: For segment downloading (usually pre-installed)
- **Playwright**: Automatically installs browser binaries

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd f2moviesdl
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Install Playwright browsers**:
   ```bash
   npx playwright install firefox
   ```

4. **Install FFmpeg**:
   - **Ubuntu/Debian**: `sudo apt install ffmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Windows**: Download from https://ffmpeg.org/

5. **Build the project**:
   ```bash
   npm run build
   ```

## Usage

### Basic Usage

```typescript
import { F2MoviesDL } from './index';

const downloader = new F2MoviesDL();

// Download a video
await downloader.downloadVideo(
  'https://f2movies.to/movie/your-movie-url',
  'output-filename.mp4'
);
```

### Configuration Options

```typescript
const downloader = new F2MoviesDL({
  // Browser settings
  headless: false,          // Show browser window
  timeout: 30000,           // Page timeout in ms
  
  // Download settings
  outputDir: './downloads', // Output directory
  maxConcurrentDownloads: 3,// Parallel downloads
  retryAttempts: 3,         // Download retry attempts
  
  // Quality preferences
  preferredQuality: '1080p',// Preferred video quality
  
  // Monitoring settings
  captureResponses: true,   // Capture network responses
  logRequests: false        // Log network requests
});
```

### Advanced Usage

```typescript
// Custom configuration
const config = {
  browser: {
    headless: true,
    timeout: 60000
  },
  download: {
    outputDir: './videos',
    maxConcurrentDownloads: 5
  }
};

const downloader = new F2MoviesDL(config);

// Download with custom options
try {
  const result = await downloader.downloadVideo(
    'https://f2movies.to/movie/example',
    'my-video.mp4'
  );
  
  if (result) {
    console.log('Download completed:', result);
  } else {
    console.log('Download failed');
  }
} catch (error) {
  console.error('Error:', error);
}
```

## API Reference

### Main Classes

#### `F2MoviesDL`
Main orchestration class that coordinates the entire download process.

```typescript
class F2MoviesDL {
  constructor(config?: F2MoviesDLConfig)
  async downloadVideo(url: string, outputFileName: string): Promise<string | null>
}
```

#### `FirefoxBrowser`
Handles browser automation with stealth features and ad blocking.

```typescript
class FirefoxBrowser {
  async launch(): Promise<void>
  async navigate(url: string): Promise<Page>
  async close(): Promise<void>
}
```

#### `NetworkMonitor`
Monitors and captures network requests and responses.

```typescript
class NetworkMonitor {
  startMonitoring(page: Page): void
  stopMonitoring(): void
  getM3U8Requests(): NetworkRequest[]
  getM3U8Content(url: string): string | null
}
```

#### `M3U8Processor`
Processes M3U8 playlists and orchestrates video download.

```typescript
class M3U8Processor {
  async processM3U8WithBrowser(
    m3u8Url: string, 
    outputFileName: string, 
    page: Page, 
    networkMonitor?: NetworkMonitor
  ): Promise<string | null>
}
```

## Scripts

- `npm run build` - Build TypeScript to JavaScript
- `npm run test:download` - Run download test
- `npm run clean` - Clean build artifacts
- `npm start` - Run the built application

## Configuration Files

### `tsconfig.json`
TypeScript compiler configuration with strict type checking and ES2022 target.

### `package.json`
Project metadata and dependencies including Playwright, TypeScript, and Node.js types.

## Troubleshooting

### Common Issues

1. **Browser fails to launch**:
   - Ensure Playwright browsers are installed: `npx playwright install firefox`
   - Check if Firefox is properly installed

2. **FFmpeg not found**:
   - Install FFmpeg using your system's package manager
   - Ensure FFmpeg is in your PATH

3. **Download fails with 403 errors**:
   - The site may have updated its protection mechanisms
   - Try running with `headless: false` to see what's happening

4. **Segments fail to download**:
   - Check your internet connection
   - Verify that curl is installed and accessible

5. **Video conversion fails**:
   - Ensure FFmpeg is properly installed
   - Check that downloaded segments are valid

### Debug Mode

Run with debug logging enabled:

```typescript
const downloader = new F2MoviesDL({
  logRequests: true,
  headless: false
});
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Build and test: `npm run build && npm run test`
5. Commit your changes: `git commit -am 'Add feature'`
6. Push to the branch: `git push origin feature-name`
7. Submit a pull request

## License

This project is for educational purposes only. Please respect copyright laws and terms of service of the websites you interact with.

## Disclaimer

This tool is intended for educational and research purposes only. Users are responsible for ensuring their usage complies with applicable laws and website terms of service. The developers are not responsible for any misuse of this software.

## Technical Details

### Browser Automation
- Uses Playwright Firefox with stealth configurations
- Implements comprehensive popup and ad blocking
- Simulates human-like behavior with random delays

### Network Monitoring
- Captures M3U8 playlist requests in real-time
- Filters out advertising and tracking requests
- Stores response content for later processing

### Video Processing
- Parses master M3U8 playlists to find quality variants
- Downloads segment playlists and extracts video URLs
- Uses curl with proper headers for authenticated downloads
- Converts segments to MP4 using FFmpeg with optimal settings

### Error Handling
- Comprehensive error handling and retry mechanisms
- Graceful fallbacks for network failures
- Detailed logging for troubleshooting
