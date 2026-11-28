export type CategoryId = 'all' | 'ai-design' | 'ai-dev' | 'uiux' | 'branding' | 'studios';
export type ArticleCategory = Exclude<CategoryId, 'all' | 'studios'>;
export type Lang = 'en' | 'ja';

export type Source = {
  id: string;
  name: string;
  category: ArticleCategory;
  url: string;
  lang?: Lang;
  // タイトルか要約に一致する記事だけを残す
  match?: RegExp;
  // タイトルに一致する記事を除く
  exclude?: RegExp;
  // AI に関する記事だったら、このカテゴリに振り替える
  aiCategory?: ArticleCategory;
  // 利用者が追加したサイト。feed.php?url= で取得する
  custom?: boolean;
};

export type Article = {
  id: string;
  title: string;
  link: string;
  summary: string;
  image: string;
  date: string | null;
  source: string;
  sourceId: string;
  category: ArticleCategory;
  lang: Lang;
};

export type FetchStatus = 'loading' | 'ok' | 'error';

export type Ogp = {
  title?: string;
  description?: string;
  image?: string;
  icon?: string;
  siteName?: string;
};

export type Studio = {
  name: string;
  url: string;
  lang: Lang;
  ogp: Ogp;
  // 利用者が追加した会社
  custom?: boolean;
};
