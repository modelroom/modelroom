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
import {
  getSession,
  partsText,
  postAnswer,
  postChat,
  postDismiss,
  type Ask,
  type AskAnswer,
  type Part,
  type Turn,
} from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent } from './useServerEvents.tsx';

export type ChatMessage =
  | { id: string; role: 'user'; text: string; at: number }
  | { id: string; role: 'assistant'; text: string; at: number; done: boolean; parts?: Part[] }
  | { id: string; role: 'system'; text: string; at: number; tone: 'info' | 'error' }
  | { id: string; role: 'log'; text: string; at: number; done: boolean };

interface State {
  messages: ChatMessage[];
  /** Questions the agent is blocked on, oldest first. */
  asks: Ask[];
  running: boolean;
  sessionId: string | null;
  assistantId: string | null;
  logId: string | null;
  seq: number;
}

type Action =
  | { type: 'replay'; turns: Turn[]; sessionId: string | null; resumed: string }
  | { type: 'user'; text: string }
  | { type: 'notice'; text: string; tone: 'info' | 'error' }
  | { type: 'start'; sessionId: string | null }
  | { type: 'session'; sessionId: string | null }
  | { type: 'parts'; parts: Part[] }
  | { type: 'ask'; ask: Ask }
  | { type: 'ask-done'; askId: string }
  | { type: 'chunk'; stream: string; chunk: string }
  | { type: 'done'; code: number; error: string | null };

const initialState: State = {
  messages: [],
  asks: [],
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
      const messages: ChatMessage[] = action.turns.map((turn, index) => {
        const id = `replay-${index}`;
        if (turn.role === 'user') return { id, role: 'user', text: partsText(turn.parts), at };
        return {
          id,
          role: 'assistant',
          text: partsText(turn.parts),
          at,
          done: true,
          parts: turn.parts,
        };
      });
      if (messages.length) {
        messages.push({
          id: 'replay-notice',
          role: 'system',
          text: action.resumed,
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
        asks: [], // a new turn cannot be blocked on the last turn's question
      };
    case 'session':
      return { ...state, sessionId: action.sessionId };
    case 'ask': {
      if (state.asks.some((ask) => ask.id === action.ask.id)) return state;
      return { ...state, asks: [...state.asks, action.ask] };
    }
    case 'ask-done':
      return { ...state, asks: state.asks.filter((ask) => ask.id !== action.askId) };
    case 'parts': {
      // The turn as its own parts, live off the agent's server. This replaces the
      // streamed prose: the same words, plus the tool calls and patches around them.
      if (!action.parts.length) return state;
      const text = partsText(action.parts);
      if (!state.assistantId) {
        const id = nextId(state, 'assistant');
        return {
          ...state,
          seq: state.seq + 1,
          assistantId: id,
          messages: [
            ...state.messages,
            { id, role: 'assistant', text, at: Date.now(), done: false, parts: action.parts },
          ],
        };
      }
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === state.assistantId && message.role === 'assistant'
            ? { ...message, text, parts: action.parts }
            : message,
        ),
      };
    }
    case 'chunk': {
      if (action.stream === 'meta' || action.stream === 'stderr') {
        return append(state, 'log', 'logId', action.chunk);
      }
      // Once this turn is being read as parts, the CLI's prose is raw output: keep
      // it in the log instead of showing the same answer twice.
      const assistant = state.messages.find((message) => message.id === state.assistantId);
      if (assistant?.role === 'assistant' && assistant.parts?.length) {
        return append(state, 'log', 'logId', action.chunk);
      }
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
        asks: [], // the turn is over; an unanswered question is moot
      };
    }
    default:
      return state;
  }
}

export interface ChatApi {
  messages: ChatMessage[];
  /** Questions the agent is blocked on, oldest first. */
  asks: Ask[];
  running: boolean;
  sessionId: string | null;
  queue: string[];
  submit: (text: string) => Promise<void>;
  answerAsk: (askId: string, answer: AskAnswer) => Promise<void>;
  dismissAsk: (askId: string) => Promise<void>;
  removeQueued: (index: number) => void;
  setSessionId: (id: string | null) => void;
  notice: (text: string) => void;
}

export function useChat(room: string): ChatApi {
  const { t } = useI18n();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [queue, setQueue] = useState<string[]>([]);

  useServerEvent<{ room: string; sessionId: string }>('chat-start', (data) => {
    if (data.room === room) dispatch({ type: 'start', sessionId: data.sessionId });
  });
  useServerEvent<{ room: string; stream: string; chunk: string }>('chat', (data) => {
    if (data.room === room) dispatch({ type: 'chunk', stream: data.stream, chunk: data.chunk });
  });
  useServerEvent<{ room: string; parts: Part[] }>('chat-parts', (data) => {
    if (data.room === room) dispatch({ type: 'parts', parts: data.parts });
  });
  useServerEvent<{ room: string; ask: Ask }>('chat-ask', (data) => {
    if (data.room === room) dispatch({ type: 'ask', ask: data.ask });
  });
  useServerEvent<{ room: string; askId: string }>('chat-ask-done', (data) => {
    if (data.room === room) dispatch({ type: 'ask-done', askId: data.askId });
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
        const turns = data.turns ?? [];
        dispatch({
          type: 'replay',
          turns,
          sessionId: data.session ?? null,
          resumed: t(turns.length === 1 ? 'chat.resumedOne' : 'chat.resumed', {
            turns: turns.length,
          }),
        });
        // A question the agent is still blocked on: the card comes back too.
        for (const ask of data.asks ?? []) dispatch({ type: 'ask', ask });
      } catch {
        /* the panel just starts empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, t]);

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
            text: t('chat.couldNotSend', {
              reason: result.reason ?? result.error ?? t('chat.agentBusy'),
            }),
            tone: 'error',
          });
          dispatch({ type: 'done', code: -1, error: null });
        }
      } catch {
        dispatch({ type: 'notice', text: t('chat.couldNotReach'), tone: 'error' });
        dispatch({ type: 'done', code: -1, error: null });
      }
    },
    [room, t],
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

  // The answer goes back to the turn that is blocked on it; the agent carries on
  // from where it stopped. The card closes when the server confirms.
  const answerAsk = useCallback(
    async (askId: string, answer: AskAnswer) => {
      try {
        const result = await postAnswer(room, askId, answer);
        if (result.error) throw new Error(result.error);
        dispatch({ type: 'ask-done', askId });
      } catch {
        dispatch({ type: 'notice', text: t('ask.couldNotSend'), tone: 'error' });
      }
    },
    [room, t],
  );

  const dismissAsk = useCallback(
    async (askId: string) => {
      try {
        await postDismiss(room, askId);
      } catch {
        /* the turn moves on either way */
      }
      dispatch({ type: 'ask-done', askId });
    },
    [room],
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
    asks: state.asks,
    running: state.running,
    sessionId: state.sessionId,
    queue,
    submit,
    answerAsk,
    dismissAsk,
    removeQueued: (index) => setQueue((current) => current.filter((_, i) => i !== index)),
    setSessionId: (id) => dispatch({ type: 'session', sessionId: id }),
    notice: (text) => dispatch({ type: 'notice', text, tone: 'info' }),
  };
}
