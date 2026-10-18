// The chat column: the conversation, the run log, and the composer.

import { useEffect, useRef } from 'react';
import type { ChatApi, ChatMessage } from '../hooks/useChat.ts';
import { clock } from '../lib/format.ts';
import { PROSE_CLASS } from '../lib/prose.ts';
import { cn } from '../lib/utils.ts';
import { Composer } from './Composer.tsx';
import { Markdown } from './Markdown.tsx';
import { PartView } from './parts.tsx';
import { CopyButton } from './ui/CopyButton.tsx';
import { Icon } from './ui/Icon.tsx';

const SUGGESTIONS = [
  'Tighten the spacing and the type scale.',
  'Add a loading state and an error state.',
  'Make the primary action the obvious one.',
  'Rewrite SPEC.md so it only holds what the screen cannot show.',
];

function LogBlock({ message }: { message: Extract<ChatMessage, { role: 'log' }> }) {
  return (
    <details open={!message.done} className="rounded-lg border border-border bg-muted/40 text-xs">
      <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 font-mono text-muted-foreground">
        <Icon name="terminal" className="size-3.5" />
        agent log
        {!message.done && <Icon name="loader" className="size-3 animate-spin" />}
      </summary>
      <pre className="mr-scroll max-h-56 overflow-auto px-2.5 pb-2 font-mono whitespace-pre-wrap text-muted-foreground">
        {message.text}
      </pre>
    </details>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'log') return <LogBlock message={message} />;

  if (message.role === 'system') {
    return (
      <p
        className={cn(
          'text-center font-mono text-[11px]',
          message.tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {message.text}
      </p>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[92%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-primary-foreground">
          <p className="text-sm break-words whitespace-pre-wrap">{message.text}</p>
        </div>
        <span className="text-[11px] text-muted-foreground">{clock(message.at)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {message.parts && message.parts.length > 0 ? (
        <div className="flex w-full flex-col gap-2">
          {message.parts.map((part, index) => (
            <PartView key={`${message.id}-${index}`} part={part} />
          ))}
          {!message.done && (
            <span className="h-3.5 w-1.5 animate-pulse rounded-sm bg-primary" aria-hidden />
          )}
        </div>
      ) : (
        <div className="max-w-[95%] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 shadow-xs">
          <Markdown source={message.text} className={PROSE_CLASS} />
          {!message.done && (
            <span className="mt-1 inline-block h-3.5 w-1.5 animate-pulse rounded-sm bg-primary align-middle" />
          )}
        </div>
      )}
      <div className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
        <span>{clock(message.at)}</span>
        {message.done && <CopyButton text={message.text} size="icon-xs" label="Copy reply" />}
      </div>
    </div>
  );
}

export function ChatPanel({
  room,
  chat,
  agentLabel,
}: {
  room: string;
  chat: ChatApi;
  agentLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">Chat</span>
        {chat.running && <Icon name="loader" className="size-3.5 animate-spin text-primary" />}
        <span
          className="ml-auto truncate font-mono text-[11px] text-muted-foreground"
          title={agentLabel}
        >
          {agentLabel}
        </span>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
        className="mr-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        {chat.messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Icon name="sparkles" className="size-5" />
            </div>
            <p className="max-w-[15rem] text-sm text-muted-foreground">
              A room is one screen. Ask for the change; watch the artifact move.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => void chat.submit(text)}
                  className="max-w-full rounded-md border border-border px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </div>

      <Composer
        key={room}
        room={room}
        running={chat.running}
        queue={chat.queue}
        onSubmit={(text) => void chat.submit(text)}
        onRemoveQueued={chat.removeQueued}
      />
    </section>
  );
}
