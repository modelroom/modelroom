// The filter's matching rule, kept pure so it can be tested without a DOM and
// shared by both renderings of the control.
//
// It is the same rule the server's search uses: NFKC-normalise, lower-case, and
// look for the query anywhere in the label. A facet value is free text, so a
// substring match is what someone typing "auth" expects from "oauth".

export interface FilterOption {
  value: string;
  label: string;
}

/** Case- and width-insensitive form of a query. */
export const normalizeQuery = (query: string): string =>
  query.normalize('NFKC').toLowerCase().trim();

/**
 * Narrow `options` to those whose label contains `query`.
 *
 * `limit` is the honesty valve: past a few hundred rows the dropdown is
 * unreadable anyway, and the virtualised control is what makes a long list
 * scrollable — the cap keeps the *rendered* list bounded for the plain
 * `MultiSelect`, which renders every option it is handed.
 */
export function filterOptions<T extends FilterOption>(
  options: readonly T[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): T[] {
  const needle = normalizeQuery(query);
  const out: T[] = [];
  for (const option of options) {
    if (needle && !option.label.normalize('NFKC').toLowerCase().includes(needle)) continue;
    out.push(option);
    if (out.length >= limit) break;
  }
  return out;
}
