// The dashboard: every room, narrowed by what the records say.
//
// The server derives the list, the facets and the search results from the docs'
// frontmatter on every request; this only decides what to show and in which order.
//
// The filters are `FacetFilter` (see FacetFilter.tsx) and their state lives in
// the URL, so a narrowed view is shareable and survives a reload.

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Pill,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Tabs,
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
  type RoomConfig,
  type SearchHit,
  type UpdateInfo,
} from '../lib/api.ts';
import { stamp } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { forgetSession, loadSession, saveSession } from '../lib/storage.ts';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { useUpdate } from '../hooks/useUpdate.ts';
import { AgentStatus, ToneBadge, toneForStatus } from '../components/Status.tsx';
import { Icon } from '../components/Icon.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { AddRoomDialog } from '../components/AddRoomDialog.tsx';
import { RoomPreview } from '../components/RoomPreview.tsx';
import { UpdateBadge } from '../components/UpdateNotice.tsx';
import { FacetFilter } from './FacetFilter.tsx';
import { FlowView } from './FlowView.tsx';
import { appOf } from './flow.ts';
import { orderRooms, type SortKey } from './sort.ts';

type View = 'grid' | 'flow';

/** The dashboard's whole display state: it lives in the URL, and mirrors to the tab. */
interface ViewState {
  q: string;
  filters: Record<string, string[]>;
  archived: boolean;
  sort: SortKey;
  view: View;
  /** The `app` tab; null is "all". */
  app: string | null;
}

const VIEW_KEY = 'modelroom.dashboard.view';
const ALL_APPS = '__all__';

const DEFAULT_VIEW: ViewState = {
  q: '',
  filters: {},
  archived: false,
  sort: 'updated',
  view: 'grid',
  app: null,
};

/** The state as the address bar spells it; only what differs from the default. */
function toQuery(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const [key, values] of Object.entries(state.filters)) {
    if (values.length) params.set(`f.${key}`, values.join('|'));
  }
  if (state.archived) params.set('archived', '1');
  if (state.sort !== 'updated') params.set('sort', state.sort);
  if (state.view !== 'grid') params.set('view', state.view);
  if (state.app) params.set('app', state.app);
  return params.toString();
}

function readUrl(): ViewState {
  const params = new URLSearchParams(location.search);
  // `Object.fromEntries`, not `filters[key] = …`: the key is the URL's, and a
  // dynamic assignment would let `?f.__proto__=…` reach the prototype.
  const filters = Object.fromEntries(
    [...params]
      .filter(([key, value]) => key.startsWith('f.') && value)
      .map(([key, value]) => [key.slice(2), value.split('|').filter(Boolean)]),
  ) as Record<string, string[]>;
  return {
    q: params.get('q') ?? '',
    filters,
    archived: params.get('archived') === '1',
    sort: params.get('sort') === 'name' ? 'name' : 'updated',
    view: params.get('view') === 'flow' ? 'flow' : 'grid',
    app: params.get('app') || null,
  };
}

/** Did this visit arrive with a view in the address bar? Then it wins. */
function hasUrlState(): boolean {
  const params = new URLSearchParams(location.search);
  return (
    ['q', 'archived', 'sort', 'view', 'app'].some((key) => params.has(key)) ||
    [...params.keys()].some((key) => key.startsWith('f.'))
  );
}

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
  onPreview,
}: {
  room: DashboardRoom;
  hit: SearchHit | null;
  query: string;
  onPreview: (name: string) => void;
}) {
  const { lang, t } = useI18n();
  const href = `/rooms/${encodeURIComponent(room.name)}`;
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const snippet = hit?.snippets[0];

  // A plain click previews the room without leaving the list; a modified click
  // (⌘/ctrl/shift, or the middle button) is left to the browser, so "open in a
  // new tab" still means the room itself.
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onPreview(room.name);
  };

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
    <Box style={{ position: 'relative' }}>
      <Card
        component="a"
        href={href}
        onClick={open}
        withBorder
        radius="md"
        p={0}
        h="100%"
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
            {room.thumbStale && <ToneBadge tone="warning">{t('dashboard.thumbStale')}</ToneBadge>}
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

      <Tooltip label={t('dashboard.openRoom')} withArrow>
        <ActionIcon
          component="a"
          href={href}
          variant="default"
          size="md"
          aria-label={t('dashboard.openRoom')}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }}
        >
          <Icon name="arrow-right" size={15} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}

export function DashboardApp() {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<DashboardRoom[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  // Read once, before the first render: the URL when it names a view, else what
  // this tab last showed. From then on the URL mirrors the state.
  const initial = useRef<ViewState | null>(null);
  if (initial.current === null) {
    initial.current = hasUrlState()
      ? readUrl()
      : (loadSession<ViewState | null>(VIEW_KEY, null) ?? DEFAULT_VIEW);
  }
  const start = initial.current;

  const [query, setQuery] = useState(start.q);
  const [filters, setFilters] = useState<Record<string, string[]>>(start.filters);
  const [archived, setArchived] = useState(start.archived);
  const [sort, setSort] = useState<SortKey>(start.sort);
  const [view, setView] = useState<View>(start.view);
  const [app, setApp] = useState<string | null>(start.app);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /** The room shown in the preview drawer; null is "closed". */
  const [preview, setPreview] = useState<string | null>(null);

  const seq = useRef(0);
  const searchTimer = useRef<number | null>(null);
  const reloadTimer = useRef<number | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const { status, connected } = useServerEvents();

  const syncUrl = useCallback(
    (next: Partial<ViewState>) => {
      const state: ViewState = {
        q: next.q ?? query,
        filters: next.filters ?? filters,
        archived: next.archived ?? archived,
        sort: next.sort ?? sort,
        view: next.view ?? view,
        app: next.app ?? app,
      };
      const qs = toQuery(state);
      history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    },
    [app, archived, filters, query, sort, view],
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
    setConfig(data.config ?? null);
    setUpdate(data.update ?? null);
    setLoading(false);
  }, []);

  // The address bar starts in step with what we read, so a shared link and a
  // restored tab look the same. `start` is read once; `load`/`runSearch` are stable.
  useEffect(() => {
    const qs = toQuery(start);
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    void (async () => {
      await load();
      if (start.q.trim()) await runSearch(start.q);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, runSearch]);

  // Everything the dashboard shows is remembered for the tab, so leaving a room
  // and coming back lands on the same view.
  useEffect(() => {
    saveSession(VIEW_KEY, { q: query, filters, archived, sort, view, app });
  }, [app, archived, filters, query, sort, view]);

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

  const setSortKey = (value: SortKey) => {
    setSort(value);
    syncUrl({ sort: value });
  };

  const setViewMode = (value: View) => {
    setView(value);
    syncUrl({ view: value });
  };

  const setAppTab = (value: string | null) => {
    setApp(value);
    syncUrl({ app: value });
  };

  const clearAll = () => {
    setQuery('');
    setFilters({});
    setArchived(false);
    setHits(null);
    forgetSession(VIEW_KEY);
    syncUrl({ q: '', filters: {}, archived: false });
  };

  const order = useMemo(() => new Map((hits ?? []).map((hit, index) => [hit.name, index])), [hits]);

  const baseRooms = useMemo(
    () => rooms.filter((room) => archived || !room.deprecated),
    [archived, rooms],
  );

  const visible = useMemo(() => {
    let base = baseRooms;
    if (app !== null) base = base.filter((room) => appOf(room) === app);
    if (Object.keys(filters).length) {
      base = base.filter((room) =>
        Object.entries(filters).every(([key, wanted]) => {
          if (!wanted.length) return true;
          const raw = room.fields?.[key];
          const have = (Array.isArray(raw) ? raw : [raw])
            .filter((value) => value !== null && value !== undefined)
            .map(String);
          return have.some((value) => wanted.includes(value));
        }),
      );
    }
    return orderRooms(base, sort, query ? order : null);
  }, [app, baseRooms, filters, order, query, sort]);

  // The app tabs: named apps in name order, "unassigned" last. The tab bar only
  // appears once there is a real choice (one named app or more).
  const appTabs = useMemo(() => {
    const values = new Set<string>();
    let none = false;
    for (const room of baseRooms) {
      const value = appOf(room);
      if (value) values.add(value);
      else none = true;
    }
    return { apps: [...values].sort((a, b) => a.localeCompare(b, 'ja')), none };
  }, [baseRooms]);
  const showAppTabs = appTabs.apps.length >= 1;
  // Only the rooms the flow is drawing: a `next` to a hidden or archived room is
  // not an edge, so the graph never points at a node that is not there.
  const knownNames = useMemo(() => new Set(baseRooms.map((room) => room.name)), [baseRooms]);

  // A tab can outlive its app (a rename, a removal). Fall back to "all" rather
  // than filter to nothing — but only once the rooms are loaded.
  useEffect(() => {
    if (loading || app === null) return;
    if (!appTabs.apps.includes(app)) {
      setApp(null);
      syncUrl({ app: null });
    }
  }, [app, appTabs.apps, loading, syncUrl]);

  const total = rooms.filter((room) => archived || !room.deprecated).length;
  const archivedCount = rooms.filter((room) => room.deprecated).length;
  const filtered = Boolean(query) || Object.keys(filters).length > 0;
  const activeCount = (query ? 1 : 0) + Object.values(filters).reduce((n, v) => n + v.length, 0);

  // `/` focuses the search, Escape leaves it. While the preview is open the
  // search behind it should stay put.
  useEffect(() => {
    if (preview) return undefined;
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
  }, [preview]);

  const busy = status?.phase === 'chat' || status?.phase === 'rendering';
  // What the page loaded is only the first word: the check lands after it, over SSE.
  const notice = useUpdate(update);

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
            <UpdateBadge update={notice} />
            <Button
              size="compact-sm"
              onClick={() => setAdding(true)}
              leftSection={<Icon name="plus" size={14} />}
            >
              {t('dashboard.addRoom')}
            </Button>
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
          <Group justify="space-between" align="center" gap="md" mb="sm" wrap="wrap">
            {showAppTabs ? (
              <Tabs
                value={app ?? ALL_APPS}
                onChange={(value) => setAppTab(value === ALL_APPS ? null : value)}
              >
                <Tabs.List>
                  <Tabs.Tab value={ALL_APPS}>{t('dashboard.appAll')}</Tabs.Tab>
                  {appTabs.apps.map((value) => (
                    <Tabs.Tab key={value} value={value}>
                      {value}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            ) : (
              <Box />
            )}

            <Group gap="sm" wrap="nowrap">
              {view === 'grid' && (
                <SegmentedControl
                  size="xs"
                  value={sort}
                  onChange={(value) => setSortKey(value as SortKey)}
                  data={[
                    { value: 'updated', label: t('dashboard.sortUpdated') },
                    { value: 'name', label: t('dashboard.sortName') },
                  ]}
                  aria-label={t('dashboard.sort')}
                />
              )}
              <SegmentedControl
                size="xs"
                value={view}
                onChange={(value) => setViewMode(value as View)}
                data={[
                  { value: 'grid', label: t('dashboard.viewGrid') },
                  { value: 'flow', label: t('dashboard.viewFlow') },
                ]}
                aria-label={t('dashboard.view')}
              />
            </Group>
          </Group>

          {view === 'grid' && (facets.length > 0 || archivedCount > 0) && (
            <Group align="flex-start" gap="lg" mb="md" wrap="wrap">
              {facets
                .filter((facet) => facet.key !== 'app')
                .map((facet) => (
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

          {view === 'grid' && filtered && (
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
          ) : view === 'flow' ? (
            <FlowView rooms={baseRooms} app={app} known={knownNames} onPreview={setPreview} />
          ) : visible.length > 0 ? (
            <SimpleGrid minColWidth={240} spacing="md">
              {visible.map((room) => (
                <RoomCard
                  key={room.name}
                  room={room}
                  hit={(hits ?? []).find((entry) => entry.name === room.name) ?? null}
                  query={query}
                  onPreview={setPreview}
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
                  <>
                    <Button
                      size="compact-sm"
                      onClick={() => setAdding(true)}
                      leftSection={<Icon name="plus" size={14} />}
                      w="fit-content"
                    >
                      {t('dashboard.addRoom')}
                    </Button>
                    <Code block>$ npx modelroom init my-first-room{'\n'}$ npx modelroom serve</Code>
                  </>
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

      <AddRoomDialog
        opened={adding}
        onClose={() => setAdding(false)}
        names={rooms.map((room) => room.name)}
        prefix={config?.rooms ?? 'rooms'}
        onCreated={(room) => window.location.assign(`/rooms/${encodeURIComponent(room)}`)}
      />

      <RoomPreview room={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
