/**
 * Example Host App Integration
 * 
 * This demonstrates how an Electron app would integrate the Braid plugin
 * using the privileged plugin system.
 */

const { app, BrowserWindow, ipcMain, Menu, Tray, globalShortcut } = require('electron');
const path = require('path');

class ExampleElectronApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.plugins = new Map();
        this.privilegedAPIs = null;
        
        // Plugin system setup
        this.setupPluginSystem();
    }
    
    /**
     * Initialize the plugin system with privileged APIs
     */
    setupPluginSystem() {
        // Create privileged APIs object
        this.privilegedAPIs = {
            // File system access
            require: (moduleName) => {
                console.log(`Plugin requesting module: ${moduleName}`);
                // Security check: only allow specific modules
                const allowedModules = [
                    'braid-video-downloader',
                    'fs',
                    'path',
                    'os'
                ];
                
                if (allowedModules.includes(moduleName)) {
                    return require(moduleName);
                } else {
                    throw new Error(`Module ${moduleName} not allowed`);
                }
            },
            
            // Process spawning (for FFmpeg)
            spawn: require('child_process').spawn,
            exec: require('child_process').exec,
            
            // File system operations
            writeFile: require('fs').promises.writeFile,
            readFile: require('fs').promises.readFile,
            mkdir: require('fs').promises.mkdir,
            
            // System paths
            getDownloadsPath: () => {
                const os = require('os');
                return path.join(os.homedir(), 'Downloads');
            },
            
            getAppDataPath: () => {
                return app.getPath('userData');
            },
            
            // Global shortcuts
            registerGlobalShortcut: (accelerator, callback) => {
                return globalShortcut.register(accelerator, callback);
            },
            
            unregisterGlobalShortcut: (accelerator) => {
                globalShortcut.unregister(accelerator);
            },
            
            // Notifications
            showNotification: (options) => {
                const { Notification } = require('electron');
                if (Notification.isSupported()) {
                    new Notification(options).show();
                }
            },
            
            // Protocol handlers
            registerProtocolHandler: (protocol, handler) => {
                app.setAsDefaultProtocolClient(protocol);
                app.on('open-url', (event, url) => {
                    if (url.startsWith(`${protocol}://`)) {
                        handler(url);
                    }
                });
            },
            
            // Clipboard monitoring
            watchClipboard: (callback) => {
                const { clipboard } = require('electron');
                let lastClipboard = '';
                
                setInterval(() => {
                    const currentClipboard = clipboard.readText();
                    if (currentClipboard !== lastClipboard) {
                        lastClipboard = currentClipboard;
                        callback(currentClipboard);
                    }
                }, 1000);
            }
        };
    }
    
    /**
     * Load and initialize a plugin
     */
    async loadPlugin(pluginPath) {
        try {
            console.log(`Loading plugin from: ${pluginPath}`);
            
            // Load plugin manifest
            const manifestPath = path.join(pluginPath, 'manifest.json');
            const manifest = require(manifestPath);
            
            console.log(`Plugin manifest loaded:`, manifest.name);
            
            // Check if plugin requires privileges
            if (manifest.Privileged) {
                console.log(`Plugin ${manifest.name} requires privileged access`);
                
                // Show privilege request dialog to user
                const granted = await this.requestPrivilegeApproval(manifest);
                if (!granted) {
                    throw new Error('Privileged access denied by user');
                }
            }
            
            // Load plugin code
            const pluginCodePath = path.join(pluginPath, manifest.main);
            const plugin = require(pluginCodePath);
            
            // Create plugin host interface
            const pluginHost = this.createPluginHost(manifest);
            
            // Initialize plugin (standard)
            if (plugin.initialize) {
                await plugin.initialize(pluginHost);
                console.log(`Plugin ${manifest.name} initialized (standard)`);
            }
            
            // Initialize plugin (privileged)
            if (manifest.Privileged && plugin.initializePrivileged) {
                await plugin.initializePrivileged(this.privilegedAPIs);
                console.log(`Plugin ${manifest.name} initialized (privileged)`);
            }
            
            // Store plugin
            this.plugins.set(manifest.name, {
                manifest,
                plugin,
                host: pluginHost
            });
            
            console.log(`Plugin ${manifest.name} loaded successfully`);
            return plugin;
            
        } catch (error) {
            console.error(`Failed to load plugin from ${pluginPath}:`, error);
            throw error;
        }
    }
    
    /**
     * Request privilege approval from user
     */
    async requestPrivilegeApproval(manifest) {
        const { dialog } = require('electron');
        
        const permissions = manifest.permissions?.privileged || [];
        const permissionDescriptions = {
            'file-system-write': 'Write files to your computer (for downloads)',
            'process-spawn': 'Run external programs (FFmpeg for video processing)',
            'network-unrestricted': 'Access any website or URL',
            'browser-automation': 'Control web browsers for video extraction'
        };
        
        const message = `The plugin "${manifest.displayName}" is requesting privileged access:\n\n` +
            permissions.map(perm => `• ${permissionDescriptions[perm] || perm}`).join('\n') +
            '\n\nDo you want to grant these permissions?';
        
        const result = await dialog.showMessageBox(this.mainWindow, {
            type: 'question',
            title: 'Plugin Privilege Request',
            message: message,
            buttons: ['Grant Access', 'Deny'],
            defaultId: 1,
            cancelId: 1
        });
        
        return result.response === 0;
    }
    
    /**
     * Create plugin host interface
     */
    createPluginHost(manifest) {
        return {
            // App integration
            getApp: () => app,
            getMainWindow: () => this.mainWindow,
            
            // Window management
            createWindow: (options) => {
                return new BrowserWindow({
                    parent: this.mainWindow,
                    modal: false,
                    ...options
                });
            },
            
            // API registration
            registerAPI: (apiName, handler) => {
                console.log(`Plugin ${manifest.name} registered API: ${apiName}`);
                ipcMain.handle(`plugin:${manifest.name}:${apiName}`, handler);
            },
            
            // Settings
            getSetting: (key) => {
                // In a real app, this would read from app settings
                const settings = {
                    'braid.downloadDir': path.join(require('os').homedir(), 'Downloads', 'Braid'),
                    'braid.logLevel': 'info',
                    'braid.maxConcurrentDownloads': 3
                };
                return settings[key];
            },
            
            setSetting: (key, value) => {
                console.log(`Setting ${key} = ${value}`);
                // In a real app, this would persist to app settings
            },
            
            // UI integration
            addPanel: (panelConfig) => {
                console.log(`Adding panel: ${panelConfig.title}`);
                // In a real app, this would add to sidebar or tab system
                this.addPluginPanel(manifest.name, panelConfig);
            },
            
            addMenuItem: (menuItem) => {
                console.log(`Adding menu item: ${menuItem.label}`);
                this.addPluginMenuItem(manifest.name, menuItem);
            },
            
            addContextMenu: (contextMenu) => {
                console.log(`Adding context menu: ${contextMenu.title}`);
                // Implementation would add to right-click context menus
            },
            
            // System integration
            setSystemTrayMenu: (menuItems) => {
                if (this.tray) {
                    const contextMenu = Menu.buildFromTemplate(menuItems);
                    this.tray.setContextMenu(contextMenu);
                }
            },
            
            showNotification: (options) => {
                const { Notification } = require('electron');
                if (Notification.isSupported()) {
                    new Notification(options).show();
                }
            },
            
            showDialog: async (options) => {
                const { dialog } = require('electron');
                
                if (options.type === 'prompt') {
                    // Custom prompt dialog
                    return new Promise((resolve) => {
                        const promptWindow = new BrowserWindow({
                            parent: this.mainWindow,
                            modal: true,
                            width: 400,
                            height: 200,
                            webPreferences: {
                                nodeIntegration: true,
                                contextIsolation: false
                            }
                        });
                        
                        const promptHTML = `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <title>${options.title}</title>
                                <style>
                                    body { font-family: Arial, sans-serif; padding: 20px; }
                                    .prompt-container { display: flex; flex-direction: column; gap: 15px; }
                                    input { padding: 8px; font-size: 14px; }
                                    .buttons { display: flex; gap: 10px; justify-content: flex-end; }
                                    button { padding: 8px 16px; }
                                </style>
                            </head>
                            <body>
                                <div class="prompt-container">
                                    <p>${options.message}</p>
                                    <input type="text" id="promptInput" placeholder="${options.placeholder || ''}" />
                                    <div class="buttons">
                                        <button onclick="cancel()">Cancel</button>
                                        <button onclick="submit()">OK</button>
                                    </div>
                                </div>
                                <script>
                                    const { ipcRenderer } = require('electron');
                                    
                                    function submit() {
                                        const value = document.getElementById('promptInput').value;
                                        ipcRenderer.send('prompt-result', { response: 0, inputValue: value });
                                        window.close();
                                    }
                                    
                                    function cancel() {
                                        ipcRenderer.send('prompt-result', { response: 1, inputValue: null });
                                        window.close();
                                    }
                                    
                                    document.getElementById('promptInput').focus();
                                    document.getElementById('promptInput').addEventListener('keypress', (e) => {
                                        if (e.key === 'Enter') submit();
                                        if (e.key === 'Escape') cancel();
                                    });
                                </script>
                            </body>
                            </html>
                        `;
                        
                        promptWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(promptHTML)}`);
                        
                        ipcMain.once('prompt-result', (event, result) => {
                            resolve(result);
                        });
                    });
                } else {
                    return await dialog.showMessageBox(this.mainWindow, options);
                }
            },
            
            // Progress tracking
            updateProgress: (downloadId, progress) => {
                console.log(`Progress update for ${downloadId}:`, progress);
                // Send to renderer process
                this.mainWindow.webContents.send('plugin-progress-update', {
                    plugin: manifest.name,
                    downloadId,
                    progress
                });
            },
            
            updateDownloadStatus: (downloadId, status, error) => {
                console.log(`Status update for ${downloadId}: ${status}`, error || '');
                this.mainWindow.webContents.send('plugin-status-update', {
                    plugin: manifest.name,
                    downloadId,
                    status,
                    error
                });
            },
            
            // Store integration
            updateDownloadStore: (downloadId, data) => {
                console.log(`Store update for ${downloadId}:`, data);
                // In a real app, this would update the app's download management system
            }
        };
    }
    
    /**
     * Add plugin panel to main window
     */
    addPluginPanel(pluginName, panelConfig) {
        // Send to renderer to add panel
        this.mainWindow.webContents.send('add-plugin-panel', {
            plugin: pluginName,
            panel: panelConfig
        });
    }
    
    /**
     * Add plugin menu item
     */
    addPluginMenuItem(pluginName, menuItem) {
        // Get current menu
        const menu = Menu.getApplicationMenu();
        
        // Find or create plugins menu
        let pluginsMenu = menu.items.find(item => item.label === 'Plugins');
        if (!pluginsMenu) {
            const template = menu.items.map(item => ({
                label: item.label,
                submenu: item.submenu
            }));
            
            template.push({
                label: 'Plugins',
                submenu: []
            });
            
            const newMenu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(newMenu);
            pluginsMenu = newMenu.items.find(item => item.label === 'Plugins');
        }
        
        // Add plugin menu item
        if (pluginsMenu && pluginsMenu.submenu) {
            pluginsMenu.submenu.append(new MenuItem({
                label: `${menuItem.label} (${pluginName})`,
                click: menuItem.click
            }));
        }
    }
    
    /**
     * Initialize the app
     */
    async initialize() {
        // Create main window
        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        
        // Load main app UI
        const mainHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Example App with Braid Plugin</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
                    .container { display: flex; gap: 20px; }
                    .sidebar { width: 250px; }
                    .main-content { flex: 1; }
                    .plugin-panel { border: 1px solid #ccc; margin: 10px 0; padding: 15px; }
                    .download-item { border: 1px solid #ddd; margin: 5px 0; padding: 10px; }
                    .progress-bar { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
                    .progress-fill { height: 100%; background: #4CAF50; transition: width 0.3s; }
                    button { padding: 8px 16px; margin: 5px; cursor: pointer; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="sidebar">
                        <h3>Plugins</h3>
                        <div id="plugin-panels"></div>
                    </div>
                    <div class="main-content">
                        <h1>Example App with Braid Plugin</h1>
                        <div>
                            <h3>Quick Download</h3>
                            <input type="text" id="urlInput" placeholder="Enter video URL..." style="width: 300px; padding: 8px;" />
                            <button onclick="downloadVideo()">Download</button>
                        </div>
                        <div>
                            <h3>Active Downloads</h3>
                            <div id="downloads-list"></div>
                        </div>
                    </div>
                </div>
                
                <script>
                    const { ipcRenderer } = require('electron');
                    
                    // Plugin communication
                    async function downloadVideo() {
                        const url = document.getElementById('urlInput').value;
                        if (!url) return;
                        
                        try {
                            const result = await ipcRenderer.invoke('plugin:braid-video-downloader:braid.downloadVideo', url);
                            console.log('Download result:', result);
                            updateDownloadsList();
                        } catch (error) {
                            console.error('Download failed:', error);
                            alert('Download failed: ' + error.message);
                        }
                    }
                    
                    async function updateDownloadsList() {
                        try {
                            const downloads = await ipcRenderer.invoke('plugin:braid-video-downloader:braid.getActiveDownloads');
                            const listContainer = document.getElementById('downloads-list');
                            
                            listContainer.innerHTML = downloads.map(download => \`
                                <div class="download-item" data-id="\${download.id}">
                                    <div><strong>URL:</strong> \${download.url}</div>
                                    <div><strong>Status:</strong> \${download.status}</div>
                                    <div class="progress-bar">
                                        <div class="progress-fill" style="width: \${download.progress?.percentage || 0}%"></div>
                                    </div>
                                    <div>\${download.progress?.segments || 0}/\${download.progress?.total || 0} segments</div>
                                    <button onclick="cancelDownload('\${download.id}')">Cancel</button>
                                </div>
                            \`).join('');
                        } catch (error) {
                            console.error('Failed to update downloads list:', error);
                        }
                    }
                    
                    async function cancelDownload(downloadId) {
                        try {
                            await ipcRenderer.invoke('plugin:braid-video-downloader:braid.cancelDownload', downloadId);
                            updateDownloadsList();
                        } catch (error) {
                            console.error('Failed to cancel download:', error);
                        }
                    }
                    
                    // Listen for plugin events
                    ipcRenderer.on('plugin-progress-update', (event, data) => {
                        console.log('Progress update:', data);
                        updateDownloadsList();
                    });
                    
                    ipcRenderer.on('plugin-status-update', (event, data) => {
                        console.log('Status update:', data);
                        updateDownloadsList();
                    });
                    
                    ipcRenderer.on('add-plugin-panel', (event, data) => {
                        console.log('Adding plugin panel:', data);
                        const panelsContainer = document.getElementById('plugin-panels');
                        const panelDiv = document.createElement('div');
                        panelDiv.className = 'plugin-panel';
                        panelDiv.innerHTML = \`
                            <h4>\${data.panel.title}</h4>
                            <p>Plugin: \${data.plugin}</p>
                        \`;
                        panelsContainer.appendChild(panelDiv);
                    });
                    
                    // Update downloads list every 2 seconds
                    setInterval(updateDownloadsList, 2000);
                    
                    // Initial load
                    updateDownloadsList();
                </script>
            </body>
            </html>
        `;
        
        this.mainWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(mainHTML)}`);
        
        // Create system tray
        this.tray = new Tray(path.join(__dirname, 'assets', 'tray-icon.png'));
        this.tray.setToolTip('Example App');
        
        // Load Braid plugin
        try {
            await this.loadPlugin(path.join(__dirname, '../plugin'));
            console.log('Braid plugin loaded successfully');
        } catch (error) {
            console.error('Failed to load Braid plugin:', error);
        }
    }
}

// App lifecycle
app.whenReady().then(async () => {
    const exampleApp = new ExampleElectronApp();
    await exampleApp.initialize();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const exampleApp = new ExampleElectronApp();
        exampleApp.initialize();
    }
});

module.exports = ExampleElectronApp;
