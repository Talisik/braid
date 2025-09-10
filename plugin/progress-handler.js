/**
 * Progress Handler for Braid Plugin
 * 
 * This module handles progress updates and can be used by the host app
 * to integrate with their download management system.
 */

// Global progress handlers that the host app can register
window.braidProgressHandlers = {
    downloads: new Map(),
    
    // Register a global progress handler
    register: function(downloadId, handler) {
        this.downloads.set(downloadId, handler);
    },
    
    // Update progress for a specific download
    update: function(downloadId, progress) {
        const handler = this.downloads.get(downloadId);
        if (handler) {
            handler(progress);
        }
        
        // Also trigger global progress event
        if (window.onBraidProgress) {
            window.onBraidProgress(downloadId, progress);
        }
        
        // Dispatch custom event for the host app
        window.dispatchEvent(new CustomEvent('braid-progress', {
            detail: { downloadId, progress }
        }));
    },
    
    // Remove handler when download completes
    cleanup: function(downloadId) {
        this.downloads.delete(downloadId);
    }
};

// Global functions the host app can use
window.updateBraidProgress = function(downloadId, progress) {
    window.braidProgressHandlers.update(downloadId, progress);
};

window.registerBraidProgressHandler = function(downloadId, handler) {
    window.braidProgressHandlers.register(downloadId, handler);
};

window.cleanupBraidProgress = function(downloadId) {
    window.braidProgressHandlers.cleanup(downloadId);
};

// Example integration patterns for different host app architectures

/**
 * React Integration Example
 */
window.braidReactIntegration = {
    // Hook for React components
    useDownloadProgress: function(downloadId) {
        const [progress, setProgress] = React.useState(null);
        
        React.useEffect(() => {
            const handler = (newProgress) => {
                setProgress(newProgress);
            };
            
            window.registerBraidProgressHandler(downloadId, handler);
            
            return () => {
                window.cleanupBraidProgress(downloadId);
            };
        }, [downloadId]);
        
        return progress;
    },
    
    // Component for download progress
    DownloadProgress: function({ downloadId }) {
        const progress = this.useDownloadProgress(downloadId);
        
        if (!progress) return null;
        
        return React.createElement('div', {
            className: 'braid-progress'
        }, [
            React.createElement('div', {
                className: 'progress-bar'
            }, [
                React.createElement('div', {
                    className: 'progress-fill',
                    style: { width: `${progress.percentage || 0}%` }
                })
            ]),
            React.createElement('span', {
                className: 'progress-text'
            }, `${progress.segments || 0}/${progress.total || 0} segments`)
        ]);
    }
};

/**
 * Vue Integration Example
 */
window.braidVueIntegration = {
    // Vue component
    DownloadProgress: {
        props: ['downloadId'],
        data() {
            return {
                progress: null
            };
        },
        mounted() {
            window.registerBraidProgressHandler(this.downloadId, (progress) => {
                this.progress = progress;
            });
        },
        beforeUnmount() {
            window.cleanupBraidProgress(this.downloadId);
        },
        template: `
            <div v-if="progress" class="braid-progress">
                <div class="progress-bar">
                    <div class="progress-fill" :style="{ width: (progress.percentage || 0) + '%' }"></div>
                </div>
                <span class="progress-text">{{ progress.segments || 0 }}/{{ progress.total || 0 }} segments</span>
            </div>
        `
    }
};

/**
 * Vanilla JS Integration Example
 */
window.braidVanillaIntegration = {
    // Create progress element
    createProgressElement: function(downloadId, container) {
        const progressDiv = document.createElement('div');
        progressDiv.className = 'braid-progress';
        progressDiv.innerHTML = `
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <span class="progress-text">0/0 segments</span>
        `;
        
        container.appendChild(progressDiv);
        
        // Register progress handler
        window.registerBraidProgressHandler(downloadId, (progress) => {
            const progressFill = progressDiv.querySelector('.progress-fill');
            const progressText = progressDiv.querySelector('.progress-text');
            
            progressFill.style.width = `${progress.percentage || 0}%`;
            progressText.textContent = `${progress.segments || 0}/${progress.total || 0} segments`;
            
            // Update status
            progressDiv.setAttribute('data-status', progress.status || 'downloading');
        });
        
        return progressDiv;
    },
    
    // Update download list
    updateDownloadList: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Get active downloads from plugin
        if (window.braidPlugin) {
            const downloads = window.braidPlugin.getActiveDownloads();
            
            container.innerHTML = '';
            downloads.forEach(download => {
                const downloadDiv = document.createElement('div');
                downloadDiv.className = 'download-item';
                downloadDiv.innerHTML = `
                    <div class="download-info">
                        <span class="download-url">${download.url}</span>
                        <span class="download-status">${download.status}</span>
                    </div>
                    <div class="download-progress-container" id="progress-${download.id}"></div>
                    <div class="download-actions">
                        <button onclick="window.braidPlugin.cancelDownload('${download.id}')">Cancel</button>
                        <button onclick="window.braidPlugin.pauseDownload('${download.id}')">Pause</button>
                    </div>
                `;
                
                container.appendChild(downloadDiv);
                
                // Create progress element for this download
                const progressContainer = document.getElementById(`progress-${download.id}`);
                this.createProgressElement(download.id, progressContainer);
            });
        }
    }
};

/**
 * Electron Main Process Integration
 */
if (typeof require !== 'undefined') {
    const { ipcMain } = require('electron');
    
    // IPC handlers for main process communication
    ipcMain.handle('braid:get-progress', (event, downloadId) => {
        if (window.braidPlugin) {
            return window.braidPlugin.getDownloadProgress(downloadId);
        }
        return null;
    });
    
    ipcMain.handle('braid:get-all-downloads', () => {
        if (window.braidPlugin) {
            return window.braidPlugin.getActiveDownloads();
        }
        return [];
    });
    
    ipcMain.handle('braid:download-video', async (event, url, options) => {
        if (window.braidPlugin) {
            return await window.braidPlugin.downloadVideo(url, options);
        }
        throw new Error('Braid plugin not available');
    });
}

/**
 * Progress Update Patterns
 */
window.braidProgressPatterns = {
    // Pattern 1: Direct store update (Redux/Vuex/etc)
    updateStore: function(downloadId, progress) {
        // Example for Redux
        if (window.store && window.store.dispatch) {
            window.store.dispatch({
                type: 'BRAID_PROGRESS_UPDATE',
                payload: { downloadId, progress }
            });
        }
        
        // Example for Vuex
        if (window.$store) {
            window.$store.commit('updateBraidProgress', { downloadId, progress });
        }
    },
    
    // Pattern 2: Event-driven updates
    emitEvents: function(downloadId, progress) {
        // Custom events
        window.dispatchEvent(new CustomEvent('braid-download-progress', {
            detail: { downloadId, progress }
        }));
        
        // Socket.io updates (if available)
        if (window.io && window.socket) {
            window.socket.emit('braid-progress', { downloadId, progress });
        }
    },
    
    // Pattern 3: Database/API updates
    persistProgress: async function(downloadId, progress) {
        // Local storage
        const downloads = JSON.parse(localStorage.getItem('braidDownloads') || '{}');
        downloads[downloadId] = { ...downloads[downloadId], progress };
        localStorage.setItem('braidDownloads', JSON.stringify(downloads));
        
        // API update (if available)
        if (window.api) {
            try {
                await window.api.updateDownloadProgress(downloadId, progress);
            } catch (error) {
                console.warn('Failed to update download progress via API:', error);
            }
        }
    }
};

// Auto-setup based on detected frameworks
document.addEventListener('DOMContentLoaded', () => {
    // Auto-detect and setup integrations
    if (typeof React !== 'undefined') {
        console.log('Braid Plugin: React integration available');
    }
    
    if (typeof Vue !== 'undefined') {
        console.log('Braid Plugin: Vue integration available');
    }
    
    if (window.store) {
        console.log('Braid Plugin: Redux store detected');
    }
    
    if (window.$store) {
        console.log('Braid Plugin: Vuex store detected');
    }
});

// Export for Node.js environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        braidProgressHandlers: window.braidProgressHandlers,
        braidReactIntegration: window.braidReactIntegration,
        braidVueIntegration: window.braidVueIntegration,
        braidVanillaIntegration: window.braidVanillaIntegration,
        braidProgressPatterns: window.braidProgressPatterns
    };
}
