import { F2MoviesDL } from './core/F2MoviesDL.js';

async function testEnhancedMovieDownload() {
  console.log('=== Enhanced F2Movies Download Test ===');
  
  const f2moviesdl = new F2MoviesDL({
    headless: false,  // Set to false to see the browser in action
    viewport: { width: 1920, height: 1080 }
  });

  try {
    // Test with F2Movies URL (from your screenshot)
    const animeUrl = 'https://www.f2movies.to/movie/war-of-the-worlds-129007';
    
    console.log('Starting enhanced F2Movies download with play button detection...');
    const result = await f2moviesdl.downloadVideo(
      animeUrl, 
      'war-of-the-worlds.mp4', 
      25000 // 25 second monitoring
    );
    
    if (result) {
      console.log(`\n=== DOWNLOAD SUCCESS ===`);
      console.log(`Final video file: ${result}`);
      console.log(`Check your downloads folder!`);
    } else {
      console.log(`\n=== DOWNLOAD FAILED ===`);
      console.log(`No M3U8 streams were found or processed`);
    }
    
  } catch (error) {
    console.error('Enhanced download test failed:', error);
  }
}

async function testStreamDetection() {
  console.log('\n=== Stream Detection Test ===');
  
  const f2moviesdl = new F2MoviesDL({
    headless: false,
    viewport: { width: 1920, height: 1080 }
  });

  try {
    // Test stream detection only
    const animeUrl = 'https://www.f2movies.to/movie/war-of-the-worlds-129007';
    
    const streams = await f2moviesdl.findVideoStreams(animeUrl, 25000, true);
    
    console.log(`\nFound ${streams.length} video streams:`);
    streams.forEach((stream: any, i: number) => {
      console.log(`${i + 1}. ${stream.isMainVideo ? '[MAIN]' : '[ALT]'} ${stream.quality}p - ${stream.source}`);
      console.log(`   ${stream.url.substring(0, 80)}...`);
    });
    
  } catch (error) {
    console.error('Stream detection test failed:', error);
  }
}

async function testPlayButtonDetection() {
  console.log('\n=== Play Button Detection Test ===');
  
  const f2moviesdl = new F2MoviesDL({
    headless: false,
    viewport: { width: 1920, height: 1080 }
  });

  try {
    const f2MoviesUrl = 'https://www.f2movies.to/movie/war-of-the-worlds-129007';
    
    const success = await f2moviesdl.testPlayButtonDetection(f2MoviesUrl);
    console.log(`\nPlay button detection: ${success ? 'SUCCESS' : 'FAILED'}`);
    
  } catch (error) {
    console.error('Play button detection test failed:', error);
  }
}

// Run tests based on command line argument
if (import.meta.url === `file://${process.argv[1]}`) {
  const testType = process.argv[2] || 'all';
  
  console.log('Starting Enhanced F2MoviesDL Tests...\n');
  
  switch (testType) {
    case 'download':
      testEnhancedMovieDownload()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Test failed:', error);
          process.exit(1);
        });
      break;
      
    case 'streams':
      testStreamDetection()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Test failed:', error);
          process.exit(1);
        });
      break;
      
    case 'play':
      testPlayButtonDetection()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error('Test failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      // Run the main download test (skip others for now)
      testEnhancedMovieDownload()
        .then(() => {
          console.log('\nAll tests completed!');
          process.exit(0);
        })
        .catch((error) => {
          console.error('Tests failed:', error);
          process.exit(1);
        });
  }
}
