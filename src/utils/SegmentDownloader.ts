import { join, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { CurlDownloader } from './CurlDownloader.js';

export interface SegmentDownloadConfig {
  maxConcurrentDownloads?: number;
  persistentRetry?: boolean;
}

export class SegmentDownloader {
  private config: SegmentDownloadConfig;
  private downloader: CurlDownloader;

  constructor(config: SegmentDownloadConfig = {}) {
    this.config = {
      maxConcurrentDownloads: config.maxConcurrentDownloads || 3,
      persistentRetry: config.persistentRetry !== false, // Default true
      ...config
    };
    this.downloader = new CurlDownloader();
  }

  /**
   * Download video segments with progress tracking and persistent retry
   */
  public async downloadSegments(segments: string[], outputFileName: string, outputDir: string): Promise<string[]> {
    console.log(`\nDownloading ${segments.length} segments...`);
    
    const segmentDir = join(outputDir, `${outputFileName}_segments`);
    if (!existsSync(segmentDir)) {
      mkdirSync(segmentDir, { recursive: true });
    }

    const segmentFiles: string[] = [];
    let completed = 0;

    // Create download tasks
    const downloadTasks = segments.map((segmentUrl, i) => {
      const segmentFile = join(segmentDir, `segment_${i.toString().padStart(6, '0')}.ts`);
      segmentFiles.push(segmentFile);
      
      return this.downloadSingleSegment(segmentUrl, segmentFile, () => {
        completed++;
        const progress = ((completed / segments.length) * 100).toFixed(1);
        process.stdout.write(`\rProgress: ${progress}% (${completed}/${segments.length})`);
      });
    });

    // Process downloads with concurrency control
    await this.processWithConcurrency(downloadTasks, this.config.maxConcurrentDownloads!);
    
    console.log(`\nAll segments downloaded`);
    return segmentFiles;
  }

  /**
   * Download a single segment with persistent retry
   */
  private async downloadSingleSegment(url: string, outputPath: string, onComplete: () => void): Promise<void> {
    if (this.config.persistentRetry) {
      // Persistent retry - keep trying until success
      await this.downloader.downloadToFileWithRetry(url, outputPath, -1);
    } else {
      // Limited retry (3 attempts)
      await this.downloader.downloadToFileWithRetry(url, outputPath, 3);
    }
    
    onComplete();
    // Small delay between downloads to be respectful
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Process tasks with concurrency control
   */
  private async processWithConcurrency<T>(tasks: Promise<T>[], maxConcurrent: number): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<any>[] = [];

    for (const task of tasks) {
      const promise = task.then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }
}
