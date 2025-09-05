import { VideoDownloader } from './dist/index.js';

async function testPatient() {
  console.log('Patient Video Loading Test');
  console.log('');

  console.log('Starting patient test with ad click-through...');

  // Configuration for patient testing
  const config = {
    browserType: 'firefox',
    url: 'https://jav.guru/741640/start-402-ended-up-having-a-one-night-stand-after-drinks-with-a-colleague-i-dislike-his-cock-fits-so-perfectly-deep-in-the-pussy-that-had-the-best-climax-of-my-life-honjo-suzu/',
    
    browserConfig: {
      headless: true, // Show browser for debugging
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    },
    
    downloadConfig: {
      outputDir: 'downloads',
      maxWorkers: 4,
      timeout: 30000,
      retries: 3,
    },
    
    loggerConfig: {
      level: 'info',
    }
  };

  const downloader = new VideoDownloader(config);

  try {
    const success = await downloader.main();

    if (success) {
      console.log('');
      console.log('Patient test completed successfully!');
      console.log('Video should be downloaded to the downloads folder.');
    } else {
      console.log('');
      console.log('Patient test failed - no video found or download failed.');
    }

  } catch (error) {
    console.error('');
    console.error('Patient test error:', error.message);
  } finally {
    try {
      await downloader.forceCleanup();
    } catch (cleanupError) {
      console.error('Cleanup warning:', cleanupError.message);
    }
  }
}

// Run the patient test
testPatient().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
