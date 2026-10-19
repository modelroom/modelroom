// The tool UI's language. One provider, one `t`, and the catalog the CLI and the
// server use — so a phrase cannot drift between the browser and the terminal.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { t as translate, type Lang, type MessageKey } from '../../shared/i18n.ts';

export type { Lang, MessageKey };

interface I18nValue {
  lang: Lang;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue>({
  lang: 'en',
  t: (key, params) => translate('en', key, params),
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({ lang, t: (key, params) => translate(lang, key, params) }),
    [lang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** The language the browser asks for, used only when `/api/meta` cannot answer. */
export function browserLang(): Lang {
  const value = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  return value.startsWith('ja') ? 'ja' : 'en';
}
