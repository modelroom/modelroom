// Every event the server can send over `/events`.
//
// `EventSource` has no wildcard: a named event is only delivered if it is
// registered by name, so an event missing from this list is an event nobody ever
// hears — a feature that silently does not arrive. `test/unit/events.test.mjs`
// holds this list against the server's own `broadcast` calls, in both directions.

export const SERVER_EVENTS = [
  'hello', // sent directly rather than through broadcast, on connect
  'status',
  'change',
  'chat-start',
  'chat',
  'chat-parts',
  'chat-ask',
  'chat-ask-done',
  'chat-done',
  'render-start',
  'render-done',
  'doc-saved',
  'settings',
  'update', // the answer to the one registry check, when it lands
] as const;

export type ServerEvent = (typeof SERVER_EVENTS)[number];
