// One `prose` recipe for rendered markdown.
//
// @tailwindcss/typography is written for article pages: it colours code fences
// dark and puts backticks around inline code. In a chat bubble and a doc preview
// both of those read as bugs, so the recipe is fixed once, here, and reused.

export const PROSE_CLASS = [
  'prose prose-sm max-w-none dark:prose-invert',
  'prose-p:my-1.5 prose-pre:my-2',
  'prose-pre:bg-muted prose-pre:text-foreground prose-pre:border prose-pre:border-border',
  'prose-code:before:content-none prose-code:after:content-none',
].join(' ');
