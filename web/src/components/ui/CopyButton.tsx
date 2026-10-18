import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button.tsx';
import { Icon } from './Icon.tsx';

export function CopyButton({
  text,
  label = 'copy',
  size = 'xs',
  className = '',
}: {
  text: string;
  label?: string;
  size?: 'xs' | 'icon-xs' | 'icon-sm';
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setDone(true);
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setDone(false), 1200);
      } catch {
        /* clipboard blocked: nothing to say */
      }
    })();
  }, [text]);

  if (size !== 'xs') {
    return (
      <Button variant="ghost" size={size} onClick={copy} title={label} className={className}>
        <Icon name={done ? 'check' : 'copy'} className="size-3.5" />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="xs" onClick={copy} title={label} className={className}>
      <Icon name={done ? 'check' : 'copy'} className="size-3.5" />
      {done ? 'copied' : label}
    </Button>
  );
}
