/**
 * Test with patience - wait for real video after ad detection
 */

import { VideoDownloader } from "./dist/index.js";

async function testPatient() {
    console.log("⏳ Patient Video Loading Test\n");

    const config = {
        browserType: "firefox",
        url: "https://jav.guru/741640/start-402-ended-up-having-a-one-night-stand-after-drinks-with-a-colleague-i-dislike-his-cock-fits-so-perfectly-deep-in-the-pussy-that-had-the-best-climax-of-my-life-honjo-suzu/",
        browserConfig: {
            headless: true,
            viewport: { width: 1920, height: 1080 },
        },
        loggerConfig: {
            level: "info",
        },
    };

    const downloader = new VideoDownloader(config);

    try {
        console.log("🚀 Starting patient test with ad click-through...");
        const success = await downloader.main();

        if (success) {
            console.log("\\n🎉 SUCCESS! Patience paid off!");

            const candidates = downloader.getVideoCandidates();
            console.log(`📊 Video candidates found: ${candidates.length}`);

            candidates.forEach((candidate, index) => {
                console.log(`\\n🎬 Video ${index + 1}:`);
                console.log(`   Domain: ${candidate.domain}`);
                console.log(`   Source: ${candidate.source}`);
                console.log(`   URL: ${candidate.url.substring(0, 80)}...`);
            });
        } else {
            console.log("\\n❌ Failed - even with patience");
        }
    } catch (error) {
        console.error("\\n💥 Error:", error.message);
    } finally {
        try {
            await downloader.forceCleanup();
            console.log("\\n🧹 Cleanup completed");
        } catch (cleanupError) {
            console.warn("⚠️  Cleanup warning");
        }
    }
}

process.on("SIGINT", () => {
    console.log("\\n🛑 Interrupted");
    process.exit(0);
});

testPatient().catch(console.error);
