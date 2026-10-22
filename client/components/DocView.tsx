// One room doc, read-only: what it says, and what changed since you last looked.
//
// Editing is the agent's job now — the file is still the source of truth, but the
// UI never writes it. What the reader needs is the rendered doc and a diff against
// the last text this browser saw, kept in localStorage, so "changed" means "new to
// you" and not "different from some server snapshot".

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Button, DataList, Group, Loader, SegmentedControl, Text } from '@mantine/core';
import { getDoc } from '../lib/api.ts';
import { diffStat, diffLines } from '../lib/diff.ts';
import { splitFrontmatter } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { renderDoc } from '../lib/markdown.ts';
import { load, save } from '../lib/storage.ts';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Diff } from './Diff.tsx';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { ToneBadge } from './Status.tsx';

type View = 'preview' | 'diff';

const seenKey = (room: string, name: string): string => `modelroom.doc.seen:${room}:${name}`;

/** The rendered doc: its frontmatter as a small table, then the body. */
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

export function DocView({
  room,
  roomsPath,
  name,
}: {
  room: string;
  roomsPath: string;
  name: string;
}) {
  const { t } = useI18n();
  const [text, setText] = useState<string | null>(null);
  const [seen, setSeen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [view, setView] = useState<View>('preview');

  const key = seenKey(room, name);

  const refresh = useCallback(
    async (initialize: boolean) => {
      const data = await getDoc(room, name).catch(() => null);
      if (!data || data.error) {
        setError(data?.error ?? t('docs.loadFailed'));
        return;
      }
      setError(null);
      setMissing(Boolean(data.missing));
      setText(data.text);
      if (!initialize) return;
      // The first time this browser reads the doc, what it reads becomes the
      // baseline; from then on the diff is what the agent changed afterwards.
      const stored = load<string | null>(key, null);
      const baseline = stored ?? data.text;
      if (stored === null) save(key, data.text);
      setSeen(baseline);
      setView(baseline !== data.text ? 'diff' : 'preview');
    },
    [key, name, room, t],
  );

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  useServerEvent<{ file: string }>('change', (data) => {
    const base = data.file.split('/').pop() ?? '';
    if (data.file.startsWith(`${roomsPath}/${room}/`) && base === name) void refresh(false);
  });

  const changed = seen !== null && text !== null && seen !== text;

  const markSeen = () => {
    if (text === null) return;
    save(key, text);
    setSeen(text);
    setView('preview');
  };

  const stat = useMemo(
    () => (changed && seen !== null && text !== null ? diffStat(diffLines(seen, text)) : null),
    [changed, seen, text],
  );

  return (
    <Box style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, flexDirection: 'column' }}>
      <Group
        gap="xs"
        px="sm"
        py={4}
        wrap="nowrap"
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          flexShrink: 0,
        }}
      >
        <Icon name="file" size={14} />
        <Text size="xs" ff="monospace">
          {name}
        </Text>
        {changed && stat && (
          <ToneBadge tone="warning">
            {t('docs.changed', { added: stat.added, removed: stat.removed })}
          </ToneBadge>
        )}
        <Group gap="xs" ml="auto" wrap="nowrap">
          {changed && (
            <>
              <SegmentedControl
                size="xs"
                value={view}
                onChange={(value) => setView(value as View)}
                data={[
                  { value: 'preview', label: t('common.preview') },
                  { value: 'diff', label: t('docs.diff') },
                ]}
                aria-label={t('docs.viewMode')}
              />
              <Button
                size="compact-xs"
                variant="default"
                onClick={markSeen}
                leftSection={<Icon name="check" size={13} />}
              >
                {t('docs.seen')}
              </Button>
            </>
          )}
        </Group>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {error ? (
          <Text size="sm" c="danger" p="md">
            {error}
          </Text>
        ) : text === null ? (
          <Group justify="center" p="xl">
            <Loader size="sm" />
          </Group>
        ) : missing ? (
          <Text size="sm" c="dimmed" p="md">
            {t('docs.missing', { name })}
          </Text>
        ) : view === 'diff' && changed && seen !== null ? (
          <Diff before={seen} after={text} />
        ) : (
          <Preview text={text} />
        )}
      </Box>
    </Box>
  );
}
