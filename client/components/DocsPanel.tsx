// The docs column: every room doc, in tabs or as tiles, edited, previewed, or
// both at once — and split across or down depending on how you like to read.
//
// The file is still the source of truth. Autosave writes it back through the same
// hash-checked PUT the old UI used, and a conflict (someone else wrote the file)
// stops and asks instead of overwriting.
//
// The chrome is Mantine: `Tabs` for the docs, `SegmentedControl` for the three
// switches, `DataList` for the frontmatter, `Alert` for a conflict.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  DataList,
  Group,
  SegmentedControl,
  SimpleGrid,
  Tabs,
  Text,
  VisuallyHidden,
} from '@mantine/core';
import { getDoc, putDoc } from '../lib/api.ts';
import { clock, docLabel, splitFrontmatter } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { renderDoc } from '../lib/markdown.ts';
import { load, save } from '../lib/storage.ts';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { MarkdownEditor } from './MarkdownEditor.tsx';
import { Split, SplitHandle, SplitPanel } from './Split.tsx';

type Mode = 'edit' | 'split' | 'preview';
type Layout = 'tabs' | 'tiles';
type Orientation = 'row' | 'column';
type Tone = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface DocEntry {
  name: string;
  text: string;
  savedText: string;
  mtime: number;
  /** The version this entry is based on: the text's hash, per doc. */
  hash: string;
  savedAt: number;
  tone: Tone;
  /** 'disk' = what we last read; 'saved' = what we last wrote. */
  origin: 'disk' | 'saved';
  error?: string;
  conflict?: { text: string; hash: string };
}

const AUTOSAVE_MS = 800;

type Translate = ReturnType<typeof useI18n>['t'];

const modes = (t: Translate) => [
  {
    value: 'edit',
    label: (
      <>
        <Icon name="pencil" size={14} />
        <VisuallyHidden>{t('common.edit')}</VisuallyHidden>
      </>
    ),
  },
  {
    value: 'split',
    label: (
      <>
        <Icon name="columns" size={14} />
        <VisuallyHidden>{t('common.split')}</VisuallyHidden>
      </>
    ),
  },
  {
    value: 'preview',
    label: (
      <>
        <Icon name="eye" size={14} />
        <VisuallyHidden>{t('common.preview')}</VisuallyHidden>
      </>
    ),
  },
];

const orientations = (t: Translate) => [
  {
    value: 'row',
    label: (
      <>
        <Icon name="columns" size={14} />
        <VisuallyHidden>{t('common.sideBySide')}</VisuallyHidden>
      </>
    ),
  },
  {
    value: 'column',
    label: (
      <>
        <Icon name="rows" size={14} />
        <VisuallyHidden>{t('common.stacked')}</VisuallyHidden>
      </>
    ),
  },
];

const layouts = (t: Translate) => [
  { value: 'tabs', label: t('common.tabs') },
  { value: 'tiles', label: t('common.tiles') },
];

function statusOf(
  entry: DocEntry,
  lang: 'en' | 'ja',
  t: Translate,
): { text: string; tone: 'danger' | 'warning' | 'dimmed' } {
  if (entry.tone === 'error')
    return { text: t('docs.failed', { error: entry.error ?? '' }), tone: 'danger' };
  if (entry.tone === 'conflict') return { text: t('docs.changedElsewhere'), tone: 'warning' };
  if (entry.tone === 'saving') return { text: t('docs.saving'), tone: 'dimmed' };
  if (entry.text !== entry.savedText) return { text: t('docs.unsaved'), tone: 'dimmed' };
  if (entry.savedAt) {
    // "on disk" until we have written it — the file's mtime is not our save.
    return {
      text:
        entry.origin === 'saved'
          ? t('docs.savedAt', { time: clock(entry.savedAt, lang) })
          : t('docs.onDiskAt', { time: clock(entry.savedAt, lang) }),
      tone: 'dimmed',
    };
  }
  return { text: '', tone: 'dimmed' };
}

function StatusText({ entry }: { entry: DocEntry }) {
  const { lang, t } = useI18n();
  const status = statusOf(entry, lang, t);
  return (
    <Text size="xs" c={status.tone} style={{ whiteSpace: 'nowrap' }}>
      {status.text}
    </Text>
  );
}

function Preview({ text }: { text: string }) {
  const { rows, body } = useMemo(() => splitFrontmatter(text), [text]);
  return (
    <Box
      className="mr-scroll"
      h="100%"
      p="md"
      style={{ overflowY: 'auto', backgroundColor: 'var(--mr-panel)' }}
    >
      {rows.length > 0 && (
        <Box
          mb="md"
          p="xs"
          style={{
            borderRadius: 'var(--mantine-radius-md)',
            border: '1px solid var(--mantine-color-default-border)',
            backgroundColor: 'var(--mr-subtle)',
          }}
        >
          <DataList size="xs" gap="xs" labelWidth="6rem">
            {rows.map((row) => (
              <DataList.Item key={row.key}>
                <DataList.ItemLabel ff="monospace" c="dimmed">
                  {row.key}
                </DataList.ItemLabel>
                <DataList.ItemValue style={{ overflowWrap: 'anywhere' }}>
                  {row.value || '—'}
                </DataList.ItemValue>
              </DataList.Item>
            ))}
          </DataList>
        </Box>
      )}
      <Markdown source={body} render={renderDoc} />
    </Box>
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
  const { t } = useI18n();
  if (entry.tone !== 'conflict') return null;
  return (
    <Alert
      variant="light"
      color="danger"
      radius={0}
      py={6}
      px="sm"
      icon={<Icon name="alert" size={14} />}
      styles={{ message: { width: '100%' } }}
    >
      <Group gap="xs" wrap="nowrap">
        <Text size="xs">{t('docs.conflictText', { name: entry.name })}</Text>
        <Group gap={6} ml="auto" wrap="nowrap">
          <Button size="compact-xs" variant="default" onClick={onKeep}>
            {t('docs.keepMine')}
          </Button>
          <Button size="compact-xs" color="danger" onClick={onTake}>
            {t('docs.takeTheirs')}
          </Button>
        </Group>
      </Group>
    </Alert>
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
  const { t } = useI18n();
  const [entries, setEntries] = useState<Record<string, DocEntry>>(() =>
    Object.fromEntries(
      docs.map((name) => [
        name,
        {
          name,
          text: '',
          savedText: '',
          mtime: 0,
          hash: '',
          savedAt: 0,
          tone: 'idle' as Tone,
          origin: 'disk' as const,
        },
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
      // Our own save also bumps the file's mtime, so the watcher fires and we land
      // here again. If the content is what we just wrote, it is still our save —
      // don't relabel it "on disk".
      const unchanged = current !== undefined && data.text === current.savedText;
      patch(name, {
        text: data.text,
        savedText: data.text,
        mtime: data.mtime,
        hash: data.hash,
        savedAt: unchanged && current ? current.savedAt : data.mtime || Date.now(),
        tone: 'saved',
        origin: unchanged && current?.origin === 'saved' ? 'saved' : 'disk',
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
        hash: entry.hash,
        mtime: entry.mtime,
      });
      if (ok) {
        patch(name, {
          mtime: data.mtime ?? entry.mtime,
          hash: data.hash ?? entry.hash,
          savedText: entry.text,
          savedAt: Date.now(),
          tone: 'saved',
          origin: 'saved',
          error: undefined,
        });
        return;
      }
      if (status === 409) {
        patch(name, {
          tone: 'conflict',
          conflict: { text: data.text ?? '', hash: data.hash ?? '' },
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
    // Rebase onto theirs: their version becomes the one we are editing on top of.
    patch(name, { hash: entry.conflict.hash, tone: 'idle', conflict: undefined });
    await saveDoc(name);
  };
  const conflictTake = (name: string) => {
    const entry = ref.current[name];
    if (!entry?.conflict) return;
    patch(name, {
      text: entry.conflict.text,
      savedText: entry.conflict.text,
      hash: entry.conflict.hash,
      savedAt: Date.now(),
      tone: 'saved',
      origin: 'disk',
      conflict: undefined,
    });
  };

  const activeEntry = entries[active] ?? Object.values(entries)[0];

  const pane = (entry: DocEntry, withHeader: boolean): ReactNode => {
    const editor = (
      <MarkdownEditor
        value={entry.text}
        onChange={(text) => onText(entry.name, text)}
        ariaLabel={t('docs.sourceLabel', { name: entry.name })}
      />
    );
    const preview = <Preview text={entry.text} />;
    const vertical = orientation === 'column';
    const body =
      mode === 'edit' ? (
        editor
      ) : mode === 'preview' ? (
        preview
      ) : (
        <Split
          orientation={vertical ? 'vertical' : 'horizontal'}
          autoSaveId="modelroom.docs.split"
          style={{ flex: 1, minHeight: 0 }}
        >
          <SplitPanel defaultSize="50%" minSize="15%">
            {editor}
          </SplitPanel>
          <SplitHandle withHandle />
          <SplitPanel defaultSize="50%" minSize="15%">
            {preview}
          </SplitPanel>
        </Split>
      );
    return (
      <Box style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column' }}>
        {withHeader && (
          <Group
            gap="xs"
            px="sm"
            py={4}
            wrap="nowrap"
            style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
          >
            <Icon name="file" size={14} />
            <Text size="xs" ff="monospace">
              {entry.name}
            </Text>
            <Box ml="auto">
              <StatusText entry={entry} />
            </Box>
          </Group>
        )}
        <ConflictBanner
          entry={entry}
          onKeep={() => void conflictKeep(entry.name)}
          onTake={() => conflictTake(entry.name)}
        />
        <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {body}
        </Box>
      </Box>
    );
  };

  if (!activeEntry) {
    return (
      <Text size="sm" c="dimmed" p="md">
        {t('docs.notConfigured')}
      </Text>
    );
  }

  const controls = (
    <Group gap="xs" ml="auto" wrap="nowrap">
      {layout === 'tabs' && <StatusText entry={activeEntry} />}
      <SegmentedControl
        size="xs"
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        data={modes(t)}
        aria-label={t('docs.docView')}
      />
      {mode === 'split' && (
        <SegmentedControl
          size="xs"
          value={orientation}
          onChange={(value) => setOrientation(value as Orientation)}
          data={orientations(t)}
          aria-label={t('docs.splitOrientation')}
        />
      )}
      <SegmentedControl
        size="xs"
        value={layout}
        onChange={(value) => setLayout(value as Layout)}
        data={layouts(t)}
        aria-label={t('docs.layout')}
      />
    </Group>
  );

  if (layout === 'tabs') {
    return (
      <Tabs
        value={active}
        onChange={(value) => setActive(value ?? active)}
        style={{
          display: 'flex',
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          flexDirection: 'column',
          backgroundColor: 'var(--mr-panel)',
        }}
      >
        <Group
          gap="xs"
          px="xs"
          py={4}
          wrap="wrap"
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
            flexShrink: 0,
          }}
        >
          <Tabs.List
            className="mr-scroll"
            style={{ flexWrap: 'nowrap', overflowX: 'auto', borderBottom: 'none' }}
          >
            {docs.map((name) => (
              <Tabs.Tab
                key={name}
                value={name}
                leftSection={
                  entries[name] && entries[name].text !== entries[name].savedText ? (
                    <Box
                      w={6}
                      h={6}
                      style={{
                        borderRadius: 999,
                        backgroundColor: 'var(--mantine-primary-color-filled)',
                      }}
                    />
                  ) : undefined
                }
              >
                {docLabel(name)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {controls}
        </Group>
        <Tabs.Panel
          value={active}
          style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}
        >
          {pane(activeEntry, false)}
        </Tabs.Panel>
      </Tabs>
    );
  }

  return (
    <Box
      style={{
        display: 'flex',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        flexDirection: 'column',
        backgroundColor: 'var(--mr-panel)',
      }}
    >
      <Group
        gap="xs"
        px="xs"
        py={4}
        wrap="wrap"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <Text size="sm" fw={500} px={4}>
          {t('room.docs')}
        </Text>
        {controls}
      </Group>
      <SimpleGrid
        className="mr-scroll"
        cols={1}
        spacing={1}
        verticalSpacing={1}
        style={{
          display: 'grid',
          gridAutoRows: 'minmax(200px, 1fr)',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          backgroundColor: 'var(--mantine-color-default-border)',
          ...(orientation === 'row'
            ? { gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }
            : { gridTemplateColumns: 'minmax(0, 1fr)' }),
        }}
      >
        {docs.map((name) => {
          const entry = entries[name];
          return entry ? (
            <Box
              key={name}
              style={{
                display: 'flex',
                minWidth: 0,
                minHeight: 0,
                flexDirection: 'column',
                overflow: 'hidden',
                backgroundColor: 'var(--mr-panel)',
              }}
            >
              {pane(entry, true)}
            </Box>
          ) : null;
        })}
      </SimpleGrid>
    </Box>
  );
}
