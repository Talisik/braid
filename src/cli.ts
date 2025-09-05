#!/usr/bin/env node

/**
 * CLI interface for Braid Video Downloader
 */

import { program } from "commander";
import { VideoDownloader } from "./VideoDownloader.js";
import { BrowserType } from "./types/index.js";

program
    .name("braid")
    .description("Download videos from web pages including M3U8/HLS streams")
    .version("1.0.0");

program
    .command("download <url>")
    .description("Download video from a URL")
    .option(
        "-b, --browser <type>",
        "Browser type (firefox, chromium, brave)",
        "chromium"
    )
    .option("-o, --output <dir>", "Output directory", "downloads")
    .option("-w, --workers <number>", "Max concurrent workers", "4")
    .option("-t, --timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("-r, --retries <number>", "Number of retries per segment", "3")
    .option("--headless", "Run browser in headless mode", true)
    .option("--no-headless", "Run browser in headed mode")
    .action(
        async (
            url: string,
            options: {
                output: any;
                browser: string;
                workers: string;
                timeout: string;
                retries: string;
                headless: any;
            }
        ) => {
            try {
                console.log(`Starting video download from: ${url}`);
                console.log(`Output directory: ${options.output}`);
                console.log(`Browser: ${options.browser}`);

                const downloader = new VideoDownloader({
                    browserType: options.browser as BrowserType,
                    url,
                    downloadConfig: {
                        outputDir: options.output,
                        maxWorkers: parseInt(options.workers),
                        timeout: parseInt(options.timeout),
                        retries: parseInt(options.retries),
                    },
                    browserConfig: {
                        headless: options.headless,
                    },
                    loggerConfig: {
                        level: "info",
                    },
                });

                const success = await downloader.main();

                if (success) {
                    console.log("Video download completed successfully!");
                    process.exit(0);
                } else {
                    console.error("Video download failed");
                    process.exit(1);
                }
            } catch (error) {
                            console.error(
                "Error:",
                    error instanceof Error ? error.message : String(error)
                );
                process.exit(1);
            }
        }
    );

program
    .command("m3u8 <url>")
    .description("Download M3U8/HLS stream directly")
    .option("-o, --output <filename>", "Output filename (without extension)")
    .option("-w, --workers <number>", "Max concurrent workers", "4")
    .option("-t, --timeout <ms>", "Request timeout in milliseconds", "30000")
    .option("-r, --retries <number>", "Number of retries per segment", "3")
    .option("--ffmpeg <path>", "Path to ffmpeg binary (uses bundled FFmpeg by default)")
    .action(async (url: string, options) => {
        try {
            console.log(`Starting M3U8 download from: ${url}`);

            const { M3U8Processor } = await import("./utils/M3U8Processor.js");

            const processor = new M3U8Processor({
                outputDir: "downloads",
                maxWorkers: parseInt(options.workers),
                timeout: parseInt(options.timeout),
                retries: parseInt(options.retries),
                ffmpegPath: options.ffmpeg,
            });

            const success = await processor.processM3U8(
                url,
                {},
                options.output
            );

            if (success) {
                console.log("M3U8 download completed successfully!");
                process.exit(0);
            } else {
                console.error("M3U8 download failed");
                process.exit(1);
            }
        } catch (error) {
            console.error(
                "Error:",
                error instanceof Error ? error.message : String(error)
            );
            process.exit(1);
        }
    });

// Handle unknown commands
program.command("*", { hidden: true }).action(() => {
    console.error("Unknown command. Use --help for available commands.");
    process.exit(1);
});

// Parse CLI arguments
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse();
}

export { program };
