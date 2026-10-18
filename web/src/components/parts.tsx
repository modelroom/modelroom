// Rendering one part of a turn.
//
// The chat used to have one shape — a bubble of text — because stdout has one
// shape. A turn does not: it is text, thinking, and calls the agent made, and
// each of those wants to look like itself. A tool row is one line; open it to
// see what it printed, or the patch it wrote.

import { cn } from '../lib/utils.ts';
import { PROSE_CLASS } from '../lib/prose.ts';
import type { DiffFile, Part } from '../lib/api.ts';
import { Markdown } from './Markdown.tsx';
import { Badge } from './ui/badge.tsx';
import { Icon, type IconName } from './ui/Icon.tsx';

/** A tool's name is opencode's, so the icon is a hint, not a contract. */
const ICONS: Record<string, IconName> = {
  shell: 'terminal',
  bash: 'terminal',
  read: 'file',
  write: 'pencil',
  edit: 'pencil',
  patch: 'pencil',
  glob: 'search',
  grep: 'search',
  list: 'file',
  task: 'sparkles',
  fetch: 'external',
};

function statusVariant(status: 'running' | 'completed' | 'error') {
  if (status === 'error') return 'destructive' as const;
  if (status === 'running') return 'secondary' as const;
  return 'muted' as const;
}

function Patch({ file }: { file: DiffFile }) {
  const lines = file.patch.split('\n');
  return (
    <div data-part="patch" className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground">
        {file.file}
      </div>
      <pre className="mr-scroll max-h-64 overflow-auto p-2 font-mono text-[11px] leading-relaxed">
        {lines.map((line, index) => (
          <div
            key={index}
            className={cn(
              'px-1',
              line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')
                ? 'text-muted-foreground'
                : line.startsWith('+')
                  ? 'bg-success/10 text-success'
                  : line.startsWith('-')
                    ? 'bg-destructive/10 text-destructive'
                    : '',
            )}
          >
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}

function ToolRow({ part }: { part: Extract<Part, { kind: 'tool' }> }) {
  const icon = ICONS[part.name] ?? 'terminal';
  const hasBody = Boolean(part.output) || part.files.length > 0;
  return (
    <div data-part="tool" className="w-full rounded-lg border border-border bg-card/60 text-xs">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <Icon name={icon} className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 font-mono font-medium">{part.name}</span>
        {part.summary && (
          <span
            className="min-w-0 flex-1 truncate font-mono text-muted-foreground"
            title={part.summary}
          >
            {part.summary}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {part.exit !== null && part.exit !== 0 && (
            <Badge variant="destructive">exit {part.exit}</Badge>
          )}
          {part.files.length > 0 && (
            <Badge variant="muted">
              {part.files.length} file{part.files.length > 1 ? 's' : ''}
            </Badge>
          )}
          <Badge variant={statusVariant(part.status)}>
            {part.status === 'running' && <Icon name="loader" className="size-3 animate-spin" />}
            {part.status}
          </Badge>
        </span>
      </div>

      {hasBody && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-2.5 py-1 text-muted-foreground">
            {part.files.length > 0 ? 'changes' : 'output'}
          </summary>
          <div className="flex flex-col gap-2 p-2">
            {part.files.map((file) => (
              <Patch key={file.file} file={file} />
            ))}
            {part.output && (
              <pre className="mr-scroll max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] whitespace-pre-wrap">
                {part.output}
              </pre>
            )}
            {part.truncated && (
              <p className="text-[11px] text-muted-foreground">output was truncated</p>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function PartView({ part }: { part: Part }) {
  if (part.kind === 'text') {
    return (
      <div
        data-part="text"
        className="max-w-[95%] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 shadow-xs"
      >
        <Markdown source={part.text} className={PROSE_CLASS} />
      </div>
    );
  }

  if (part.kind === 'reasoning') {
    return (
      <details
        data-part="reasoning"
        className="w-full rounded-lg border border-dashed border-border bg-muted/30 text-xs"
      >
        <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground">
          <Icon name="sparkles" className="size-3.5" />
          reasoning
        </summary>
        <div className="mr-scroll max-h-64 overflow-auto px-3 pb-2 text-muted-foreground">
          <Markdown source={part.text} className={PROSE_CLASS} />
        </div>
      </details>
    );
  }

  return <ToolRow part={part} />;
}
