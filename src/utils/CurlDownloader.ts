import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync, statSync } from 'fs';

const execAsync = promisify(exec);

export class CurlDownloader {
  private baseHeaders: string[];

  constructor() {
    this.baseHeaders = [
      '"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"',
      '"Accept: */*"',
      '"Accept-Language: en-US,en;q=0.5"',
      '"Accept-Encoding: gzip, deflate, br"',
      '"Cache-Control: no-cache"',
      '"Pragma: no-cache"',
      '"Connection: keep-alive"',
      '"Sec-Fetch-Dest: empty"',
      '"Sec-Fetch-Mode: cors"',
      '"Sec-Fetch-Site: cross-site"'
    ];
  }

  /**
   * Set referer header for segment downloads
   */
  public setReferer(refererUrl: string): void {
    // Remove existing referer if present
    this.baseHeaders = this.baseHeaders.filter(h => !h.includes('Referer:'));
    // Add new referer
    this.baseHeaders.push(`"Referer: ${refererUrl}"`);
  }

  /**
   * Download content using curl and return as string
   */
  public async downloadAsString(url: string): Promise<string> {
    const curlCommand = [
      'curl',
      '-s', // Silent mode
      '-L', // Follow redirects
      '--compressed', // Accept compressed responses
      ...this.baseHeaders.map(h => `-H ${h}`),
      `"${url}"`
    ].join(' ');

    const { stdout, stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('Warning:')) {
      throw new Error(`Curl error: ${stderr}`);
    }
    
    return stdout;
  }

  /**
   * Download content using curl directly to file
   */
  public async downloadToFile(url: string, outputPath: string): Promise<void> {
    const curlCommand = [
      'curl',
      '-s', // Silent mode
      '-L', // Follow redirects
      '--compressed', // Accept compressed responses
      '--max-redirs', '5', // Limit redirects
      '--connect-timeout', '30', // Connection timeout
      '--max-time', '60', // Total timeout
      ...this.baseHeaders.map(h => `-H ${h}`),
      '-o', `"${outputPath}"`,
      `"${url}"`
    ].join(' ');

    const { stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('Warning:')) {
      throw new Error(`Curl download error: ${stderr}`);
    }

    // Validate downloaded content
    this.validateDownloadedFile(outputPath);
  }

  /**
   * Validate that downloaded file is actually video content, not HTML
   */
  private validateDownloadedFile(filePath: string): void {
    try {
      const stats = statSync(filePath);
      
      // Check file size (should be more than a few KB for video segments)
      if (stats.size < 1000) {
        throw new Error(`Downloaded file too small (${stats.size} bytes) - likely an error page`);
      }

      // Read first few bytes to check if it's HTML
      const buffer = readFileSync(filePath, { encoding: 'utf8', flag: 'r' });
      const firstChunk = buffer.substring(0, 100).toLowerCase();
      
      if (firstChunk.includes('<!doctype html') || 
          firstChunk.includes('<html') || 
          firstChunk.includes('cloudflare') ||
          firstChunk.includes('access denied')) {
        throw new Error('Downloaded HTML content instead of video segment - likely blocked or redirected');
      }
    } catch (error) {
      throw new Error(`File validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download with persistent retry until success
   */
  public async downloadToFileWithRetry(url: string, outputPath: string, maxRetries: number = -1): Promise<void> {
    let attempts = 0;
    
    while (maxRetries === -1 || attempts < maxRetries) {
      try {
        await this.downloadToFile(url, outputPath);
        return; // Success!
      } catch (error) {
        attempts++;
        const waitTime = Math.min(5000, 1000 * attempts); // Exponential backoff, max 5s
        
        if (maxRetries !== -1 && attempts >= maxRetries) {
          throw new Error(`Failed to download after ${maxRetries} attempts: ${error}`);
        }
        
        console.log(`Retry ${attempts} for segment in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
}
