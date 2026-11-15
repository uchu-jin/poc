import { categoryLabel } from '../data/sources';
import { timeAgo } from '../lib/format';
import type { Article } from '../types';

export function SaveButton({ saved, onToggle }: { saved: boolean; onToggle: () => void }) {
  const label = saved ? '保存を解除' : 'あとで読む';
  return (
    <button
      className={`icon-btn ${saved ? 'is-on' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        onToggle();
      }}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function Thumb({ article, className }: { article: Article; className?: string }) {
  return (
    <div className={`thumb ${className || ''} cat-${article.category}`}>
      {article.image ? (
        <img
          src={article.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => e.currentTarget.remove()}
        />
      ) : null}
      <span className="thumb-fallback">{article.source}</span>
    </div>
  );
}

export function Meta({ article }: { article: Article }) {
  return (
    <div className="meta">
      <span className={`tag tag-${article.category}`}>{categoryLabel(article.category)}</span>
      <span className="source" translate="no">
        {article.source}
      </span>
      {article.lang === 'ja' && <span className="jp-mark">国内</span>}
      <span className="dot">·</span>
      <time dateTime={article.date || undefined}>{timeAgo(article.date)}</time>
    </div>
  );
}
