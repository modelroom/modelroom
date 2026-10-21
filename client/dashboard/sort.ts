// The dashboard's ordering rule, kept pure so it can be tested without a DOM.
//
// "Updated" reads `sortAt` — the frontmatter `updated_at` when it parses, else the
// file mtime (the server decides; see `core/rooms.ts`). "Name" is the directory
// name, the room's real identity, so it sorts the same way `ls` would.
//
// A search has its own order: relevance, from the server's scoring. When a
// relevance map is handed in, it wins and the chosen sort is ignored — the
// matches are already the point.

export type SortKey = 'updated' | 'name';

export interface SortableRoom {
  name: string;
  sortAt: number;
}

/**
 * Return `rooms` in display order. Does not mutate its input.
 *
 * `relevance` maps a room name to its rank (0 is best); when it is given, only
 * the rooms it names are kept, in rank order.
 */
export function orderRooms<T extends SortableRoom>(
  rooms: readonly T[],
  sort: SortKey,
  relevance: Map<string, number> | null = null,
): T[] {
  if (relevance) {
    return rooms
      .filter((room) => relevance.has(room.name))
      .sort((a, b) => (relevance.get(a.name) ?? 0) - (relevance.get(b.name) ?? 0));
  }
  const sorted = [...rooms];
  if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  else sorted.sort((a, b) => b.sortAt - a.sortAt);
  return sorted;
}
