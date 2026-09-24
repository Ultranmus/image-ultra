import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Agent instructions live in the repo-root CLAUDE.md + docs/internal.
  agentRules: false,
};

export default config;
