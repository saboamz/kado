import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base is set for GitHub Pages project-site hosting (/kado/).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.GITHUB_PAGES === 'true' ? '/kado/' : '/',
  build: {
    rollupOptions: {
      output: {
        // The Supabase client is ~200 kB of the bundle and changes on a
        // different cadence from our own code. Splitting it means an app
        // deploy does not invalidate it in everyone's cache, and vice versa.
        manualChunks: {
          supabase: ['@supabase/supabase-js'],
          router: ['react-router-dom'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
