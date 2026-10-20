# DESIGN.md — the layer's design rules

Everything shared across the rooms lives here: the tokens, the components, the
accessibility floor. A room takes from this file and names what it took in its
`SPEC.md` (the `Uses:` line); it does not invent a colour, a type size or a button
that is already here. When two rooms would repeat the same decision, move it here
and reference it — do not copy it into both.

The artifacts are plain HTML with no build step, so a token is a CSS custom property.
Keep this small: a design layer is not a component library. Replace the values below
with the project's own, once.

## The design system

Name the design system this layer draws from and where its truth lives, so an agent
knows what to read before writing markup:

- **Source:** (a package, a URL, a Figma file — wherever the components and tokens are defined)
- **MCP:** (the server's name, if an agent reads it through Model Context Protocol, or "none")

An MCP server is *configured* in `opencode.json`, not here: OpenCode reads
`modelroom/opencode.json` because the agent runs from this directory. This file only
names which server matters, so the agent knows to use it; secrets stay in the
environment, never in either file.

## Tokens

```css
:root {
  --color-bg: #ffffff;
  --color-fg: #111827;
  --color-muted: #6b7280;
  --color-border: #e5e7eb;
  --color-accent: #2563eb;
  --color-danger: #b91c1c;

  --font: system-ui, -apple-system, sans-serif;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5rem;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 16px;
  --space-4: 24px;
  --space-5: 32px;

  --radius: 8px;
}
```

## Components

Anything two rooms share — a button, a field, a badge — is described here once: its
markup, its states, and the tokens it uses. A room references it from its `SPEC.md`.
A room that needs a variation says so in its own `SPEC.md`; it does not fork the
component, and it does not restate it.

## Accessibility floor

- Contrast: body text meets WCAG AA (4.5:1); large text and UI, 3:1.
- Every interactive control is reachable and operable by keyboard alone.
- Focus is visible — never remove the outline without replacing it.
- A touch target is at least 44×44px wherever a finger is the input.

## What this file is not

- Not a room. A decision one screen needs belongs in that room's `SPEC.md`.
- Not the artifact. What can be seen in a screenshot belongs in `index.html`; this
  file holds the tokens the screen is drawn with, and the reasoning behind them.
