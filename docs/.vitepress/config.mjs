import { defineConfig } from 'vitepress';

const attribution =
  'N-ATLaS is an initiative of the Federal Ministry of Communications, Innovation and Digital Economy, and powered by Awarri Technologies.';

const socialLinks = [
  { icon: 'github', link: 'https://github.com/Kambah123/N-ATLAS-Kit' },
  { icon: 'x', link: 'https://x.com/0xSkamber' },
];

const builder =
  'Built by <a href="https://www.onedevstudioo.site/" target="_blank" rel="noopener">OneDev Studioo</a>' +
  ' · <a href="https://x.com/0xSkamber" target="_blank" rel="noopener">@0xSkamber</a>';

/** @type {import('vitepress').DefaultTheme.NavItem[]} */
const enNav = [
  { text: 'Quickstart', link: '/quickstart' },
  { text: 'Gateway', link: '/gateway' },
  {
    text: 'SDKs',
    items: [
      { text: 'JavaScript', link: '/sdk/javascript' },
      { text: 'Python', link: '/sdk/python' },
    ],
  },
  { text: 'Hausa', link: '/ha/' },
];

/** @type {import('vitepress').DefaultTheme.Sidebar} */
const enSidebar = [
  {
    text: 'Guide',
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Quickstart', link: '/quickstart' },
      { text: 'Examples', link: '/examples' },
      { text: 'Templates', link: '/templates' },
      { text: 'Self-hosting', link: '/self-hosting' },
      { text: 'Limits and troubleshooting', link: '/troubleshooting' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Gateway API', link: '/gateway' },
      { text: 'JavaScript SDK', link: '/sdk/javascript' },
      { text: 'Python SDK', link: '/sdk/python' },
      { text: 'How the kit uses N-ATLaS', link: '/integration' },
      { text: 'Licensing and attribution', link: '/licensing' },
    ],
  },
];

export default defineConfig({
  title: 'N-ATLAS Kit',
  titleTemplate: ':title · N-ATLAS Kit',
  description:
    'Developer toolkit for N-ATLaS — Hausa, Igbo, Yorùbá, and Nigerian English — and the four NCAIR1 speech models.',
  lang: 'en-NG',
  cleanUrls: true,
  srcDir: 'src',
  ignoreDeadLinks: false,
  themeConfig: {
    siteTitle: 'N-ATLAS Kit',
    nav: enNav,
    sidebar: enSidebar,
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    socialLinks,
    footer: {
      message: attribution,
      copyright: `Toolkit code is Apache-2.0. The N-ATLaS and NCAIR1 speech models are not. ${builder}`,
    },
  },
  locales: {
    root: {
      label: 'English',
      lang: 'en-NG',
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
      },
    },
    ha: {
      label: 'Hausa',
      lang: 'ha',
      description: 'Kayan aiki na masu haɓaka software don N-ATLaS.',
      themeConfig: {
        nav: [
          { text: 'Bayani', link: '/ha/' },
          { text: 'Farawa', link: '/ha/quickstart' },
          { text: 'Samfura', link: '/ha/templates' },
          { text: 'English', link: '/' },
        ],
        sidebar: [
          {
            text: 'Hausa',
            items: [
              { text: 'Bayani', link: '/ha/' },
              { text: 'Farawa', link: '/ha/quickstart' },
              { text: 'Samfura', link: '/ha/templates' },
            ],
          },
          {
            text: 'Sauran shafuka suna da Turanci',
            items: [
              { text: 'Gateway API', link: '/gateway' },
              { text: 'JavaScript SDK', link: '/sdk/javascript' },
              { text: 'Python SDK', link: '/sdk/python' },
              { text: 'Self-hosting', link: '/self-hosting' },
              { text: 'Troubleshooting', link: '/troubleshooting' },
              { text: 'Licensing', link: '/licensing' },
            ],
          },
        ],
        outline: { level: [2, 3], label: 'A wannan shafin' },
        docFooter: { prev: 'Baya', next: 'Gaba' },
        darkModeSwitchLabel: 'Yanayi',
        sidebarMenuLabel: 'Jerin shafuka',
        returnToTopLabel: 'Koma sama',
        socialLinks,
        footer: {
          message: `Ana buƙatar mai magana da Hausa ya duba fassarar. ${attribution}`,
          copyright: `Lambar kayan aikin Apache-2.0 ce. Samfuran ba haka ba. ${builder}`,
        },
      },
    },
  },
});
