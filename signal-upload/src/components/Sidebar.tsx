import { CATEGORIES } from '../data/sources';
import type { FetchStatus, Source } from '../types';

type Props = {
  sources: Source[];
  status: Record<string, FetchStatus>;
  countBySource: Record<string, number>;
  hiddenSources: string[];
  onToggleSource: (id: string) => void;
  hasRead: boolean;
  onResetRead: () => void;
};

export function Sidebar({
  sources,
  status,
  countBySource,
  hiddenSources,
  onToggleSource,
  hasRead,
  onResetRead,
}: Props) {
  return (
    <aside className="sidebar">
      <section>
        <h4>ソース</h4>
        <p className="muted small">チェックを外すとフィードから非表示になります</p>
        <a className="link-btn" href="#/sites">
          サイトを追加・削除する
        </a>
        {CATEGORIES.filter((c) => sources.some((s) => s.category === c.id)).map(({ id, label }) => (
          <div className="source-group" key={id}>
            <div className={`group-label tag-${id}`}>{label}</div>
            {sources
              .filter((s) => s.category === id)
              .map((s) => (
                <label className="source-row" key={s.id}>
                  <input
                    type="checkbox"
                    checked={!hiddenSources.includes(s.id)}
                    onChange={() => onToggleSource(s.id)}
                  />
                  <span className="source-name" translate="no">
                    {s.name}
                    {s.lang === 'ja' && <span className="jp-mark">国内</span>}
                  </span>
                  <span className={`status status-${status[s.id] || 'idle'}`}>
                    {status[s.id] === 'error'
                      ? '取得失敗'
                      : status[s.id] === 'loading'
                        ? '…'
                        : countBySource[s.id] || 0}
                  </span>
                </label>
              ))}
          </div>
        ))}
      </section>
      <section>
        <h4>このアプリについて</h4>
        <p className="muted small">
          各メディアの公式RSSから最新記事を自動で集めています。海外の記事は原文(英語)のままです。日本語で読みたいときは、Chromeでページを右クリックして「日本語に翻訳」を選んでください。記事タイトルをクリックすると元記事が開きます。既読の記事は薄く表示されます。
        </p>
        {hasRead && (
          <button className="link-btn" onClick={onResetRead}>
            既読をリセット
          </button>
        )}
      </section>
    </aside>
  );
}
