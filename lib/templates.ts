// modelroom — the templates `init` copies.
//
// Each language is a directory under `templates/`, so a language is data, not a
// branch in the code. English is the fallback: a missing file never makes `init`
// fail, it just lands in the language we know we have.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LANGS, type Lang } from './lang.ts';

export const ROOM_FILES = ['BRIEF.md', 'SPEC.md', 'BEHAVIOUR.md', 'index.html'] as const;

/** The file for a language, falling back to English. */
export async function readTemplate(
  templatesDir: string,
  lang: Lang,
  relativePath: string,
): Promise<string> {
  const candidates = [join(templatesDir, lang, relativePath)];
  if (lang !== 'en') candidates.push(join(templatesDir, 'en', relativePath));
  let lastError: unknown = null;
  for (const path of candidates) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`template not found: ${relativePath}`);
}

/** Every language the package actually ships, in a stable order. */
export function shippedLangs(): readonly Lang[] {
  return LANGS;
}
