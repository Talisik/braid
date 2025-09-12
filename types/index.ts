export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  timestamp: number;
  resourceType: string;
}

export interface NetworkResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  timestamp: number;
  size: number;
}

export interface BrowserConfig {
  headless?: boolean;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface NetworkMonitorConfig {
  filterUrls?: string[];
  captureResponses?: boolean;
  logRequests?: boolean;
}
