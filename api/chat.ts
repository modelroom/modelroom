// modelroom — the chat turn, as the browser receives it.
//
// The opencode API describes an assistant message as a list of parts: `text`,
// `reasoning`, and one `tool` part per call — each with its own input, its
// output and its metadata (an exit code, or the patches it wrote). This is the
// shape the server hands to the chat, defined once so neither side can drift.
//
// Types only, and browser-safe on purpose: no `node:`, no packages. The parsing
// that turns an opencode message into these parts lives in `server/parts.ts`,
// because opencode's own shape is the server's business and not the wire's.

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

// ── the agent asking the person ──────────────────────────────────────────────
//
// An agent that needs a decision asks a question and blocks until it is
// answered. That is not opencode's `form`, nor Claude Code's `AskUserQuestion`:
// it is the one thing both do, said once here so the chat can render it without
// knowing which agent produced it. A driver maps its own shape onto `Ask`.

/** One choice the agent offers. */
export interface AskOption {
  label: string;
  description?: string;
}

/** One question the agent asks. */
export interface AskQuestion {
  /** Stable key the answer comes back under (opencode: the field key). */
  key: string;
  header: string;
  question: string;
  options: AskOption[];
  /** true when the person may pick more than one. */
  multiple?: boolean;
}

/** The agent is blocked on the person. `id` is driver-local (opencode: form id). */
export interface Ask {
  id: string;
  title?: string;
  questions: AskQuestion[];
  /** The tool call it belongs to, when there is one. */
  source?: { messageID?: string; callID?: string };
}

/** key -> chosen labels / typed text. A single choice is a one-element array. */
export type AskAnswer = Record<string, string[]>;
