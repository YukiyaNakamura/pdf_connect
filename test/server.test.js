import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { createShortener } from '../server/app.js';

let server, base, shortener;

beforeAll(async () => {
  shortener = createShortener({ dbPath: ':memory:', rateLimit: { max: 1000, windowMs: 60_000 } });
  server = createServer(async (req, res) => {
    if (!(await shortener.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  shortener.close();
});

const shorten = (url) =>
  fetch(`${base}/api/shorten`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });

describe('URL短縮API', () => {
  it('短縮して、検索条件・ページ内の位置ごと元のURLへリダイレクトする', async () => {
    const target = 'https://example.com/path/to?q=hello%20world&page=2#section-3';
    const res = await shorten(target);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.shortUrl).toMatch(new RegExp(`^${base}/s/[A-Za-z0-9]{7}$`));

    const redirect = await fetch(data.shortUrl, { redirect: 'manual' });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe(target);
  });

  it('同じURLには同じ短縮リンクを返す', async () => {
    const a = await (await shorten('https://example.org/same')).json();
    const b = await (await shorten('https://example.org/same')).json();
    expect(a.code).toBe(b.code);
  });

  it('無効なURLは400とエラーメッセージ', async () => {
    for (const url of ['javascript:alert(1)', 'not a url', '', 123]) {
      const res = await shorten(url);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBeTruthy();
    }
  });

  it('自分の短縮リンクの再短縮は拒否', async () => {
    const { shortUrl } = await (await shorten('https://example.net/')).json();
    const res = await shorten(shortUrl);
    expect(res.status).toBe(400);
  });

  it('壊れたJSONは400', async () => {
    const res = await fetch(`${base}/api/shorten`, { method: 'POST', body: '{' });
    expect(res.status).toBe(400);
  });

  it('存在しないコードは404', async () => {
    const res = await fetch(`${base}/s/nothere`, { redirect: 'manual' });
    expect(res.status).toBe(404);
  });

  it('GETで /api/shorten は405', async () => {
    expect((await fetch(`${base}/api/shorten`)).status).toBe(405);
  });

  it('レート制限を超えると429', async () => {
    const limited = createShortener({ dbPath: ':memory:', rateLimit: { max: 1, windowMs: 60_000 } });
    const s = createServer(async (req, res) => { await limited.handle(req, res); });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${s.address().port}/api/shorten`;
    const post = () => fetch(url, { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
    s.close();
    limited.close();
  });
});
