import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
export class SegmentDownloader {
    config;
    downloadedSegments = [];
    constructor(config = {}) {
        this.config = {
            maxConcurrentDownloads: config.maxConcurrentDownloads || 3,
            retryAttempts: config.retryAttempts || 3,
            tmpDirectory: config.tmpDirectory || join(tmpdir(), 'f2moviesdl-segments'),
            ...config
        };
        // Ensure tmp directory exists
        if (!existsSync(this.config.tmpDirectory)) {
            mkdirSync(this.config.tmpDirectory, { recursive: true });
            console.log(`Created tmp directory: ${this.config.tmpDirectory}`);
        }
    }
    /**
     * Download all segments from a list of URLs
     */
    async downloadSegments(segmentUrls, outputPrefix = 'segment') {
        console.log(`Starting download of ${segmentUrls.length} segments...`);
        console.log(`Using ${this.config.maxConcurrentDownloads} concurrent downloads`);
        console.log(`Temporary directory: ${this.config.tmpDirectory}`);
        const segmentPaths = [];
        const downloadPromises = [];
        // Process segments in batches
        for (let i = 0; i < segmentUrls.length; i += this.config.maxConcurrentDownloads) {
            const batch = segmentUrls.slice(i, i + this.config.maxConcurrentDownloads);
            console.log(`Downloading batch ${Math.floor(i / this.config.maxConcurrentDownloads) + 1}/${Math.ceil(segmentUrls.length / this.config.maxConcurrentDownloads)} (${batch.length} segments)`);
            const batchPromises = batch.map(async (url, batchIndex) => {
                const segmentIndex = i + batchIndex;
                const segmentPath = join(this.config.tmpDirectory, `${outputPrefix}_${segmentIndex.toString().padStart(6, '0')}.ts`);
                const success = await this.downloadSegment(url, segmentPath, segmentIndex);
                return success ? segmentPath : null;
            });
            const batchResults = await Promise.all(batchPromises);
            // Add successful downloads to the list
            for (const result of batchResults) {
                if (result) {
                    segmentPaths.push(result);
                }
            }
            // Small delay between batches to avoid overwhelming the server
            if (i + this.config.maxConcurrentDownloads < segmentUrls.length) {
                await this.delay(100);
            }
        }
        const successCount = segmentPaths.length;
        const failCount = segmentUrls.length - successCount;
        console.log(`Segment download completed: ${successCount} success, ${failCount} failed`);
        if (failCount > 0) {
            console.log(`Warning: ${failCount} segments failed to download. Video may be incomplete.`);
        }
        // Sort segments by filename to ensure correct order
        segmentPaths.sort();
        this.downloadedSegments = segmentPaths;
        return segmentPaths;
    }
    /**
     * Download a single segment with retry logic
     */
    async downloadSegment(url, outputPath, index) {
        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
                        'Accept': '*/*',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Connection': 'keep-alive',
                        'Sec-Fetch-Dest': 'empty',
                        'Sec-Fetch-Mode': 'cors',
                        'Sec-Fetch-Site': 'cross-site'
                    }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const buffer = await response.arrayBuffer();
                writeFileSync(outputPath, new Uint8Array(buffer));
                if (index % 10 === 0 || index === 0) {
                    console.log(`  Downloaded segment ${index + 1}: ${(buffer.byteLength / 1024).toFixed(1)}KB`);
                }
                return true;
            }
            catch (error) {
                console.error(`  Segment ${index + 1} attempt ${attempt} failed:`, error.message);
                if (attempt < this.config.retryAttempts) {
                    await this.delay(1000 * attempt); // Exponential backoff
                }
            }
        }
        console.error(`  Failed to download segment ${index + 1} after ${this.config.retryAttempts} attempts`);
        return false;
    }
    /**
     * Get list of downloaded segment paths
     */
    getDownloadedSegments() {
        return [...this.downloadedSegments];
    }
    /**
     * Clean up downloaded segments
     */
    cleanup() {
        try {
            if (existsSync(this.config.tmpDirectory)) {
                fs.rmSync(this.config.tmpDirectory, { recursive: true, force: true });
                console.log(`Cleaned up temporary directory: ${this.config.tmpDirectory}`);
            }
        }
        catch (error) {
            console.error('Error cleaning up segments:', error);
        }
    }
    /**
     * Get temporary directory path
     */
    getTmpDirectory() {
        return this.config.tmpDirectory;
    }
    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Estimate download progress
     */
    getProgress() {
        const total = this.downloadedSegments.length;
        const downloaded = this.downloadedSegments.filter(path => existsSync(path)).length;
        const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
        return { downloaded, total, percentage };
    }
    /**
     * Download M3U8 content using curl with proper headers
     */
    async downloadM3U8WithCurl(url, headers) {
        try {
            console.log(`Downloading M3U8 with curl: ${url}`);
            console.log('Headers:', Object.keys(headers).join(', '));
            const curlArgs = [
                '-L', // Follow redirects
                '-s', // Silent mode
                '-S', // Show errors
                '--max-time', '30',
                '--retry', '10',
                '--compressed' // Handle gzip/deflate compression automatically
            ];
            // Add headers
            for (const [key, value] of Object.entries(headers)) {
                curlArgs.push('-H', `${key}: ${value}`);
            }
            // Add URL last
            curlArgs.push(url);
            return new Promise((resolve, reject) => {
                const curl = spawn('curl', curlArgs);
                let output = '';
                let errorOutput = '';
                curl.stdout.on('data', (data) => {
                    output += data.toString();
                });
                curl.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });
                curl.on('close', (code) => {
                    if (code === 0 && output.length > 0) {
                        console.log(`Successfully downloaded M3U8 content (${output.length} chars)`);
                        resolve(output);
                    }
                    else {
                        console.error(`Curl failed with code ${code}: ${errorOutput}`);
                        resolve(null);
                    }
                });
                curl.on('error', (error) => {
                    console.error('Curl process error:', error.message);
                    reject(error);
                });
            });
        }
        catch (error) {
            console.error('Error downloading M3U8 with curl:', error);
            return null;
        }
    }
    /**
     * Download segments using curl with custom headers (for protected streams)
     */
    async downloadSegmentsWithCurl(segmentUrls, headers, outputPrefix = 'segment') {
        console.log(`Starting curl download of ${segmentUrls.length} segments...`);
        console.log(`Using ${this.config.maxConcurrentDownloads} concurrent downloads`);
        console.log(`Temporary directory: ${this.config.tmpDirectory}`);
        const segmentPaths = [];
        // Process segments in batches
        for (let i = 0; i < segmentUrls.length; i += this.config.maxConcurrentDownloads) {
            const batch = segmentUrls.slice(i, i + this.config.maxConcurrentDownloads);
            console.log(`Downloading batch ${Math.floor(i / this.config.maxConcurrentDownloads) + 1}/${Math.ceil(segmentUrls.length / this.config.maxConcurrentDownloads)} (${batch.length} segments)`);
            const batchPromises = batch.map(async (url, batchIndex) => {
                const segmentIndex = i + batchIndex;
                const segmentPath = join(this.config.tmpDirectory, `${outputPrefix}_${segmentIndex.toString().padStart(6, '0')}.ts`);
                const success = await this.downloadSegmentWithCurl(url, segmentPath, headers);
                return success ? segmentPath : null;
            });
            const batchResults = await Promise.all(batchPromises);
            const successfulPaths = batchResults.filter(path => path !== null);
            segmentPaths.push(...successfulPaths);
            console.log(`Batch completed: ${successfulPaths.length}/${batch.length} segments downloaded successfully`);
        }
        this.downloadedSegments = segmentPaths;
        console.log(`\nDownload completed: ${segmentPaths.length}/${segmentUrls.length} segments downloaded successfully`);
        return segmentPaths;
    }
    /**
     * Download a single segment using curl
     */
    async downloadSegmentWithCurl(url, outputPath, headers) {
        const { spawn } = await import('child_process');
        return new Promise((resolve) => {
            try {
                // Build curl command with headers
                const curlArgs = [
                    '-L', // Follow redirects
                    '-s', // Silent mode
                    '-S', // Show errors
                    '--max-time', '30', // 30 second timeout
                    '--retry', '2', // Retry twice
                    '-o', outputPath, // Output file
                ];
                // Add headers
                for (const [key, value] of Object.entries(headers)) {
                    curlArgs.push('-H', `${key}: ${value}`);
                }
                // Add URL last
                curlArgs.push(url);
                const curlProcess = spawn('curl', curlArgs);
                curlProcess.on('close', (code) => {
                    if (code === 0 && existsSync(outputPath)) {
                        resolve(true);
                    }
                    else {
                        console.error(`Failed to download segment: ${url} (exit code: ${code})`);
                        resolve(false);
                    }
                });
                curlProcess.on('error', (error) => {
                    console.error(`Curl error for ${url}:`, error);
                    resolve(false);
                });
            }
            catch (error) {
                console.error(`Error setting up curl for ${url}:`, error);
                resolve(false);
            }
        });
    }
}
//# sourceMappingURL=SegmentDownloader.js.map