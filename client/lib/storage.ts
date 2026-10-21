// localStorage that never throws: private mode and a full quota are normal.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is off; the in-memory value still works */
  }
}

export function forget(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// The same, scoped to the tab. The dashboard remembers its view this way: it
// survives a room → room → back trip and a reload, but a closed tab forgets it,
// so opening the dashboard fresh never surprises anyone with an old filter.

export function loadSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage is off; the in-memory value still works */
  }
}

export function forgetSession(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
