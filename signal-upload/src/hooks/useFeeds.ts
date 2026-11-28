import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeArticles, parseFeed } from '../lib/parseFeed';
import type { Article, FetchStatus, Source } from '../types';

const FEED_ENDPOINT = 'api/feed.php';

export const feedRequestUrl = (source: Pick<Source, 'id' | 'url' | 'custom'>) =>
  source.custom
    ? `${FEED_ENDPOINT}?url=${encodeURIComponent(source.url)}`
    : `${FEED_ENDPOINT}?id=${source.id}`;

export function useFeeds(sources: Source[]) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [status, setStatus] = useState<Record<string, FetchStatus>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // 「24時間以内」などの判定の基準時刻。取得のたびに進める
  const [now, setNow] = useState(() => Date.now());
  // 媒体の追加・削除で取得し直したとき、前の取得の結果で上書きしないための番号
  const runRef = useRef(0);

  const reload = useCallback(async () => {
    const run = ++runRef.current;
    const ids = new Set(sources.map((s) => s.id));
    setNow(Date.now());
    setArticles((prev) => prev.filter((a) => ids.has(a.sourceId)));
    setStatus(Object.fromEntries(sources.map((s) => [s.id, 'loading' as const])));
    const all: Article[] = [];
    await Promise.all(
      sources.map(async (source) => {
        try {
          const res = await fetch(feedRequestUrl(source));
          if (!res.ok) throw new Error(String(res.status));
          const items = parseFeed(await res.text(), source);
          if (run !== runRef.current) return;
          all.push(...items);
          // 届いた媒体から順に画面に出す
          setArticles((prev) => mergeArticles(prev, items));
          setStatus((prev) => ({ ...prev, [source.id]: 'ok' }));
        } catch {
          if (run !== runRef.current) return;
          setStatus((prev) => ({ ...prev, [source.id]: 'error' }));
        }
      }),
    );
    if (run !== runRef.current) return;
    // 全部そろったら、取得できなかった媒体の古い記事を落として作り直す
    setArticles(mergeArticles([], all));
    setUpdatedAt(new Date());
  }, [sources]);

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
