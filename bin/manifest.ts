// modelroom — the consumer's package.json
//
// `init` writes one file outside `modelroom/`: the script that makes
// `npm run modelroom` work. That file belongs to the project, so the edit is
// minimal — indentation, trailing newline and key order survive, and a manifest
// that would not change is returned untouched. A dependency is only ever added
// by the package manager itself, which keeps the lockfile in step with it.
//
// Everything here is text in, text out: no filesystem, no process.

/** The package, its bin and the script key — the same word for all three. */
export const SCRIPT_NAME = 'modelroom';

/** The script once the package is installed: the local bin, pinned. */
export const LOCAL_COMMAND = SCRIPT_NAME;

/** The script when it is not: npx resolves it per run, `--yes` skips the prompt. */
export const NPX_COMMAND = `npx --yes ${SCRIPT_NAME}`;

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** A parsed manifest, plus the shape of the file it came from. */
export type Manifest = {
  json: Record<string, unknown>;
  indent: string;
  newline: boolean;
};

export type ScriptEdit =
  | { ok: true; text: string; changed: boolean; current?: string }
  | { ok: false; reason: 'invalid' | 'scripts' };

/** `null` when the text is not a JSON object — the caller leaves the file alone. */
export function parseManifest(text: string): Manifest | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return {
    json: json as Record<string, unknown>,
    indent: detectIndent(text),
    newline: text.endsWith('\n'),
  };
}

/** The indent the file already uses; '' for a manifest on a single line. */
function detectIndent(text: string): string {
  return /^([ \t]+)\S/m.exec(text)?.[1] ?? (text.includes('\n') ? '  ' : '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** The script as written, or `undefined` when it is missing or not a string. */
export function scriptOf(m: Manifest, name: string): string | undefined {
  const scripts = m.json.scripts;
  if (!isObject(scripts)) return undefined;
  const value = scripts[name];
  return typeof value === 'string' ? value : undefined;
}

/** Whether `scripts.<name>` is there at all, whatever it holds. */
export function hasScript(m: Manifest, name: string): boolean {
  const scripts = m.json.scripts;
  return isObject(scripts) && name in scripts;
}

/** Whether the project already installs it — then there is nothing to install. */
export function hasDependency(m: Manifest, name: string): boolean {
  return ['dependencies', 'devDependencies', 'optionalDependencies'].some((key) => {
    const deps = m.json[key];
    return isObject(deps) && name in deps;
  });
}

/** A dependency on itself is not one: the repo that *is* modelroom installs nothing. */
export function isSelfPackage(m: Manifest, name: string = SCRIPT_NAME): boolean {
  return m.json.name === name;
}

/**
 * Add one script, keeping the file's own shape. An existing key is never
 * overwritten unless asked, and the text comes back untouched when nothing
 * would move — so a second run of `init` writes nothing at all.
 */
export function addScript(
  text: string,
  name: string,
  value: string,
  options: { overwrite?: boolean } = {},
): ScriptEdit {
  const m = parseManifest(text);
  if (!m) return { ok: false, reason: 'invalid' };
  const scripts = m.json.scripts;
  if (scripts !== undefined && !isObject(scripts)) return { ok: false, reason: 'scripts' };

  const current = scriptOf(m, name);
  if (hasScript(m, name) && (current === value || !options.overwrite)) {
    return { ok: true, text, changed: false, current };
  }

  m.json.scripts = { ...(scripts as Record<string, unknown> | undefined), [name]: value };
  return { ok: true, text: stringify(m), changed: true, current };
}

/** The manifest back as text: the same indent and the same trailing newline. */
export function stringify(m: Manifest): string {
  return JSON.stringify(m.json, null, m.indent) + (m.newline ? '\n' : '');
}

/** Which package manager the project already uses, judged by its lockfile. */
export function detectPackageManager(files: Iterable<string>): PackageManager {
  const names = new Set(files);
  if (names.has('bun.lock') || names.has('bun.lockb')) return 'bun';
  if (names.has('pnpm-lock.yaml')) return 'pnpm';
  if (names.has('yarn.lock')) return 'yarn';
  return 'npm';
}

/** `add` as a devDependency, in each manager's own spelling. */
export function installCommand(
  pm: PackageManager,
  spec: string,
): { command: string; args: string[] } {
  switch (pm) {
    case 'pnpm':
      return { command: 'pnpm', args: ['add', '--save-dev', spec] };
    case 'yarn':
      return { command: 'yarn', args: ['add', '--dev', spec] };
    case 'bun':
      return { command: 'bun', args: ['add', '--dev', spec] };
    default:
      return { command: 'npm', args: ['install', '--save-dev', spec] };
  }
}
