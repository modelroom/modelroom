// modelroom — how *this* project runs modelroom
//
// The command that is named everywhere: the project's own script when it has
// one, the manager's remote runner when it does not. One place, because three
// things have to agree — the `{{cli}}` in the layer's AGENTS.md and skills, the
// `next:` lines the CLI prints, and the update notice in the UI — and because
// the manager is the project's own: a pnpm project must never be handed an `npm`
// command (a project that pins its manager through `devEngines` refuses them).
//
// This reads the consumer's package.json *and* the directory around it, so it is
// its own module rather than part of `core/manifest.ts`, which stays text in,
// text out.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Config } from './config.ts';
import {
  SCRIPT_NAME,
  detectPackageManager,
  hasScript,
  installCommand,
  parseManifest,
  remoteCommand,
  scriptCommand,
} from './manifest.ts';

export interface ProjectCommands {
  /** The everyday command: `npm run modelroom`, `pnpm modelroom`, `npx modelroom`. */
  cli: string;
  /** The same, at `@latest` — the registry, not the installed copy. */
  cliLatest: string;
  /** What brings this project to a newer modelroom, and refreshes what it generated. */
  update: string;
}

/**
 * The project root is the directory that holds the state, the same one `init`
 * writes the `.gitignore` line to — one level up from the layer.
 */
export async function projectCommands(cfg: Config): Promise<ProjectCommands> {
  const root = dirname(cfg.stateDir);
  const pm = detectPackageManager(await readdir(root).catch(() => []));
  const text = await readFile(join(root, 'package.json'), 'utf8').catch(() => null);
  const manifest = text ? parseManifest(text) : null;
  // A script means the package is installed and pinned here, so `update` has to
  // run *that* copy — install the new one first, then let it refresh the files
  // it generated. No script means the registry is the only way in, which also
  // fetches the new version.
  const local = Boolean(manifest && hasScript(manifest, SCRIPT_NAME));
  const latest = remoteCommand(pm, `${SCRIPT_NAME}@latest`);
  const install = installCommand(pm, `${SCRIPT_NAME}@latest`);
  return {
    cli: local ? scriptCommand(pm, SCRIPT_NAME) : remoteCommand(pm, SCRIPT_NAME),
    cliLatest: latest,
    update: local
      ? `${install.command} ${install.args.join(' ')} && ${scriptCommand(pm, SCRIPT_NAME)} update`
      : `${latest} update`,
  };
}
