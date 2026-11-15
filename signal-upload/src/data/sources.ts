import type { CategoryId, Lang, Source } from '../types';

// public/api/feeds.json にも同じ id と URL を登録する(tests/feeds-json.test.ts で照合)

export const AI_PATTERN = new RegExp(
  String.raw`\b(AI|A\.I\.|artificial intelligence|LLMs?|GPT[-\w]*|Claude|Opus|Sonnet|Haiku|Gemini|ChatGPT|Midjourney|Firefly|Stable Diffusion|diffusion models?|generative|gen ?AI|agentic|AI agents?|machine learning|copilot|prompt(s|ing)?|vibe coding|MCP)\b` +
    `|人工知能|生成AI|機械学習|AIエージェント|プロンプト|バイブコーディング`,
  'i',
);

const BRANDING_PATTERN =
  /ブランディング|ブランドアイデンティティ|ブランド刷新|ロゴ|\bCI\b|\bVI\b|パッケージ|リブランド|リニューアル|アイデンティティ|タイポグラフィ|アートディレクション/;

export const SOURCES: Source[] = [
  {
    id: 'uxc-ai',
    name: 'UX Collective',
    category: 'ai-design',
    url: 'https://uxdesign.cc/feed/tagged/ai',
  },
  {
    id: 'uxplanet-ai',
    name: 'UX Planet',
    category: 'ai-design',
    url: 'https://uxplanet.org/feed/tagged/ai',
  },
  {
    id: 'medium-aidesign',
    name: 'Medium #AI Design',
    category: 'ai-design',
    url: 'https://medium.com/feed/tag/ai-design',
  },
  {
    id: 'simonw',
    name: 'Simon Willison',
    category: 'ai-dev',
    url: 'https://simonwillison.net/atom/everything/',
  },
  {
    id: 'github-ai',
    name: 'GitHub Blog',
    category: 'ai-dev',
    url: 'https://github.blog/ai-and-ml/feed/',
  },
  {
    id: 'latentspace',
    name: 'Latent Space',
    category: 'ai-dev',
    url: 'https://www.latent.space/feed',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    category: 'ai-dev',
    url: 'https://huggingface.co/blog/feed.xml',
  },
  {
    id: 'infoq-ai',
    name: 'InfoQ AI/ML',
    category: 'ai-dev',
    url: 'https://feed.infoq.com/ai-ml-data-eng/',
  },
  {
    id: 'googledev',
    name: 'Google Developers',
    category: 'ai-dev',
    url: 'https://developers.googleblog.com/feeds/posts/default',
    match: AI_PATTERN,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'ai-dev',
    url: 'https://openai.com/news/rss.xml',
    match:
      /\b(API|Codex|developers?|SDK|agents?|coding|code|engineers?|Responses|Realtime|fine-tun\w*|open[- ]weight)\b/i,
  },
  {
    id: 'jetbrains-ai',
    name: 'JetBrains AI',
    category: 'ai-dev',
    url: 'https://blog.jetbrains.com/ai/feed/',
  },
  {
    id: 'zenn-llm',
    name: 'Zenn(LLM)',
    category: 'ai-dev',
    lang: 'ja',
    url: 'https://zenn.dev/topics/llm/feed',
  },
  {
    id: 'zenn-genai',
    name: 'Zenn(生成AI)',
    category: 'ai-dev',
    lang: 'ja',
    url: 'https://zenn.dev/topics/%E7%94%9F%E6%88%90ai/feed',
  },
  {
    id: 'qiita-genai',
    name: 'Qiita(生成AI)',
    category: 'ai-dev',
    lang: 'ja',
    url: 'https://qiita.com/tags/%E7%94%9F%E6%88%90ai/feed',
  },
  {
    id: 'publickey',
    name: 'Publickey',
    category: 'ai-dev',
    lang: 'ja',
    url: 'https://www.publickey1.jp/atom.xml',
    match: AI_PATTERN,
  },
  {
    id: 'devio',
    name: 'DevelopersIO',
    category: 'ai-dev',
    lang: 'ja',
    url: 'https://dev.classmethod.jp/feed/',
    match: AI_PATTERN,
  },
  {
    id: 'nngroup',
    name: 'Nielsen Norman Group',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://www.nngroup.com/feed/rss/',
  },
  {
    id: 'smashing',
    name: 'Smashing Magazine',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://www.smashingmagazine.com/feed/',
  },
  {
    id: 'uxcollective',
    name: 'UX Collective',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://uxdesign.cc/feed',
  },
  {
    id: 'uxplanet',
    name: 'UX Planet',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://uxplanet.org/feed',
  },
  {
    id: 'figma',
    name: 'Figma Blog',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://www.figma.com/blog/feed/atom.xml',
  },
  {
    id: 'alistapart',
    name: 'A List Apart',
    category: 'uiux',
    aiCategory: 'ai-design',
    url: 'https://alistapart.com/main/feed/',
  },
  {
    id: 'goodpatch',
    name: 'Goodpatch Blog',
    category: 'uiux',
    aiCategory: 'ai-design',
    lang: 'ja',
    url: 'https://goodpatch.com/blog/feed',
  },
  {
    id: 'zenn-design',
    name: 'Zenn(デザイン)',
    category: 'uiux',
    aiCategory: 'ai-design',
    lang: 'ja',
    url: 'https://zenn.dev/topics/design/feed',
  },
  {
    id: 'zenn-figma',
    name: 'Zenn(Figma)',
    category: 'uiux',
    aiCategory: 'ai-design',
    lang: 'ja',
    url: 'https://zenn.dev/topics/figma/feed',
  },
  {
    id: 'webcreatorbox',
    name: 'Webクリエイターボックス',
    category: 'uiux',
    aiCategory: 'ai-design',
    lang: 'ja',
    url: 'https://www.webcreatorbox.com/feed',
  },
  {
    id: 'coliss',
    name: 'コリス',
    category: 'uiux',
    aiCategory: 'ai-design',
    lang: 'ja',
    url: 'https://coliss.com/feed/',
  },
  { id: 'bpo', name: 'BP&O', category: 'branding', url: 'https://bpando.org/feed/' },
  {
    id: 'brandingmag',
    name: 'Brandingmag',
    category: 'branding',
    url: 'https://www.brandingmag.com/feed/',
  },
  {
    id: 'designweek',
    name: 'Design Week',
    category: 'branding',
    url: 'https://www.designweek.co.uk/feed/',
  },
  {
    id: 'creativereview',
    name: 'Creative Review',
    category: 'branding',
    url: 'https://www.creativereview.co.uk/feed/',
  },
  {
    id: 'packagingworld',
    name: 'Packaging of the World',
    category: 'branding',
    url: 'https://packagingoftheworld.com/feed',
  },
  {
    id: 'mindsparkle',
    name: 'Mindsparkle Mag',
    category: 'branding',
    url: 'https://mindsparklemag.com/feed/',
  },
  {
    id: 'jdn',
    name: 'JDN',
    category: 'branding',
    lang: 'ja',
    url: 'https://www.japandesign.ne.jp/feed/',
    match: BRANDING_PATTERN,
    exclude: /求人/,
  },
  {
    id: 'advertimes',
    name: 'AdverTimes',
    category: 'branding',
    lang: 'ja',
    url: 'https://www.advertimes.com/feed/',
    match: BRANDING_PATTERN,
  },
];

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'ai-design', label: 'AI×デザイン' },
  { id: 'ai-dev', label: 'AI×開発' },
  { id: 'uiux', label: 'UI/UX' },
  { id: 'branding', label: 'ブランディング' },
  { id: 'studios', label: 'デザイン会社' },
];

export const REGIONS: { id: 'all' | Lang; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'en', label: '海外' },
  { id: 'ja', label: '国内' },
];

export const PERIODS = [
  { id: 'all', label: 'すべて', ms: Infinity },
  { id: '24h', label: '24時間', ms: 86_400_000 },
  { id: '7d', label: '7日間', ms: 604_800_000 },
] as const;

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label || id;
