export class AdBlocker {
  private blockedDomains: Set<string>;
  private blockedPatterns: RegExp[];

  constructor() {
    this.blockedDomains = new Set([
      'googleads.g.doubleclick.net',
      'googlesyndication.com',
      'doubleclick.net',
      'google-analytics.com',
      'googletagmanager.com',
      'facebook.com',
      'facebook.net',
      'twitter.com',
      'ads.yahoo.com',
      'amazon-adsystem.com',
      'adnxs.com',
      'adsystem.com',
      'outbrain.com',
      'taboola.com',
      'adskeeper.co.uk',
      'mgid.com',
      'smartadserver.com',
      'criteo.com',
      'adsafeprotected.com',
      'moatads.com',
      'scorecardresearch.com',
      'quantserve.com',
      'openx.net',
      'rubiconproject.com',
      'pubmatic.com',
      'contextweb.com',
      'adsrvr.org',
      'turn.com',
      'rlcdn.com',
      'bluekai.com',
      'demdex.net',
      'adsafeprotected.com',
      'creative.mnaspm.com',
    ]);

    this.blockedPatterns = [
      /\/ads?\//i,
      /\/ad[\-_]?server/i,
      /\/advertisement/i,
      /\/banner/i,
      /\/popup/i,
      /\/interstitial/i,
      /\/preroll/i,
      /\/midroll/i,
      /\/tracking/i,
      /\/analytics/i,
      /\/metrics/i,
      /googleads/i,
      /doubleclick/i,
      /googlesyndication/i,
    ];
  }

  blockWebsites(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const fullUrl = url.toLowerCase();

      // Check blocked domains
      if (this.blockedDomains.has(domain)) {
        return true;
      }

      // Check for subdomain matches
      for (const blockedDomain of this.blockedDomains) {
        if (domain.endsWith(`.${blockedDomain}`)) {
          return true;
        }
      }

      // Check blocked patterns
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(fullUrl)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      // If URL parsing fails, don't block
      return false;
    }
  }

  addBlockedDomain(domain: string): void {
    this.blockedDomains.add(domain.toLowerCase());
  }

  removeBlockedDomain(domain: string): void {
    this.blockedDomains.delete(domain.toLowerCase());
  }

  addBlockedPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }

  isBlocked(url: string): boolean {
    return this.blockWebsites(url);
  }
}
