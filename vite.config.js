import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The fallback block in index.html is only for the un-built source file; strip it from builds.
const stripSourceFallback = {
  name: 'strip-source-fallback',
  apply: 'build',
  transformIndexHtml: (html) =>
    html
      .replace(/\s*<!-- source-fallback:start[\s\S]*?<!-- source-fallback:end -->/, '')
      .replace(' onerror="window.__QC_SRC_FAILED = true"', ''),
};

export default defineConfig(({ mode }) => {
  // `npm run build:standalone` → one self-contained HTML file you can open by double-clicking.
  if (mode === 'standalone') {
    return {
      base: './', // relative paths so the file works from disk and from any sub-folder (e.g. GitHub Pages)
      plugins: [react(), stripSourceFallback, viteSingleFile()],
      build: { outDir: 'standalone', chunkSizeWarningLimit: 2000 },
    };
  }

  return {
    plugins: [react(), stripSourceFallback],
    build: {
      chunkSizeWarningLimit: 600, // the Firebase SDK chunk is ~550 kB (130 kB gzipped)
      rollupOptions: {
        output: {
          // Keep Firebase in its own chunk so the app shell loads fast.
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
