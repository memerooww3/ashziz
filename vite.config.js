import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import handler from './api/enquiries.js';

function copyStaticAssetsPlugin() {
  return {
    name: 'copy-static-assets',
    closeBundle() {
      const outDir = path.resolve('dist');
      if (!fs.existsSync(outDir)) return;

      // Copy static assets into dist/assets (merges alongside Vite bundle chunks)
      const srcAssets = path.resolve('assets');
      const destAssets = path.join(outDir, 'assets');
      if (fs.existsSync(srcAssets)) {
        fs.cpSync(srcAssets, destAssets, { recursive: true });
      }

      // Copy vendor libraries & DRACO wasm/decoder files into dist/vendor
      const srcVendor = path.resolve('vendor');
      const destVendor = path.join(outDir, 'vendor');
      if (fs.existsSync(srcVendor)) {
        fs.cpSync(srcVendor, destVendor, { recursive: true });
      }

      // Copy static metadata, robots, and public media into dist root
      for (const file of ['legal.json', 'white.jpg', 'robots.txt']) {
        const srcFile = path.resolve(file);
        const destFile = path.join(outDir, file);
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [
    {
      name: 'ashziz-enquiry-api',
      configureServer(server) {
        server.middlewares.use('/api/enquiries', (req, res, next) => {
          handler(req, res).catch(next);
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use('/api/enquiries', (req, res, next) => {
          handler(req, res).catch(next);
        });
      }
    },
    copyStaticAssetsPlugin()
  ],
  build: {
    // Disable source maps in production to prevent leaking internal code structure
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    port: 5173,
    host: true,
    open: false
  },
  publicDir: false
});
