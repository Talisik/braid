/**
 * Example usage of Braid Video Downloader
 * This file demonstrates how users would use the package after installing it
 */

const { VideoDownloader, M3U8Processor } = require('./dist/index.js');

async function exampleUsage() {
  console.log('🎬 Braid Video Downloader Example');
  console.log('================================\n');

  // Example 1: Basic video download from a web page
  console.log('1. Basic Video Download:');
  try {
    const downloader = new VideoDownloader({
      browserType: 'chromium',
      url: 'https://example.com/video-page', // Replace with actual URL
      downloadConfig: {
        outputDir: 'downloads',
        maxWorkers: 4,
        retries: 3
      },
      browserConfig: {
        headless: true
      },
      loggerConfig: {
        level: 'info'
      }
    });

    console.log('📦 VideoDownloader instance created successfully');
    // Note: Uncomment the next line to actually run the download
    // const success = await downloader.main();
    // console.log(success ? '✅ Download completed!' : '❌ Download failed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n2. Direct M3U8 Processing:');
  try {
    const processor = new M3U8Processor({
      outputDir: 'downloads',
      maxWorkers: 4,
      timeout: 30000,
      retries: 3
    });

    console.log('📦 M3U8Processor instance created successfully');
    // Note: Uncomment the next lines to actually process an M3U8
    // await processor.processM3U8(
    //   'https://example.com/stream.m3u8',
    //   {
    //     'Referer': 'https://example.com/',
    //     'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    //   },
    //   'my-video'
    // );
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✅ Package loaded and examples completed successfully!');
  console.log('📚 Check README.md for more detailed usage examples.');
}

// Run the example
if (require.main === module) {
  exampleUsage().catch(console.error);
}

module.exports = { exampleUsage };
