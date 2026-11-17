import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://rgsp.renjuportal.com',
  integrations: [
    starlight({
      title: 'RGSP',
      description: '連珠対局サーバープロトコル（Renju Game Server Protocol）の仕様書',
      defaultLocale: 'root',
      locales: {
        root: { label: '日本語', lang: 'ja' },
        en: { label: 'English', lang: 'en' },
      },
      customCss: ['./src/styles/custom.css'],
      social: [],
      sidebar: [
        { label: '仕様書', translations: { en: 'Specification' }, items: [
          { label: '概要', translations: { en: 'Overview' }, slug: 'overview' },
          { label: '仕様書（全文）', translations: { en: 'Full specification' }, slug: 'spec' },
          { label: '決まっていること・未定のこと', translations: { en: 'Status' }, slug: 'status' },
        ]},
        { label: 'リファレンス', translations: { en: 'Reference' }, items: [
          { label: 'API リファレンス', translations: { en: 'API reference' }, link: '/reference/', attrs: { target: '_blank' } },
          { label: 'エラーコード', translations: { en: 'Error codes' }, slug: 'errors' },
          { label: 'サーバー一覧', translations: { en: 'Server directory' }, slug: 'servers' },
        ]},
      ],
    }),
  ],
});
