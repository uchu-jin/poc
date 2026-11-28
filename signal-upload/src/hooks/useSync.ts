import { useEffect, useRef, useState } from 'react';
import { sanitizeSyncData, type SyncData } from '../lib/sync';
import { useLocalStorage } from './useLocalStorage';
import type { SourcesApi } from './useSources';
import type { StudiosApi } from './useStudios';

export type SyncStatus = 'off' | 'loading' | 'saving' | 'synced' | 'error';

const ENDPOINT = 'api/sync.php';
const SAVE_DELAY_MS = 800;
// 最後にサーバーとそろえた内容。これと今の一覧が違えば、まだ保存していない変更がある
// (保存する前にタブを閉じても、次に開いたときにサーバーの古い内容で戻さないため)
const BASE_KEY = 'syncBase';

export class SyncNotFound extends Error {}

async function load(code: string): Promise<SyncData> {
  const res = await fetch(`${ENDPOINT}?code=${code}`, { cache: 'no-store' });
  if (res.status === 404) throw new SyncNotFound();
  if (!res.ok) throw new Error(`sync ${res.status}`);
  const body = (await res.json()) as { data?: unknown };
  return sanitizeSyncData(body.data);
}

async function save(data: SyncData, code?: string): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, data }),
  });
  if (res.status === 404) throw new SyncNotFound();
  if (!res.ok) throw new Error(`sync ${res.status}`);
  return ((await res.json()) as { code: string }).code;
}

function readBase() {
  try {
    return localStorage.getItem(BASE_KEY);
  } catch {
    return null;
  }
}

// 同期コードがあれば、開いたときと画面に戻ったときにサーバーの内容を読み込み、
// サイトを追加・削除するたびにサーバーへ保存する(あとから保存したほうが残る)
export function useSync(sourcesApi: SourcesApi, studiosApi: StudiosApi) {
  const [code, setCode] = useLocalStorage<string>('syncCode', '');
  const [status, setStatus] = useState<SyncStatus>(code ? 'loading' : 'off');
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [lost, setLost] = useState(false);
  const synced = useRef<string | null>(code ? readBase() : null);
  // 保存は1つずつ順に送る(古い内容があとから届いて残らないように)
  const queue = useRef(Promise.resolve());

  const data = sanitizeSyncData({
    customSources: sourcesApi.custom,
    removedSources: sourcesApi.removed,
    customStudios: studiosApi.custom,
    removedStudios: studiosApi.removed,
  });
  const payload = JSON.stringify(data);

  const apply = (next: SyncData) => {
    sourcesApi.replace(next.customSources, next.removedSources);
    studiosApi.replace(next.customStudios, next.removedStudios);
  };
  const latest = useRef({ apply, payload });
  useEffect(() => {
    latest.current = { apply, payload };
  });

  const markSynced = (value: string | null) => {
    synced.current = value;
    try {
      if (value === null) localStorage.removeItem(BASE_KEY);
      else localStorage.setItem(BASE_KEY, value);
    } catch {
      // 保存できなくても、このタブの同期は続けられる
    }
  };
  const done = () => {
    setStatus('synced');
    setSyncedAt(Date.now());
  };
  const reset = () => {
    markSynced(null);
    setCode('');
    setStatus('off');
  };
  const fail = (e: unknown) => {
    if (e instanceof SyncNotFound) {
      // ほかの端末でサーバーから削除された
      reset();
      setLost(true);
    } else {
      setStatus('error');
    }
  };

  // 読み込んだ内容が今の一覧と同じなら置き換えない(置き換えると全媒体を取り直してしまう)。
  // 読み込みの間に一覧が変わったら、その変更を優先して保存に回す
  const pull = (target: string) => {
    const before = latest.current.payload;
    return load(target).then((next) => {
      const json = JSON.stringify(next);
      if (latest.current.payload !== before) {
        markSynced(json);
        push(target);
        return;
      }
      if (json !== before) latest.current.apply(next);
      markSynced(json);
      done();
    }, fail);
  };

  const push = (target: string) => {
    setStatus('saving');
    queue.current = queue.current.then(() => {
      const sending = latest.current.payload;
      if (sending === synced.current) return done();
      return save(JSON.parse(sending) as SyncData, target).then(() => {
        markSynced(sending);
        done();
      }, fail);
    });
  };

  useEffect(() => {
    if (!code) return;
    let active = true;
    const refresh = () => {
      if (!active || document.visibilityState !== 'visible') return;
      // まだ保存していない変更があるときは読み込まず、保存を先にする
      if (synced.current !== null && synced.current !== latest.current.payload) return;
      void pull(code);
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', refresh);
    };
    // pull は code だけで決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (!code || synced.current === null || synced.current === payload) return;
    const timer = setTimeout(() => push(code), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, payload]);

  return {
    code,
    status,
    syncedAt,
    lost,
    // この端末の一覧で新しいコードを作る
    start: async () => {
      setLost(false);
      const created = await save(data);
      markSynced(payload);
      setCode(created);
      done();
    },
    // ほかの端末で作ったコードを使う。この端末の一覧はサーバーの内容に置き換わる
    join: async (target: string) => {
      setLost(false);
      const next = await load(target);
      const json = JSON.stringify(next);
      if (json !== payload) apply(next);
      markSynced(json);
      setCode(target);
      done();
    },
    // 保存していない変更があれば保存し、なければ読み込み直す
    retry: () => {
      if (synced.current !== null && synced.current !== payload) {
        push(code);
      } else {
        setStatus('loading');
        void pull(code);
      }
    },
    // この端末だけ同期をやめる(一覧はこの端末に残る)
    stop: reset,
    // サーバーの保存内容を消して、同期をやめる
    destroy: async () => {
      const res = await fetch(`${ENDPOINT}?code=${code}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`sync ${res.status}`);
      reset();
    },
  };
}

export type SyncApi = ReturnType<typeof useSync>;
