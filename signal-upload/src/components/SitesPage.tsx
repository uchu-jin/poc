import { useState, type FormEvent, type ReactNode } from 'react';
import { categoryLabel } from '../data/sources';
import { feedRequestUrl } from '../hooks/useFeeds';
import type { SourcesApi } from '../hooks/useSources';
import type { StudiosApi } from '../hooks/useStudios';
import type { SyncApi } from '../hooks/useSync';
import { guessSiteName, parseOgp } from '../lib/ogp';
import { feedTitle, parseFeed } from '../lib/parseFeed';
import { SyncPanel } from './SyncPanel';
import {
  ARTICLE_CATEGORIES,
  detectLang,
  findByUrl,
  newSourceId,
  normalizeUrl,
} from '../lib/sources';
import type { ArticleCategory, FetchStatus, Lang, Source, Studio } from '../types';

type Props = {
  api: SourcesApi;
  studiosApi: StudiosApi;
  sync: SyncApi;
  status: Record<string, FetchStatus>;
  countBySource: Record<string, number>;
};

// RSS の媒体とデザイン会社を同じ一覧で選べるよう、選択はこのキーで持つ
const feedKey = (s: Source) => `feed:${s.id}`;
const studioKey = (s: Studio) => `studio:${s.url}`;

type Item = {
  key: string;
  name: string;
  url: string;
  lang?: Lang;
  custom?: boolean;
  source?: Source;
};
type Group = { id: string; label: string; items: Item[] };

const feedItem = (s: Source): Item => ({ ...s, key: feedKey(s), source: s });
const studioItem = (s: Studio): Item => ({ ...s, key: studioKey(s) });

export function SitesPage({ api, studiosApi, sync, status, countBySource }: Props) {
  const { sources } = api;
  const { studios } = studiosApi;
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  // 一覧が長いので、最初はグループを閉じておく(検索中は合うものがあるグループを開く)
  const [opened, setOpened] = useState<string[]>([]);

  const q = query.trim().toLowerCase();
  const matches = (item: Item) =>
    !q || item.name.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
  const groups: Group[] = [
    ...ARTICLE_CATEGORIES.map((c) => ({
      id: c,
      label: categoryLabel(c),
      items: sources.filter((s) => s.category === c).map(feedItem),
    })),
    { id: 'studios', label: 'デザイン会社', items: studios.map(studioItem) },
  ]
    .map((g) => ({ ...g, items: g.items.filter(matches) }))
    .filter((g) => g.items.length > 0);

  const allKeys = [...sources.map(feedKey), ...studios.map(studioKey)];
  const visibleKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  // 削除済みのものが選択に残らないよう、いまあるものだけ数える
  const selectedKeys = selected.filter((k) => allKeys.includes(k));
  const removedCount = api.removedCount + studiosApi.removedCount;

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  const toggleOpen = (id: string) =>
    setOpened((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const removeSelected = () => {
    if (!window.confirm(`${selectedKeys.length} 件のサイトを削除します。よろしいですか？`)) return;
    api.remove(sources.filter((s) => selectedKeys.includes(feedKey(s))).map((s) => s.id));
    studiosApi.remove(studios.filter((s) => selectedKeys.includes(studioKey(s))).map((s) => s.url));
    setSelected([]);
  };

  const restore = () => {
    api.restoreBuiltIn();
    studiosApi.restoreBuiltIn();
  };

  return (
    <div className="sites-page">
      <div className="page-head">
        <a className="back-link" href="#/">
          ← フィードに戻る
        </a>
        <h2>サイト管理</h2>
        <p className="muted small">
          追加・削除した内容は、このブラウザに保存されます。同期コードを使うと、ほかの端末とも同じ一覧にできます。
        </p>
      </div>

      <SyncPanel sync={sync} />

      <AddSiteForm api={api} studiosApi={studiosApi} />

      <section className="panel">
        <div className="list-toolbar">
          <div className="search list-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="名前や URL で絞り込み"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="サイトを絞り込み"
            />
          </div>
          {/* 誤って大量に消さないよう、まとめて選ぶ操作は置かず、一つずつ選ぶ */}
          <span className="muted small">
            {q ? `${visibleKeys.length} / ${allKeys.length}` : allKeys.length} サイト
          </span>
          {!q && (
            <button
              className="link-btn small"
              onClick={() =>
                setOpened(opened.length >= groups.length ? [] : groups.map((g) => g.id))
              }
            >
              {opened.length >= groups.length ? 'すべて閉じる' : 'すべて開く'}
            </button>
          )}
          {removedCount > 0 && (
            <button className="ghost-btn small-btn list-restore" onClick={restore}>
              初期のサイトを元に戻す({removedCount} 件)
            </button>
          )}
        </div>

        {allKeys.length === 0 && <div className="empty">登録されているサイトはありません。</div>}
        {allKeys.length > 0 && groups.length === 0 && (
          <div className="empty">「{query.trim()}」に合うサイトはありません。</div>
        )}

        {groups.map((g) => {
          const keys = g.items.map((i) => i.key);
          const picked = keys.filter((k) => selectedKeys.includes(k)).length;
          const open = !!q || opened.includes(g.id);
          return (
            <div className="site-group" key={g.id}>
              <div className="group-head">
                <button
                  className="group-toggle"
                  aria-expanded={open}
                  disabled={!!q}
                  onClick={() => toggleOpen(g.id)}
                >
                  <span className={`group-label tag-${g.id}`}>{g.label}</span>
                  <span className="muted small">
                    {keys.length} サイト{picked > 0 && ` · ${picked} 件選択`}
                  </span>
                  {!q && <span className="chevron" aria-hidden="true" />}
                </button>
              </div>
              {open &&
                g.items.map((item) => (
                  <SiteRow
                    key={item.key}
                    item={item}
                    checked={selectedKeys.includes(item.key)}
                    onToggle={() => toggle(item.key)}
                  >
                    {item.source && (
                      <FeedControls
                        source={item.source}
                        api={api}
                        status={status[item.source.id]}
                        count={countBySource[item.source.id] || 0}
                      />
                    )}
                  </SiteRow>
                ))}
            </div>
          );
        })}
      </section>

      {selectedKeys.length > 0 && (
        <div className="selection-bar" role="region" aria-label="選択したサイト">
          <span>{selectedKeys.length} 件選択中</span>
          <button className="link-btn" onClick={() => setSelected([])}>
            選択を解除
          </button>
          <button className="danger-btn" onClick={removeSelected}>
            削除する
          </button>
        </div>
      )}
    </div>
  );
}

function FeedControls({
  source,
  api,
  status,
  count,
}: {
  source: Source;
  api: SourcesApi;
  status?: FetchStatus;
  count: number;
}) {
  return (
    <>
      {source.custom && (
        <select
          className="category-select"
          value={source.category}
          onChange={(e) => api.setCategory(source.id, e.target.value as ArticleCategory)}
          aria-label={`${source.name} のカテゴリ`}
        >
          {ARTICLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      )}
      <span className={`status status-${status || 'idle'}`}>
        {status === 'error' ? '取得失敗' : status === 'loading' ? '…' : `${count} 件`}
      </span>
    </>
  );
}

type RowProps = {
  item: Item;
  checked: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

function SiteRow({ item, checked, onToggle, children }: RowProps) {
  const { name, url, lang, custom } = item;
  return (
    // 行のどこを押しても選べるように(リンク・選択欄・チェックボックス自体は除く)
    <div
      className={`site-row ${checked ? 'is-selected' : ''}`}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('a, select, input')) onToggle();
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${name} を選択`} />
      <div className="site-main">
        <div className="site-name" translate="no">
          {name}
          {lang === 'ja' && <span className="jp-mark">国内</span>}
          {custom && <span className="added-mark">追加</span>}
        </div>
        <a className="site-url" href={url} target="_blank" rel="noreferrer">
          {url}
        </a>
      </div>
      {children}
    </div>
  );
}

type AddCategory = ArticleCategory | 'studios';
type Message = { kind: 'error' | 'ok'; text: string };

const FETCH_FAILED: Message = {
  kind: 'error',
  text: 'サイトを取得できませんでした。URL を確かめて、もう一度お試しください。',
};

function AddSiteForm({ api, studiosApi }: { api: SourcesApi; studiosApi: StudiosApi }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AddCategory>('ai-design');
  const [lang, setLang] = useState<'auto' | Lang>('auto');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const isStudio = category === 'studios';

  // 返り値は画面に出すメッセージ
  async function addFeed(target: string, category: ArticleCategory): Promise<Message> {
    const existing = findByUrl(api.sources, target);
    if (existing) return { kind: 'error', text: `「${existing.name}」として登録済みです。` };

    const res = await fetch(feedRequestUrl({ id: '', url: target, custom: true }));
    if (!res.ok) {
      return res.status === 422
        ? {
            kind: 'error',
            text: 'このページに RSS が見つかりませんでした。RSS の URL を直接入れてみてください。',
          }
        : FETCH_FAILED;
    }
    const xml = await res.text();
    const feedUrl = res.headers.get('X-Feed-Url') || target;
    const sameFeed = findByUrl(api.sources, feedUrl);
    if (sameFeed) return { kind: 'error', text: `「${sameFeed.name}」として登録済みです。` };

    const title = feedTitle(xml);
    const draft: Source = {
      id: newSourceId(),
      name: name.trim() || title || new URL(target).hostname,
      url: feedUrl,
      category,
      custom: true,
    };
    const articles = parseFeed(xml, draft);
    if (articles.length === 0)
      return { kind: 'error', text: 'RSS は見つかりましたが、記事がありませんでした。' };
    const detected = detectLang(`${title} ${articles.map((a) => a.title).join(' ')}`);
    const source = { ...draft, lang: lang === 'auto' ? detected : lang };
    api.add(source);
    return {
      kind: 'ok',
      text: `「${source.name}」を${categoryLabel(category)}に追加しました(記事 ${articles.length} 件)。`,
    };
  }

  async function addStudio(target: string): Promise<Message> {
    const existing = findByUrl(studiosApi.studios, target);
    if (existing) return { kind: 'error', text: `「${existing.name}」として登録済みです。` };

    const res = await fetch(`api/ogp.php?url=${encodeURIComponent(target)}`);
    if (!res.ok) return FETCH_FAILED;
    const page = (await res.json()) as { url?: string; tags?: string };
    const pageUrl = page.url || target;
    const sameSite = findByUrl(studiosApi.studios, pageUrl);
    if (sameSite) return { kind: 'error', text: `「${sameSite.name}」として登録済みです。` };

    const ogp = parseOgp(page.tags || '', pageUrl);
    const studio: Studio = {
      name: name.trim() || guessSiteName(ogp, pageUrl) || new URL(target).hostname,
      url: target,
      lang: lang === 'auto' ? detectLang(`${ogp.title} ${ogp.description}`) : lang,
      ogp,
      custom: true,
    };
    studiosApi.add(studio);
    return { kind: 'ok', text: `「${studio.name}」をデザイン会社に追加しました。` };
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const target = normalizeUrl(url);
    if (!target) {
      setMessage({ kind: 'error', text: 'URL の形が正しくありません。' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result =
        category === 'studios' ? await addStudio(target) : await addFeed(target, category);
      setMessage(result);
      if (result.kind === 'ok') {
        setUrl('');
        setName('');
      }
    } catch {
      setMessage({
        kind: 'error',
        text: 'サイトを取得できませんでした。通信状況を確かめてください。',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel add-form" onSubmit={submit}>
      <h3>サイトを追加</h3>
      <label className="field field-wide">
        <span>{isStudio ? '会社サイトの URL' : 'サイトか RSS の URL'}</span>
        <input
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </label>
      <label className="field field-wide">
        <span>
          表示名<span className="muted">(空欄ならサイトの名前を使います)</span>
        </span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>カテゴリ</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as AddCategory)}>
          {ARTICLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
          <option value="studios">デザイン会社</option>
        </select>
      </label>
      <label className="field">
        <span>地域</span>
        <select value={lang} onChange={(e) => setLang(e.target.value as 'auto' | Lang)}>
          <option value="auto">自動で判定</option>
          <option value="en">海外</option>
          <option value="ja">国内</option>
        </select>
      </label>
      {isStudio && (
        <p className="muted small field-wide">
          デザイン会社は記事を集めず、「デザイン会社」タブにサイトの紹介カードとして並びます。
        </p>
      )}
      <div className="form-foot">
        <button className="primary-btn" type="submit" disabled={busy}>
          {busy ? '確認中…' : '追加する'}
        </button>
        {message && (
          <p className={`form-message is-${message.kind}`} role="status">
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
