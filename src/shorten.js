// URL短縮タブ
import { validateUrl } from './url.js';

const $ = (id) => document.getElementById(id);
const form = $('shorten-form');
const input = $('long-url');
const button = $('shorten-btn');
const errorBox = $('shorten-error');
const result = $('shorten-result');
const shortUrlField = $('short-url');
const copyBtn = $('copy-btn');
const copyStatus = $('copy-status');
const originalLink = $('original-url');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const check = validateUrl(input.value);
  if (!check.ok) {
    showError(check.error);
    input.focus();
    return;
  }

  setBusy(true);
  try {
    const data = await requestShorten(check.url);
    showResult(data);
  } catch (err) {
    showError(err.message);
  } finally {
    setBusy(false);
  }
});

input.addEventListener('input', hideError);

async function requestShorten(url) {
  let res;
  try {
    res = await fetch('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error('サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.shortUrl) {
    throw new Error(data?.error ?? `短縮に失敗しました（エラーコード ${res.status}）。もう一度お試しください`);
  }
  return data;
}

function showResult({ shortUrl, url }) {
  shortUrlField.value = shortUrl;
  originalLink.href = url;
  originalLink.textContent = url;
  copyStatus.textContent = '';
  copyBtn.textContent = 'コピー';
  result.hidden = false;
  copyBtn.focus();
}

copyBtn.addEventListener('click', async () => {
  const text = shortUrlField.value;
  if (!text) return;
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    // http接続や古いブラウザ向けのフォールバック
    shortUrlField.select();
    ok = document.execCommand?.('copy') ?? false;
  }
  copyStatus.textContent = ok ? 'コピーしました' : 'コピーできませんでした。リンクを長押し（または選択）してコピーしてください';
  copyStatus.classList.toggle('is-error', !ok);
  if (ok) {
    copyBtn.textContent = 'コピー済み';
    clearTimeout(copyBtn._timer);
    copyBtn._timer = setTimeout(() => (copyBtn.textContent = 'コピー'), 2000);
  }
});

// 読み取り専用欄をタップしたら全選択して手動コピーしやすくする
shortUrlField.addEventListener('focus', () => shortUrlField.select());

function setBusy(busy) {
  button.disabled = busy;
  button.textContent = busy ? '短縮しています…' : '短縮する';
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
  input.removeAttribute('aria-invalid');
}
