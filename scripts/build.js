import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

console.log('====================================================');
console.log('📦 BUILDING MONEY CLARITY PRODUCTION BUNDLE');
console.log('====================================================');

// 1. Ensure dist folder
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Copy all public assets to dist
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('[Build] Copying public client assets to dist/...');
copyDirSync(publicDir, distDir);

// 3. Verify essential files exist
const requiredFiles = [
    'index.html',
    'auth.html',
    '_redirects',
    'css/style.css',
    'css/auth.css',
    'js/api.js',
    'js/app.js',
    'js/auth.js',
    'images/logo.png'
];

let allValid = true;
for (const file of requiredFiles) {
    const fullPath = path.join(distDir, file);
    if (!fs.existsSync(fullPath)) {
        console.error(`❌ Missing build artifact: ${file}`);
        allValid = false;
    } else {
        const stats = fs.statSync(fullPath);
        console.log(`✓ Verified: ${file} (${stats.size} bytes)`);
    }
}

if (!allValid) {
    console.error('❌ Build failed due to missing files.');
    process.exit(1);
}

console.log('\n====================================================');
console.log('✅ PRODUCTION BUILD COMPLETED SUCCESSFULLY!');
console.log('🚀 Ready for Netlify Deployment.');
console.log('====================================================\n');
