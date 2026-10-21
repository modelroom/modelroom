// modelroom — is there a newer one?
//
// One question, asked once, and the answer is only ever a note: the registry's
// `latest` for this package, held against the version that is running. Nothing
// here installs anything, and nothing here writes — a caller that wants to
// remember the answer puts it in local state (`state.update`).
//
// The fetch is a parameter rather than an import, so a test — and the browser
// pass — can hold the whole thing to a value without a network. Everything that
// can fail fails to `null`: a version check must never be the reason a command
// stops working.

export const REGISTRY_URL = 'https://registry.npmjs.org/modelroom/latest';

/** The environment variable that turns the check off; any value but 0/false. */
export const NO_UPDATE_CHECK = 'MODELROOM_NO_UPDATE_CHECK';

/** One day: often enough to learn about a release, rare enough to be invisible. */
export const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

/** A check that cannot answer in this long is a check that does not run. */
export const CHECK_TIMEOUT_MS = 2000;

/** What the UI and the CLI are told. `latest: null` is "not known", not "current". */
export interface UpdateCheck {
  current: string;
  latest: string | null;
  /** `latest` is newer than `current` — the only thing worth interrupting for. */
  available: boolean;
  /** When this answer was fetched; 0 when it never was. */
  checkedAt: number;
}

/** The last answer, as it is kept between runs. */
export interface UpdateCache {
  latest: string;
  checkedAt: number;
}

/** The one thing this needs from the network, narrowed so a test can stand in. */
export interface LatestResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<LatestResponse>;

interface ParsedVersion {
  parts: [number, number, number];
  /** The prerelease tail, or null when this is a release. */
  pre: string | null;
}

/** `1.2.3` and `1.2.3-rc.1`. Anything else is not a version we will argue about. */
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The leading version of a string, so `v1.2.3` and `1.2.3 (build 4)` still read. */
export function parseVersion(raw: string): ParsedVersion | null {
  const match = VERSION.exec(raw.trim().replace(/^[v=]+/, ''));
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ?? null,
  };
}

/**
 * The semver ordering, as far as a notice needs it: a release is above its own
 * prereleases (`1.0.0-rc.1` < `1.0.0`), a numeric identifier below an
 * alphanumeric one (`1.0.0-1` < `1.0.0-alpha`), and numbers compare as numbers
 * (`rc.10` > `rc.9`, which a string compare gets wrong). Two strings we cannot
 * parse are equal, which means "no update": silence is the safe answer.
 */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < left.parts.length; i++) {
    const l = left.parts[i] as number;
    const r = right.parts[i] as number;
    if (l !== r) return l < r ? -1 : 1;
  }
  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1;
  if (right.pre === null) return -1;
  return comparePrerelease(left.pre, right.pre);
}

function comparePrerelease(a: string, b: string): number {
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = /^\d+$/.test(l);
    const rn = /^\d+$/.test(r);
    if (ln && rn) return Number(l) < Number(r) ? -1 : 1;
    if (ln) return -1;
    if (rn) return 1;
    return l < r ? -1 : 1;
  }
  return 0;
}

/**
 * Whether `latest` is worth telling someone about. A checkout ahead of the
 * registry — a branch, a release that has not been published yet — is not an
 * update, and neither is an answer we could not read.
 */
export function isNewer(latest: string | null, current: string): boolean {
  return latest !== null && compareVersions(latest, current) > 0;
}

/** `MODELROOM_NO_UPDATE_CHECK=1` (and anything but `0`/`false`) turns it off. */
export function updateCheckDisabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[NO_UPDATE_CHECK];
  return Boolean(value && value !== '0' && value !== 'false');
}

/**
 * The registry's `latest`, or `null` for every way this can fail — offline, a
 * timeout, a proxy, something that is not the JSON we expect. The caller hears
 * the same thing in each case: nothing to say.
 */
export async function fetchLatest(
  fetcher: Fetcher = globalThis.fetch as Fetcher,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const response = await fetcher(REGISTRY_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body = await response.json();
    const version =
      body &&
      typeof body === 'object' &&
      typeof (body as { version?: unknown }).version === 'string'
        ? (body as { version: string }).version
        : null;
    return version !== null && parseVersion(version) ? version : null;
  } catch {
    return null;
  }
}

export interface CheckOptions {
  /** The version that is running: modelroom's own package.json. */
  current: string;
  /** Last run's answer, when there is one. */
  cached?: UpdateCache | null;
  fetcher?: Fetcher;
  now?: number;
  ttlMs?: number;
  /** Defaults to the environment: `MODELROOM_NO_UPDATE_CHECK`. */
  disabled?: boolean;
}

export interface CheckResult {
  check: UpdateCheck;
  /**
   * Whether this call actually asked the registry. Only an answer is worth
   * keeping: a failure leaves the cache alone and is retried next time.
   */
  fetched: boolean;
}

/**
 * The whole decision: reuse a fresh cache, ask when it is stale, and answer
 * either way. It does not throw and it does not block anything that is not
 * already waiting for it.
 */
export async function checkForUpdate(options: CheckOptions): Promise<CheckResult> {
  const { current } = options;
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? CHECK_TTL_MS;
  const known = (latest: string, checkedAt: number, fetched: boolean): CheckResult => ({
    check: { current, latest, available: isNewer(latest, current), checkedAt },
    fetched,
  });
  const unknown = (checkedAt: number, fetched: boolean): CheckResult => ({
    check: { current, latest: null, available: false, checkedAt },
    fetched,
  });

  if (options.disabled ?? updateCheckDisabled()) return unknown(0, false);
  const cached = options.cached;
  if (cached?.latest && now - cached.checkedAt < ttl && now >= cached.checkedAt) {
    return known(cached.latest, cached.checkedAt, false);
  }
  const latest = await fetchLatest(options.fetcher);
  return latest === null ? unknown(now, true) : known(latest, now, true);
}
