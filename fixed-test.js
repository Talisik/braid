/**
 * Fixed test to address the multiple browser and URL issues
 */

const { VideoDownloader } = require('./dist/index.js');

async function fixedTest() {
  console.log('🔧 Fixed Test - Single browser, proper cleanup...\n');

  let downloader = null;

  try {
    const config = {
      browserType: 'firefox',
      url: 'https://example.com',
      browserConfig: {
        headless: false,
        viewport: { width: 1920, height: 1080 },
      },
      loggerConfig: {
        level: 'info'
      }
    };

    console.log('📋 Configuration:');
    console.log('   Browser:', config.browserType);
    console.log('   URL:', JSON.stringify(config.url));  // Show exact URL
    console.log('   Headless:', config.browserConfig.headless);
    console.log('');

    console.log('🚀 Creating VideoDownloader instance...');
    downloader = new VideoDownloader(config);
    
    console.log('🌐 Starting main process (should open ONE browser)...');
    
    // Add a timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Test timeout after 30 seconds')), 30000)
    );
    
    const mainPromise = downloader.main();
    
    const success = await Promise.race([mainPromise, timeoutPromise]);
    
    console.log('Result:', success ? '✅ Success' : '❌ Failed');
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    
    if (error.message.includes('vizdisplaycompositor')) {
      console.error('🚨 URL CORRUPTION DETECTED!');
      console.error('The URL is being corrupted somewhere in the process.');
    }
    
    if (error.message.includes('timeout')) {
      console.error('⏰ Test timed out - browser may still be open');
    }
    
  } finally {
    console.log('🧹 Ensuring cleanup...');
    
    // Force cleanup if downloader exists
    if (downloader && typeof downloader.forceCleanup === 'function') {
      try {
        await downloader.forceCleanup();
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError.message);
      }
    }
    
    console.log('✅ Test completed');
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, exiting...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, exiting...');
  process.exit(0);
});

fixedTest();
