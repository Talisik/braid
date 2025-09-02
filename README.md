# Web Navigator Backend Package

A TypeScript backend package for web navigation and video processing, converted from the Python pokemon-downloader.

## 🚀 How to Run This Package

### Prerequisites

1. **Install Firefox browser for Playwright:**
   ```bash
   npx playwright install firefox
   ```

2. **Install FFmpeg (required for video processing):**
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install ffmpeg
   
   # macOS
   brew install ffmpeg
   
   # Windows
   choco install ffmpeg
   ```

### Method 1: Run the Usage Example (Recommended)

The simplest way to test the package:

```bash
# Make sure you're in the project directory
cd /home/mark/web-navigator

# Run the example
node usage-example.js
```

This will:
- Launch Firefox browser
- Navigate to the configured URL
- Attempt to find and download video streams
- Save videos to the `downloads/` folder

### Method 2: Use as a Node.js Module

Create your own script:

```javascript
// my-script.js
const { VideoDownloader } = require('./dist/index.js');

async function myDownload() {
  const downloader = new VideoDownloader({
    browserType: 'firefox',
    url: 'https://your-target-site.com',
    downloadConfig: {
      outputDir: 'my-downloads',
      maxWorkers: 2
    }
  });
  
  const success = await downloader.main();
  console.log('Download success:', success);
}

myDownload();
```

Then run: `node my-script.js`

### Method 3: Use Individual Components

```javascript
// advanced-usage.js
const { M3U8Processor, FirefoxBrowser } = require('./dist/index.js');

async function customDownload() {
  // Use just the M3U8 processor
  const processor = new M3U8Processor({
    outputDir: 'videos',
    maxWorkers: 4
  });
  
  await processor.downloadM3U8Stream(
    'https://example.com/playlist.m3u8',
    { 'Referer': 'https://example.com' },
    'my-video.mp4'
  );
}
```

### Method 4: Development Mode (TypeScript)

If you want to modify the source code:

```bash
# Run TypeScript directly
npm run dev

# Or compile and run
npm run build
npm start
```

### Method 5: Install as NPM Package (Optional)

You can install this as a local package:

```bash
# From the project directory
npm pack  # Creates web-navigator-backend-1.0.0.tgz

# In another project
npm install /path/to/web-navigator-backend-1.0.0.tgz

# Then use it
const { VideoDownloader } = require('web-navigator-backend');
```

## 📋 Configuration Options

### Basic Configuration
```javascript
const config = {
  browserType: 'firefox',  // 'firefox', 'chromium', 'brave'
  url: 'https://target-site.com',
  
  browserConfig: {
    headless: false,        // true for background mode
    viewport: { width: 1920, height: 1080 }
  },
  
  downloadConfig: {
    outputDir: 'downloads',
    maxWorkers: 4,          // Parallel download threads
    timeout: 30000,         // Request timeout
    retries: 3              // Retry attempts
  },
  
  loggerConfig: {
    level: 'info'           // 'error', 'warn', 'info', 'debug'
  }
};
```

### Advanced M3U8 Processing
```javascript
const { M3U8Processor } = require('./dist/index.js');

const processor = new M3U8Processor({
  outputDir: 'downloads',
  maxWorkers: 6,
  ffmpegPath: '/usr/bin/ffmpeg'  // Custom FFmpeg path
});

// Download with progress tracking
await processor.downloadM3U8Stream(
  'https://example.com/stream.m3u8',
  { 'User-Agent': 'Mozilla/5.0...' },
  'output.mp4',
  4,  // workers
  (current, total) => console.log(`Progress: ${current}/${total}`)
);
```

## 🛠️ Available Scripts

```bash
npm run build      # Compile TypeScript to JavaScript
npm run dev        # Run in development mode
npm start          # Run compiled version
npm run clean      # Clean build directory
npm test           # Run Playwright tests
```

## 📁 Output Structure

Downloads will be saved to:
```
web-navigator/
├── downloads/           ← Video files saved here
│   ├── video_1693123456.mp4
│   └── video_1693123789.mp4
├── dist/               ← Compiled package
├── src/                ← TypeScript source code
├── usage-example.js    ← Ready-to-run example
├── package.json        ← Package configuration
└── README.md           ← This file
```

## 🔧 Troubleshooting

### Common Issues:

1. **Firefox not found:**
   ```bash
   npx playwright install firefox
   ```

2. **FFmpeg not found:**
   ```bash
   which ffmpeg  # Check if installed
   sudo apt install ffmpeg  # Install if missing
   ```

3. **Permission errors:**
   ```bash
   mkdir downloads  # Create downloads folder
   chmod 755 downloads
   ```

4. **Module not found:**
   ```bash
   npm run build  # Recompile if needed
   ```

## 🎯 Quick Test

Run this to test everything works:

```bash
# Test the package
node -e "
const { VideoDownloader } = require('./dist/index.js');
console.log('✅ Package loaded successfully!');
console.log('Available:', Object.keys(require('./dist/index.js')));
"
```

## 🚀 Production Usage

For production use, consider:
- Set `headless: true` for background operation
- Adjust `maxWorkers` based on your system
- Use proper error handling and logging
- Monitor download folder size

The package is ready to use! 🎉
