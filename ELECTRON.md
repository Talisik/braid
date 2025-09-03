# Electron Compatibility Guide

This guide helps you integrate `braid-video-downloader` into Electron applications, addressing common issues and providing best practices.

## Common Issues and Solutions

### 1. Package.json Resolution Error

**Error:** `Error: Cannot find module '../../../package.json'`

**Cause:** Electron applications have different directory structures and module resolution, especially when packaged. Dependencies like `ffmpeg-static` may try to access their `package.json` files using relative paths that don't work in Electron environments.

**Solution:** This package now includes automatic fallback handling for Electron environments. If `ffmpeg-static` fails to load, it will automatically fall back to using the system `ffmpeg` binary.

### 2. FFmpeg Path Configuration

For Electron applications, you have several options for FFmpeg:

#### Option 1: System FFmpeg (Recommended)
```javascript
const { VideoDownloader } = require('braid-video-downloader');

const downloader = new VideoDownloader({
  browserType: 'chromium',
  url: 'https://example.com/video',
  downloadConfig: {
    // Let the package auto-detect or use system ffmpeg
    // ffmpegPath will be automatically determined
  }
});
```

#### Option 2: Bundle FFmpeg with Your Electron App
```javascript
const path = require('path');
const { app } = require('electron');

const ffmpegPath = path.join(
  app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
  'resources',
  'ffmpeg'
);

const downloader = new VideoDownloader({
  browserType: 'chromium',
  url: 'https://example.com/video',
  downloadConfig: {
    ffmpegPath: ffmpegPath
  }
});
```

#### Option 3: External FFmpeg Binary
```javascript
const downloader = new VideoDownloader({
  browserType: 'chromium',
  url: 'https://example.com/video',
  downloadConfig: {
    ffmpegPath: '/path/to/your/ffmpeg' // Absolute path
  }
});
```

### 3. Electron Packaging Configuration

#### For electron-builder:

```json
{
  "build": {
    "asar": true,
    "asarUnpack": [
      "**/ffmpeg*",
      "**/node_modules/playwright/**/*"
    ],
    "files": [
      "**/*",
      "!**/node_modules/playwright/.local-browsers/**/*"
    ]
  }
}
```

#### For electron-packager:

```bash
electron-packager . --asar --asar-unpack="**/ffmpeg*" --asar-unpack="**/node_modules/playwright/**/*"
```

### 4. Playwright in Electron

Playwright (used for browser automation) may need special configuration in Electron:

```javascript
const { VideoDownloader } = require('braid-video-downloader');

const downloader = new VideoDownloader({
  browserType: 'chromium',
  url: 'https://example.com/video',
  browserConfig: {
    // Disable sandbox for Electron compatibility
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true // Usually required in packaged Electron apps
  }
});
```

### 5. Working Directory Issues

If you encounter path-related issues, set the working directory explicitly:

```javascript
const path = require('path');
const { app } = require('electron');

// In your main process
app.on('ready', () => {
  // Set working directory to app path
  process.chdir(path.dirname(app.getAppPath()));
  
  // Now initialize your video downloader
  // ...
});
```

## Testing Your Electron App

1. **Test in Development Mode:**
   ```bash
   npm run electron-dev
   ```

2. **Test Packaged App:**
   ```bash
   npm run build
   npm run electron-pack
   # Test the packaged application
   ```

3. **Test with Different Configurations:**
   - Test with `asar: true` and `asar: false`
   - Test with different FFmpeg path configurations
   - Test in both headless and headed browser modes

## Troubleshooting

### Debug Mode
Enable verbose logging to troubleshoot issues:

```javascript
const downloader = new VideoDownloader({
  // ... your config
  loggerConfig: {
    level: 'debug' // or 'verbose'
  }
});
```

### Common Error Messages

| Error | Solution |
|-------|----------|
| `Cannot find module '../../../package.json'` | Package now handles this automatically |
| `ffmpeg not found` | Install ffmpeg system-wide or specify `ffmpegPath` |
| `Browser executable not found` | Ensure Playwright browsers are properly unpacked |
| `Permission denied` | Add `--no-sandbox` to browser args |

## Example Electron Integration

```javascript
const { app, BrowserWindow } = require('electron');
const { VideoDownloader } = require('braid-video-downloader');

app.whenReady().then(() => {
  // Set up your main window
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Video download function
  async function downloadVideo(url) {
    const downloader = new VideoDownloader({
      browserType: 'chromium',
      url: url,
      browserConfig: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      },
      downloadConfig: {
        outputDir: path.join(app.getPath('downloads'), 'videos')
      },
      loggerConfig: {
        level: 'info'
      }
    });

    try {
      const success = await downloader.main();
      return success;
    } catch (error) {
      console.error('Download failed:', error);
      return false;
    }
  }

  // Expose to renderer process via IPC if needed
  const { ipcMain } = require('electron');
  ipcMain.handle('download-video', async (event, url) => {
    return await downloadVideo(url);
  });
});
```

## Performance Tips

1. **Use headless mode** for better performance in packaged apps
2. **Limit concurrent workers** to avoid overwhelming the system
3. **Use system FFmpeg** when possible for better performance
4. **Cache browser instances** if downloading multiple videos

## Support

If you encounter issues specific to Electron that aren't covered here, please:

1. Check that you're using the latest version of the package
2. Enable debug logging to get more information
3. Test with a minimal Electron app to isolate the issue
4. Report the issue with your Electron version and configuration
