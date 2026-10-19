// modelroom — which language the tool should speak.
//
// The committed `lang` in modelroom.json wins. Before there is a config (or
// when it has no lang yet), the environment and the OS locale decide. Only the
// languages the package ships are returned; everything else is English.

import type { Lang } from './lang.ts';

/** `ja_JP.UTF-8`, `ja-JP`, `Japanese_Japan` → `ja`; everything else → `en`. */
export function normalizeLang(value: string | null | undefined): Lang {
  const tag = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!tag) return 'en';
  if (tag.startsWith('ja') || tag.includes('japanese')) return 'ja';
  return 'en';
}

/** The OS / shell language, without looking at any config file. */
export function detectLang(env: NodeJS.ProcessEnv = process.env): {
  lang: Lang;
  source: 'env' | 'default';
} {
  const candidates = [env.MODELROOM_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG].filter(
    (value): value is string =>
      Boolean(value && value.trim() && value !== 'C' && value !== 'POSIX'),
  );
  for (const candidate of candidates) return { lang: normalizeLang(candidate), source: 'env' };
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) return { lang: normalizeLang(locale), source: 'env' };
  } catch {
    /* no Intl: fall through */
  }
  return { lang: 'en', source: 'default' };
}

/** True when the process is attached to a terminal that can answer a prompt. */
export function canPrompt(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);
}

/** Accept `j`, `ja`, `日本語`, `e`, `en`, `english`. */
export function parseLangAnswer(value: string): Lang | null {
  const answer = value.trim().toLowerCase();
  if (!answer) return null;
  if (answer === 'j' || answer === 'ja' || answer === 'jp' || answer.includes('日本')) return 'ja';
  if (answer === 'e' || answer === 'en' || answer.includes('english')) return 'en';
  return null;
}
