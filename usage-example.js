/**
 * Web Navigator Backend - Usage Example
 * 
 * This example demonstrates how to use the VideoDownloader package
 * to automatically find and download video streams from web pages.
 */

const { VideoDownloader } = require('./dist/index.js');

async function main() {
  console.log('🚀 Starting video download example...\n');

  // Configuration for the video downloader
  const config = {
    browserType: 'firefox', // Use Firefox as default
    url: 'https://jav.guru/741640/start-402-ended-up-having-a-one-night-stand-after-drinks-with-a-colleague-i-dislike-his-cock-fits-so-perfectly-deep-in-the-pussy-that-had-the-best-climax-of-my-life-honjo-suzu/',
    
    // Optional browser configuration
    browserConfig: {
      headless: false, // Set to true for headless mode
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    },
    
    // Optional download configuration
    downloadConfig: {
      outputDir: 'downloads',        // Where to save videos
      maxWorkers: 4,                 // Parallel download workers
      timeout: 30000,                // Request timeout (30 seconds)
      retries: 3,                    // Retry failed downloads
      ffmpegPath: undefined,         // Use system FFmpeg
    },
    
    // Optional logger configuration
    loggerConfig: {
      level: 'info', // 'error', 'warn', 'info', 'debug'
    }
  };

  console.log('📋 Configuration:');
  console.log('   Browser Type:', config.browserType);
  console.log('   Target URL:', config.url);
  console.log('   Output Directory:', config.downloadConfig.outputDir);
  console.log('   Max Workers:', config.downloadConfig.maxWorkers);
  console.log('   Headless Mode:', config.browserConfig.headless);
  console.log('');

  // Create the downloader instance
  const downloader = new VideoDownloader(config);

  try {
    console.log('🎬 Starting video download process...');
    console.log('This will:');
    console.log('  1. Launch Firefox browser');
    console.log('  2. Navigate to the target URL');
    console.log('  3. Search for video streams');
    console.log('  4. Download found videos');
    console.log('');

    // Start the download process
    const success = await downloader.main();

    if (success) {
      console.log('');
      console.log('🎉 SUCCESS! Video download completed!');
      console.log('📁 Check the downloads folder for your video files.');
      
      // Show results
      const candidates = downloader.getVideoCandidates();
      const allRequests = downloader.getAllVideoRequests();
      
      console.log('');
      console.log('📊 Download Statistics:');
      console.log(`   Video Candidates Found: ${candidates.length}`);
      console.log(`   Total Video Requests: ${allRequests.length}`);
      console.log(`   Direct URL Found: ${downloader.isDirectUrlFound() ? 'Yes' : 'No'}`);
      
      if (candidates.length > 0) {
        console.log('');
        console.log('🎥 Video Candidates:');
        candidates.forEach((candidate, index) => {
          console.log(`   ${index + 1}. ${candidate.domain} - ${candidate.type || 'unknown'}`);
          console.log(`      Source: ${candidate.source}`);
          console.log(`      URL: ${candidate.url.substring(0, 80)}...`);
        });
      }
      
    } else {
      console.log('');
      console.log('❌ No videos found or download failed.');
      console.log('💡 Tips:');
      console.log('   - Make sure the URL contains video content');
      console.log('   - Check if the site requires user interaction');
      console.log('   - Try with headless: false to see what\'s happening');
    }

  } catch (error) {
    console.error('');
    console.error('💥 Error occurred during download:');
    console.error('   Error:', error.message);
    console.error('');
    console.error('🔧 Troubleshooting:');
    console.error('   1. Make sure Firefox is installed: npx playwright install firefox');
    console.error('   2. Check if FFmpeg is available: ffmpeg -version');
    console.error('   3. Verify the target URL is accessible');
    console.error('   4. Try running with headless: false to debug');
  } finally {
    // Cleanup
    try {
      await downloader.forceCleanup();
      console.log('');
      console.log('🧹 Cleanup completed successfully.');
    } catch (cleanupError) {
      console.error('⚠️ Cleanup warning:', cleanupError.message);
    }
  }

  console.log('');
  console.log('✅ Example completed!');
  console.log('');
  console.log('🔗 Next Steps:');
  console.log('   - Modify the URL in this file to target your desired site');
  console.log('   - Adjust configuration options as needed');
  console.log('   - Check the README.md for more advanced usage examples');
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, exiting gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received termination signal, exiting gracefully...');
  process.exit(0);
});

// Run the example
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
