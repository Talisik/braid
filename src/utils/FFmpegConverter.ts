import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, rmdirSync } from 'fs';
import { dirname } from 'path';

export class FFmpegConverter {
  private ffmpegPath: string | null = null;

  constructor() {
    this.initializeFFmpeg();
  }

  /**
   * Initialize FFmpeg path
   */
  private async initializeFFmpeg(): Promise<void> {
    if (this.ffmpegPath) return;

    const bundledFFmpeg = await this.loadFFmpegStatic();
    this.ffmpegPath = bundledFFmpeg || "ffmpeg";
    
    if (bundledFFmpeg) {
      console.log("Using bundled FFmpeg from ffmpeg-static");
    } else {
      console.log("Using system FFmpeg as fallback");
    }
  }

  /**
   * Load FFmpeg static binary
   */
  private async loadFFmpegStatic(): Promise<string | null> {
    try {
      const ffmpegModule = await import("ffmpeg-static");
      return (ffmpegModule.default || ffmpegModule) as unknown as string;
    } catch (error) {
      try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        return require("ffmpeg-static");
      } catch (requireError) {
        console.warn("Warning: ffmpeg-static could not be loaded. Using system ffmpeg as fallback.");
        return null;
      }
    }
  }

  /**
   * Convert segments to MP4 using FFmpeg
   */
  public async convertToMP4(segmentFiles: string[], outputPath: string): Promise<string> {
    console.log(`\nConverting segments to MP4...`);
    await this.initializeFFmpeg();

    return new Promise((resolve, reject) => {
      // Create concat file list
      const concatFile = outputPath.replace('.mp4', '_concat.txt');
      const concatContent = segmentFiles.map(file => `file '${file}'`).join('\n');
      
      writeFileSync(concatFile, concatContent);

      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFile,
        '-c', 'copy',
        '-y', // Overwrite output file
        outputPath
      ];

      console.log(`Running FFmpeg conversion...`);
      const ffmpeg = spawn(this.ffmpegPath!, ffmpegArgs);

      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('time=')) {
          // Extract progress information
          const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (timeMatch) {
            process.stdout.write(`\rConverting: ${timeMatch[1]}`);
          }
        }
      });

      ffmpeg.on('close', (code) => {
        // Cleanup concat file
        unlinkSync(concatFile);

        if (code === 0) {
          console.log(`\nConversion completed`);
          resolve(outputPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Cleanup temporary segment files
   */
  public cleanupSegments(segmentFiles: string[]): void {
    console.log('Cleaning up temporary files...');
    
    for (const file of segmentFiles) {
      try {
        unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Remove segment directory
    try {
      const segmentDir = dirname(segmentFiles[0]);
      rmdirSync(segmentDir);
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}
