// PDF処理ロジック（DOMに依存しない部分）
import { PDFDocument, EncryptedPDFError } from 'pdf-lib';

export class PdfLoadError extends Error {
  /** @param {'encrypted' | 'invalid' | 'not-pdf'} reason */
  constructor(reason, message) {
    super(message);
    this.name = 'PdfLoadError';
    this.reason = reason;
  }
}

// pdf-lib は ES5 向けにビルドされており EncryptedPDFError の instanceof が機能しないため、
// メッセージでも判定する
function isEncryptedError(err) {
  return err instanceof EncryptedPDFError || /is encrypted/i.test(err?.message ?? '');
}

const ERROR_MESSAGES = {
  encrypted: 'パスワードで保護されているため結合できません',
  invalid: 'PDFを読み込めませんでした（破損しているか非対応の形式です）',
  'not-pdf': 'PDFファイルではありません',
};

export function errorMessage(reason) {
  return ERROR_MESSAGES[reason] ?? ERROR_MESSAGES.invalid;
}

/** ファイル名・MIMEタイプからPDFらしいかを判定する */
export function looksLikePdf(name, type) {
  return type === 'application/pdf' || /\.pdf$/i.test(name);
}

/**
 * PDFのバイト列を検証し、ページ数を返す。
 * 読み込めない場合は PdfLoadError を投げる。
 * @param {Uint8Array} bytes
 * @returns {Promise<{ pageCount: number }>}
 */
export async function inspectPdf(bytes) {
  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (isEncryptedError(err)) {
      throw new PdfLoadError('encrypted', errorMessage('encrypted'));
    }
    throw new PdfLoadError('invalid', errorMessage('invalid'));
  }
  const pageCount = doc.getPageCount();
  if (pageCount === 0) {
    throw new PdfLoadError('invalid', 'ページが含まれていません');
  }
  return { pageCount };
}

/**
 * 複数のPDFを順番に結合する。
 * 失敗した場合は、どのファイルで失敗したかを index に持つエラーを投げる。
 * @param {Uint8Array[]} sources
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfs(sources) {
  const merged = await PDFDocument.create();
  for (let i = 0; i < sources.length; i++) {
    try {
      const src = await PDFDocument.load(sources[i]);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch (err) {
      const reason = isEncryptedError(err) ? 'encrypted' : 'invalid';
      const e = new PdfLoadError(reason, errorMessage(reason));
      e.index = i;
      throw e;
    }
  }
  return merged.save();
}

/**
 * ユーザー入力から安全なファイル名を作る（拡張子 .pdf を補う）。
 * @param {string} input
 */
export function toSafeFilename(input) {
  let name = (input ?? '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  if (!name) name = 'merged';
  return `${name.slice(0, 200)}.pdf`;
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
