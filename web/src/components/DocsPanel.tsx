// The docs column: every room doc, in tabs or as tiles, edited, previewed, or
// both at once — and split across or down depending on how you like to read.
//
// The file is still the source of truth. Autosave writes it back through the same
// mtime-checked PUT the old UI used, and a conflict (someone else wrote the file)
// stops and asks instead of overwriting.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getDoc, putDoc } from '../lib/api.ts';
import { clock, docLabel, splitFrontmatter, type FrontmatterRow } from '../lib/format.ts';
import { renderDoc } from '../lib/markdown.ts';
import { PROSE_CLASS } from '../lib/prose.ts';
import { load, save } from '../lib/storage.ts';
import { cn } from '../lib/utils.ts';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Markdown } from './Markdown.tsx';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { Button } from './ui/button.tsx';
import { Icon } from './ui/Icon.tsx';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable.tsx';
import { Segmented, type Segment } from './ui/Segmented.tsx';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs.tsx';

type Mode = 'edit' | 'split' | 'preview';
type Layout = 'tabs' | 'tiles';
type Orientation = 'row' | 'column';
type Tone = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface DocEntry {
  name: string;
  text: string;
  savedText: string;
  mtime: number;
  savedAt: number;
  tone: Tone;
  error?: string;
  conflict?: { text: string; mtime: number };
}

const AUTOSAVE_MS = 800;

const MODES: ReadonlyArray<Segment<Mode>> = [
  { value: 'edit', label: <Icon name="pencil" className="size-3.5" />, title: 'Edit' },
  {
    value: 'split',
    label: <Icon name="columns" className="size-3.5" />,
    title: 'Edit and preview',
  },
  { value: 'preview', label: <Icon name="eye" className="size-3.5" />, title: 'Preview' },
];

const ORIENTATIONS: ReadonlyArray<Segment<Orientation>> = [
  { value: 'row', label: <Icon name="columns" className="size-3.5" />, title: 'Side by side' },
  { value: 'column', label: <Icon name="rows" className="size-3.5" />, title: 'Stacked' },
];

function statusOf(entry: DocEntry): { text: string; tone: string } {
  if (entry.tone === 'error')
    return { text: `failed: ${entry.error ?? ''}`, tone: 'text-destructive' };
  if (entry.tone === 'conflict') return { text: 'changed elsewhere', tone: 'text-warning' };
  if (entry.tone === 'saving') return { text: 'saving…', tone: 'text-muted-foreground' };
  if (entry.text !== entry.savedText) return { text: 'unsaved…', tone: 'text-muted-foreground' };
  if (entry.savedAt)
    return { text: `saved ${clock(entry.savedAt)}`, tone: 'text-muted-foreground' };
  return { text: '', tone: '' };
}

function Preview({ text }: { text: string }) {
  const { rows, body } = useMemo(() => splitFrontmatter(text), [text]);
  return (
    <div className="mr-scroll h-full overflow-y-auto bg-card p-4">
      {rows.length > 0 && (
        <dl className="mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          {rows.map((row: FrontmatterRow) => (
            <Fragment key={row.key}>
              <dt className="font-mono text-muted-foreground">{row.key}</dt>
              <dd className="truncate" title={row.value}>
                {row.value || '—'}
              </dd>
            </Fragment>
          ))}
        </dl>
      )}
      <Markdown source={body} render={renderDoc} className={PROSE_CLASS} />
    </div>
  );
}

function ConflictBanner({
  entry,
  onKeep,
  onTake,
}: {
  entry: DocEntry;
  onKeep: () => void;
  onTake: () => void;
}) {
  if (entry.tone !== 'conflict') return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs">
      <Icon name="alert" className="size-3.5 text-destructive" />
      <span>
        <span className="font-mono">{entry.name}</span> changed on disk while you were typing.
      </span>
      <div className="ml-auto flex gap-1">
        <Button variant="outline" size="xs" onClick={onKeep}>
          Keep mine
        </Button>
        <Button variant="destructive" size="xs" onClick={onTake}>
          Take theirs
        </Button>
      </div>
    </div>
  );
}

export function DocsPanel({
  room,
  roomsPath,
  docs,
}: {
  room: string;
  roomsPath: string;
  docs: string[];
}) {
  const [entries, setEntries] = useState<Record<string, DocEntry>>(() =>
    Object.fromEntries(
      docs.map((name) => [
        name,
        { name, text: '', savedText: '', mtime: 0, savedAt: 0, tone: 'idle' as Tone },
      ]),
    ),
  );
  const ref = useRef(entries);
  const timers = useRef(new Map<string, number>());

  const [active, setActive] = useState<string>(() => load('modelroom.docs.active', docs[0] ?? ''));
  const [mode, setMode] = useState<Mode>(() =>
    load<Mode>('modelroom.docs.mode', window.innerWidth > 1200 ? 'split' : 'edit'),
  );
  const [layout, setLayout] = useState<Layout>(() => load<Layout>('modelroom.docs.layout', 'tabs'));
  const [orientation, setOrientation] = useState<Orientation>(() =>
    load<Orientation>('modelroom.docs.orientation', 'row'),
  );

  const patch = useCallback((name: string, partial: Partial<DocEntry>) => {
    const current = ref.current[name];
    if (!current) return;
    ref.current = { ...ref.current, [name]: { ...current, ...partial } };
    setEntries(ref.current);
  }, []);

  useEffect(() => {
    save('modelroom.docs.active', active);
  }, [active]);
  useEffect(() => {
    save('modelroom.docs.mode', mode);
  }, [mode]);
  useEffect(() => {
    save('modelroom.docs.layout', layout);
  }, [layout]);
  useEffect(() => {
    save('modelroom.docs.orientation', orientation);
  }, [orientation]);

  const loadDoc = useCallback(
    async (name: string, force: boolean) => {
      const data = await getDoc(room, name).catch(() => null);
      if (!data) return;
      if (data.error) {
        patch(name, { tone: 'error', error: data.error });
        return;
      }
      const current = ref.current[name];
      if (!force && current && current.text !== current.savedText) return; // don't clobber typing
      patch(name, {
        text: data.text,
        savedText: data.text,
        mtime: data.mtime,
        savedAt: data.mtime || Date.now(),
        tone: 'saved',
        error: undefined,
        conflict: undefined,
      });
    },
    [patch, room],
  );

  const saveDoc = useCallback(
    async (name: string) => {
      const entry = ref.current[name];
      if (!entry || entry.text === entry.savedText) return;
      patch(name, { tone: 'saving' });
      const { ok, status, data } = await putDoc({
        room,
        name,
        text: entry.text,
        mtime: entry.mtime,
      });
      if (ok) {
        patch(name, {
          mtime: data.mtime ?? entry.mtime,
          savedText: entry.text,
          savedAt: Date.now(),
          tone: 'saved',
          error: undefined,
        });
        return;
      }
      if (status === 409) {
        patch(name, {
          tone: 'conflict',
          conflict: { text: data.text ?? '', mtime: data.mtime ?? 0 },
        });
        return;
      }
      patch(name, { tone: 'error', error: data.error ?? String(status) });
    },
    [patch, room],
  );

  const onText = useCallback(
    (name: string, text: string) => {
      patch(name, { text, tone: ref.current[name]?.tone === 'conflict' ? 'conflict' : 'idle' });
      const existing = timers.current.get(name);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        name,
        window.setTimeout(() => {
          timers.current.delete(name);
          void saveDoc(name);
        }, AUTOSAVE_MS),
      );
    },
    [patch, saveDoc],
  );

  // First load.
  useEffect(() => {
    for (const name of docs) void loadDoc(name, true);
    return () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, [docs, loadDoc]);

  // The agent (or another editor) changed a file we are showing.
  useServerEvent<{ file: string }>('change', (data) => {
    if (!data.file.startsWith(`${roomsPath}/${room}/`)) return;
    const base = data.file.split('/').pop() ?? '';
    if (docs.includes(base)) void loadDoc(base, false);
  });

  const conflictKeep = async (name: string) => {
    const entry = ref.current[name];
    if (!entry?.conflict) return;
    patch(name, { mtime: entry.conflict.mtime, tone: 'idle', conflict: undefined });
    await saveDoc(name);
  };
  const conflictTake = (name: string) => {
    const entry = ref.current[name];
    if (!entry?.conflict) return;
    patch(name, {
      text: entry.conflict.text,
      savedText: entry.conflict.text,
      mtime: entry.conflict.mtime,
      savedAt: Date.now(),
      tone: 'saved',
      conflict: undefined,
    });
  };

  const activeEntry = entries[active] ?? Object.values(entries)[0];
  // Tiles wrap when they would get too narrow to read: 260px is about a
  // comfortable column of prose. A tile never gets shorter than 200px, so the
  // grid scrolls rather than squeezing an editor down to nothing.
  const gridStyle =
    orientation === 'row'
      ? {
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gridAutoRows: 'minmax(200px, 1fr)',
        }
      : { gridTemplateColumns: 'minmax(0, 1fr)', gridAutoRows: 'minmax(200px, 1fr)' };

  const pane = (entry: DocEntry, withHeader: boolean): ReactNode => {
    const editor = (
      <MarkdownEditor value={entry.text} onChange={(text) => onText(entry.name, text)} />
    );
    const preview = <Preview text={entry.text} />;
    const vertical = orientation === 'column';
    const body =
      mode === 'edit' ? (
        editor
      ) : mode === 'preview' ? (
        preview
      ) : (
        <ResizablePanelGroup
          direction={vertical ? 'vertical' : 'horizontal'}
          autoSaveId="modelroom.docs.split"
        >
          <ResizablePanel defaultSize={50} minSize={15}>
            {editor}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={15}>
            {preview}
          </ResizablePanel>
        </ResizablePanelGroup>
      );
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {withHeader && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-1">
            <Icon name="file" className="size-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{entry.name}</span>
            <span className={cn('ml-auto text-[11px]', statusOf(entry).tone)}>
              {statusOf(entry).text}
            </span>
          </div>
        )}
        <ConflictBanner
          entry={entry}
          onKeep={() => void conflictKeep(entry.name)}
          onTake={() => conflictTake(entry.name)}
        />
        <div className="min-h-0 flex-1">{body}</div>
      </div>
    );
  };

  if (!activeEntry) {
    return <div className="p-4 text-sm text-muted-foreground">No docs configured.</div>;
  }

  const controls = (
    <div className="ml-auto flex items-center gap-2">
      {layout === 'tabs' && (
        <span className={cn('text-[11px]', statusOf(activeEntry).tone)}>
          {statusOf(activeEntry).text}
        </span>
      )}
      <Segmented value={mode} onChange={setMode} options={MODES} />
      {mode === 'split' && (
        <Segmented value={orientation} onChange={setOrientation} options={ORIENTATIONS} />
      )}
      <Segmented
        value={layout}
        onChange={setLayout}
        options={[
          { value: 'tabs', label: 'Tabs', title: 'One doc at a time' },
          { value: 'tiles', label: 'Tiles', title: 'Every doc at once' },
        ]}
      />
    </div>
  );

  if (layout === 'tabs') {
    return (
      <Tabs
        value={active}
        onValueChange={setActive}
        className="flex min-h-0 min-w-0 flex-1 flex-col bg-card"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
          <TabsList className="mr-scroll min-w-0 overflow-x-auto">
            {docs.map((name) => (
              <TabsTrigger key={name} value={name}>
                {docLabel(name)}
                {entries[name] && entries[name].text !== entries[name].savedText && (
                  <span className="size-1.5 rounded-full bg-primary" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {controls}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{pane(activeEntry, false)}</div>
      </Tabs>
    );
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <span className="px-1 text-sm font-medium">Docs</span>
        {controls}
      </header>
      <div
        className="mr-scroll grid min-h-0 flex-1 gap-px overflow-y-auto bg-border"
        style={gridStyle}
      >
        {docs.map((name) => {
          const entry = entries[name];
          return entry ? (
            <div key={name} className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-card">
              {pane(entry, true)}
            </div>
          ) : null;
        })}
      </div>
    </section>
  );
}
