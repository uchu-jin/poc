import type { Lang, Ogp, Studio } from '../types';
import ogpByUrl from './studios-ogp.json';

const STUDIO_LIST: { name: string; url: string; lang: Lang }[] = [
  { name: 'Pentagram', url: 'https://www.pentagram.com', lang: 'en' },
  { name: 'Wolff Olins', url: 'https://www.wolffolins.com', lang: 'en' },
  { name: 'Landor', url: 'https://landor.com', lang: 'en' },
  { name: 'Collins', url: 'https://www.wearecollins.com', lang: 'en' },
  { name: 'Interbrand', url: 'https://www.interbrand.com', lang: 'en' },
  {
    name: 'Design Bridge and Partners(旧Superunion)',
    url: 'https://www.designbridge.com',
    lang: 'en',
  },
  { name: 'Turner Duckworth', url: 'https://turnerduckworth.com', lang: 'en' },
  { name: 'Koto', url: 'https://koto.studio', lang: 'en' },
  { name: 'Base Design', url: 'https://www.basedesign.com', lang: 'en' },
  { name: 'Sagmeister & Walsh', url: 'https://sagmeisterwalsh.com', lang: 'en' },
  { name: 'Mucho', url: 'https://wearemucho.com', lang: 'en' },
  { name: 'IDEO', url: 'https://www.ideo.com', lang: 'en' },
  { name: 'frog', url: 'https://www.frog.co', lang: 'en' },
  { name: 'Designit', url: 'https://www.designit.com', lang: 'en' },
  { name: 'ustwo', url: 'https://ustwo.com', lang: 'en' },
  { name: 'Huge', url: 'https://www.hugeinc.com', lang: 'en' },
  { name: 'nendo', url: 'https://www.nendo.jp', lang: 'ja' },
  { name: 'Takram', url: 'https://www.takram.com', lang: 'ja' },
  { name: '日本デザインセンター(NDC)', url: 'https://www.ndc.co.jp', lang: 'ja' },
  { name: '博報堂デザイン', url: 'https://www.hakuhodo-design.com', lang: 'ja' },
  { name: 'SAMURAI', url: 'https://kashiwasato.com', lang: 'ja' },
  { name: 'グッドデザインカンパニー', url: 'https://gooddesigncompany.com', lang: 'ja' },
  { name: 'GKデザイン機構', url: 'https://www.gk-design.co.jp', lang: 'ja' },
  { name: '資生堂クリエイティブ', url: 'https://www.shiseidocreative.com', lang: 'ja' },
  { name: 'ライトパブリシティ', url: 'https://www.lightpublicity.co.jp', lang: 'ja' },
  { name: 'Kigi', url: 'https://ki-gi.com', lang: 'ja' },
];

const ogp: Record<string, Ogp> = ogpByUrl;

export const STUDIOS: Studio[] = STUDIO_LIST.map((s) => ({ ...s, ogp: ogp[s.url] || {} }));
