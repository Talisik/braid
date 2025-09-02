import * as fs from 'fs';
import * as path from 'path';
import { BaseHelper } from './BaseHelper';
import { DownloadConfig } from '../types';

export class DownloadHelper extends BaseHelper {
  private config: DownloadConfig;

  constructor(config: DownloadConfig = {}) {
    super();
    this.config = {
      outputDir: config.outputDir || 'downloads',
      maxWorkers: config.maxWorkers || 4,
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
    };
  }

  ensureDownloadDirectory(): void {
    if (!fs.existsSync(this.config.outputDir!)) {
      fs.mkdirSync(this.config.outputDir!, { recursive: true });
      this.logger.info(`Created download directory: ${this.config.outputDir}`);
    }
  }

  generateOutputFilename(prefix: string = 'pokemon_video', extension: string = 'mp4'): string {
    const timestamp = this.generateTimestamp();
    return `${prefix}_${timestamp}.${extension}`;
  }

  getOutputPath(filename: string): string {
    this.ensureDownloadDirectory();
    return path.join(this.config.outputDir!, filename);
  }

  fileExists(filepath: string): boolean {
    return fs.existsSync(filepath);
  }

  getFileSize(filepath: string): number {
    try {
      const stats = fs.statSync(filepath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  deleteFile(filepath: string): boolean {
    try {
      fs.unlinkSync(filepath);
      this.logger.info(`Deleted file: ${filepath}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete file ${filepath}: ${error}`);
      return false;
    }
  }

  moveFile(source: string, destination: string): boolean {
    try {
      fs.renameSync(source, destination);
      this.logger.info(`Moved file from ${source} to ${destination}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to move file from ${source} to ${destination}: ${error}`);
      return false;
    }
  }

  copyFile(source: string, destination: string): boolean {
    try {
      fs.copyFileSync(source, destination);
      this.logger.info(`Copied file from ${source} to ${destination}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to copy file from ${source} to ${destination}: ${error}`);
      return false;
    }
  }

  listDownloadedFiles(): string[] {
    try {
      this.ensureDownloadDirectory();
      return fs.readdirSync(this.config.outputDir!);
    } catch (error) {
      this.logger.error(`Failed to list downloaded files: ${error}`);
      return [];
    }
  }

  getDownloadStats(): { count: number; totalSize: number } {
    const files = this.listDownloadedFiles();
    let totalSize = 0;

    for (const file of files) {
      const filepath = path.join(this.config.outputDir!, file);
      totalSize += this.getFileSize(filepath);
    }

    return {
      count: files.length,
      totalSize,
    };
  }

  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  cleanupIncompleteFiles(): void {
    try {
      const files = this.listDownloadedFiles();
      
      for (const file of files) {
        const filepath = path.join(this.config.outputDir!, file);
        const size = this.getFileSize(filepath);
        
        // Delete files smaller than 1MB as they're likely incomplete
        if (size < 1024 * 1024) {
          this.logger.warn(`Deleting incomplete file: ${file} (${this.formatFileSize(size)})`);
          this.deleteFile(filepath);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup incomplete files: ${error}`);
    }
  }

  getConfig(): DownloadConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<DownloadConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Download configuration updated');
  }
}
