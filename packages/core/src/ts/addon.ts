import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Try to find the native addon in multiple locations
let addon: any;

const possiblePaths = [
  // Development path (when running from source)
  join(__dirname, '../../build/Release/repo-core.node'),
  // Installed package path
  resolve(__dirname, '../../../core/build/Release/repo-core.node'),
  // Alternative workspace path
  resolve(__dirname, '../../../../packages/core/build/Release/repo-core.node')
];

for (const addonPath of possiblePaths) {
  try {
    addon = require(addonPath);
    break;
  } catch (error) {
    // Continue to next path
  }
}

if (!addon) {
  throw new Error(`Could not load native addon. Tried paths: ${possiblePaths.join(', ')}`);
}

export default addon;