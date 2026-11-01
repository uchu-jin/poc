import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../..', import.meta.url);
const read = (p: string): Buffer => readFileSync(new URL(p, root));

const html = read('index.html').toString('utf8');
const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
const map = JSON.parse(match?.[1] ?? '{}') as {
  imports?: Record<string, string>;
  integrity?: Record<string, string>;
};
const pkg = JSON.parse(read('package.json').toString('utf8')) as {
  devDependencies: Record<string, string>;
};

describe('import map', () => {
  it('import map が index.html にあるとき読み取れる', () => {
    expect(match).not.toBeNull();
  });

  it('three の版が package.json の devDependencies と一致するとき成り立つ', () => {
    const url = map.imports?.['three'] ?? '';
    const ver = /three@(\d+\.\d+\.\d+)\//.exec(url)?.[1];
    expect(ver).toBeDefined();
    expect(ver).toBe(pkg.devDependencies['three']);
  });

  it('integrity が three.module.js と three.core.js を含むとき成り立つ', () => {
    const names = Object.keys(map.integrity ?? {}).map((u) => u.split('/').pop());
    expect(names).toContain('three.module.js');
    expect(names).toContain('three.core.js');
  });

  it('integrity の各ハッシュが node_modules の同名ファイルの sha384 と一致するとき成り立つ', () => {
    const entries = Object.entries(map.integrity ?? {});
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const [url, hash] of entries) {
      const file = url.split('/').pop() as string;
      const digest = createHash('sha384')
        .update(read(`node_modules/three/build/${file}`))
        .digest('base64');
      expect(hash).toBe(`sha384-${digest}`);
    }
  });
});
