// URLの検証（ブラウザとサーバーの両方で使う）

export const MAX_URL_LENGTH = 8000;

/**
 * 短縮できるURLかを検証する。
 * 成功時は正規化したURL（検索条件・ページ内の位置を含む）を返す。
 * @param {string} input
 * @returns {{ ok: true, url: string } | { ok: false, error: string }}
 */
export function validateUrl(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return { ok: false, error: 'URLを入力してください' };
  if (text.length > MAX_URL_LENGTH) {
    return { ok: false, error: `URLが長すぎます（${MAX_URL_LENGTH}文字まで）` };
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) {
    return { ok: false, error: 'URLは http:// または https:// から入力してください' };
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: 'URLの形式が正しくありません' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: 'http または https のURLのみ短縮できます' };
  }
  if (!url.hostname) {
    return { ok: false, error: 'URLにドメイン名がありません' };
  }
  // new URL() は非ASCII文字をエンコードするので、リダイレクト先として安全に使える
  return { ok: true, url: url.href };
}
