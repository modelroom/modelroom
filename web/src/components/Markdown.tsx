// Rendered markdown. The HTML comes from markdown-it with raw HTML disabled, so
// `dangerouslySetInnerHTML` is safe here; the only DOM we touch is adding a copy
// button to each code fence.

import { useEffect, useMemo, useRef } from 'react';
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
      button.className =
        'absolute top-1.5 right-1.5 inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';
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
    <div
      ref={ref}
      className={`mr-markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
