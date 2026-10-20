// modelroom — the opencode server modelroom owns.
//
// `opencode run` is a one-shot client: it starts a private server, asks one
// question and leaves. That client cancels any question the agent asks, because
// nobody is there to answer it. modelroom keeps the server instead — one private
// `opencode serve` for the life of the process — so a turn can block on a form
// and modelroom can answer it. It is the same private server `--standalone`
// starts, only kept alive across turns.
//
// The server is modelroom's own child, separate from the shared background
// service, so it inherits this process's environment (provider keys included).
// Its port and password are generated here; requests go over plain `fetch`.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { Config } from '../core/config.ts';

const READY_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 15_000;

/** The four verbs the turn driver needs; a fake one is enough in tests. */
export interface Api {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  del: (path: string) => Promise<unknown>;
}

export interface OpenCodeServer extends Api {
  url: string;
  pid: number | null;
}

/** A port the OS hands us and we immediately give back, so `serve` can take it. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => (port ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

export interface OpenCodeServerHandle {
  /** The running server, started on first use. Null when it cannot start. */
  ensure: () => Promise<OpenCodeServer | null>;
  stop: () => void;
}

export function createOpenCodeServer(cfg: Config): OpenCodeServerHandle {
  let handle: OpenCodeServer | null = null;
  let starting: Promise<OpenCodeServer | null> | null = null;
  let child: ChildProcess | null = null;

  async function request(
    url: string,
    headers: Record<string, string>,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    try {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      if (res.status === 204) return {};
      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return null;
    }
  }

  function connect(url: string, auth: string, pid: number | null): OpenCodeServer {
    const headers = { authorization: `Basic ${auth}` };
    return {
      url,
      pid,
      get: (path) => request(url, headers, 'GET', path),
      post: (path, body) => request(url, headers, 'POST', path, body ?? {}),
      del: (path) => request(url, headers, 'DELETE', path),
    };
  }

  async function start(): Promise<OpenCodeServer | null> {
    const command = cfg.agent.command || 'opencode';
    let port: number;
    try {
      port = await freePort();
    } catch {
      return null;
    }
    const password = randomBytes(24).toString('base64url');
    let proc: ChildProcess;
    try {
      proc = spawn(command, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], {
        cwd: cfg.rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NO_COLOR: '1',
          FORCE_COLOR: '0',
          // Basic auth uses the `opencode` user; the password is ours to choose.
          OPENCODE_SERVER_PASSWORD: password,
          OPENCODE_PASSWORD: password,
        },
      });
    } catch {
      return null;
    }
    child = proc;
    const ready = await new Promise<boolean>((resolve) => {
      let out = '';
      const timer = setTimeout(() => resolve(false), READY_TIMEOUT_MS);
      timer.unref?.();
      proc.stdout?.on('data', (b: Buffer) => {
        out += String(b);
        if (/listening on/i.test(out)) {
          clearTimeout(timer);
          resolve(true);
        }
      });
      proc.stderr?.on('data', () => {}); // the server's own logging is not ours to show
      proc.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      proc.on('close', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (!ready) {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      if (child === proc) child = null;
      return null;
    }
    const auth = Buffer.from(`opencode:${password}`).toString('base64');
    const created = connect(`http://127.0.0.1:${port}`, auth, proc.pid ?? null);
    // A crashed server is gone: the next `ensure` starts a fresh one.
    proc.on('close', () => {
      if (child === proc) child = null;
      if (handle === created) handle = null;
    });
    return created;
  }

  return {
    ensure: async () => {
      if (handle) return handle;
      if (starting) return starting;
      starting = start().finally(() => {
        starting = null;
      });
      const started = await starting;
      if (started) handle = started;
      return started;
    },
    stop: () => {
      try {
        child?.kill();
      } catch {
        /* already gone */
      }
      child = null;
      handle = null;
    },
  };
}
