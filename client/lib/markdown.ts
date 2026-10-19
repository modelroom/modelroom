// Markdown → HTML, safely.
//
// The HTML the agent writes is *not* rendered as HTML: `html: false` makes
// markdown-it escape raw tags, so a doc or a reply can never inject markup into
// the tool. Two renderers share the pipeline — chat turns single newlines into
// breaks, docs keep CommonMark's soft wrapping.

import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance, RendererRule } from 'markdown-it';
import hljs from 'highlight.js/lib/common';

const highlight = (code: string, lang: string): string => {
  if (lang && hljs.getLanguage(lang)) {
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    } catch {
      /* fall through to plain */
    }
  }
  return '';
};

function make(breaks: boolean): MarkdownItInstance {
  const md = new MarkdownIt({ html: false, linkify: true, breaks, highlight });
  const open: RendererRule =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx]?.attrSet('target', '_blank');
    tokens[idx]?.attrSet('rel', 'noopener noreferrer');
    return open(tokens, idx, options, env, self);
  };
  return md;
}

const chatMd = make(true);
const docMd = make(false);

export const renderChat = (source: string): string => chatMd.render(source);
export const renderDoc = (source: string): string => docMd.render(source);
