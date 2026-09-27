import createMDX from '@next/mdx';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Static HTML (DECISIONS #106): hosted on Vercel, but works on any static host.
  output: 'export',
  reactStrictMode: true,
  agentRules: false,
  pageExtensions: ['ts', 'tsx', 'mdx'],
};

// Plugins by name (Turbopack can't take functions): tables, heading anchors, highlighted code.
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm'],
    rehypePlugins: [
      'rehype-slug',
      ['@shikijs/rehype', { themes: { light: 'github-light', dark: 'github-dark' } }],
    ],
  },
});

export default withMDX(config);
