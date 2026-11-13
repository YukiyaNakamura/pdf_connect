import { defineConfig } from 'vite';
import { createShortener } from './server/app.js';

// 開発中は Vite のサーバーに URL短縮API を組み込む（npm run dev だけで動く）
function shortenerPlugin() {
  let shortener;
  return {
    name: 'url-shortener',
    apply: 'serve',
    configureServer(server) {
      if (process.env.VITEST) return; // テスト時はDBを作らない
      shortener = createShortener({ dbPath: process.env.DB_PATH });
      server.middlewares.use(async (req, res, next) => {
        try {
          if (!(await shortener.handle(req, res))) next();
        } catch (err) {
          next(err);
        }
      });
      server.httpServer?.once('close', () => shortener.close());
    },
  };
}

export default defineConfig({
  plugins: [shortenerPlugin()],
});
