import { hostname } from '../lib/format';
import type { Article } from '../types';
import { Meta, SaveButton, Thumb } from './ArticleParts';

export type ArticleCardProps = {
  article: Article;
  saved: boolean;
  read: boolean;
  onToggleSave: () => void;
  onOpen: () => void;
};

export function HeroCard({ article, saved, read, onToggleSave, onOpen }: ArticleCardProps) {
  return (
    <a
      className={`hero ${read ? 'is-read' : ''}`}
      href={article.link}
      target="_blank"
      rel="noreferrer"
      onClick={onOpen}
    >
      <Thumb article={article} className="hero-thumb" />
      <div className="hero-body">
        <Meta article={article} />
        <h2 lang={article.lang}>{article.title}</h2>
        <p lang={article.lang}>{article.summary}</p>
        <div className="card-foot">
          <span className="domain">{hostname(article.link)} ↗</span>
          <SaveButton saved={saved} onToggle={onToggleSave} />
        </div>
      </div>
    </a>
  );
}

export function ArticleCard({ article, saved, read, onToggleSave, onOpen }: ArticleCardProps) {
  return (
    <a
      className={`card ${read ? 'is-read' : ''}`}
      href={article.link}
      target="_blank"
      rel="noreferrer"
      onClick={onOpen}
    >
      <Thumb article={article} />
      <div className="card-body">
        <Meta article={article} />
        <h3 lang={article.lang}>{article.title}</h3>
        {article.summary && <p lang={article.lang}>{article.summary}</p>}
        <div className="card-foot">
          <span className="domain">{hostname(article.link)}</span>
          <SaveButton saved={saved} onToggle={onToggleSave} />
        </div>
      </div>
    </a>
  );
}

export function SkeletonGrid() {
  return (
    <div className="grid">
      {Array.from({ length: 9 }, (_, i) => (
        <div className="card skeleton" key={i}>
          <div className="thumb" />
          <div className="card-body">
            <div className="sk-line w40" />
            <div className="sk-line" />
            <div className="sk-line w70" />
          </div>
        </div>
      ))}
    </div>
  );
}
