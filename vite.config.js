import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  // `npm run build:standalone` → one self-contained HTML file you can open by double-clicking.
  if (mode === 'standalone') {
    return {
      plugins: [react(), viteSingleFile()],
      build: { outDir: 'standalone', chunkSizeWarningLimit: 2000 },
    };
  }

  return {
    plugins: [react()],
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
