import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSources, type SourcesApi } from '../src/hooks/useSources';
import { useStudios } from '../src/hooks/useStudios';
import { useSync, type SyncApi } from '../src/hooks/useSync';
import type { SyncData } from '../src/lib/sync';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CODE = 'ABCDEFGHJKMNPQ23';
const empty: SyncData = {
  customSources: [],
  removedSources: [],
  customStudios: [],
  removedStudios: [],
};

// sync.php の代わり。GET の返事は release() を呼ぶまで止めておける
function fakeServer(initial: SyncData) {
  let stored = initial;
  const posts: SyncData[] = [];
  let hold: Promise<void> | null = null;
  let release = () => {};
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { data: SyncData };
      stored = body.data;
      posts.push(body.data);
      return new Response(JSON.stringify({ code: CODE, updatedAt: 1 }));
    }
    const snapshot = stored;
    if (hold) await hold;
    return new Response(JSON.stringify({ data: snapshot, updatedAt: 1 }));
  });
  return {
    fetchMock,
    posts,
    gets: () => fetchMock.mock.calls.filter(([, init]) => !init?.method).length,
    setStored: (data: SyncData) => (stored = data),
    holdGets: () => {
      hold = new Promise((resolve) => (release = resolve));
    },
    release: () => {
      hold = null;
      release();
    },
  };
}

let root: Root;
let current: { sources: SourcesApi; sync: SyncApi };

function Harness() {
  const sources = useSources();
  const studios = useStudios();
  const sync = useSync(sources, studios);
  useEffect(() => {
    current = { sources, sync };
  });
  return null;
}

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const mount = () => act(() => root.render(createElement(Harness)));

beforeEach(() => {
  localStorage.clear();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useSync', () => {
  it('サーバーの内容が同じなら一覧を置き換えない(全媒体の取り直しを起こさない)', async () => {
    const server = fakeServer({ ...empty, removedSources: ['simonw'] });
    vi.stubGlobal('fetch', server.fetchMock);
    localStorage.setItem('syncCode', JSON.stringify(CODE));
    localStorage.setItem('removedSources', JSON.stringify(['simonw']));
    await mount();
    await wait(50);
    const before = current.sources.sources;
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await wait(50);
    expect(server.gets()).toBe(2);
    expect(current.sources.sources).toBe(before);
  });

  it('前回保存できなかった変更があれば、開いたときに読み込まず保存する', async () => {
    const server = fakeServer({ ...empty, removedSources: ['simonw'] });
    vi.stubGlobal('fetch', server.fetchMock);
    localStorage.setItem('syncCode', JSON.stringify(CODE));
    localStorage.setItem('syncBase', JSON.stringify({ ...empty, removedSources: ['simonw'] }));
    // サーバーに送る前にタブを閉じた変更
    localStorage.setItem('removedSources', JSON.stringify(['simonw', 'figma']));
    await mount();
    await wait(1000);
    expect(server.gets()).toBe(0);
    expect(server.posts.at(-1)?.removedSources).toEqual(['simonw', 'figma']);
    expect(current.sync.status).toBe('synced');
  });

  it('読み込みの最中に変えた内容は、届いたサーバーの内容で消さずに保存する', async () => {
    const server = fakeServer(empty);
    vi.stubGlobal('fetch', server.fetchMock);
    localStorage.setItem('syncCode', JSON.stringify(CODE));
    server.holdGets();
    await mount();
    await act(async () => current.sources.remove(['figma']));
    server.setStored({ ...empty, removedStudios: ['https://x.example'] });
    await act(async () => server.release());
    await wait(1000);
    expect(JSON.parse(localStorage.getItem('removedSources') ?? '[]')).toEqual(['figma']);
    expect(server.posts.at(-1)?.removedSources).toEqual(['figma']);
  });

  it('ほかの端末の変更は、画面に戻ったときに読み込む', async () => {
    const server = fakeServer(empty);
    vi.stubGlobal('fetch', server.fetchMock);
    localStorage.setItem('syncCode', JSON.stringify(CODE));
    await mount();
    await wait(50);
    server.setStored({ ...empty, removedSources: ['figma'] });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    await wait(50);
    expect(current.sources.sources.some((s) => s.id === 'figma')).toBe(false);
    expect(server.posts).toHaveLength(0);
  });
});
