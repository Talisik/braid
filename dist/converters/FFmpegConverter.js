import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
export class FFmpegConverter {
    ffmpegPath = 'ffmpeg';
    constructor() {
        // Try to use system ffmpeg first
        this.detectFFmpeg();
    }
    /**
     * Detect available FFmpeg installation
     */
    async detectFFmpeg() {
        try {
            // Test if ffmpeg is available in PATH
            const test = spawn('ffmpeg', ['-version']);
            test.on('error', () => {
                console.log('System FFmpeg not found, will try to use bundled version if available');
            });
            test.on('close', (code) => {
                if (code === 0) {
                    console.log('Using system FFmpeg');
                    this.ffmpegPath = 'ffmpeg';
                }
            });
        }
        catch (error) {
            console.log('FFmpeg detection failed, using default path');
        }
    }
    /**
     * Convert segments to final video file
     */
    async convertSegmentsToVideo(segmentPaths, outputPath, options = {}) {
        const { cleanup = true, videoCodec = 'libx264', audioCodec = 'aac', quality = 'high' } = options;
        console.log(`Converting ${segmentPaths.length} segments to: ${outputPath}`);
        console.log(`Video codec: ${videoCodec}, Audio codec: ${audioCodec}, Quality: ${quality}`);
        try {
            // Create file list for FFmpeg
            const fileListPath = join(process.cwd(), 'segments_list.txt');
            const fileListContent = segmentPaths.map(path => `file '${path}'`).join('\n');
            writeFileSync(fileListPath, fileListContent);
            console.log(`Created segment list file: ${fileListPath}`);
            // Build FFmpeg arguments
            const args = [
                '-f', 'concat',
                '-safe', '0',
                '-i', fileListPath,
                '-c:v', videoCodec,
                '-c:a', audioCodec
            ];
            // Add quality settings
            if (quality === 'high') {
                args.push('-crf', '18', '-preset', 'medium');
            }
            else if (quality === 'medium') {
                args.push('-crf', '23', '-preset', 'medium');
            }
            else if (quality === 'fast') {
                args.push('-crf', '28', '-preset', 'fast');
            }
            // Add output path
            args.push('-y', outputPath);
            console.log(`Running FFmpeg with args: ${args.join(' ')}`);
            const success = await this.runFFmpeg(args);
            // Cleanup file list
            try {
                unlinkSync(fileListPath);
            }
            catch (error) {
                console.log('Could not remove file list, continuing...');
            }
            if (success && cleanup) {
                console.log('Cleaning up segment files...');
                this.cleanupSegments(segmentPaths);
            }
            return success;
        }
        catch (error) {
            console.error('Error in convertSegmentsToVideo:', error);
            return false;
        }
    }
    /**
     * Run FFmpeg with given arguments
     */
    async runFFmpeg(args) {
        return new Promise((resolve) => {
            console.log(`Starting FFmpeg conversion...`);
            const ffmpeg = spawn(this.ffmpegPath, args);
            let hasError = false;
            ffmpeg.stdout.on('data', (data) => {
                // FFmpeg outputs to stderr, but we can capture stdout if needed
                process.stdout.write(data);
            });
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                // Look for progress information
                if (output.includes('time=')) {
                    const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
                    if (timeMatch) {
                        process.stdout.write(`\rConverting... Time: ${timeMatch[1]}`);
                    }
                }
                // Look for errors
                if (output.includes('Error') || output.includes('error')) {
                    console.error('\nFFmpeg error:', output);
                    hasError = true;
                }
            });
            ffmpeg.on('close', (code) => {
                console.log(`\nFFmpeg finished with code: ${code}`);
                if (code === 0 && !hasError) {
                    console.log('Video conversion completed successfully!');
                    resolve(true);
                }
                else {
                    console.error('Video conversion failed');
                    resolve(false);
                }
            });
            ffmpeg.on('error', (error) => {
                console.error('FFmpeg process error:', error);
                resolve(false);
            });
        });
    }
    /**
     * Clean up segment files
     */
    cleanupSegments(segmentPaths) {
        let cleanedCount = 0;
        for (const segmentPath of segmentPaths) {
            try {
                if (existsSync(segmentPath)) {
                    unlinkSync(segmentPath);
                    cleanedCount++;
                }
            }
            catch (error) {
                console.error(`Failed to delete segment: ${segmentPath}`);
            }
        }
        console.log(`Cleaned up ${cleanedCount}/${segmentPaths.length} segment files`);
    }
    /**
     * Check if FFmpeg is available
     */
    async isFFmpegAvailable() {
        return new Promise((resolve) => {
            const test = spawn(this.ffmpegPath, ['-version']);
            test.on('error', () => {
                resolve(false);
            });
            test.on('close', (code) => {
                resolve(code === 0);
            });
        });
    }
    /**
     * Get FFmpeg version information
     */
    async getFFmpegVersion() {
        return new Promise((resolve) => {
            const ffmpeg = spawn(this.ffmpegPath, ['-version']);
            let output = '';
            ffmpeg.stdout.on('data', (data) => {
                output += data.toString();
            });
            ffmpeg.on('close', () => {
                const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
                resolve(versionMatch ? versionMatch[1] : 'unknown');
            });
            ffmpeg.on('error', () => {
                resolve('not available');
            });
        });
    }
}
//# sourceMappingURL=FFmpegConverter.js.map