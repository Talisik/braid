import { WeebDL } from './index.js';

async function testAnimeDownload() {
  console.log('=== Anime Download Test ===');
  
  const weebdl = new WeebDL({
    headless: true,  // Run in background
    viewport: { width: 1920, height: 1080 }
  });

  try {
    // Test download with the anime URL we know works
    const animeUrl = 'https://9animetv.to/watch/i-was-reincarnated-as-the-7th-prince-so-i-can-take-my-time-perfecting-my-magical-ability-19132?ep=123156';
    const outputFileName = 'vdeio1.mp4';
    
    console.log('Starting anime download...');
    const result = await weebdl.downloadAnime(animeUrl, outputFileName, 20000); // 20 second monitoring
    
    if (result) {
      console.log(`\nDownload completed successfully!`);
      console.log(`File saved to: ${result}`);
    } else {
      console.log(`\nDownload failed - no video streams found`);
    }
    
  } catch (error) {
    console.error('Download test failed:', error);
  }
}

// Advanced test with custom output directory
async function testCustomDownload() {
  console.log('\n=== Custom Download Test ===');
  
  const weebdl = new WeebDL({
    headless: true,
    viewport: { width: 1920, height: 1080 }
  });

  // Get browser instance for advanced configuration
  const browser = weebdl.getBrowser();

  try {
    await browser.launch();
    
    // Navigate to anime page
    const animeUrl = 'https://9animetv.to/watch/i-was-reincarnated-as-the-7th-prince-so-i-can-take-my-time-perfecting-my-magical-ability-19132?ep=123156';
    await browser.navigateAndMonitor(animeUrl);
    
    // Wait for streams to load
    await browser.waitAndMonitor(15000);
    
    // Get all network requests
    const monitor = browser.getNetworkMonitor();
    const requests = monitor.getRequests();
    
    // Close browser
    await browser.close();
    
    // Filter and analyze streams
    const streamFilter = weebdl.getStreamFilter();
    const videoStreams = streamFilter.filterVideoStreams(requests);
    
    console.log(`\nFound ${videoStreams.length} video streams:`);
    videoStreams.forEach((stream, i) => {
      console.log(`${i + 1}. ${stream.isMainVideo ? '[MAIN]' : '[OTHER]'} ${stream.quality}p - ${stream.source}`);
      console.log(`   ${stream.url.substring(0, 100)}...`);
    });
    
    // Download the best stream
    if (videoStreams.length > 0) {
      const bestStream = videoStreams[0];
      console.log(`\nDownloading best stream: ${bestStream.source} (${bestStream.quality}p)`);
      
      const m3u8Processor = weebdl.getM3U8Processor();
      const result = await m3u8Processor.processM3U8(bestStream.url, 'custom_download.mp4');
      
      console.log(`Custom download completed: ${result}`);
    }
    
  } catch (error) {
    console.error('Custom download failed:', error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Starting anime download tests...');
  testAnimeDownload()
    .then(() => {
      console.log('\nStarting custom download test...');
      return testCustomDownload();
    })
    .catch(console.error);
}
