import { codeToHtml } from 'shiki';

/** Syntax-highlighted HTML (light + dark themes, like the MDX code blocks). Build time only. */
export function highlight(code: string, lang = 'ts'): Promise<string> {
  return codeToHtml(code, { lang, themes: { light: 'github-light', dark: 'github-dark' } });
}
