// The dashboard: every room, narrowed by what the records say.
//
// The server derives the list, the facets and the search results from the docs'
// frontmatter on every request; this only decides what to show and in which order.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getRooms,
  searchRooms,
  type DashboardRoom,
  type Facet,
  type SearchHit,
} from '../lib/api.ts';
import { stamp } from '../lib/format.ts';
import { cn } from '../lib/utils.ts';
import { useServerEvent, useServerEvents } from '../hooks/useServerEvents.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Input } from '../components/ui/input.tsx';
import { Select } from '../components/ui/select.tsx';
import { Skeleton } from '../components/ui/skeleton.tsx';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ESCAPES[character] as string);

const statusVariant = (status: string | null): 'success' | 'warning' | 'muted' => {
  const value = String(status ?? '').toLowerCase();
  if (/adopt|approv|done|complete|accept/.test(value)) return 'success';
  if (/review/.test(value)) return 'warning';
  return 'muted';
};

function RoomCard({
  room,
  hit,
  query,
}: {
  room: DashboardRoom;
  hit: SearchHit | null;
  query: string;
}) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const snippet = hit?.snippets[0];

  const highlight = (text: string): string => {
    const safe = escapeHtml(text);
    if (!tokens.length) return safe;
    const pattern = new RegExp(
      '(' + tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
      'gi',
    );
    return safe.replace(pattern, '<mark class="rounded bg-warning/40 px-0.5">$1</mark>');
  };

  return (
    <a
      href={`/room/${encodeURIComponent(room.name)}`}
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        room.deprecated && 'opacity-60',
      )}
    >
      {room.hasThumb && room.thumbUrl ? (
        <img
          className="mr-card-artifact"
          src={`${room.thumbUrl}?v=${room.updatedAt}`}
          alt=""
          loading="lazy"
        />
      ) : (
        <div className="mr-card-artifact grid place-items-center text-xs text-muted-foreground">
          {room.hasArtifact ? 'no thumbnail yet' : 'no artifact yet'}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{room.title || room.name}</span>
          {room.version !== null && room.version !== undefined && (
            <Badge variant="outline" className="font-mono">
              v{room.version}
            </Badge>
          )}
          {room.running && (
            <Badge variant="secondary" className="gap-1">
              <Icon name="loader" className="size-3 animate-spin" />
              running
            </Badge>
          )}
        </div>

        <div className="truncate font-mono text-xs text-muted-foreground">rooms/{room.name}</div>

        {room.summary && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{room.summary}</p>
        )}

        {snippet && (
          <p
            className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
            // The snippet is already escaped text; only the match is marked up.
            dangerouslySetInnerHTML={{ __html: highlight(snippet.text) }}
          />
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1">
          {room.status && <Badge variant={statusVariant(room.status)}>{room.status}</Badge>}
          {room.deprecated && <Badge variant="destructive">archived</Badge>}
          {room.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {room.behaviourIds.length > 0 && (
            <Badge variant="outline">
              {room.behaviourIds.length} behaviour{room.behaviourIds.length > 1 ? 's' : ''}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{stamp(room.updatedAt)}</span>
        </div>
      </div>
    </a>
  );
}

function FacetControl({
  facet,
  selected,
  onToggle,
  onPick,
}: {
  facet: Facet;
  selected: string[];
  onToggle: (value: string) => void;
  onPick: (value: string) => void;
}) {
  return (
    <fieldset className="max-w-[16rem] min-w-[9rem]">
      <legend className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
        {facet.key}
      </legend>

      {facet.control === 'checkboxes' && (
        <div className="flex flex-col gap-1">
          {facet.values.map((entry) => (
            <label key={entry.value} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(entry.value)}
                onCheckedChange={() => onToggle(entry.value)}
              />
              <span className="truncate">{entry.value}</span>
              <span className="ml-auto text-xs text-muted-foreground">{entry.count}</span>
            </label>
          ))}
        </div>
      )}

      {facet.control === 'radio' && (
        <div className="flex flex-col gap-1">
          {[{ value: '', count: null }, ...facet.values].map((entry) => (
            <label
              key={entry.value || 'any'}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name={`facet-${facet.key}`}
                className="size-3.5 accent-primary"
                checked={entry.value ? selected.includes(entry.value) : selected.length === 0}
                onChange={() => onPick(entry.value)}
              />
              <span className={cn('truncate', !entry.value && 'text-muted-foreground')}>
                {entry.value || 'any'}
              </span>
              {entry.count !== null && (
                <span className="ml-auto text-xs text-muted-foreground">{entry.count}</span>
              )}
            </label>
          ))}
        </div>
      )}

      {facet.control === 'select' && (
        <Select
          value={selected[0] ?? ''}
          onChange={(event) => onPick(event.target.value)}
          aria-label={facet.key}
        >
          <option value="">any</option>
          {facet.values.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.value} ({entry.count})
            </option>
          ))}
        </Select>
      )}
    </fieldset>
  );
}

export function DashboardApp() {
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

  const toggleFilter = (key: string, value: string) => {
    const set = new Set(filters[key] ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    applyFilters({ ...filters, [key]: [...set] });
  };

  const setFilter = (key: string, value: string) => {
    const next = { ...filters };
    if (value) next[key] = [value];
    else delete next[key];
    applyFilters(next);
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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-card px-4">
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">modelroom</span>
          <Badge variant="secondary">
            {visible.length === total ? `rooms ${total}` : `${visible.length} / ${total}`}
          </Badge>
        </div>

        <div className="relative flex-1">
          <Input
            ref={searchBox}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search rooms, docs, tags…  ( / )"
            className="max-w-xl pl-8"
            autoComplete="off"
            aria-label="Search rooms"
          />
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(!connected && 'border-destructive text-destructive')}
          >
            {busy ? (
              <Icon name="loader" className="size-3 animate-spin" />
            ) : (
              <span
                className={cn('size-1.5 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
              />
            )}
            {connected ? (status?.message ?? 'ready') : 'reconnecting…'}
          </Badge>
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <a href="/settings">Settings</a>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <Icon name="refresh" className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] p-5">
        {facets.length > 0 || archivedCount > 0 ? (
          <div className="mb-4 flex flex-wrap items-start gap-5">
            {facets.map((facet) => (
              <FacetControl
                key={facet.key}
                facet={facet}
                selected={filters[facet.key] ?? []}
                onToggle={(value) => toggleFilter(facet.key, value)}
                onPick={(value) => setFilter(facet.key, value)}
              />
            ))}
            {archivedCount > 0 && (
              <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={archived}
                  onCheckedChange={(checked) => setArchivedFilter(checked === true)}
                />
                <span className="text-muted-foreground">archived ({archivedCount})</span>
              </label>
            )}
          </div>
        ) : null}

        {filtered && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {query && <Badge variant="secondary">search: {query}</Badge>}
            {Object.entries(filters).flatMap(([key, values]) =>
              values.map((value) => (
                <Button
                  key={`${key}-${value}`}
                  variant="ghost"
                  size="xs"
                  onClick={() => toggleFilter(key, value)}
                >
                  {key}: {value}
                  <span className="text-muted-foreground">×</span>
                </Button>
              )),
            )}
            {(query ? 1 : 0) + Object.values(filters).reduce((n, v) => n + v.length, 0) > 1 && (
              <Button variant="link" size="xs" onClick={clearAll}>
                clear all
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {Array.from({ length: 6 }, (_, index) => (
              <Card key={index} className="overflow-hidden">
                <Skeleton className="aspect-[16/10] w-full rounded-none" />
                <CardContent className="flex flex-col gap-2 pt-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visible.length > 0 ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {visible.map((room) => (
              <RoomCard
                key={room.name}
                room={room}
                hit={(hits ?? []).find((entry) => entry.name === room.name) ?? null}
                query={query}
              />
            ))}
          </div>
        ) : (
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>{filtered ? 'Nothing matches' : 'No rooms yet'}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              {filtered ? (
                <p>Loosen a filter, or search for something else.</p>
              ) : (
                <p>
                  A room is one screen: <code className="font-mono">rooms/&lt;name&gt;/</code> with{' '}
                  <code className="font-mono">BRIEF.md</code>,{' '}
                  <code className="font-mono">SPEC.md</code>,{' '}
                  <code className="font-mono">BEHAVIOUR.md</code> and an artifact.
                </p>
              )}
              {!filtered && (
                <pre className="mr-scroll overflow-x-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-xs">
                  <code>$ npx modelroom init my-first-room{'\n'}$ npx modelroom serve</code>
                </pre>
              )}
              {filtered && (
                <Button variant="outline" size="sm" className="self-start" onClick={clearAll}>
                  Clear search and filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1600px] px-5 pb-8 text-xs text-muted-foreground">
        Agent-agnostic: modelroom drives the coding agent you configure. Artifacts are served
        unmodified (no injection).
      </footer>
    </div>
  );
}
