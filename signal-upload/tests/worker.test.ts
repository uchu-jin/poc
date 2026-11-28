import { describe, expect, it } from 'vitest';
import {
  checkPublicUrl,
  cleanData,
  detectCharset,
  discoverFeed,
  headTags,
  isBlockedHost,
  isFeed,
  isValidCode,
  newCode,
} from '../worker/lib';

describe('isFeed', () => {
  it('RSS と Atom は通し、HTML は通さない', () => {
    expect(isFeed('<?xml version="1.0"?><rss version="2.0">')).toBe(true);
    expect(isFeed('<feed xmlns="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(isFeed('<!doctype html><html><head><title>rss</title>')).toBe(false);
  });
});

describe('discoverFeed', () => {
  it('rel="alternate" の RSS を相対 URL から絶対 URL にする', () => {
    const html =
      '<link rel="stylesheet" href="/a.css"><link rel="alternate" type="application/rss+xml" href="/feed?a=1&amp;b=2">';
    expect(discoverFeed(html, 'https://example.com/blog/')).toBe(
      'https://example.com/feed?a=1&b=2',
    );
  });

  it('引用符のない href も読む', () => {
    const html = '<link rel=alternate type=application/rss+xml href=https://example.com/feed/>';
    expect(discoverFeed(html, 'https://example.com/')).toBe('https://example.com/feed/');
  });

  it('見つからなければ null', () => {
    expect(discoverFeed('<link rel="icon" href="/x.png">', 'https://example.com/')).toBeNull();
  });
});

describe('headTags', () => {
  it('<head> の title・meta・link だけを返す', () => {
    const html =
      '<html><head><title>会社</title><meta property="og:image" content="x.png"><script>x</script></head><body><meta name="ignored"></body>';
    expect(headTags(html)).toBe('<title>会社</title>\n<meta property="og:image" content="x.png">');
  });

  it('HTML でなければ null', () => {
    expect(headTags('{"json": true}')).toBeNull();
  });
});

describe('detectCharset', () => {
  it('Content-Type を優先し、なければ HTML の meta を見る', () => {
    expect(detectCharset('text/html; charset=Shift_JIS', '')).toBe('Shift_JIS');
    expect(detectCharset('text/html', '<meta charset="euc-jp">')).toBe('euc-jp');
    expect(detectCharset(null, '<html>')).toBeUndefined();
  });
});

describe('checkPublicUrl / isBlockedHost', () => {
  it('公開サイトの http/https は通す', () => {
    expect(checkPublicUrl('https://uxdesign.cc/feed')).toBeInstanceOf(URL);
    expect(checkPublicUrl('http://example.com:80/rss')).toBeInstanceOf(URL);
  });

  it('http/https 以外、80/443 以外のポート、ユーザー名付きは通さない', () => {
    expect(checkPublicUrl('ftp://example.com/')).toBe('bad url');
    expect(checkPublicUrl('file:///etc/passwd')).toBe('bad url');
    expect(checkPublicUrl('https://example.com:8443/')).toBe('bad port');
    expect(checkPublicUrl('https://user:pass@example.com/')).toBe('bad url');
    expect(checkPublicUrl('not a url')).toBe('bad url');
  });

  it('社内網・自分自身・特別なアドレスは通さない', () => {
    for (const host of [
      'localhost',
      'foo.localhost',
      'printer.local',
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '[::1]',
      '2130706433',
      '0x7f000001',
    ]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
    expect(isBlockedHost('8.8.8.8')).toBe(false);
    expect(isBlockedHost('172.32.0.1')).toBe(false);
    expect(isBlockedHost('zenn.dev')).toBe(false);
  });
});

describe('同期', () => {
  it('コードは I・O・0・1 を除いた英数字16文字', () => {
    const code = newCode(new Uint8Array(16).map((_, i) => i * 7));
    expect(isValidCode(code)).toBe(true);
    expect(isValidCode('ABCDEFGHIJKLMNOP')).toBe(false);
    expect(isValidCode('abcdefghjkmnpqrs')).toBe(false);
    expect(isValidCode(123)).toBe(false);
  });

  it('決まった4つのキーの配列だけを残す', () => {
    expect(cleanData({ customSources: [{ url: 'x' }], extra: 1 })).toEqual({
      customSources: [{ url: 'x' }],
      removedSources: [],
      customStudios: [],
      removedStudios: [],
    });
    expect(cleanData({ customSources: 'x' })).toBeNull();
    expect(cleanData([])).toBeNull();
    expect(cleanData(null)).toBeNull();
  });
});
