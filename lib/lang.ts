// The languages the package ships. Kept apart from config.ts so the browser
// bundle can import the catalogs without dragging Node's filesystem in.

export type Lang = 'en' | 'ja';
export const LANGS: readonly Lang[] = ['en', 'ja'];
export const isLang = (value: unknown): value is Lang => value === 'en' || value === 'ja';
