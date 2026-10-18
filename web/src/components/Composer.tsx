// The composer. Auto-grows, remembers your draft, walks your prompt history, and
// — the point of it — keeps working while the agent is busy: Enter queues.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { load, save } from '../lib/storage.ts';
import { Button } from './ui/button.tsx';
import { Icon } from './ui/Icon.tsx';

const MAX_HEIGHT = 220;
const HISTORY_MAX = 50;

export function Composer({
  room,
  running,
  queue,
  onSubmit,
  onRemoveQueued,
}: {
  room: string;
  running: boolean;
  queue: string[];
  onSubmit: (text: string) => void;
  onRemoveQueued: (index: number) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const draftKey = `modelroom.draft.${room}`;
  const historyKey = `modelroom.history.${room}`;
  const [value, setValue] = useState(() => load<string>(draftKey, ''));
  const [history, setHistory] = useState<string[]>(() => load<string[]>(historyKey, []));
  const [cursor, setCursor] = useState<number | null>(null);
  const draft = useRef('');

  useEffect(() => {
    save(draftKey, value);
  }, [draftKey, value]);

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
    setCursor(null);
    const next = history.at(-1) === text ? history : [...history, text].slice(-HISTORY_MAX);
    setHistory(next);
    save(historyKey, next);
  };

  const walkHistory = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    if (event.key === 'ArrowUp') {
      const atStart =
        element.selectionStart === element.selectionEnd &&
        !element.value.slice(0, element.selectionStart).includes('\n');
      if (!history.length || (cursor === null && !atStart)) return;
      event.preventDefault();
      if (cursor === null) {
        draft.current = element.value;
        setCursor(history.length);
      }
      const index = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(index);
      setValue(history[index] ?? '');
      return;
    }
    if (event.key === 'ArrowDown' && cursor !== null) {
      event.preventDefault();
      if (cursor < history.length - 1) {
        setCursor(cursor + 1);
        setValue(history[cursor + 1] ?? '');
      } else {
        setCursor(null);
        setValue(draft.current);
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return; // let the IME finish the word
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    walkHistory(event);
  };

  return (
    <div className="border-t border-border p-2">
      {queue.length > 0 && (
        <div className="flex flex-wrap gap-1 px-0.5 pb-2">
          {queue.map((text, index) => (
            <span
              key={`${index}-${text}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground"
            >
              <Icon name="clock" className="size-3" />
              <span className="max-w-[16rem] truncate">{text}</span>
              <button
                type="button"
                aria-label="Remove queued prompt"
                onClick={() => onRemoveQueued(index)}
                className="rounded transition-colors hover:text-destructive"
              >
                <Icon name="x" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-background p-1.5 transition-colors focus-within:border-ring">
        <textarea
          ref={area}
          rows={1}
          value={value}
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value);
            setCursor(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="Ask the agent to change this room. It edits the room's files; the artifact updates here."
          className="mr-scroll w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-2 px-1">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            Enter to send · Shift+Enter for a new line
          </span>
          <div className="ml-auto flex items-center gap-2">
            {running && (
              <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <Icon name="sparkles" className="size-3" />
                agent is working…
              </span>
            )}
            <Button size="sm" onClick={submit} disabled={!value.trim()}>
              <Icon name="send" className="size-3.5" />
              {running ? 'Queue' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
