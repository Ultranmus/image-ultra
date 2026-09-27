import { Fragment, type ReactNode } from 'react';
import { highlight } from '../highlight';

/**
 * Renders a doc comment: paragraphs, ```code blocks```, `inline code` and **bold**. Doc comments
 * are our own (from the packages' types), read at build time.
 */
export async function Doc({ text }: { text: string }) {
  const blocks = text.split(/(```\w*\n[\s\S]*?```)/g).filter((b) => b.trim());
  const rendered = await Promise.all(
    blocks.map(async (block, i) => {
      const code = /^```(\w*)\n([\s\S]*?)```$/.exec(block);
      if (code) {
        const html = await highlight(code[2]!.trimEnd(), code[1] || 'ts');
        return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      }
      return block
        .split(/\n{2,}/)
        .map((para, j) => <p key={`${i}-${j}`}>{inline(para.replace(/\n/g, ' '))}</p>);
    }),
  );
  return <>{rendered}</>;
}

function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
