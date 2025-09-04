import { Logger } from "winston";
import { createLogger } from "./Logger.js";
import { VideoCandidate } from "../types/index.js";
import { M3U8Processor } from "./M3U8Processor.js";

export class StreamHandler {
    private logger: Logger;
    private processor: M3U8Processor;

    constructor() {
        this.logger = createLogger("StreamHandler");
        this.processor = new M3U8Processor();
    }

    async processResults(candidates: VideoCandidate[]): Promise<boolean> {
        if (candidates.length === 0) {
            this.logger.warn("No video candidates found");
            return false;
        }

        this.logger.info(`Found ${candidates.length} video candidates:`);

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const age = (Date.now() - candidate.timestamp) / 1000;
            const source = candidate.source || "network";

            this.logger.info(
                `  ${i + 1}. ${candidate.domain} (age: ${age.toFixed(
                    1
                )}s, source: ${source})`
            );
            this.logger.info(`     ${candidate.url}`);
        }

        // Sort candidates by score
        const scoredCandidates = candidates.map((candidate) => ({
            score: this.calculateCandidateScore(candidate),
            candidate,
        }));

        const sortedCandidates = scoredCandidates.sort(
            (a, b) => b.score - a.score
        );

        // Try each candidate until we find one without ads
        for (let i = 0; i < sortedCandidates.length; i++) {
            const { score, candidate } = sortedCandidates[i];
            const url = candidate.url;

            this.logger.info(
                `Trying candidate ${i + 1}/${
                    sortedCandidates.length
                } (score ${score}): ${url}`
            );

            // Skip heavily penalized ad domains
            if (score < 0) {
                this.logger.warn(
                    `SKIPPING AD CANDIDATE ${i + 1} (score ${score}): ${url}`
                );
                continue;
            }

            // Skip very low scoring candidates that are likely ads
            if (score < 50) {
                this.logger.warn(
                    `SKIPPING LOW-QUALITY CANDIDATE ${
                        i + 1
                    } (score ${score}): ${url}`
                );
                continue;
            }

            // Skip non-video URLs
            if (this.isNonVideoUrl(url)) {
                this.logger.warn(`SKIPPING NON-VIDEO URL: ${url}`);
                continue;
            }

            // Final validation: Check if this is actually an ad stream
            const isAd = await this.isLikelyAdStream(url, candidate.headers);
            if (isAd) {
                this.logger.warn(`SKIPPING DETECTED AD STREAM: ${url}`);
                continue;
            }

            // Handle both M3U8 and direct video URLs
            let success = false;
            if (this.isDirectVideoUrl(url)) {
                success = await this.processor.downloadDirectVideo(
                    url,
                    candidate.headers
                );
            } else {
                success = await this.processor.processM3U8(
                    url,
                    candidate.headers
                );
            }

            if (success) {
                this.logger.info(
                    `SUCCESS! Downloaded video using candidate ${i + 1}`
                );
                return true;
            } else {
                this.logger.warn(
                    `Candidate ${
                        i + 1
                    } failed (likely contains ads), trying next...`
                );
            }
        }

        this.logger.error("All video candidates failed or contained ads");
        return false;
    }

    private calculateCandidateScore(candidate: VideoCandidate): number {
        const url = candidate.url;
        const domain = candidate.domain || "";
        const age = (Date.now() - candidate.timestamp) / 1000;

        let score = 0;
        this.logger.info(`SCORING: ${url} (domain: ${domain})`);

        // Ultimate priority: Direct video player URLs
        if (this.isDirectVideoPlayerUrl(url)) {
            score += 5000;
            this.logger.info(
                `DIRECT VIDEO PLAYER URL BONUS: +5000 points for ${url}`
            );
        }

        // Highest priority: DOM-extracted video URLs
        const source = candidate.source || "";
        if (source.includes("dom_extraction")) {
            score += 2000;
            this.logger.info(`DOM EXTRACTION BONUS: +2000 points for ${url}`);
        } else if (source.includes("player_page_analysis")) {
            score += 1000;
            this.logger.info(
                `PLAYER PAGE ANALYSIS BONUS: +1000 points for ${url}`
            );
        }

        // Content type scoring - Prioritize M3U8 master manifests over individual segments
        if (url.toLowerCase().includes(".m3u8")) {
            // Check if it's a master manifest (contains quality indicators or is in master directory)
            if (
                url.includes("/master/") ||
                url.includes("master.m3u8") ||
                /_(240p|360p|480p|720p|1080p)\.m3u8/.test(url)
            ) {
                score += 900;
                this.logger.info(
                    `M3U8 MASTER MANIFEST DETECTED - HIGHEST PRIORITY: ${url}`
                );
            } else {
                score += 700;
                this.logger.info(
                    `M3U8 STREAM DETECTED - HIGH PRIORITY: ${url}`
                );
            }
        } else if (this.isDirectVideoUrl(url)) {
            // Individual video segments get lower priority than M3U8 manifests
            if (
                url.includes("_h264_") &&
                (url.includes("_init_") ||
                    /\d+_[a-zA-Z0-9]+_\d+\.mp4$/.test(url))
            ) {
                score += 400; // HLS segments get lower priority
                this.logger.info(
                    `HLS SEGMENT DETECTED - MEDIUM PRIORITY: ${url}`
                );
            } else {
                score += 600; // Complete video files still get good priority
                this.logger.info(
                    `DIRECT VIDEO FILE DETECTED - HIGH PRIORITY: ${url}`
                );
            }
        }

        // Domain-based scoring
        if (this.isKnownStreamingDomain(domain)) {
            score += 300;
            this.logger.info(
                `KNOWN STREAMING DOMAIN - MEDIUM PRIORITY: ${url}`
            );
        }

        // Penalize ad domains
        if (this.isAdDomain(domain)) {
            score -= 1000;
            this.logger.warn(`AD DOMAIN DETECTED - HEAVILY PENALIZED: ${url}`);

            if (score < 400) {
                score = -999; // Block completely
                this.logger.warn(`AD DOMAIN BLOCKED COMPLETELY: ${url}`);
            }
        }

        // Prefer recent timestamps
        if (age < 10) {
            score += 10;
        }

        // Prefer shorter URLs (often cleaner)
        if (url.length < 200) {
            score += 20;
        }

        return score;
    }

    private isDirectVideoPlayerUrl(url: string): boolean {
        const patterns = ["/t/", "/e/", "/embed/", "/player/", "/v/"];
        return (
            patterns.some((pattern) => url.includes(pattern)) &&
            !url.endsWith(".m3u8")
        );
    }

    private isDirectVideoUrl(url: string): boolean {
        const extensions = [".mp4", ".mkv", ".avi", ".webm", ".mov"];
        return extensions.some((ext) => url.toLowerCase().includes(ext));
    }

    private isKnownStreamingDomain(domain: string): boolean {
        const domains = [
            "sacdnssedge.com",
            "turbovidhls.com",
            "streamhihi.com",
            "ovaltinecdn",
            "equityvypqjdgkbw",
            "tnmr.org",
        ];
        return domains.some((d) => domain.toLowerCase().includes(d));
    }

    private isAdDomain(domain: string): boolean {
        const adDomains = ["emturbovid.com"]; // Only real ad domains
        return adDomains.some((d) => domain.toLowerCase().includes(d));
    }

    private isNonVideoUrl(url: string): boolean {
        const nonVideoPatterns = [
            "/cdn-cgi/",
            "/api/",
            "/config",
            ".json",
            ".js",
            ".css",
            "speculation",
            "googletagmanager",
            "analytics",
            "tracking",
            "fonts.gstatic",
            "tiktokcdn",
        ];

        const urlLower = url.toLowerCase();
        return nonVideoPatterns.some((pattern) => urlLower.includes(pattern));
    }

    private async isLikelyAdStream(
        url: string,
        headers: Record<string, string>
    ): Promise<boolean> {
        try {
            // This is a simplified version - in a real implementation,
            // you'd make an HTTP request to analyze the stream content
            this.logger.info(`VALIDATING STREAM: ${url}`);

            // For now, just check URL patterns that indicate ads
            const adIndicators = [
                "googleads",
                "doubleclick",
                "googlesyndication",
                "adsystem",
                "ads.yahoo",
                "amazon-adsystem",
                "adnxs.com",
                "creative.mnaspm.com",
            ];

            const urlLower = url.toLowerCase();
            return adIndicators.some((indicator) =>
                urlLower.includes(indicator)
            );
        } catch (error) {
            this.logger.warn(`Error validating stream: ${error}`);
            return true; // If validation fails, assume it's an ad to be safe
        }
    }
}
