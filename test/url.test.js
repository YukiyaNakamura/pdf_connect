import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/url.js';

describe('validateUrl', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['http://example.com/a/b?q=1&r=2#sec', 'http://example.com/a/b?q=1&r=2#sec'],
    ['  https://example.com/?q=日本語#見出し  ', 'https://example.com/?q=%E6%97%A5%E6%9C%AC%E8%AA%9E#%E8%A6%8B%E5%87%BA%E3%81%97'],
    ['https://例え.jp/', 'https://xn--r8jz45g.jp/'],
    ['https://localhost:8080/x', 'https://localhost:8080/x'],
  ])('%s を受け付ける', (input, expected) => {
    expect(validateUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each([
    [''],
    ['example.com'],
    ['javascript:alert(1)'],
    ['ftp://example.com/file'],
    ['mailto:a@example.com'],
    ['https://'],
    ['http://exa mple.com'],
    [`https://example.com/${'a'.repeat(9000)}`],
  ])('%s を拒否する', (input) => {
    const r = validateUrl(input);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
