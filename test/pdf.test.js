import { describe, it, expect } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
import { inspectPdf, mergePdfs, toSafeFilename, PdfLoadError, looksLikePdf } from '../src/pdf.js';

async function makePdf(pages) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

// トレーラーに /Encrypt を持つPDF（パスワード付きPDFの判定用）
async function makeEncryptedPdf() {
  const doc = await PDFDocument.create();
  doc.addPage();
  const encrypt = doc.context.obj({ Filter: PDFName.of('Standard'), V: 1, R: 2 });
  doc.context.trailerInfo.Encrypt = doc.context.register(encrypt);
  return doc.save({ useObjectStreams: false });
}

describe('inspectPdf', () => {
  it('ページ数を返す', async () => {
    expect(await inspectPdf(await makePdf(3))).toEqual({ pageCount: 3 });
  });

  it('パスワード付きPDFは encrypted エラー', async () => {
    const err = await inspectPdf(await makeEncryptedPdf()).catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.reason).toBe('encrypted');
  });

  it('壊れたデータは invalid エラー', async () => {
    const err = await inspectPdf(new TextEncoder().encode('not a pdf')).catch((e) => e);
    expect(err).toBeInstanceOf(PdfLoadError);
    expect(err.reason).toBe('invalid');
  });
});

describe('mergePdfs', () => {
  it('指定順にページを結合する', async () => {
    const a = await PDFDocument.create();
    a.addPage([100, 100]);
    const b = await PDFDocument.create();
    b.addPage([300, 300]);
    b.addPage([300, 300]);
    const out = await PDFDocument.load(await mergePdfs([await b.save(), await a.save()]));
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(0).getWidth()).toBe(300);
    expect(out.getPage(2).getWidth()).toBe(100);
  });

  it('失敗したファイルの位置を返す', async () => {
    const err = await mergePdfs([await makePdf(1), await makeEncryptedPdf()]).catch((e) => e);
    expect(err.index).toBe(1);
    expect(err.reason).toBe('encrypted');
  });
});

describe('toSafeFilename', () => {
  it.each([
    ['report', 'report.pdf'],
    ['report.PDF', 'report.pdf'],
    ['  ', 'merged.pdf'],
    ['a/b:c?', 'a_b_c_.pdf'],
    ['..hidden', 'hidden.pdf'],
    ['請求書_2026', '請求書_2026.pdf'],
  ])('%s → %s', (input, expected) => {
    expect(toSafeFilename(input)).toBe(expected);
  });
});

describe('looksLikePdf', () => {
  it('MIMEタイプか拡張子で判定する', () => {
    expect(looksLikePdf('a.pdf', '')).toBe(true);
    expect(looksLikePdf('a', 'application/pdf')).toBe(true);
    expect(looksLikePdf('a.png', 'image/png')).toBe(false);
  });
});
