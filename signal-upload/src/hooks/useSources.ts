import { useMemo } from 'react';
import { SOURCES } from '../data/sources';
import { activeSources, sanitizeCustom } from '../lib/sources';
import type { ArticleCategory, Source } from '../types';
import { useLocalStorage } from './useLocalStorage';

export function useSources() {
  const [rawCustom, setCustom] = useLocalStorage<unknown>('customSources', []);
  const [removed, setRemoved] = useLocalStorage<string[]>('removedSources', []);
  const custom = useMemo(() => sanitizeCustom(rawCustom), [rawCustom]);
  const sources = useMemo(() => activeSources(SOURCES, custom, removed), [custom, removed]);

  return {
    custom,
    removed,
    // 同期でサーバーの内容に置き換えるとき
    replace: (nextCustom: Source[], nextRemoved: string[]) => {
      setCustom(nextCustom);
      setRemoved(nextRemoved);
    },
    sources,
    removedCount: removed.length,
    add: (source: Source) => setCustom([...custom, source]),
    remove: (ids: string[]) => {
      setCustom(custom.filter((s) => !ids.includes(s.id)));
      const builtIn = ids.filter((id) => SOURCES.some((s) => s.id === id));
      setRemoved([...new Set([...removed, ...builtIn])]);
    },
    setCategory: (id: string, category: ArticleCategory) =>
      setCustom(custom.map((s) => (s.id === id ? { ...s, category } : s))),
    restoreBuiltIn: () => setRemoved([]),
  };
}

export type SourcesApi = ReturnType<typeof useSources>;
