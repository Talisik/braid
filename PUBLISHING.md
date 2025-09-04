# Publishing Guide for Braid Video Downloader

## Before Publishing

1. **Update Version**
   ```bash
   npm version patch  # For bug fixes
   npm version minor  # For new features
   npm version major  # For breaking changes
   ```

2. **Test the Package Locally**
   ```bash
   # Build the package
   npm run build
   
   # Test the example
   node example.js
   
   # Test CLI
   node dist/cli.js --help
   
   # Test package contents
   npm pack --dry-run
   ```

3. **Test Installation in Another Directory**
   ```bash
   # Create test package
   npm pack
   
   # Test in another directory
   mkdir ../test-install
   cd ../test-install
   npm init -y
   npm install ../braid/braid-video-downloader-1.0.0.tgz
   
   # Test usage
   node -e "const { VideoDownloader } = require('braid-video-downloader'); console.log('✅ Package works!');"
   ```

## Publishing to NPM

### First Time Setup

1. **Create NPM Account** (if you don't have one)
   - Go to https://www.npmjs.com/signup
   - Verify your email

2. **Login to NPM**
   ```bash
   npm login
   ```

3. **Check Package Name Availability**
   ```bash
   npm view braid-video-downloader
   # Should return 404 if available
   ```

### Publishing Steps

1. **Final Check**
   ```bash
   npm run build
   npm test  # If you have tests
   ```

2. **Publish**
   ```bash
   npm publish
   ```

### Publishing Scoped Package (Alternative)

If the name is taken, you can publish as a scoped package:

1. **Update package.json**
   ```json
   {
     "name": "@yourusername/braid-video-downloader",
     ...
   }
   ```

2. **Publish with public access**
   ```bash
   npm publish --access public
   ```

## After Publishing

1. **Test Installation**
   ```bash
   npm install braid-video-downloader
   ```

2. **Update GitHub Repository**
   - Update repository URL in package.json
   - Create GitHub release
   - Add badges to README

3. **Create GitHub Release**
   - Tag the version: `git tag v1.0.0`
   - Push tags: `git push --tags`
   - Create release on GitHub

## Usage After Publishing

Users will be able to install and use your package like this:

```bash
# Install globally for CLI usage
npm install -g braid-video-downloader

# Use CLI
braid download "https://example.com/video"

# Or install locally for library usage
npm install braid-video-downloader
```

```javascript
// In their projects
const { VideoDownloader, M3U8Processor } = require('braid-video-downloader');
// or
import { VideoDownloader, M3U8Processor } from 'braid-video-downloader';
```

## Package Features for Users

- ✅ TypeScript support with full type definitions
- ✅ CLI tool (`braid` command)
- ✅ ESM and CommonJS compatibility
- ✅ Automatic browser installation
- ✅ Comprehensive documentation
- ✅ Example usage files
- ✅ Proper error handling
