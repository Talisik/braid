# Braid Video Downloader - Privileged Plugin

A lightweight, privileged plugin that provides video downloading capabilities to Electron applications using the Braid video downloader package.

## 📦 **Installation**

### For Electron App Developers

1. **Install Braid from GitHub:**
   ```bash
   npm install git+https://github.com/Talisik/braid.git
   ```

2. **Plugin files are automatically available:**
   ```
   node_modules/braid/plugin/
   ├── plugin.js           # Main plugin file
   ├── manifest.json       # Plugin manifest
   ├── progress-handler.js # Progress handling examples
   └── example-host-app.js # Integration example
   ```

3. **Use in your Electron app:**
   ```javascript
   // In your main process
   const pluginPath = path.join(__dirname, 'node_modules', 'braid', 'plugin', 'plugin.js');
   const plugin = await import(pluginPath);
   ```

### What Happens During Installation

- ✅ **Dependencies installed** (Playwright, FFmpeg, etc.)
- ✅ **TypeScript compiled** to `dist/` (automatic via `prepare` script)
- ✅ **Firefox browser installed** for Playwright
- ✅ **Plugin files ready** in `node_modules/braid/plugin/`

## 🔌 **Plugin Architecture**

This plugin uses the **privileged plugin pattern** instead of bundling the entire Braid codebase:

- **Lightweight**: Only contains plugin interface code
- **Secure**: Uses privileged APIs with user approval
- **Efficient**: Leverages existing Braid package as dependency
- **Flexible**: Easy integration with any Electron app

## 📁 **Plugin Structure**

```
plugin/
├── manifest.json           # Plugin configuration and permissions
├── plugin.js              # Main plugin code with initialize() methods
├── progress-handler.js     # Progress tracking and UI integration helpers
├── example-host-app.js     # Example Electron app showing integration
└── README.md              # This file
```

## 🚀 **How It Works**

### 1. **Standard Initialization** (`initialize()`)
- Sets up basic UI components (panels, menus, system tray)
- Registers non-privileged APIs (progress tracking, download list)
- Requests privileged access from user

### 2. **Privileged Initialization** (`initializePrivileged()`)
- Gains access to file system, process spawning, browser automation
- Loads Braid package using privileged `require()`
- Registers privileged APIs (actual downloading functions)
- Sets up system-level integrations (shortcuts, protocols)

### 3. **Security Model**
- User explicitly approves privileged access
- Only specific modules can be loaded
- All privileged operations are audited
- Plugin can be disabled/unloaded safely

## 📋 **Required Permissions**

### Standard Permissions
- `downloads` - Show download notifications
- `notifications` - Display system notifications

### Privileged Permissions
- `file-system-write` - Save downloaded video files
- `process-spawn` - Run FFmpeg for video processing
- `network-unrestricted` - Access video streaming URLs
- `browser-automation` - Launch browsers for video extraction

## 🔧 **Installation & Usage**

### 1. **Install Plugin in Host App**

```javascript
// In your Electron app
const exampleApp = new ExampleElectronApp();
await exampleApp.loadPlugin('./path/to/braid/plugin');
```

### 2. **User Approval Flow**
1. Plugin requests privileged access
2. User sees permission dialog explaining what plugin needs
3. User approves/denies access
4. Plugin initializes with appropriate permissions

### 3. **Using Plugin APIs**

```javascript
// From renderer process
const result = await ipcRenderer.invoke('plugin:braid-video-downloader:braid.downloadVideo', url);

// From main process
const braidPlugin = plugins.get('braid-video-downloader');
await braidPlugin.downloadVideo(url, options);
```

## 🎨 **UI Integration Patterns**

### **React Integration**
```jsx
function DownloadManager() {
    const [downloads, setDownloads] = useState([]);
    
    useEffect(() => {
        // Listen for progress updates
        window.addEventListener('braid-progress', (event) => {
            const { downloadId, progress } = event.detail;
            // Update download state
        });
    }, []);
    
    return <div>{/* Download UI */}</div>;
}
```

### **Vue Integration**
```vue
<template>
    <div v-for="download in downloads" :key="download.id">
        <progress-bar :progress="download.progress" />
    </div>
</template>

<script>
export default {
    mounted() {
        window.registerBraidProgressHandler(this.downloadId, this.updateProgress);
    }
}
</script>
```

### **Vanilla JS Integration**
```javascript
// Create progress tracking
window.braidVanillaIntegration.createProgressElement(downloadId, container);

// Update download list
window.braidVanillaIntegration.updateDownloadList('downloads-container');
```

## 🔄 **Progress Tracking**

The plugin provides multiple ways to handle progress updates:

### **Direct Store Updates**
```javascript
// Redux
window.braidProgressPatterns.updateStore(downloadId, progress);

// Vuex  
window.braidProgressPatterns.updateStore(downloadId, progress);
```

### **Event-Driven Updates**
```javascript
// Custom events
window.addEventListener('braid-download-progress', (event) => {
    const { downloadId, progress } = event.detail;
    // Handle progress update
});
```

### **Persistent Updates**
```javascript
// Local storage + API
await window.braidProgressPatterns.persistProgress(downloadId, progress);
```

## 🌟 **Key Benefits**

### **vs. Full Package Integration**
| Aspect | Full Package | Privileged Plugin |
|--------|-------------|------------------|
| **Size** | Large bundle | Lightweight interface |
| **Security** | Full access | User-approved permissions |
| **Updates** | App rebuild | Plugin update only |
| **Integration** | Manual API calls | Event-driven + UI panels |
| **Distribution** | Part of app | Plugin marketplace |

### **vs. Standard Plugin**
| Aspect | Standard Plugin | Privileged Plugin |
|--------|----------------|------------------|
| **File Access** | Limited | Full file system |
| **Process Spawning** | Not allowed | FFmpeg execution |
| **Network Access** | Restricted | Unrestricted URLs |
| **Browser Control** | Not possible | Full automation |

## 🔐 **Security Features**

1. **Explicit User Consent**: User must approve privileged access
2. **Module Allowlist**: Only specific modules can be loaded
3. **Audit Logging**: All privileged operations are logged
4. **Sandboxed Execution**: Plugin runs in controlled environment
5. **Revokable Permissions**: Can be disabled at any time

## 📱 **System Integration**

- **System Tray**: Quick download from clipboard
- **Global Shortcuts**: `Ctrl+Shift+D` for quick download
- **Protocol Handlers**: `braid://video-url` links
- **Context Menus**: Right-click "Download with Braid"
- **Clipboard Monitoring**: Auto-detect video URLs

## 🎯 **Example Host App**

The `example-host-app.js` demonstrates:
- Plugin loading with privilege requests
- UI integration with download manager
- Progress tracking and updates
- IPC communication patterns
- System integration features

Run the example:
```bash
cd plugin
npm install electron
node example-host-app.js
```

## 🚀 **Next Steps**

1. **Package for Distribution**: Create npm package for plugin
2. **Plugin Marketplace**: Submit to Electron plugin marketplace
3. **Advanced UI**: Create rich download management interface
4. **Cloud Integration**: Add cloud storage upload capabilities
5. **Batch Processing**: Support multiple concurrent downloads

This privileged plugin approach gives you the **power of the full Braid package** with the **convenience of a drop-in plugin** and the **security of user-approved permissions**! 🎉
