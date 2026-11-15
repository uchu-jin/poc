import { useCallback, useEffect, useState } from 'react';
import { SOURCES } from '../data/sources';
import { mergeArticles, parseFeed } from '../lib/parseFeed';
import type { Article, FetchStatus } from '../types';

const FEED_ENDPOINT = 'api/feed.php';

export function useFeeds() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<Record<string, FetchStatus>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // 「24時間以内」などの判定の基準時刻。取得のたびに進める
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(async () => {
    setNow(Date.now());
    setStatus(Object.fromEntries(SOURCES.map((s) => [s.id, 'loading' as const])));
    const all: Article[] = [];
    await Promise.all(
      SOURCES.map(async (source) => {
        try {
          const res = await fetch(`${FEED_ENDPOINT}?id=${source.id}`);
          if (!res.ok) throw new Error(String(res.status));
          const items = parseFeed(await res.text(), source);
          all.push(...items);
          // 届いた媒体から順に画面に出す
          setArticles((prev) => mergeArticles(prev, items));
          setStatus((prev) => ({ ...prev, [source.id]: 'ok' }));
        } catch {
          setStatus((prev) => ({ ...prev, [source.id]: 'error' }));
        }
      }),
    );
    // 全部そろったら、取得できなかった媒体の古い記事を落として作り直す
    setArticles(mergeArticles([], all));
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回の取得
    reload();
  }, [reload]);

  return {
    articles,
    status,
    loading: Object.values(status).some((s) => s === 'loading'),
    updatedAt,
    now,
    reload,
  };
}
