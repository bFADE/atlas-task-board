import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Never let the dev server hand out the SQLite database (it lives inside the project root,
 * which Vite serves). fs.deny covers /@fs/ and module requests; this covers plain static paths.
 */
const blockData = (): Plugin => ({
  name: 'atlas-block-data',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const path = decodeURIComponent((req.url ?? '').split('?')[0]).toLowerCase();
      if (path.startsWith('/data/') || /\.db(-wal|-shm|-journal)?$/.test(path) || path.includes('/data/')) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      next();
    });
  },
});

export default defineConfig({
  plugins: [blockData(), react(), tailwindcss()],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    fs: {
      strict: true,
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/*.db', '**/*.db-*'],
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
