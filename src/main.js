import './tabs.js';
import './shorten.js';
import { inspectPdf, mergePdfs, looksLikePdf, errorMessage, toSafeFilename, formatSize } from './pdf.js';

/**
 * @typedef {{
 *   id: number,
 *   name: string,
 *   size: number,
 *   status: 'loading' | 'ok' | 'error',
 *   error?: string,
 *   pageCount?: number,
 *   bytes?: Uint8Array,
 * }} Item
 */

/** @type {Item[]} */
let items = [];
let nextId = 1;
let merging = false;

const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('file-input');
const list = $('file-list');
const empty = $('empty');
const count = $('count');
const clearBtn = $('clear');
const filenameInput = $('filename');
const mergeBtn = $('merge');
const message = $('message');
const live = $('live');

// ---------- 追加 ----------

fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = ''; // 同じファイルを再選択できるように
});

let dragDepth = 0;
dropzone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropzone.classList.add('is-dragover');
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});
dropzone.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropzone.classList.remove('is-dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropzone.classList.remove('is-dragover');
  addFiles(e.dataTransfer.files);
});
// ドロップ領域の外に落としたときにブラウザがPDFを開いてしまうのを防ぐ
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

/** @param {FileList | File[]} files */
function addFiles(files) {
  const added = Array.from(files ?? []);
  if (added.length === 0) return;
  hideMessage();

  for (const file of added) {
    /** @type {Item} */
    const item = { id: nextId++, name: file.name, size: file.size, status: 'loading' };
    items.push(item);
    if (!looksLikePdf(file.name, file.type)) {
      item.status = 'error';
      item.error = errorMessage('not-pdf');
      continue;
    }
    loadItem(item, file);
  }
  announce(`${added.length}件のファイルを追加しました`);
  render();
}

async function loadItem(item, file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { pageCount } = await inspectPdf(bytes);
    Object.assign(item, { status: 'ok', bytes, pageCount });
  } catch (err) {
    Object.assign(item, { status: 'error', error: err.message || errorMessage('invalid') });
  }
  if (items.includes(item)) render();
}

// ---------- 並べ替え・削除 ----------

list.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.closest('li').dataset.id);
  const index = items.findIndex((it) => it.id === id);
  if (index < 0) return;
  const action = btn.dataset.action;

  if (action === 'up' || action === 'down') {
    const to = action === 'up' ? index - 1 : index + 1;
    if (to < 0 || to >= items.length) return;
    [items[index], items[to]] = [items[to], items[index]];
    render();
    announce(`「${items[to].name}」を${to + 1}番目に移動しました`);
    restoreFocus(id, action);
  } else if (action === 'remove') {
    const [removed] = items.splice(index, 1);
    render();
    announce(`「${removed.name}」を削除しました`);
    // 削除後は近くの項目、なければファイル選択にフォーカス
    const neighbor = items[index] ?? items[index - 1];
    if (neighbor) list.querySelector(`li[data-id="${neighbor.id}"] [data-action="remove"]`)?.focus();
    else fileInput.focus();
  }
});

/** 移動後も同じボタンにフォーカスを残す（端に着いたら反対側のボタンへ） */
function restoreFocus(id, action) {
  const li = list.querySelector(`li[data-id="${id}"]`);
  if (!li) return;
  const same = li.querySelector(`[data-action="${action}"]`);
  const other = li.querySelector(`[data-action="${action === 'up' ? 'down' : 'up'}"]`);
  (same && !same.disabled ? same : other)?.focus();
}

clearBtn.addEventListener('click', () => {
  items = [];
  hideMessage();
  render();
  announce('すべてのファイルを削除しました');
});

// ---------- 結合 ----------

mergeBtn.addEventListener('click', async () => {
  const errors = items.filter((it) => it.status === 'error');
  if (errors.length > 0) {
    showMessage(`読み込めないファイルがあります。該当ファイルを削除してから結合してください：${errors.map((e) => `「${e.name}」`).join('、')}`);
    list.querySelector(`li[data-id="${errors[0].id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const targets = items.filter((it) => it.status === 'ok');
  if (targets.length === 0) return;

  merging = true;
  hideMessage();
  render();
  try {
    const out = await mergePdfs(targets.map((it) => it.bytes));
    const filename = toSafeFilename(filenameInput.value);
    download(out, filename);
    announce(`${filename} をダウンロードしました`);
  } catch (err) {
    const failed = typeof err.index === 'number' ? targets[err.index] : null;
    if (failed) {
      failed.status = 'error';
      failed.error = err.message;
      showMessage(`「${failed.name}」の結合中にエラーが発生しました：${err.message}`);
    } else {
      showMessage('結合中に予期しないエラーが発生しました。もう一度お試しください。');
      console.error(err);
    }
  } finally {
    merging = false;
    render();
  }
});

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

filenameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !mergeBtn.disabled) mergeBtn.click();
});

// ---------- 描画 ----------

function render() {
  list.replaceChildren(...items.map(renderItem));

  const hasItems = items.length > 0;
  empty.hidden = hasItems;
  clearBtn.hidden = !hasItems;
  count.textContent = hasItems ? `（${items.length}件）` : '';

  const loading = items.some((it) => it.status === 'loading');
  const okCount = items.filter((it) => it.status === 'ok').length;
  mergeBtn.disabled = merging || loading || okCount === 0;
  mergeBtn.textContent = merging ? '結合しています…' : loading ? '読み込み中…' : '結合してダウンロード';
}

/** @param {Item} item @param {number} i */
function renderItem(item, i) {
  const li = document.createElement('li');
  li.className = `file-item is-${item.status}`;
  li.dataset.id = String(item.id);

  const order = el('span', 'order', String(i + 1));
  order.setAttribute('aria-hidden', 'true');

  const info = el('div', 'info');
  info.append(el('span', 'name', item.name));
  if (item.status === 'error') {
    const err = el('span', 'error', `⚠ ${item.error}`);
    info.append(err);
  } else {
    const meta = item.status === 'loading'
      ? '読み込み中…'
      : `${item.pageCount}ページ・${formatSize(item.size)}`;
    info.append(el('span', 'meta', meta));
  }

  const actions = el('div', 'actions');
  actions.append(
    iconButton('up', '↑', `「${item.name}」を上へ移動`, i === 0 || merging),
    iconButton('down', '↓', `「${item.name}」を下へ移動`, i === items.length - 1 || merging),
    iconButton('remove', '✕', `「${item.name}」を削除`, merging),
  );

  li.append(order, info, actions);
  return li;
}

function iconButton(action, text, label, disabled) {
  const b = el('button', `icon-button icon-${action}`, text);
  b.type = 'button';
  b.dataset.action = action;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.disabled = disabled;
  return b;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}
function hideMessage() {
  message.hidden = true;
  message.textContent = '';
}
function announce(text) {
  live.textContent = '';
  requestAnimationFrame(() => (live.textContent = text));
}

render();
