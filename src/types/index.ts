export interface VideoCandidate {
  url: string;
  headers: Record<string, string>;
  timestamp: number;
  domain: string;
  source: string;
  type?: string;
  status?: number;
}

export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
  ignoreHTTPSErrors?: boolean;
  javaScriptEnabled?: boolean;
}

export interface DownloadConfig {
  outputDir?: string;
  maxWorkers?: number;
  timeout?: number;
  retries?: number;
}

export interface M3U8ProcessorConfig extends DownloadConfig {
  ffmpegPath?: string;
  segmentTimeout?: number;
}

export interface StreamInfo {
  url: string;
  duration?: number;
  bandwidth?: number;
  resolution?: string;
  codecs?: string;
}

export interface PlaylistInfo {
  isLive: boolean;
  streams: StreamInfo[];
  totalDuration?: number;
  segmentCount?: number;
}

export type BrowserType = 'firefox' | 'chromium' | 'brave';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  level: LogLevel;
  format?: string;
  filename?: string;
}

export interface VideoDownloaderConfig {
  browserType: BrowserType;
  url: string;
  downloadConfig?: DownloadConfig;
  browserConfig?: BrowserConfig;
  loggerConfig?: LoggerConfig;
}
