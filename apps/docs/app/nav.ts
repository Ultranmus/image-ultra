/** The docs sidebar, in reading order. */
export interface NavSection {
  title: string;
  pages: { href: string; title: string }[];
}

export const NAV: NavSection[] = [
  {
    title: 'Start',
    pages: [{ href: '/docs/getting-started', title: 'Getting started' }],
  },
  {
    title: 'Guides',
    pages: [
      { href: '/docs/saving', title: 'Save and restore edits' },
      { href: '/docs/headless', title: 'Render without the editor' },
      { href: '/docs/tools', title: 'Choose tools' },
      { href: '/docs/custom-tools', title: 'Custom tools' },
      { href: '/docs/theming', title: 'Theming' },
      { href: '/docs/localization', title: 'Languages and right-to-left' },
      { href: '/docs/assets', title: 'Stickers, watermark and fonts' },
      { href: '/docs/accessibility', title: 'Accessibility' },
      { href: '/docs/big-photos', title: 'Big photos and limits' },
      { href: '/docs/metadata', title: 'Photo metadata (EXIF)' },
      { href: '/docs/ssr', title: 'Server rendering' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { href: '/reference', title: 'API reference' },
      { href: '/theming', title: 'Theme playground' },
    ],
  },
];
