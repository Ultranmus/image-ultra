import type { MDXComponents } from 'mdx/types';
import Link from 'next/link';

/** How MDX elements render: internal links use Next's `<Link>`. */
const components: MDXComponents = {
  a: ({ href = '', ...props }) =>
    href.startsWith('/') ? <Link href={href} {...props} /> : <a href={href} {...props} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
