// modelroom — which language `init` will speak, and where that answer came from.
//
// The decision is pure so it can be tested without a terminal: `init` reads a
// flag, a config, the environment, and possibly an answer to the one question it
// asks, and this turns those into one language and one provenance. The guessing
// it replaces is weak — a Mac set to Japanese whose shell exports
// `LANG=en_US.UTF-8` detects English — so the answer a person gives outranks it.

import { isLang } from '../core/config.ts';
import type { Lang } from '../i18n/lang.ts';

/** Where the language came from. The CLI prints this next to it. */
export type LangSource = 'flag' | 'config' | 'prompt' | 'env' | 'default';

/** A language names itself, so these labels read the same in every locale. */
export const LANG_LABELS: Record<Lang, string> = { en: 'English', ja: '日本語' };

/** The config's own `lang`, when the file is JSON and names a language we ship. */
export function configLanguage(text: string): Lang | undefined {
  try {
    const raw = JSON.parse(text) as { lang?: unknown };
    return isLang(raw.lang) ? raw.lang : undefined;
  } catch {
    return undefined;
  }
}

/** `init` asks only at a terminal, and only when nobody has already pinned it. */
export function shouldAskLang(input: {
  explicit?: Lang;
  configLang?: Lang;
  interactive: boolean;
}): boolean {
  return input.interactive && input.explicit === undefined && input.configLang === undefined;
}

/**
 * The language `init` will use, and why. `write` is whether the result belongs in
 * the config's `lang`: a flag and a prompt answer are decisions and go in; a
 * config that already names one needs no change; a detection is not a decision
 * at all.
 */
export function resolveInitLang(input: {
  explicit?: Lang;
  configLang?: Lang;
  detected: { lang: Lang; source: 'env' | 'default' };
  answer?: Lang;
}): { lang: Lang; source: LangSource; write: boolean } {
  if (input.answer !== undefined) return { lang: input.answer, source: 'prompt', write: true };
  if (input.explicit !== undefined) return { lang: input.explicit, source: 'flag', write: true };
  if (input.configLang !== undefined) {
    return { lang: input.configLang, source: 'config', write: false };
  }
  return { lang: input.detected.lang, source: input.detected.source, write: false };
}
