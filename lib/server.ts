// modelroom — the local server
//
// Serves the workspace (dashboard / room / settings), streams changes over SSE,
// and runs the coding agent you configure. It never writes anything except the
// room docs you allow (`cfg.docs`), and it never reads your application code.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { readFile, mkdir, open } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPackageRoot } from './pkg.ts';
import {
  loadConfig,
  loadState,
  saveState,
  applySettings,
  type Config,
  type State,
} from './config.ts';
import { listRoomNames, roomInfo, publicRoom, isRoomName, type RoomInfo } from './rooms.ts';
import { buildFacets, searchRooms } from './facets.ts';
import { getAdapter, stripAnsi } from './agents/index.ts';
import { renderArtifact, playwrightAvailable, type RenderResult } from './artifact.ts';
import { sessionView, watchParts, type PartsWatcher } from './opencode.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const pkgDir = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
const uiDir = join(pkgDir, 'ui');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export interface ModelroomStatus {
  phase: string;
  message: string;
  since: number;
  lastEvent: { file: string; at: number } | null;
  log: string[];
}

export interface ChatResult {
  started: boolean;
  reason?: string;
  sessionId?: string;
  pid?: number;
}

export interface App {
  cfg: Config;
  server: ReturnType<typeof createServer>;
  status: ModelroomStatus;
  startWatching: () => void;
  listen: () => Promise<{ url: string; cfg: Config }>;
  close: () => Promise<void>;
}

export interface CreateOptions {
  cwd?: string;
  port?: number | string;
  host?: string;
}

export async function createModelroom(opts: CreateOptions = {}): Promise<App> {
  const cfg = await loadConfig(opts.cwd || process.cwd());
  if (opts.port) cfg.port = Number(opts.port);
  if (opts.host) cfg.host = String(opts.host);

  await mkdir(cfg.stateDir, { recursive: true }); // keep state local, never in git
  const state: State = await loadState(cfg);
  // Settings saved from the UI are local state: re-apply them over modelroom.json
  // so a saved model survives the next start.
  applySettings(cfg, state.settings);
  const clients = new Set<ServerResponse>();
  const chats = new Map<string, PartsWatcher | null>(); // room -> its watcher, if it has one
  let rendering = false;
  const status: ModelroomStatus = {
    phase: 'idle',
    message: 'ready',
    since: Date.now(),
    lastEvent: null,
    log: [],
  };

  const persist = () => saveState(cfg, state).catch(() => {});
  const sessionOf = (room: string): string => {
    const adapter = getAdapter(cfg.agent.adapter);
    if (!state.sessions[room]) {
      state.sessions[room] = adapter.newSessionId();
      void persist();
    }
    return state.sessions[room] as string;
  };

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        /* cleaned on close */
      }
    }
  };
  const setStatus = (phase: string, message: string) => {
    status.phase = phase;
    status.message = message;
    status.since = Date.now();
    broadcast('status', { phase, message, since: status.since });
  };
  /**
   * Wait for best-effort work, but never longer than the budget: a snapshot that
   * lands late is still used, while a hung server must not hold up the chat.
   */
  const settle = async (work: Promise<void> | undefined, ms: number): Promise<void> => {
    if (!work) return;
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, ms).unref())]);
  };

  // ── files ─────────────────────────────────────────────────────────────────
  const send = (res: ServerResponse, code: number, type: string, body: string | Buffer) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, code: number, obj: unknown) =>
    send(res, code, MIME['.json'] as string, JSON.stringify(obj));

  function withinRoot(target: string): boolean {
    if (target !== cfg.rootDir && !target.startsWith(cfg.rootDir + sep)) return false;
    // Serve ordinary project files only: no dotfiles (secrets, .git, .modelroom), no deps.
    const parts = relative(cfg.rootDir, target).split(sep);
    return parts.every((p) => p && !p.startsWith('.') && p !== 'node_modules');
  }

  async function serveFile(res: ServerResponse, urlPath: string) {
    const rel = decodeURIComponent(urlPath.replace(/^\/files\/?/, ''));
    const target = normalize(join(cfg.rootDir, rel));
    if (!withinRoot(target)) return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body); // byte-identical: no injection
    } catch {
      send(res, 404, 'text/plain; charset=utf-8', `not found: ${rel}`);
    }
  }

  async function serveUi(res: ServerResponse, page: string) {
    try {
      return send(res, 200, MIME['.html'] as string, await readFile(join(uiDir, page)));
    } catch (err) {
      // Log locally; the browser gets no path or stack information.
      process.stderr.write(
        `modelroom: cannot serve ${page}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return send(res, 500, 'text/plain; charset=utf-8', 'internal error');
    }
  }

  /** Static assets of the tool itself (the built stylesheet and friends). */
  async function serveUiAsset(res: ServerResponse, urlPath: string) {
    const rel = decodeURIComponent(urlPath.replace(/^\/ui\/?/, ''));
    const target = normalize(join(uiDir, rel));
    if (target !== uiDir && !target.startsWith(uiDir + sep)) {
      return send(res, 403, 'text/plain; charset=utf-8', 'forbidden');
    }
    try {
      const body = await readFile(target);
      res.writeHead(200, {
        'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      send(res, 404, 'text/plain; charset=utf-8', `not found: /ui/${rel}`);
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────
  const watchers: FSWatcher[] = [];
  function startWatching() {
    for (const dir of [cfg.roomsDir]) {
      try {
        watchers.push(
          watch(dir, { recursive: true }, (_e, name) => {
            const file = name
              ? relative(cfg.rootDir, join(dir, String(name)))
              : relative(cfg.rootDir, dir);
            const at = Date.now();
            if (file.includes('.modelroom')) return;
            status.lastEvent = { file, at };
            status.phase = 'change';
            status.message = `changed: ${file}`;
            status.since = at;
            broadcast('change', { file, at });
            broadcast('status', { phase: 'change', message: status.message, since: at });
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`modelroom: cannot watch ${dir}: ${message}\n`);
      }
    }
  }

  // ── chat ──────────────────────────────────────────────────────────────────
  function runChat(room: string, prompt: string): ChatResult {
    if (!prompt || !prompt.trim()) return { started: false, reason: 'empty prompt' };
    if (chats.has(room)) return { started: false, reason: 'this room is already running' };
    const adapter = getAdapter(cfg.agent.adapter);
    const sessionId = sessionOf(room);
    const startedAt = Date.now();
    setStatus('chat', `${room}: agent is working…`);
    broadcast('chat-start', { room, sessionId, prompt, at: startedAt });
    broadcast('chat', {
      room,
      sessionId,
      stream: 'meta',
      chunk: `$ ${cfg.agent.command} (agent=${cfg.agent.agent || '-'}, model=${cfg.agent.model || 'default'}, session=${sessionId})\n`,
    });
    // A structured agent keeps its turn on its own server while it works — the text,
    // the tool calls, the patches it wrote. Follow that: it is the only live view of
    // the *shape* of the work, where stdout is just prose. `since` is what separates
    // this answer from the previous one, so a run never opens on the last reply.
    const watcher = adapter.structured
      ? watchParts(cfg, sessionId, (parts) => broadcast('chat-parts', { room, sessionId, parts }), {
          since: startedAt,
        })
      : null;
    chats.set(room, watcher);
    const child = adapter.run({
      cfg,
      cwd: cfg.rootDir,
      prompt,
      sessionId,
      onChunk: (stream, chunk) => {
        const text = stripAnsi(chunk);
        if (text) broadcast('chat', { room, sessionId, stream, chunk: text });
      },
      onExit: (code, err) => {
        void (async () => {
          // The last snapshot belongs to this turn: let it land before the turn is
          // called done, or the answer's last line arrives after the chat let go.
          await settle(
            watcher?.stop().catch(() => {}),
            2500,
          );
          chats.delete(room);
          if (err) setStatus('error', err);
          else setStatus(code === 0 ? 'ok' : 'error', `${room}: agent exited (${code})`);
          broadcast('chat-done', { room, sessionId, code, error: err || null, at: Date.now() });
        })();
      },
    });
    return { started: true, sessionId, pid: child.pid };
  }

  // ── artifact render (optional) ────────────────────────────────────────────
  async function render(room: string, device: string): Promise<RenderResult> {
    if (rendering) return { ok: false, error: 'already rendering' };
    rendering = true;
    setStatus('rendering', `${room}: rendering ${cfg.artifact.replace(/\.html?$/i, '.png')}…`);
    broadcast('render-start', { room, device, at: Date.now() });
    try {
      const result = await renderArtifact({ cfg, room, device });
      if (result.ok) {
        setStatus('ok', `${room}: ${cfg.artifact.replace(/\.html?$/i, '.png')} updated`);
      } else {
        setStatus('error', result.error);
      }
      broadcast('render-done', { room, ...result, at: Date.now() });
      return result;
    } finally {
      rendering = false;
    }
  }

  /** Read text and its mtime through one handle, so they describe one file. */
  async function readDoc(path: string): Promise<{ text: string; mtime: number }> {
    const fh = await open(path, 'r');
    try {
      const s = await fh.stat();
      return { text: await fh.readFile('utf8'), mtime: s.mtimeMs };
    } finally {
      await fh.close();
    }
  }

  /**
   * The version of a doc's content. Two writes can be a millisecond apart, so the
   * mtime is not a reliable "did this change" token; the hash is.
   */
  const hashOf = (text: string): string =>
    createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

  // One writer per file. Your autosave and the agent's edit can arrive together,
  // and the version check alone cannot stop them interleaving — so saves to the
  // same path are queued, and the check runs inside the queue.
  const writeQueues = new Map<string, Promise<void>>();
  function withFileLock<T>(file: string, work: () => Promise<T>): Promise<T> {
    const previous = writeQueues.get(file) ?? Promise.resolve();
    const result = previous.then(work);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    writeQueues.set(file, settled);
    void (async () => {
      await settled;
      if (writeQueues.get(file) === settled) writeQueues.delete(file);
    })();
    return result;
  }

  async function readBody(req: IncomingMessage, limit = 400_000): Promise<string> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      const buf = chunk as Buffer;
      size += buf.length;
      if (size > limit) throw new Error('payload too large');
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  /** Parse a JSON body; answers 400 itself and returns null when it is malformed. */
  async function jsonBody(
    req: IncomingMessage,
    res: ServerResponse,
    optional = false,
  ): Promise<Record<string, unknown> | null> {
    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      process.stderr.write(`modelroom: cannot read request body: ${detail}\n`);
      sendJson(res, 400, { error: 'request body could not be read' });
      return null;
    }
    if (!raw.trim() && optional) return {};
    try {
      const parsed: unknown = JSON.parse(raw || '{}');
      if (!isRecord(parsed)) {
        sendJson(res, 400, { error: 'body must be a JSON object' });
        return null;
      }
      return parsed;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      process.stderr.write(`modelroom: invalid JSON body: ${detail}\n`);
      sendJson(res, 400, { error: 'body must be valid JSON' });
      return null;
    }
  }

  // ── routing ───────────────────────────────────────────────────────────────
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      const names = await listRoomNames(cfg);
      const param = url.searchParams.get('room') || '';
      const room = isRoomName(param) && names.includes(param) ? param : (names[0] ?? null);

      if (path === '/health') return send(res, 200, 'text/plain; charset=utf-8', 'ok');
      if (path === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }

      if (path === '/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-store',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        res.write('retry: 1000\n\n');
        res.write(
          `event: hello\ndata: ${JSON.stringify({ config: publicConfig(cfg), status })}\n\n`,
        );
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (path === '/api/rooms') {
        const rooms = await Promise.all(names.map((n) => roomInfo(cfg, n)));
        return sendJson(res, 200, {
          count: rooms.length,
          // `running` is live state, not a record: it comes from the chat map.
          rooms: rooms.map((info) => ({ ...publicRoom(info), running: chats.has(info.name) })),
          facets: buildFacets(rooms),
          config: publicConfig(cfg),
        });
      }

      // Full-text search happens here, over the derived index in memory: the
      // browser never downloads every body just to filter the list.
      if (path === '/api/search') {
        const q = url.searchParams.get('q') || '';
        const rooms = await Promise.all(names.map((n) => roomInfo(cfg, n)));
        return sendJson(res, 200, { q, hits: searchRooms(rooms, q) });
      }

      if (path === '/api/room') {
        if (!room) return sendJson(res, 404, { error: 'no rooms' });
        const info = await roomInfo(cfg, room);
        return sendJson(res, 200, {
          room: publicRoom(info),
          session: state.sessions[room] || null,
          status,
          config: publicConfig(cfg),
        });
      }

      if (path === '/api/doc' && req.method === 'GET') {
        const name = url.searchParams.get('name') || '';
        if (!cfg.docs.includes(name)) {
          return sendJson(res, 400, { error: `name must be one of ${cfg.docs.join(', ')}` });
        }
        if (!room) return sendJson(res, 404, { error: 'no rooms' });
        try {
          const p = join(cfg.roomsDir, room, name);
          const { text, mtime } = await readDoc(p);
          return sendJson(res, 200, { room, name, text, mtime, hash: hashOf(text) });
        } catch {
          return sendJson(res, 200, {
            room,
            name,
            text: '',
            mtime: 0,
            hash: hashOf(''),
            missing: true,
          });
        }
      }

      if (path === '/api/doc' && req.method === 'PUT') {
        const body = await jsonBody(req, res);
        if (!body) return;
        const target = isRoomName(body.room) && names.includes(body.room) ? body.room : room;
        const name = typeof body.name === 'string' ? body.name : '';
        if (!target) return sendJson(res, 404, { error: 'no rooms' });
        if (!cfg.docs.includes(name)) {
          return sendJson(res, 403, { error: 'this file is not editable' });
        }
        const p = join(cfg.roomsDir, target, name);
        // The version this save is based on: a content hash when the client sends
        // one (the room UI does), otherwise the mtime. Both the check and the write
        // run inside the file's queue, so two saves can never interleave.
        // 'a+' creates the file when it is missing and never truncates on open, so
        // there is no window between "does it exist" and the write.
        const expectedHash = typeof body.hash === 'string' && body.hash ? body.hash : null;
        const expectedMtime = body.mtime ? Number(body.mtime) : null;
        const outcome = await withFileLock(
          p,
          async (): Promise<{ status: number; body: Record<string, unknown> }> => {
            const fh = await open(p, 'a+');
            try {
              const s = await fh.stat();
              const current = await fh.readFile('utf8');
              const currentHash = hashOf(current);
              const changed = expectedHash
                ? currentHash !== expectedHash
                : expectedMtime !== null && expectedMtime !== s.mtimeMs;
              if (changed) {
                return {
                  status: 409,
                  body: {
                    error: 'changed elsewhere',
                    text: current,
                    mtime: s.mtimeMs,
                    hash: currentHash,
                  },
                };
              }
              const text = typeof body.text === 'string' ? body.text : '';
              await fh.truncate(0);
              await fh.writeFile(text, 'utf8');
              const written = await fh.stat();
              return {
                status: 200,
                body: { room: target, name, mtime: written.mtimeMs, hash: hashOf(text) },
              };
            } finally {
              await fh.close();
            }
          },
        );
        if (outcome.status === 200) {
          broadcast('doc-saved', {
            room: target,
            name,
            mtime: outcome.body.mtime,
            at: Date.now(),
          });
        }
        return sendJson(res, outcome.status, outcome.body);
      }
      if (path === '/api/doc') return sendJson(res, 405, { error: 'GET or PUT' });

      if (path === '/api/chat' && req.method === 'POST') {
        const body = await jsonBody(req, res);
        if (!body) return;
        const target = isRoomName(body.room) && names.includes(body.room) ? body.room : room;
        if (!target) return sendJson(res, 404, { error: 'no rooms' });
        const r = runChat(target, typeof body.prompt === 'string' ? body.prompt : '');
        return sendJson(res, r.started ? 202 : 409, { room: target, ...r });
      }

      if (path === '/api/session' && req.method === 'POST') {
        const body = await jsonBody(req, res, true);
        if (!body) return; // malformed JSON: jsonBody already answered 400
        const target = isRoomName(body.room) && names.includes(body.room) ? body.room : room;
        if (!target) return sendJson(res, 404, { error: 'no rooms' });
        if (chats.has(target)) return sendJson(res, 409, { error: 'room is running' });
        const adapter = getAdapter(cfg.agent.adapter);
        const id = adapter.newSessionId();
        state.sessions[target] = id;
        await persist();
        return sendJson(res, 202, { room: target, sessionId: id });
      }

      // What the agent did in this room: cost, tokens, context, transcript, MCP.
      // opencode-only, and best-effort — a failure just means `available: false`.
      if (path === '/api/session' && req.method === 'GET') {
        if (!room) return sendJson(res, 404, { error: 'no rooms' });
        if (cfg.agent.adapter !== 'opencode') {
          return sendJson(res, 200, { available: false, room, session: null });
        }
        const sessionId = state.sessions[room] ?? null;
        const view = await sessionView(cfg, sessionId);
        const base = { available: Boolean(view), room, session: sessionId };
        return sendJson(res, 200, view ? { ...base, ...view } : base);
      }

      if (path === '/api/settings' && req.method === 'POST') {
        const body = await jsonBody(req, res);
        if (!body) return;
        const applied = applySettings(cfg, body);
        Object.assign(state.settings, applied); // keep them local, and for the next start
        await persist();
        broadcast('settings', { applied, at: Date.now() });
        return sendJson(res, 200, { applied, config: publicConfig(cfg) });
      }

      if (path === '/api/artifact' && req.method === 'POST') {
        const body = await jsonBody(req, res, true);
        if (!body) return; // malformed JSON: jsonBody already answered 400
        const target = isRoomName(body.room) && names.includes(body.room) ? body.room : room;
        if (!target) return sendJson(res, 404, { error: 'no rooms' });
        const device = typeof body.device === 'string' ? body.device : 'tablet';
        const result = await render(target, device);
        return sendJson(res, result.ok ? 200 : 501, result);
      }

      if (path.startsWith('/files/')) return await serveFile(res, path);
      if (path.startsWith('/ui/')) return await serveUiAsset(res, path);

      const page =
        path === '/'
          ? 'dashboard.html'
          : path === '/settings'
            ? 'settings.html'
            : path.startsWith('/room/')
              ? 'room.html'
              : null;
      if (page) return await serveUi(res, page);

      send(res, 404, 'text/plain; charset=utf-8', 'not found');
    } catch (err) {
      if (res.headersSent) {
        try {
          res.end();
        } catch {
          /* already closed */
        }
        return;
      }
      const code = err instanceof URIError ? 400 : 500;
      if (code === 500) {
        // The detail stays in the terminal; the browser gets nothing to probe with.
        const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
        process.stderr.write(`modelroom: ${detail}\n`);
      }
      try {
        send(
          res,
          code,
          'text/plain; charset=utf-8',
          code === 400 ? 'bad request' : 'internal error',
        );
      } catch {
        /* nothing we can do */
      }
    }
  });

  const heartbeat = setInterval(() => {
    for (const res of clients) {
      try {
        res.write(': ping\n\n');
      } catch {
        clients.delete(res);
      }
    }
  }, 15000);
  heartbeat.unref();

  return {
    cfg,
    server,
    status,
    startWatching,
    listen: () =>
      new Promise((resolveListen, reject) => {
        server.once('error', reject);
        server.listen(cfg.port, cfg.host, () =>
          resolveListen({ url: `http://${cfg.host}:${cfg.port}`, cfg }),
        );
      }),
    close: () =>
      new Promise((r) => {
        clearInterval(heartbeat);
        for (const w of watchers) w.close();
        for (const chat of chats.values()) void chat?.stop();
        server.close(() => r());
      }),
  };
}

export function publicConfig(cfg: Config) {
  return {
    root: cfg.root,
    rooms: cfg.rooms,
    artifact: cfg.artifact,
    docs: cfg.docs,
    agent: {
      adapter: cfg.agent.adapter,
      command: cfg.agent.command,
      agent: cfg.agent.agent,
      model: cfg.agent.model,
      standalone: cfg.agent.standalone,
    },
  };
}

export { playwrightAvailable };
export type { RoomInfo };
