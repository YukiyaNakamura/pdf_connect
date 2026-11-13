// URL短縮のAPIとリダイレクトを処理する（依存ライブラリなし）
//   POST /api/shorten  { "url": "https://..." } → { "code", "shortUrl", "url" }
//   GET  /s/:code      → 元のURLへ 302 リダイレクト
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomInt } from 'node:crypto';
import { validateUrl } from '../src/url.js';

const CODE_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
const CODE_LENGTH = 7;
const CODE_PATTERN = /^[A-Za-z0-9]{1,32}$/;
const MAX_BODY_BYTES = 16 * 1024;

/**
 * @param {{
 *   dbPath?: string,
 *   publicBaseUrl?: string,      // 例: https://example.com（未指定ならリクエストのホストから作る）
 *   rateLimit?: { max: number, windowMs: number },
 * }} [options]
 */
export function createShortener(options = {}) {
  const dbPath = options.dbPath ?? 'data/links.db';
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      code       TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS links_url ON links(url);
  `);
  const findByUrl = db.prepare('SELECT code FROM links WHERE url = ?');
  const findByCode = db.prepare('SELECT url FROM links WHERE code = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO links (code, url) VALUES (?, ?)');

  const limiter = createRateLimiter(options.rateLimit ?? { max: 30, windowMs: 60_000 });

  function save(url) {
    const existing = findByUrl.get(url);
    if (existing) return existing.code;
    for (let i = 0; i < 10; i++) {
      const code = generateCode();
      if (insert.run(code, url).changes === 1) return code;
    }
    throw new Error('短縮コードを生成できませんでした');
  }

  /**
   * 処理したら true、対象外のパスなら false を返す（Connect 形式のミドルウェアとしても使える）
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   */
  async function handle(req, res) {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    if (pathname === '/api/shorten') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'POSTで送信してください' }, { Allow: 'POST' });
        return true;
      }
      if (!limiter(clientIp(req))) {
        sendJson(res, 429, { error: '短時間に多くのリクエストがありました。しばらく待ってからお試しください' });
        return true;
      }
      let body;
      try {
        body = JSON.parse(await readBody(req));
      } catch (err) {
        const tooLarge = err?.code === 'TOO_LARGE';
        sendJson(res, tooLarge ? 413 : 400, { error: tooLarge ? 'URLが長すぎます' : 'リクエストの形式が正しくありません' });
        return true;
      }
      const result = validateUrl(body?.url);
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return true;
      }
      const base = baseUrl(req, options.publicBaseUrl);
      if (isOwnShortLink(result.url, base)) {
        sendJson(res, 400, { error: 'すでに短縮されたリンクです' });
        return true;
      }
      try {
        const code = save(result.url);
        sendJson(res, 201, { code, shortUrl: `${base}/s/${code}`, url: result.url });
      } catch (err) {
        console.error(err);
        sendJson(res, 500, { error: 'サーバーで短縮に失敗しました。もう一度お試しください' });
      }
      return true;
    }

    const match = pathname.match(/^\/s\/([^/]+)\/?$/);
    if (match && (req.method === 'GET' || req.method === 'HEAD')) {
      const code = match[1];
      const row = CODE_PATTERN.test(code) ? findByCode.get(code) : undefined;
      if (!row) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(NOT_FOUND_HTML);
        return true;
      }
      res.writeHead(302, {
        Location: row.url,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      });
      res.end();
      return true;
    }

    return false;
  }

  return { handle, close: () => db.close() };
}

function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function baseUrl(req, configured) {
  if (configured) return configured.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim()
    || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}`;
}

function isOwnShortLink(url, base) {
  try {
    const u = new URL(url);
    return u.host === new URL(base).host && u.pathname.startsWith('/s/');
  } catch {
    return false;
  }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function createRateLimiter({ max, windowMs }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
      }
      return true;
    }
    entry.count++;
    return entry.count <= max;
  };
}

const NOT_FOUND_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>リンクが見つかりません</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;line-height:1.7;color:#1c2026;background:#f6f7f9}
@media (prefers-color-scheme: dark){body{color:#e8eaee;background:#14161a}a{color:#6b98ff}}</style></head>
<body><h1>リンクが見つかりません</h1><p>この短縮リンクは存在しないか、URLが間違っている可能性があります。</p><p><a href="/">トップへ戻る</a></p></body></html>`;
