// modelroom — the agent's turn, as parts.
//
// The opencode API describes an assistant message as a list of parts: `text`,
// `reasoning`, and one `tool` part per call — each with its own input, its
// output (`content`) and its metadata (an exit code, or the patches it wrote).
// That is everything the CLI's stdout throws away.
//
// This module is pure: it takes what the API already returned and turns it into
// the small, serializable shape the chat renders. No I/O, no guessing at the
// CLI's human output.

export type ToolStatus = 'running' | 'completed' | 'error';

/** One file an edit touched, with the patch opencode produced for it. */
export interface DiffFile {
  file: string;
  patch: string;
}

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | {
      kind: 'tool';
      id: string;
      name: string;
      status: ToolStatus;
      /** One line that says what it acted on: a path, a command, a pattern. */
      summary: string | null;
      files: DiffFile[];
      /** The tool's own output, clipped. */
      output: string | null;
      exit: number | null;
      truncated: boolean;
    };

export interface Turn {
  role: 'user' | 'assistant';
  parts: Part[];
}

const MAX_OUTPUT = 4000;
const MAX_SUMMARY = 140;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)}…` : text;

const firstLine = (text: string): string => clip(text.split('\n')[0]?.trim() ?? '', MAX_SUMMARY);

/** The path a tool acted on, whichever key opencode used for it. */
function pathOf(input: Record<string, unknown>): string | null {
  for (const key of ['path', 'filePath', 'file', 'filename']) {
    const value = str(input[key]);
    if (value) return value;
  }
  return null;
}

/** What the tool acted on, in one line — this is the row the chat shows. */
export function summarise(name: string, input: Record<string, unknown>): string | null {
  const path = pathOf(input);
  const command = str(input.command);
  if (command) return firstLine(command);
  if (path) return clip(path, MAX_SUMMARY);
  for (const key of ['pattern', 'query', 'glob', 'description', 'prompt', 'url', 'name']) {
    const value = str(input[key]);
    if (value) return clip(value.split('\n')[0] ?? value, MAX_SUMMARY);
  }
  const keys = Object.keys(input);
  return keys.length ? clip(keys.join(', '), MAX_SUMMARY) : null;
}

function statusOf(state: Record<string, unknown>): ToolStatus {
  const status = str(state.status);
  if (status === 'running' || status === 'pending') return 'running';
  if (status === 'error' || status === 'failed') return 'error';
  return 'completed';
}

/** The patches opencode records when a tool writes files. */
function filesOf(state: Record<string, unknown>): DiffFile[] {
  const metadata = isRecord(state.metadata) ? state.metadata : {};
  const files = metadata.files;
  if (!Array.isArray(files)) return [];
  const out: DiffFile[] = [];
  for (const entry of files) {
    if (!isRecord(entry)) continue;
    const file = str(entry.file) ?? str(entry.path);
    const patch = str(entry.patch);
    if (file) out.push({ file, patch: patch ?? '' });
  }
  return out;
}

/** A tool's output is a list of content parts; only the text ones are useful. */
function outputOf(state: Record<string, unknown>): string | null {
  const content = state.content;
  if (typeof content === 'string') return content.trim() ? clip(content, MAX_OUTPUT) : null;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((entry) => (isRecord(entry) && entry.type === 'text' ? str(entry.text) : null))
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n');
  return text.trim() ? clip(text, MAX_OUTPUT) : null;
}

function toolPart(raw: Record<string, unknown>, fallbackId: string): Part {
  const name = str(raw.name) ?? 'tool';
  const state = isRecord(raw.state) ? raw.state : {};
  const input = isRecord(state.input) ? state.input : {};
  const metadata = isRecord(state.metadata) ? state.metadata : {};
  return {
    kind: 'tool',
    // A call without an id still gets a stable one, from where it sits in the turn.
    id: str(raw.id) ?? fallbackId,
    name,
    status: statusOf(state),
    summary: summarise(name, input),
    files: filesOf(state),
    output: outputOf(state),
    exit: typeof metadata.exit === 'number' ? metadata.exit : null,
    truncated: metadata.truncated === true,
  };
}

/** The parts of one assistant message, in order, with the empty ones dropped. */
export function parseParts(message: Record<string, unknown>): Part[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const parts: Part[] = [];
  for (const rawPart of content) {
    if (!isRecord(rawPart)) continue;
    const type = str(rawPart.type);
    if (type === 'text') {
      const text = str(rawPart.text);
      if (text?.trim()) parts.push({ kind: 'text', text });
      continue;
    }
    if (type === 'reasoning') {
      const text = str(rawPart.text);
      if (text?.trim()) parts.push({ kind: 'reasoning', text });
      continue;
    }
    if (type === 'tool') parts.push(toolPart(rawPart, `tool-${parts.length}`));
  }
  return parts;
}

const created = (message: unknown): number =>
  isRecord(message) && isRecord(message.time) && typeof message.time.created === 'number'
    ? message.time.created
    : 0;

/**
 * The conversation as turns. Consecutive assistant messages are one turn: a
 * single prompt is answered over several steps, and the chat should read as one
 * answer, not six.
 */
export function toTurns(messages: unknown[]): Turn[] {
  const turns: Turn[] = [];
  const ordered = [...messages].sort((a, b) => created(a) - created(b));
  for (const raw of ordered) {
    if (!isRecord(raw)) continue;
    if (raw.type === 'user') {
      const text = str(raw.text);
      if (text?.trim()) turns.push({ role: 'user', parts: [{ kind: 'text', text }] });
      continue;
    }
    if (raw.type !== 'assistant') continue; // `idle` and anything else is not a turn
    const parts = parseParts(raw);
    if (!parts.length) continue;
    const last = turns.at(-1);
    if (last?.role === 'assistant') last.parts.push(...parts);
    else turns.push({ role: 'assistant', parts });
  }
  return turns;
}
