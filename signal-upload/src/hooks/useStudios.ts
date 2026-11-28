import { useMemo } from 'react';
import { STUDIOS } from '../data/studios';
import { activeStudios, sanitizeStudios } from '../lib/sources';
import type { Studio } from '../types';
import { useLocalStorage } from './useLocalStorage';

// デザイン会社は URL で見分ける(初期の会社には id がないため)
export function useStudios() {
  const [rawCustom, setCustom] = useLocalStorage<unknown>('customStudios', []);
  const [removed, setRemoved] = useLocalStorage<string[]>('removedStudios', []);
  const custom = useMemo(() => sanitizeStudios(rawCustom), [rawCustom]);
  const studios = useMemo(() => activeStudios(STUDIOS, custom, removed), [custom, removed]);

  return {
    custom,
    removed,
    // 同期でサーバーの内容に置き換えるとき
    replace: (nextCustom: Studio[], nextRemoved: string[]) => {
      setCustom(nextCustom);
      setRemoved(nextRemoved);
    },
    studios,
    removedCount: removed.length,
    add: (studio: Studio) => setCustom([...custom, studio]),
    remove: (urls: string[]) => {
      setCustom(custom.filter((s) => !urls.includes(s.url)));
      const builtIn = urls.filter((url) => STUDIOS.some((s) => s.url === url));
      setRemoved([...new Set([...removed, ...builtIn])]);
    },
    restoreBuiltIn: () => setRemoved([]),
  };
}

export type StudiosApi = ReturnType<typeof useStudios>;
