import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CurlDownloader {
  private baseHeaders: string[];

  constructor() {
    this.baseHeaders = [
      '"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0"',
      '"Accept: */*"',
      '"Accept-Language: en-US,en;q=0.5"',
      '"Accept-Encoding: gzip, deflate, br"',
      '"Origin: https://9animetv.to"',
      '"Referer: https://9animetv.to/"',
      '"Connection: keep-alive"',
      '"Sec-Fetch-Dest: empty"',
      '"Sec-Fetch-Mode: cors"',
      '"Sec-Fetch-Site: cross-site"'
    ];
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
      ...this.baseHeaders.map(h => `-H ${h}`),
      '-o', `"${outputPath}"`,
      `"${url}"`
    ].join(' ');

    const { stderr } = await execAsync(curlCommand);
    
    if (stderr && !stderr.includes('Warning:')) {
      throw new Error(`Curl download error: ${stderr}`);
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
