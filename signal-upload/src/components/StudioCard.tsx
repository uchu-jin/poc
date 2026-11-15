import { hostname } from '../lib/format';
import type { Studio } from '../types';

export function StudioCard({ studio }: { studio: Studio }) {
  const { name, url, lang, ogp } = studio;
  return (
    <a className="card studio" href={url} target="_blank" rel="noreferrer">
      <div className="thumb studio-thumb">
        {ogp.image ? (
          <img
            src={ogp.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => e.currentTarget.remove()}
          />
        ) : null}
        <span className="thumb-fallback studio-fallback" translate="no">
          {name}
        </span>
      </div>
      <div className="card-body">
        <div className="studio-head">
          {ogp.icon && (
            <img
              className="studio-icon"
              src={ogp.icon}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => e.currentTarget.remove()}
            />
          )}
          <h3 translate="no">{name}</h3>
          {lang === 'ja' && <span className="jp-mark">国内</span>}
        </div>
        {ogp.description && <p lang={lang}>{ogp.description}</p>}
        <div className="card-foot">
          <span className="domain">{hostname(url)} ↗</span>
        </div>
      </div>
    </a>
  );
}
