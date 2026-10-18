// The workshop — a Storybook without the dependency tree.
//
// Every primitive and every panel state can be seen here on its own, before it is
// wired to the server. It is served at `/ui/kit.html`, it is the same bundle as
// the room, and it needs no build of its own: add a section below when you add a
// component, and a change is still reviewable in one screenshot.
//
// The primitives under `components/ui` are shadcn/ui source we own: add one with
// `npx shadcn@latest add <name>` or by hand, then show it here.

import { useState, type ReactNode } from 'react';
import { Markdown } from './components/Markdown.tsx';
import { Badge } from './components/ui/badge.tsx';
import { Button } from './components/ui/button.tsx';
import { CopyButton } from './components/ui/CopyButton.tsx';
import { Icon, ICON_NAMES } from './components/ui/Icon.tsx';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from './components/ui/resizable.tsx';
import { Segmented } from './components/ui/Segmented.tsx';
import { Separator } from './components/ui/separator.tsx';
import { Skeleton } from './components/ui/skeleton.tsx';
import { renderDoc } from './lib/markdown.ts';
import { PROSE_CLASS } from './lib/prose.ts';
import { cn } from './lib/utils.ts';

const SAMPLE_CHAT = `The sign-in room is **two states**, not one:

- \`idle\` — the form, the primary action disabled until both fields are filled.
- \`error\` — the same form, with one plain sentence above it.

\`\`\`ts
export type SignInState = 'idle' | 'submitting' | 'error';
\`\`\`
`;

const SAMPLE_DOC = `# Spec

What the artifact cannot show.

| Key | Value |
| --- | --- |
| device | tablet 1024 |
| states | idle, error |

> A statement lives in one file.
`;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 mb-3 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SegmentedDemo() {
  const [value, setValue] = useState<'edit' | 'split' | 'preview'>('split');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Segmented
        value={value}
        onChange={setValue}
        options={[
          { value: 'edit', label: <Icon name="pencil" className="size-3.5" />, title: 'Edit' },
          {
            value: 'split',
            label: <Icon name="columns" className="size-3.5" />,
            title: 'Edit and preview',
          },
          { value: 'preview', label: <Icon name="eye" className="size-3.5" />, title: 'Preview' },
        ]}
      />
      <span className="font-mono text-xs text-muted-foreground">value: {value}</span>
    </div>
  );
}

export function Kit() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-5">
      <header className="flex items-center gap-2">
        <Icon name="sparkles" className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">modelroom · workshop</h1>
        <Button variant="ghost" size="sm" className="ml-auto" asChild>
          <a href="/">← Rooms</a>
        </Button>
      </header>

      <Section
        title="Icons"
        hint="lucide-react, behind a name — the set shadcn uses. `size-4` unless a caller says otherwise."
      >
        <div className="flex flex-wrap gap-3">
          {ICON_NAMES.map((name) => (
            <div key={name} className="flex w-16 flex-col items-center gap-1">
              <Icon name={name} className="size-5" />
              <span className="font-mono text-[10px] text-muted-foreground">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Segmented (ToggleGroup)"
        hint="Radix ToggleGroup under a named wrapper: modes, orientation, layout."
      >
        <SegmentedDemo />
      </Section>

      <Section title="Button & Badge" hint="shadcn/ui source, our tokens.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const).map(
              (variant) => (
                <Button key={variant} variant={variant} size="sm">
                  {variant}
                </Button>
              ),
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                'default',
                'secondary',
                'outline',
                'muted',
                'success',
                'warning',
                'destructive',
              ] as const
            ).map((variant) => (
              <Badge key={variant} variant={variant}>
                {variant}
              </Badge>
            ))}
            <Button size="icon-sm" variant="outline" title="icon button">
              <Icon name="refresh" className="size-3.5" />
            </Button>
            <CopyButton text="npx modelroom serve" label="copy command" />
            <Button size="sm" disabled>
              <Icon name="loader" className="size-3.5 animate-spin" />
              working
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </div>
      </Section>

      <Section
        title="Markdown — chat"
        hint="markdown-it with raw HTML disabled; code fences get a copy button."
      >
        <div className="max-w-[42rem] rounded-2xl rounded-tl-sm border border-border bg-card px-3 py-2 shadow-xs">
          <Markdown source={SAMPLE_CHAT} className={PROSE_CLASS} />
        </div>
      </Section>

      <Section
        title="Markdown — doc preview"
        hint="Frontmatter is split out by the panel, not here."
      >
        <div className="max-w-[42rem] rounded-lg border border-border p-4">
          <Markdown source={SAMPLE_DOC} render={renderDoc} className={PROSE_CLASS} />
        </div>
      </Section>

      <Section
        title="Resizable"
        hint="react-resizable-panels — the room's columns and the docs split."
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="h-28 overflow-hidden rounded-lg border border-border"
        >
          <ResizablePanel defaultSize={30} minSize={15}>
            <div
              className={cn(
                'grid h-full place-items-center bg-muted/30 text-xs text-muted-foreground',
              )}
            >
              chat
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={40} minSize={15}>
            <div className="grid h-full place-items-center text-xs text-muted-foreground">docs</div>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize={30} minSize={15}>
            <div className="grid h-full place-items-center bg-muted/30 text-xs text-muted-foreground">
              artifact
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </Section>

      <Section title="Separator">
        <div className="flex h-16 items-center gap-4 rounded-lg border border-border px-4">
          <span className="text-xs text-muted-foreground">before</span>
          <Separator orientation="vertical" />
          <span className="text-xs text-muted-foreground">after</span>
        </div>
      </Section>
    </div>
  );
}
