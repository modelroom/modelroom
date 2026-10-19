// Rendered markdown. The HTML comes from markdown-it with raw HTML disabled, so
// `dangerouslySetInnerHTML` is safe here; the only DOM we touch is adding a copy
// button to each code fence.
//
// The reading rhythm is Mantine's `Typography` — the old `prose` recipe is gone
// with the utility layer, and its job (headings, tables, code fences,
// blockquotes) is what `Typography` is for.

import { useEffect, useMemo, useRef } from 'react';
import { Typography } from '@mantine/core';
import { renderChat } from '../lib/markdown.ts';

export function Markdown({
  source,
  render = renderChat,
  className = '',
}: {
  source: string;
  render?: (source: string) => string;
  className?: string;
}) {
  const html = useMemo(() => render(source), [source, render]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const added: Array<{ pre: HTMLElement; button: HTMLButtonElement }> = [];
    for (const pre of root.querySelectorAll('pre')) {
      if (pre.dataset.mrCopy === '1') continue;
      const code = pre.textContent ?? '';
      pre.dataset.mrCopy = '1';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'copy';
      button.className = 'mr-copy';
      button.addEventListener('click', () => {
        void (async () => {
          try {
            await navigator.clipboard.writeText(code);
            button.textContent = 'copied';
            window.setTimeout(() => {
              button.textContent = 'copy';
            }, 1200);
          } catch {
            /* clipboard blocked */
          }
        })();
      });
      pre.appendChild(button);
      added.push({ pre, button });
    }
    return () => {
      for (const { pre, button } of added) {
        button.remove();
        delete pre.dataset.mrCopy;
      }
    };
  }, [html]);

  return (
    <Typography
      ref={ref}
      className={`mr-markdown ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
