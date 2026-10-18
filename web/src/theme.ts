// The one theme.
//
// Mantine is the whole design system now: there is no second component library
// and no utility-class layer to keep in step. The palettes below are the same
// oklch values the tool's original tokens carried — converted once, by hand,
// into Mantine's 10-shade ramps — so it keeps the tone it had:
//
//   brand   oklch(0.52 0.19 276)   the light-scheme primary (shade 6)
//           oklch(0.68 0.16 276)   the dark-scheme primary  (shade 4)
//
// `primaryShade` picks those two anchors, so light and dark each get the
// luminance they were designed for.

import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core';

/** The interface font stack: Japanese first, then whatever the OS has. */
export const FONT_SANS =
  "'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', system-ui, -apple-system, 'Segoe UI', sans-serif";

export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const brand: MantineColorsTuple = [
  '#eff4ff',
  '#dfe7ff',
  '#cbd7ff',
  '#a7b6ff',
  '#7f8cfa',
  '#6670e9',
  '#5055d3',
  '#403ebb',
  '#302a9f',
  '#231582',
];

const danger: MantineColorsTuple = [
  '#ffede9',
  '#ffdbd4',
  '#ffc2b7',
  '#ff9387',
  '#f65f55',
  '#e23632',
  '#c9000c',
  '#b00000',
  '#930000',
  '#760000',
];

const success: MantineColorsTuple = [
  '#e9faed',
  '#d3f3da',
  '#b6eac2',
  '#80d498',
  '#44b16a',
  '#009a4c',
  '#008231',
  '#006d1b',
  '#005806',
  '#004200',
];

const warning: MantineColorsTuple = [
  '#fdf4e5',
  '#f9e7cb',
  '#f3d7a9',
  '#e1b66c',
  '#c18e28',
  '#ac7400',
  '#955b00',
  '#7f4600',
  '#683400',
  '#512200',
];

const info: MantineColorsTuple = [
  '#e8f8ff',
  '#d1eeff',
  '#b3e2ff',
  '#7cc7fb',
  '#3fa2df',
  '#0089cc',
  '#0070b5',
  '#005b9f',
  '#004785',
  '#00336b',
];

export const theme = createTheme({
  primaryColor: 'brand',
  // Light reads on light, dark reads on dark — the two anchors from the tokens.
  primaryShade: { light: 6, dark: 4 },
  colors: { brand, danger, success, warning, info },
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '6px',
    md: '10px',
    lg: '12px',
    xl: '14px',
  },
  fontFamily: FONT_SANS,
  fontFamilyMonospace: FONT_MONO,
  headings: { fontFamily: FONT_SANS, fontWeight: '600', sizes: { h1: { fontSize: '1.25rem' } } },
  // The old scale was a hair tighter than Mantine's default.
  fontSizes: { xs: '11px', sm: '13px', md: '14px', lg: '16px', xl: '18px' },
});

/** Badge variants the dashboard and the chat have always used, on Mantine. */
export const TONES = {
  default: { color: 'brand' },
  secondary: { color: 'gray', variant: 'light' },
  // `default` is Mantine's own outline treatment: the label keeps the text
  // colour instead of the (too light) gray-6, so small badges stay readable.
  outline: { variant: 'default' },
  muted: { color: 'gray', variant: 'light' },
  success: { color: 'success' },
  warning: { color: 'warning' },
  destructive: { color: 'danger' },
  info: { color: 'info' },
} as const;

export type Tone = keyof typeof TONES;

/**
 * The one variable the theme's defaults get wrong for this tool: Mantine's
 * `--mantine-color-dimmed` is gray-6 (#868e96), which is 3.3:1 on white — below
 * the 4.5:1 floor for the 11–13px labels this UI is full of. These are the
 * tool's old muted-foreground values, which clear it in both schemes.
 */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-dimmed': '#656970' },
  dark: { '--mantine-color-dimmed': '#a1a5ac' },
});
