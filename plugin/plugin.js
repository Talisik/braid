/**
 * Braid Video Downloader - Privileged Plugin
 * 
 * This plugin provides a lightweight interface to the Braid video downloader
 * using privileged APIs for file system access and browser automation.
 */

let VideoDownloader, M3U8Processor;
let activeDownloads = new Map();
let downloadCounter = 0;

// Plugin state
let hostApp = null;
let privilegedAPIs = null;
let isPrivileged = false;

/**
 * Standard plugin initialization
 * Sets up basic functionality and UI components
 */
function initialize(app) {
    console.log('Braid Plugin: Standard initialization started');
    hostApp = app;
    
    // Register basic APIs (non-privileged)
    app.registerAPI('braid.getDownloadProgress', getDownloadProgress);
    app.registerAPI('braid.getActiveDownloads', getActiveDownloads);
    
    // Set up UI components
    setupUI();
    
    // Request privileged access
    requestPrivilegedAccess();
    
    console.log('Braid Plugin: Standard initialization completed');
    return Promise.resolve();
}

/**
 * Privileged plugin initialization
 * Gets access to file system, process spawning, and browser automation
 */
async function initializePrivileged(privilegedAPI) {
    console.log('Braid Plugin: Privileged initialization started');
    privilegedAPIs = privilegedAPI;
    isPrivileged = true;
    
    try {
        // Import Braid modules using privileged require
        const braidModule = await privilegedAPIs.require('braid');
        VideoDownloader = braidModule.VideoDownloader;
        M3U8Processor = braidModule.M3U8Processor;
        
        console.log('Braid Plugin: Core modules loaded successfully');
        
        // Register privileged APIs
        hostApp.registerAPI('braid.downloadVideo', downloadVideo);
        hostApp.registerAPI('braid.downloadM3U8', downloadM3U8);
        hostApp.registerAPI('braid.cancelDownload', cancelDownload);
        hostApp.registerAPI('braid.pauseDownload', pauseDownload);
        hostApp.registerAPI('braid.resumeDownload', resumeDownload);
        
        // Set up privileged features
        setupPrivilegedFeatures();
        
        console.log('Braid Plugin: Privileged initialization completed');
        return Promise.resolve();
        
    } catch (error) {
        console.error('Braid Plugin: Privileged initialization failed:', error);
        return Promise.reject(error);
    }
}

/**
 * Request privileged access from the host application
 */
function requestPrivilegedAccess() {
    if (hostApp && hostApp.requestPrivileges) {
        hostApp.requestPrivileges({
            'file-system-write': 'Download video files to user-specified directories',
            'process-spawn': 'Run FFmpeg for video processing and conversion',
            'network-unrestricted': 'Access video streaming URLs and M3U8 playlists',
            'browser-automation': 'Launch browsers to extract video streams from web pages'
        }).then((granted) => {
            console.log('Braid Plugin: Privilege request result:', granted);
        }).catch((error) => {
            console.error('Braid Plugin: Privilege request failed:', error);
        });
    }
}

/**
 * Set up basic UI components (non-privileged)
 */
function setupUI() {
    // Add download manager panel
    if (hostApp.addPanel) {
        hostApp.addPanel({
            id: 'braid-downloads',
            title: 'Downloads',
            icon: 'download',
            content: createDownloadManagerHTML()
        });
    }
    
    // Add context menu items
    if (hostApp.addContextMenu) {
        hostApp.addContextMenu({
            id: 'braid-download-link',
            title: 'Download with Braid',
            contexts: ['link', 'video'],
            onclick: handleContextMenuDownload
        });
    }
    
    // Add system tray menu
    if (hostApp.setSystemTrayMenu) {
        hostApp.setSystemTrayMenu([
            {
                label: 'Quick Download...',
                click: showQuickDownloadDialog
            },
            {
                label: 'Download Manager',
                click: showDownloadManager
            },
            { type: 'separator' },
            {
                label: 'Settings',
                click: showSettings
            }
        ]);
    }
}

/**
 * Set up privileged features (after privileged init)
 */
function setupPrivilegedFeatures() {
    // Set up global shortcuts
    if (privilegedAPIs.registerGlobalShortcut) {
        privilegedAPIs.registerGlobalShortcut('CommandOrControl+Shift+D', () => {
            showQuickDownloadDialog();
        });
    }
    
    // Set up file association handlers
    if (privilegedAPIs.registerProtocolHandler) {
        privilegedAPIs.registerProtocolHandler('braid', (url) => {
            const videoUrl = url.replace('braid://', '');
            downloadVideo(videoUrl);
        });
    }
    
    // Set up clipboard monitoring (optional)
    if (privilegedAPIs.watchClipboard) {
        privilegedAPIs.watchClipboard((clipboardText) => {
            if (isVideoUrl(clipboardText)) {
                showClipboardDownloadNotification(clipboardText);
            }
        });
    }
}

/**
 * Main download function - Downloads video from URL
 */
async function downloadVideo(url, options = {}) {
    if (!isPrivileged) {
        throw new Error('Privileged access required for video downloads');
    }
    
    const downloadId = generateDownloadId();
    console.log(`Braid Plugin: Starting video download - ID: ${downloadId}, URL: ${url}`);
    
    try {
        // Get download directory from host app settings or use default
        const downloadDir = options.outputDir || 
                           (hostApp.getSetting && hostApp.getSetting('braid.downloadDir')) || 
                           await privilegedAPIs.getDownloadsPath();
        
        // Create VideoDownloader instance
        const downloader = new VideoDownloader({
            url: url,
            browserConfig: {
                headless: options.headless !== false, // Default to headless
                browserType: options.browserType || 'firefox',
                ...options.browserConfig
            },
            downloadConfig: {
                outputDir: downloadDir,
                filename: options.filename,
                ...options.downloadConfig
            },
            loggerConfig: {
                level: options.logLevel || 'info'
            }
        });
        
        // Store active download
        activeDownloads.set(downloadId, {
            id: downloadId,
            url: url,
            status: 'starting',
            progress: 0,
            downloader: downloader,
            startTime: Date.now()
        });
        
        // Set up progress tracking
        setupDownloadProgressTracking(downloadId, downloader);
        
        // Start download
        updateDownloadStatus(downloadId, 'downloading');
        const success = await downloader.main();
        
        if (success) {
            updateDownloadStatus(downloadId, 'completed');
            showNotification('Download Completed', `Video downloaded successfully: ${url}`);
            
            // Update host app's download store if available
            if (hostApp.updateDownloadStore) {
                hostApp.updateDownloadStore(downloadId, {
                    status: 'completed',
                    completedAt: Date.now()
                });
            }
        } else {
            updateDownloadStatus(downloadId, 'failed');
            showNotification('Download Failed', `Failed to download video: ${url}`);
        }
        
        return {
            downloadId: downloadId,
            success: success,
            url: url,
            timestamp: Date.now()
        };
        
    } catch (error) {
        console.error(`Braid Plugin: Download failed - ID: ${downloadId}`, error);
        updateDownloadStatus(downloadId, 'error', error.message);
        showNotification('Download Error', `Error downloading video: ${error.message}`);
        
        return {
            downloadId: downloadId,
            success: false,
            url: url,
            error: error.message,
            timestamp: Date.now()
        };
    }
}

/**
 * Download M3U8 stream directly
 */
async function downloadM3U8(url, headers = {}, filename = null) {
    if (!isPrivileged) {
        throw new Error('Privileged access required for M3U8 downloads');
    }
    
    const downloadId = generateDownloadId();
    console.log(`Braid Plugin: Starting M3U8 download - ID: ${downloadId}, URL: ${url}`);
    
    try {
        const downloadDir = (hostApp.getSetting && hostApp.getSetting('braid.downloadDir')) || 
                           await privilegedAPIs.getDownloadsPath();
        
        const processor = new M3U8Processor({
            outputDir: downloadDir
        });
        
        // Store active download
        activeDownloads.set(downloadId, {
            id: downloadId,
            url: url,
            status: 'downloading',
            progress: 0,
            processor: processor,
            startTime: Date.now()
        });
        
        // Set up progress tracking for M3U8
        setupM3U8ProgressTracking(downloadId, processor);
        
        const success = await processor.processM3U8(url, headers, filename);
        
        if (success) {
            updateDownloadStatus(downloadId, 'completed');
            showNotification('M3U8 Download Completed', `Stream downloaded successfully`);
        } else {
            updateDownloadStatus(downloadId, 'failed');
            showNotification('M3U8 Download Failed', `Failed to download stream`);
        }
        
        return {
            downloadId: downloadId,
            success: success,
            url: url,
            filename: filename,
            timestamp: Date.now()
        };
        
    } catch (error) {
        console.error(`Braid Plugin: M3U8 download failed - ID: ${downloadId}`, error);
        updateDownloadStatus(downloadId, 'error', error.message);
        
        return {
            downloadId: downloadId,
            success: false,
            url: url,
            error: error.message,
            timestamp: Date.now()
        };
    }
}

/**
 * Set up progress tracking for video downloads
 */
function setupDownloadProgressTracking(downloadId, downloader) {
    // Note: This depends on the VideoDownloader having progress events
    // You might need to modify VideoDownloader to emit progress events
    
    if (downloader.on) {
        downloader.on('progress', (progress) => {
            updateDownloadProgress(downloadId, progress);
        });
        
        downloader.on('status', (status) => {
            updateDownloadStatus(downloadId, status);
        });
        
        downloader.on('segment-downloaded', (segmentInfo) => {
            updateDownloadProgress(downloadId, {
                segments: segmentInfo.downloaded,
                total: segmentInfo.total,
                percentage: (segmentInfo.downloaded / segmentInfo.total) * 100
            });
        });
    }
}

/**
 * Set up progress tracking for M3U8 downloads
 */
function setupM3U8ProgressTracking(downloadId, processor) {
    // Similar to video download tracking
    if (processor.on) {
        processor.on('progress', (progress) => {
            updateDownloadProgress(downloadId, progress);
        });
        
        processor.on('segment-downloaded', (segmentInfo) => {
            updateDownloadProgress(downloadId, {
                segments: segmentInfo.downloaded,
                total: segmentInfo.total,
                percentage: (segmentInfo.downloaded / segmentInfo.total) * 100
            });
        });
    }
}

/**
 * Update download progress and notify host app
 */
function updateDownloadProgress(downloadId, progress) {
    const download = activeDownloads.get(downloadId);
    if (download) {
        download.progress = progress;
        download.lastUpdate = Date.now();
        
        // Notify host app if it has a global progress handler
        if (typeof window !== 'undefined' && window.updateBraidProgress) {
            window.updateBraidProgress(downloadId, progress);
        }
        
        // Or use host app's progress update API
        if (hostApp.updateProgress) {
            hostApp.updateProgress(downloadId, progress);
        }
    }
}

/**
 * Update download status
 */
function updateDownloadStatus(downloadId, status, error = null) {
    const download = activeDownloads.get(downloadId);
    if (download) {
        download.status = status;
        download.lastUpdate = Date.now();
        if (error) download.error = error;
        
        // Notify host app
        if (hostApp.updateDownloadStatus) {
            hostApp.updateDownloadStatus(downloadId, status, error);
        }
    }
}

/**
 * Get download progress (non-privileged API)
 */
function getDownloadProgress(downloadId) {
    const download = activeDownloads.get(downloadId);
    if (download) {
        return {
            id: download.id,
            url: download.url,
            status: download.status,
            progress: download.progress,
            startTime: download.startTime,
            lastUpdate: download.lastUpdate,
            error: download.error
        };
    }
    return null;
}

/**
 * Get all active downloads (non-privileged API)
 */
function getActiveDownloads() {
    return Array.from(activeDownloads.values()).map(download => ({
        id: download.id,
        url: download.url,
        status: download.status,
        progress: download.progress,
        startTime: download.startTime,
        lastUpdate: download.lastUpdate,
        error: download.error
    }));
}

/**
 * Cancel download (privileged API)
 */
async function cancelDownload(downloadId) {
    if (!isPrivileged) {
        throw new Error('Privileged access required to cancel downloads');
    }
    
    const download = activeDownloads.get(downloadId);
    if (download) {
        try {
            if (download.downloader && download.downloader.cancel) {
                await download.downloader.cancel();
            }
            if (download.processor && download.processor.cancel) {
                await download.processor.cancel();
            }
            
            updateDownloadStatus(downloadId, 'cancelled');
            activeDownloads.delete(downloadId);
            return true;
        } catch (error) {
            console.error(`Failed to cancel download ${downloadId}:`, error);
            return false;
        }
    }
    return false;
}

/**
 * Pause download (privileged API)
 */
async function pauseDownload(downloadId) {
    if (!isPrivileged) {
        throw new Error('Privileged access required to pause downloads');
    }
    
    const download = activeDownloads.get(downloadId);
    if (download) {
        try {
            if (download.downloader && download.downloader.pause) {
                await download.downloader.pause();
            }
            updateDownloadStatus(downloadId, 'paused');
            return true;
        } catch (error) {
            console.error(`Failed to pause download ${downloadId}:`, error);
            return false;
        }
    }
    return false;
}

/**
 * Resume download (privileged API)
 */
async function resumeDownload(downloadId) {
    if (!isPrivileged) {
        throw new Error('Privileged access required to resume downloads');
    }
    
    const download = activeDownloads.get(downloadId);
    if (download) {
        try {
            if (download.downloader && download.downloader.resume) {
                await download.downloader.resume();
            }
            updateDownloadStatus(downloadId, 'downloading');
            return true;
        } catch (error) {
            console.error(`Failed to resume download ${downloadId}:`, error);
            return false;
        }
    }
    return false;
}

// UI Helper Functions

function createDownloadManagerHTML() {
    return `
        <div id="braid-download-manager">
            <h3>Active Downloads</h3>
            <div id="braid-downloads-list">
                <!-- Downloads will be populated here -->
            </div>
            <button onclick="braidPlugin.showQuickDownloadDialog()">New Download</button>
        </div>
    `;
}

function showQuickDownloadDialog() {
    if (hostApp.showDialog) {
        hostApp.showDialog({
            type: 'prompt',
            title: 'Quick Download',
            message: 'Enter video URL:',
            placeholder: 'https://example.com/video-page',
            buttons: ['Download', 'Cancel']
        }).then(async (result) => {
            if (result.response === 0 && result.inputValue) {
                await downloadVideo(result.inputValue);
            }
        });
    }
}

function showDownloadManager() {
    if (hostApp.showPanel) {
        hostApp.showPanel('braid-downloads');
    }
}

function showSettings() {
    if (hostApp.showSettings) {
        hostApp.showSettings('braid-settings');
    }
}

function handleContextMenuDownload(info) {
    if (info.linkUrl || info.srcUrl) {
        const url = info.linkUrl || info.srcUrl;
        downloadVideo(url);
    }
}

function showNotification(title, message) {
    if (hostApp.showNotification) {
        hostApp.showNotification({
            title: title,
            body: message,
            icon: 'braid-icon.png'
        });
    } else if (privilegedAPIs && privilegedAPIs.showNotification) {
        privilegedAPIs.showNotification({
            title: title,
            body: message
        });
    }
}

function showClipboardDownloadNotification(url) {
    if (hostApp.showNotification) {
        hostApp.showNotification({
            title: 'Video URL Detected',
            body: 'Click to download with Braid',
            actions: [
                { action: 'download', title: 'Download' },
                { action: 'ignore', title: 'Ignore' }
            ],
            onclick: (action) => {
                if (action === 'download') {
                    downloadVideo(url);
                }
            }
        });
    }
}

// Utility Functions

function generateDownloadId() {
    return `braid_${Date.now()}_${++downloadCounter}`;
}

function isVideoUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

// Export plugin interface
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initialize,
        initializePrivileged
    };
} else if (typeof window !== 'undefined') {
    window.braidPlugin = {
        initialize,
        initializePrivileged,
        downloadVideo,
        downloadM3U8,
        getDownloadProgress,
        getActiveDownloads,
        cancelDownload,
        showQuickDownloadDialog
    };
}
