// The doc editor: CodeMirror 6, Markdown-aware.
//
// It is deliberately not controlled on every keystroke — the parent keeps the
// text for autosave, and this replaces the document only when the text changes
// from the outside (a reload from disk), so the caret never jumps while typing.

import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  HighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { tags as t } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--mr-text)',
  },
  '.cm-content': {
    fontFamily: 'var(--mr-mono)',
    padding: '0.75rem 0',
    caretColor: 'var(--mr-text)',
  },
  '.cm-line': { padding: '0 0.85rem' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--mr-dimmed)',
    border: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--mr-text) 5%, transparent)',
  },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--mr-primary) 30%, transparent)',
  },
  '.cm-cursor': { borderLeftColor: 'var(--mr-text)' },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.heading, color: 'var(--mr-primary)', fontWeight: '600' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: 'var(--mr-info)', textDecoration: 'underline' },
  { tag: t.monospace, color: 'var(--mr-info)' },
  { tag: t.keyword, color: 'var(--mr-primary)' },
  { tag: t.string, color: 'var(--mr-success)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--mr-warning)' },
  { tag: t.comment, color: 'var(--mr-dimmed)', fontStyle: 'italic' },
  { tag: t.meta, color: 'var(--mr-dimmed)' },
]);

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel = 'Markdown source',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return undefined;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(highlightStyle),
        keymap.of([
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...markdownKeymap,
          indentWithTab,
        ]),
        markdown(),
        EditorView.lineWrapping,
        // The editor is a `role="textbox"` with no text of its own; without a
        // name screen readers announce it as an empty input.
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
        theme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const instance = new EditorView({ state, parent: host.current });
    view.current = instance;
    return () => {
      instance.destroy();
      view.current = null;
    };
    // Mount once: later `value` changes are reconciled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = view.current;
    if (!instance) return;
    const current = instance.state.doc.toString();
    if (current === value) return;
    instance.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={host} className={`mr-editor h-full overflow-hidden ${className}`} />;
}
