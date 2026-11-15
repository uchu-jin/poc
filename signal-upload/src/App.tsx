import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArticleCard, HeroCard, SkeletonGrid } from './components/ArticleCard';
import { Sidebar } from './components/Sidebar';
import { StudioCard } from './components/StudioCard';
import { CATEGORIES, PERIODS, REGIONS } from './data/sources';
import { STUDIOS } from './data/studios';
import { useFeeds } from './hooks/useFeeds';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Article, CategoryId, Lang } from './types';

const PAGE_SIZE = 24;
const DAY_MS = 86_400_000;

type Theme = 'auto' | 'light' | 'dark';
type View = 'feed' | 'saved';
type PeriodId = (typeof PERIODS)[number]['id'];

export function App() {
  const { articles, status, loading, updatedAt, now, reload } = useFeeds();
  const [storedCategory, setCategory] = useLocalStorage<CategoryId>('cat', 'all');
  const category = CATEGORIES.some((c) => c.id === storedCategory) ? storedCategory : 'all';
  const [period, setPeriod] = useLocalStorage<PeriodId>('period', 'all');
  const [region, setRegion] = useLocalStorage<'all' | Lang>('region', 'all');
  const [hiddenSources, setHiddenSources] = useLocalStorage<string[]>('hiddenSources', []);
  const [saved, setSaved] = useLocalStorage<Record<string, Article>>('saved', {});
  const [read, setRead] = useLocalStorage<Record<string, true>>('read', {});
  const [theme, setTheme] = useLocalStorage<Theme>('theme', 'auto');
  const [view, setView] = useState<View>('feed');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme === 'auto' ? '' : theme;
  }, [theme]);

  // 選択中のタブが横スクロールの外にあれば見える位置まで寄せる
  useEffect(() => {
    const tabs = tabsRef.current;
    const active = tabs?.querySelector<HTMLElement>('.is-active');
    if (!tabs || !active) return;
    const left = active.offsetLeft - tabs.offsetLeft;
    if (
      left < tabs.scrollLeft ||
      left + active.offsetWidth > tabs.scrollLeft + tabs.clientWidth - 32
    )
      tabs.scrollLeft = left - 16;
  }, [category]);

  const countBySource = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of articles) counts[a.sourceId] = (counts[a.sourceId] || 0) + 1;
    return counts;
  }, [articles]);

  const filtered = useMemo(() => {
    const base =
      view === 'saved'
        ? Object.values(saved).sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        : articles;
    const q = query.trim().toLowerCase();
    const maxAge = PERIODS.find((p) => p.id === period)?.ms ?? Infinity;
    return base.filter(
      (a) =>
        !(
          (category !== 'all' && a.category !== category) ||
          (region !== 'all' && (a.lang || 'en') !== region) ||
          (view === 'feed' && hiddenSources.includes(a.sourceId)) ||
          (view === 'feed' &&
            maxAge !== Infinity &&
            (!a.date || now - new Date(a.date).getTime() > maxAge)) ||
          (q && !`${a.title} ${a.summary} ${a.source}`.toLowerCase().includes(q))
        ),
    );
  }, [articles, saved, view, category, period, region, hiddenSources, query, now]);

  const showStudios = category === 'studios' && view === 'feed';

  const studios = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STUDIOS.filter(
      (s) =>
        !(
          (region !== 'all' && s.lang !== region) ||
          (q &&
            !`${s.name} ${s.url} ${s.ogp.title || ''} ${s.ogp.description || ''}`
              .toLowerCase()
              .includes(q))
        ),
    );
  }, [region, query]);

  // フィード表示で検索していないときは、画像のある最新記事を大きく出す
  const hero = view === 'feed' && !query ? filtered.find((a) => a.image) : undefined;
  const rest = filtered.filter((a) => a !== hero);
  const visible = rest.slice(0, limit);

  const toggleSave = (a: Article) =>
    setSaved((prev) => {
      const next = { ...prev };
      if (next[a.id]) delete next[a.id];
      else next[a.id] = a;
      return next;
    });
  const markRead = (a: Article) => setRead((prev) => ({ ...prev, [a.id]: true }));
  const toggleSource = (id: string) =>
    setHiddenSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  const cardProps = (a: Article) => ({
    article: a,
    saved: !!saved[a.id],
    read: !!read[a.id],
    onToggleSave: () => toggleSave(a),
    onOpen: () => markRead(a),
  });

  const last24h = articles.filter(
    (a) => a.date && now - new Date(a.date).getTime() < DAY_MS,
  ).length;
  const savedCount = Object.keys(saved).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ◐
          </span>
          <div>
            <h1 translate="no">Signal</h1>
            <span className="tagline">世界のAI×デザイン・開発、UI/UX、ブランディング</span>
          </div>
        </div>
        <div className="search">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            placeholder="キーワードで検索"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE_SIZE);
            }}
          />
        </div>
        <div className="top-actions">
          <button className="ghost-btn" onClick={reload} disabled={loading} title="再読み込み">
            <span className={loading ? 'spin' : ''}>↻</span>
            <span className="hide-sm">{loading ? '取得中…' : '更新'}</span>
          </button>
          <button
            className="ghost-btn"
            onClick={() =>
              setTheme(theme === 'dark' ? 'light' : theme === 'light' ? 'auto' : 'dark')
            }
            title="テーマ切り替え"
          >
            {theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◑'}
          </button>
        </div>
      </header>

      <nav className="subnav">
        <div className="tabs" role="tablist" ref={tabsRef}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={category === c.id}
              className={`tab ${category === c.id ? 'is-active' : ''}`}
              onClick={() => {
                setCategory(c.id);
                setLimit(PAGE_SIZE);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="view-switch">
          <button className={view === 'feed' ? 'is-active' : ''} onClick={() => setView('feed')}>
            フィード
          </button>
          <button className={view === 'saved' ? 'is-active' : ''} onClick={() => setView('saved')}>
            あとで読む
            {savedCount > 0 && <span className="badge">{savedCount}</span>}
          </button>
        </div>
      </nav>

      <div className="layout">
        <main>
          {view === 'feed' && (
            <div className="toolbar">
              {showStudios ? (
                <div className="stats">
                  <strong>{studios.length}</strong> 社
                  <span className="muted"> / 世界のブランディング・デザイン会社</span>
                </div>
              ) : (
                <div className="stats">
                  <strong>{filtered.length}</strong> 件
                  <span className="muted">
                    {' '}
                    / 24時間以内 {last24h} 件
                    {updatedAt &&
                      ` · ${updatedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 更新`}
                  </span>
                </div>
              )}
              <div className="filters">
                <div className="segmented" aria-label="地域">
                  {REGIONS.map((r) => (
                    <button
                      key={r.id}
                      className={region === r.id ? 'is-active' : ''}
                      onClick={() => {
                        setRegion(r.id);
                        setLimit(PAGE_SIZE);
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {!showStudios && (
                  <div className="segmented" aria-label="期間">
                    {PERIODS.map((p) => (
                      <button
                        key={p.id}
                        className={period === p.id ? 'is-active' : ''}
                        onClick={() => setPeriod(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {showStudios ? (
            studios.length === 0 ? (
              <div className="empty">条件に合う会社がありません。</div>
            ) : (
              <div className="grid">
                {studios.map((s) => (
                  <StudioCard key={s.url} studio={s} />
                ))}
              </div>
            )
          ) : articles.length === 0 && loading && view === 'feed' ? (
            <SkeletonGrid />
          ) : filtered.length === 0 ? (
            <div className="empty">
              {view === 'saved'
                ? '保存した記事はまだありません。気になる記事のしおりアイコンを押すと、ここに集まります。'
                : '条件に合う記事がありません。フィルタや期間を変えてみてください。'}
            </div>
          ) : (
            <>
              {hero && <HeroCard {...cardProps(hero)} />}
              <div className="grid">
                {visible.map((a) => (
                  <ArticleCard key={a.id} {...cardProps(a)} />
                ))}
              </div>
              {rest.length > limit && (
                <button className="more-btn" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  さらに表示({rest.length - limit} 件)
                </button>
              )}
            </>
          )}
        </main>

        <Sidebar
          status={status}
          countBySource={countBySource}
          hiddenSources={hiddenSources}
          onToggleSource={toggleSource}
          hasRead={Object.keys(read).length > 0}
          onResetRead={() => setRead({})}
        />
      </div>
    </div>
  );
}
