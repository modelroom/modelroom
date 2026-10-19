// The dashboard: every room, narrowed by what the records say.
//
// The server derives the list, the facets and the search results from the docs'
// frontmatter on every request; this only decides what to show and in which order.
//
// The filters are `FacetFilter` (see FacetFilter.tsx) and their state lives in
// the URL, so a narrowed view is shareable and survives a reload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Pill,
  SimpleGrid,
  Skeleton,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  getRooms,
  searchRooms,
  type DashboardRoom,
  type Facet,
  type SearchHit,
} from '../lib/api.ts';
import { stamp } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { AgentStatus, ToneBadge, toneForStatus } from '../components/Status.tsx';
import { Icon } from '../components/Icon.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { FacetFilter } from './FacetFilter.tsx';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] as string);

const MARK =
  'background-color: color-mix(in oklab, var(--mr-warning) 40%, transparent); border-radius: 3px; padding: 0 2px; color: inherit;';

function RoomCard({
  room,
  hit,
  query,
}: {
  room: DashboardRoom;
  hit: SearchHit | null;
  query: string;
}) {
  const { lang, t } = useI18n();
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const snippet = hit?.snippets[0];

  const highlight = (text: string): string => {
    const safe = escapeHtml(text);
    if (!tokens.length) return safe;
    const pattern = new RegExp(
      '(' + tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
      'gi',
    );
    return safe.replace(pattern, `<mark style="${MARK}">$1</mark>`);
  };

  return (
    <Card
      component="a"
      href={`/rooms/${encodeURIComponent(room.name)}`}
      withBorder
      radius="md"
      p={0}
      opacity={room.deprecated ? 0.6 : 1}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {room.hasThumb && room.thumbUrl ? (
        <img
          className="mr-card-artifact"
          src={`${room.thumbUrl}?v=${room.updatedAt}`}
          alt=""
          loading="lazy"
        />
      ) : (
        <Box className="mr-card-artifact" style={{ display: 'grid', placeItems: 'center' }}>
          <Text size="xs" c="dimmed">
            {room.hasArtifact ? t('dashboard.noThumb') : t('dashboard.noArtifact')}
          </Text>
        </Box>
      )}

      <Box p="sm" style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 4 }}>
        <Group gap="xs" wrap="nowrap">
          <Text fw={500} truncate style={{ minWidth: 0 }}>
            {room.title || room.name}
          </Text>
          {room.version !== null && room.version !== undefined && (
            <ToneBadge tone="outline" ff="monospace">
              v{room.version}
            </ToneBadge>
          )}
          {room.running && (
            <ToneBadge tone="secondary" leftSection={<Icon name="loader" size={11} />}>
              {t('common.running')}
            </ToneBadge>
          )}
        </Group>

        <Text size="xs" ff="monospace" c="dimmed" truncate>
          rooms/{room.name}
        </Text>

        {room.summary && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {room.summary}
          </Text>
        )}

        {snippet && (
          <Box
            px="xs"
            py={4}
            style={{
              borderRadius: 'var(--mantine-radius-sm)',
              backgroundColor: 'var(--mr-subtle)',
            }}
          >
            <Text
              size="xs"
              c="dimmed"
              // The snippet is already escaped text; only the match is marked up.
              dangerouslySetInnerHTML={{ __html: highlight(snippet.text) }}
            />
          </Box>
        )}

        <Group gap={4} mt={4} wrap="wrap">
          {room.status && <ToneBadge tone={toneForStatus(room.status)}>{room.status}</ToneBadge>}
          {room.deprecated && (
            <ToneBadge tone="destructive">{t('dashboard.archivedBadge')}</ToneBadge>
          )}
          {room.tags.slice(0, 4).map((tag) => (
            <ToneBadge key={tag} tone="outline">
              {tag}
            </ToneBadge>
          ))}
          {room.behaviourIds.length > 0 && (
            <ToneBadge tone="outline">
              {t(
                room.behaviourIds.length === 1
                  ? 'dashboard.behavioursOne'
                  : 'dashboard.behavioursOther',
                { count: room.behaviourIds.length },
              )}
            </ToneBadge>
          )}
          <Text size="xs" c="dimmed" ml="auto">
            {stamp(room.updatedAt, lang)}
          </Text>
        </Group>
      </Box>
    </Card>
  );
}

export function DashboardApp() {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [archived, setArchived] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(true);

  const seq = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const reloadTimer = useRef<number | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const { status, connected } = useServerEvents();

  const syncUrl = useCallback(
    (next: { q?: string; filters?: Record<string, string[]>; archived?: boolean }) => {
      const params = new URLSearchParams();
      const q = next.q ?? query;
      const nextFilters = next.filters ?? filters;
      const nextArchived = next.archived ?? archived;
      if (q) params.set('q', q);
      for (const [key, values] of Object.entries(nextFilters)) {
        if (values.length) params.set(`f.${key}`, values.join('|'));
      }
      if (nextArchived) params.set('archived', '1');
      const qs = params.toString();
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    },
    [archived, filters, query],
  );

  const runSearch = useCallback(async (text: string) => {
    const mine = ++seq.current;
    if (!text.trim()) {
      setHits(null);
      return;
    }
    const data = await searchRooms(text).catch(() => null);
    if (!data || mine !== seq.current) return;
    setHits(data.hits ?? []);
  }, []);

  const load = useCallback(async () => {
    const data = await getRooms().catch(() => null);
    if (!data) return;
    setRooms(data.rooms ?? []);
    setFacets(data.facets ?? []);
    setLoading(false);
  }, []);

  // The URL is the state on the way in; the rest of the time it is a mirror.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialQ = params.get('q') ?? '';
    const initialArchived = params.get('archived') === '1';
    const initialFilters: Record<string, string[]> = {};
    for (const [key, value] of params) {
      if (!key.startsWith('f.') || !value) continue;
      initialFilters[key.slice(2)] = value.split('|').filter(Boolean);
    }
    setQuery(initialQ);
    setArchived(initialArchived);
    setFilters(initialFilters);
    void (async () => {
      await load();
      if (initialQ.trim()) await runSearch(initialQ);
    })();
  }, [load, runSearch]);

  // Another tab (or the agent) changed something.
  useEffect(() => {
    return () => {
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
      if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    };
  }, []);
  const refreshSoon = useCallback(() => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current);
    reloadTimer.current = window.setTimeout(() => void load(), 350);
  }, [load]);
  useServerEvent('change', refreshSoon);
  useServerEvent('chat-start', refreshSoon);
  useServerEvent('chat-done', refreshSoon);
  useServerEvent('render-done', refreshSoon);
  useServerEvent('doc-saved', refreshSoon);

  const onQuery = (value: string) => {
    setQuery(value);
    if (searchTimer.current !== null) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      syncUrl({ q: value });
      void runSearch(value);
    }, 220);
  };

  const applyFilters = (next: Record<string, string[]>, nextArchived = archived) => {
    const cleaned = Object.fromEntries(Object.entries(next).filter(([, values]) => values.length));
    setFilters(cleaned);
    syncUrl({ filters: cleaned, archived: nextArchived });
  };

  const setFacet = (key: string, values: string[]) => {
    applyFilters({ ...filters, [key]: values });
  };

  const toggleFilter = (key: string, value: string) => {
    const set = new Set(filters[key] ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    applyFilters({ ...filters, [key]: [...set] });
  };

  const setArchivedFilter = (value: boolean) => {
    setArchived(value);
    syncUrl({ archived: value });
  };

  const clearAll = () => {
    setQuery('');
    setFilters({});
    setArchived(false);
    setHits(null);
    syncUrl({ q: '', filters: {}, archived: false });
  };

  const order = useMemo(() => new Map((hits ?? []).map((hit, index) => [hit.name, index])), [hits]);

  const visible = useMemo(() => {
    const base = rooms.filter((room) => archived || !room.deprecated);
    for (const [key, wanted] of Object.entries(filters)) {
      if (!wanted.length) continue;
      // The next filter narrows the current list, exactly as the old page did.
      for (let i = base.length - 1; i >= 0; i -= 1) {
        const room = base[i] as DashboardRoom;
        const raw = room.fields?.[key];
        const have = (Array.isArray(raw) ? raw : [raw])
          .filter((v) => v !== null && v !== undefined)
          .map(String);
        if (!have.some((value) => wanted.includes(value))) base.splice(i, 1);
      }
    }
    if (query) {
      base.sort((a, b) => (order.get(a.name) ?? 0) - (order.get(b.name) ?? 0));
      return base.filter((room) => order.has(room.name));
    }
    return base.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [archived, filters, order, query, rooms]);

  const total = rooms.filter((room) => archived || !room.deprecated).length;
  const archivedCount = rooms.filter((room) => room.deprecated).length;
  const filtered = Boolean(query) || Object.keys(filters).length > 0;
  const activeCount = (query ? 1 : 0) + Object.values(filters).reduce((n, v) => n + v.length, 0);

  // `/` focuses the search, Escape leaves it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== searchBox.current) {
        event.preventDefault();
        searchBox.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === searchBox.current) {
        searchBox.current?.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const busy = status?.phase === 'chat' || status?.phase === 'rendering';

  return (
    <AppShell header={{ height: 48 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" gap="sm" px="md" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Title order={1} fz="lg" fw={600} style={{ letterSpacing: '-0.01em' }}>
              modelroom
            </Title>
            <ToneBadge tone="secondary">
              {visible.length === total
                ? t('dashboard.roomsCount', { total })
                : t('dashboard.roomsFiltered', { visible: visible.length, total })}
            </ToneBadge>
          </Group>

          <Box style={{ flex: 1, minWidth: 0, maxWidth: 640 }}>
            <TextInput
              ref={searchBox}
              type="search"
              value={query}
              onChange={(event) => onQuery(event.currentTarget.value)}
              placeholder={t('dashboard.search')}
              leftSection={<Icon name="search" size={14} />}
              autoComplete="off"
              aria-label={t('dashboard.searchLabel')}
              size="sm"
            />
          </Box>

          <Group gap="xs" ml="auto" wrap="nowrap">
            <AgentStatus connected={connected} busy={busy} message={status?.message} />
            <ThemeToggle />
            <Button component="a" href="/settings" variant="subtle" color="gray" size="compact-sm">
              {t('common.settings')}
            </Button>
            <Tooltip label={t('dashboard.reload')} withArrow>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                onClick={() => void load()}
                leftSection={<Icon name="refresh" size={14} />}
              >
                {t('common.refresh')}
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ backgroundColor: 'var(--mr-page)' }}>
        <Box maw={1600} mx="auto" p="md">
          {(facets.length > 0 || archivedCount > 0) && (
            <Group align="flex-start" gap="lg" mb="md" wrap="wrap">
              {facets.map((facet) => (
                <FacetFilter
                  key={facet.key}
                  facet={facet}
                  selected={filters[facet.key] ?? []}
                  onChange={(values) => setFacet(facet.key, values)}
                />
              ))}
              {archivedCount > 0 && (
                <Box ml="auto" pt={20}>
                  <Checkbox
                    size="xs"
                    checked={archived}
                    onChange={(event) => setArchivedFilter(event.currentTarget.checked)}
                    label={t('dashboard.archived', { count: archivedCount })}
                  />
                </Box>
              )}
            </Group>
          )}

          {filtered && (
            <Group gap="xs" mb="sm" wrap="wrap">
              {query && (
                <ToneBadge tone="secondary">{t('dashboard.searchBadge', { query })}</ToneBadge>
              )}
              {Object.entries(filters).flatMap(([key, values]) =>
                values.map((value) => (
                  <Pill
                    key={`${key}-${value}`}
                    withRemoveButton
                    onRemove={() => toggleFilter(key, value)}
                    size="sm"
                  >
                    {key}: {value}
                  </Pill>
                )),
              )}
              {activeCount > 1 && (
                <Button variant="subtle" size="compact-xs" onClick={clearAll}>
                  {t('dashboard.clearAll')}
                </Button>
              )}
            </Group>
          )}

          {loading ? (
            <SimpleGrid minColWidth={240} spacing="md">
              {Array.from({ length: 6 }, (_, index) => (
                <Card key={index} withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
                  <Skeleton h={150} radius={0} />
                  <Box p="sm" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Skeleton h={16} w={128} />
                    <Skeleton h={12} w={96} />
                    <Skeleton h={12} w={160} />
                  </Box>
                </Card>
              ))}
            </SimpleGrid>
          ) : visible.length > 0 ? (
            <SimpleGrid minColWidth={240} spacing="md">
              {visible.map((room) => (
                <RoomCard
                  key={room.name}
                  room={room}
                  hit={(hits ?? []).find((entry) => entry.name === room.name) ?? null}
                  query={query}
                />
              ))}
            </SimpleGrid>
          ) : (
            <Card withBorder radius="md" maw={640}>
              <Text fw={600}>
                {filtered ? t('dashboard.nothingMatches') : t('dashboard.noRooms')}
              </Text>
              <Box mt="xs" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered ? (
                  <Text size="sm" c="dimmed">
                    {t('dashboard.loosen')}
                  </Text>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t('dashboard.noRoomsHint')}
                  </Text>
                )}
                {!filtered && (
                  <Code block>$ npx modelroom init my-first-room{'\n'}$ npx modelroom serve</Code>
                )}
                {filtered && (
                  <Button variant="default" size="compact-sm" onClick={clearAll} w="fit-content">
                    {t('dashboard.clearSearch')}
                  </Button>
                )}
              </Box>
            </Card>
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
