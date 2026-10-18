// The room's conversation.
//
// The server streams the agent's raw output in three flavours — `meta` (the
// command line), `stdout` (the answer) and `stderr` (the agent's own logging) —
// and this hook keeps them apart instead of gluing them into one blob: stdout
// becomes the reply, stderr becomes a collapsible run log, meta becomes a line.
//
// Prompts typed while the agent is busy are queued and sent when it finishes,
// which is the difference between "wait and lose your thought" and a chat.

import { useCallback, useEffect, useReducer, useState } from 'react';
import { getSession, postChat, type Part, type Turn } from '../lib/api.ts';
import { useServerEvent } from './useServerEvents.tsx';

export type ChatMessage =
  | { id: string; role: 'user'; text: string; at: number }
  | { id: string; role: 'assistant'; text: string; at: number; done: boolean; parts?: Part[] }
  | { id: string; role: 'system'; text: string; at: number; tone: 'info' | 'error' }
  | { id: string; role: 'log'; text: string; at: number; done: boolean };

interface State {
  messages: ChatMessage[];
  running: boolean;
  sessionId: string | null;
  assistantId: string | null;
  logId: string | null;
  seq: number;
}

type Action =
  | { type: 'replay'; turns: Turn[]; sessionId: string | null }
  | { type: 'user'; text: string }
  | { type: 'notice'; text: string; tone: 'info' | 'error' }
  | { type: 'start'; sessionId: string | null }
  | { type: 'session'; sessionId: string | null }
  | { type: 'chunk'; stream: string; chunk: string }
  | { type: 'done'; code: number; error: string | null };

const initialState: State = {
  messages: [],
  running: false,
  sessionId: null,
  assistantId: null,
  logId: null,
  seq: 0,
};

const nextId = (state: State, prefix: string): string => `${prefix}-${state.seq + 1}`;

/** Append text to the message with `id`, or create it. */
function append(
  state: State,
  role: 'assistant' | 'log',
  idField: 'assistantId' | 'logId',
  chunk: string,
): State {
  const id = state[idField];
  if (id) {
    return {
      ...state,
      messages: state.messages.map((message) =>
        message.id === id ? { ...message, text: message.text + chunk } : message,
      ),
    };
  }
  const created = nextId(state, role);
  const at = Date.now();
  const message: ChatMessage =
    role === 'assistant'
      ? { id: created, role: 'assistant', text: chunk, at, done: false }
      : { id: created, role: 'log', text: chunk, at, done: false };
  return {
    ...state,
    seq: state.seq + 1,
    [idField]: created,
    messages: [...state.messages, message],
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'replay': {
      if (state.messages.length) return state;
      const at = Date.now();
      const textOf = (turn: Turn): string =>
        turn.parts
          .filter((part): part is Extract<Part, { kind: 'text' }> => part.kind === 'text')
          .map((part) => part.text)
          .join('\n\n');
      const messages: ChatMessage[] = action.turns.map((turn, index) => {
        const id = `replay-${index}`;
        if (turn.role === 'user') return { id, role: 'user', text: textOf(turn), at };
        return { id, role: 'assistant', text: textOf(turn), at, done: true, parts: turn.parts };
      });
      if (messages.length) {
        messages.push({
          id: 'replay-notice',
          role: 'system',
          text: `— resumed this session (${action.turns.length} turn${
            action.turns.length === 1 ? '' : 's'
          })`,
          at,
          tone: 'info',
        });
      }
      return { ...state, sessionId: action.sessionId ?? state.sessionId, messages };
    }
    case 'user': {
      const id = nextId(state, 'user');
      return {
        ...state,
        seq: state.seq + 1,
        messages: [...state.messages, { id, role: 'user', text: action.text, at: Date.now() }],
      };
    }
    case 'notice': {
      const id = nextId(state, 'system');
      return {
        ...state,
        seq: state.seq + 1,
        messages: [
          ...state.messages,
          { id, role: 'system', text: action.text, at: Date.now(), tone: action.tone },
        ],
      };
    }
    case 'start':
      return {
        ...state,
        running: true,
        sessionId: action.sessionId ?? state.sessionId,
        assistantId: null,
        logId: null,
      };
    case 'session':
      return { ...state, sessionId: action.sessionId };
    case 'chunk': {
      if (action.stream === 'meta') return append(state, 'log', 'logId', action.chunk);
      if (action.stream === 'stderr') return append(state, 'log', 'logId', action.chunk);
      return append(state, 'assistant', 'assistantId', action.chunk);
    }
    case 'done': {
      const finish = (message: ChatMessage): ChatMessage =>
        message.role === 'assistant' || message.role === 'log'
          ? { ...message, done: true }
          : message;
      return {
        ...state,
        running: false,
        messages: state.messages.map(finish),
        assistantId: null,
        logId: null,
      };
    }
    default:
      return state;
  }
}

export interface ChatApi {
  messages: ChatMessage[];
  running: boolean;
  sessionId: string | null;
  queue: string[];
  submit: (text: string) => Promise<void>;
  removeQueued: (index: number) => void;
  setSessionId: (id: string | null) => void;
  notice: (text: string) => void;
}

export function useChat(room: string): ChatApi {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [queue, setQueue] = useState<string[]>([]);

  useServerEvent<{ room: string; sessionId: string }>('chat-start', (data) => {
    if (data.room === room) dispatch({ type: 'start', sessionId: data.sessionId });
  });
  useServerEvent<{ room: string; stream: string; chunk: string }>('chat', (data) => {
    if (data.room === room) dispatch({ type: 'chunk', stream: data.stream, chunk: data.chunk });
  });
  useServerEvent<{ room: string; code: number; error: string | null }>('chat-done', (data) => {
    if (data.room === room) dispatch({ type: 'done', code: data.code, error: data.error });
  });

  // Replay what already happened in this room's session, once.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getSession(room);
        if (cancelled) return;
        dispatch({ type: 'replay', turns: data.turns ?? [], sessionId: data.session ?? null });
      } catch {
        /* the panel just starts empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room]);

  const send = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      dispatch({ type: 'user', text: prompt });
      try {
        const result = await postChat(room, prompt);
        if (!result.started) {
          dispatch({
            type: 'notice',
            text: `could not send: ${result.reason ?? result.error ?? 'the agent is busy'}`,
            tone: 'error',
          });
          dispatch({ type: 'done', code: -1, error: null });
        }
      } catch {
        dispatch({ type: 'notice', text: 'could not reach the server', tone: 'error' });
        dispatch({ type: 'done', code: -1, error: null });
      }
    },
    [room],
  );

  const submit = useCallback(
    async (text: string) => {
      const prompt = text.trim();
      if (!prompt) return;
      if (state.running) setQueue((current) => [...current, prompt]);
      else await send(prompt);
    },
    [state.running, send],
  );

  // The moment the agent stops, the next queued prompt goes out.
  useEffect(() => {
    if (state.running || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    if (next) void send(next);
  }, [state.running, queue, send]);

  return {
    messages: state.messages,
    running: state.running,
    sessionId: state.sessionId,
    queue,
    submit,
    removeQueued: (index) => setQueue((current) => current.filter((_, i) => i !== index)),
    setSessionId: (id) => dispatch({ type: 'session', sessionId: id }),
    notice: (text) => dispatch({ type: 'notice', text, tone: 'info' }),
  };
}
