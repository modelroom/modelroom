// The session column: what the agent spent and where it is — opencode only.
// Cost, tokens, context window, MCP servers and skills, straight from the API.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { clampPct, getSession, type SessionView } from '../lib/api.ts';
import { fmtNum } from '../lib/format.ts';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Button } from './ui/button.tsx';
import { Icon } from './ui/Icon.tsx';

const Head = ({ children }: { children: ReactNode }) => (
  <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{children}</div>
);

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-2 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right font-mono break-all">{value}</span>
  </div>
);

function Bar({ pct }: { pct: number }) {
  const color = pct >= 85 ? 'bg-destructive' : pct >= 70 ? 'bg-warning' : 'bg-success';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${color}`} style={{ width: `${clampPct(pct)}%` }} />
    </div>
  );
}

export function SessionPanel({ room }: { room: string }) {
  const [view, setView] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getSession(room).catch(() => null);
    setView(data);
    setLoading(false);
  }, [room]);

  useEffect(() => {
    void load();
  }, [load]);

  useServerEvent<{ room: string }>('chat-done', (data) => {
    if (data.room === room) void load();
  });

  const stats = view?.stats;
  const tokens = stats?.tokens ?? null;
  const totalIn = tokens ? tokens.input + tokens.cacheRead : 0;
  const cached = totalIn > 0 && tokens ? Math.round((tokens.cacheRead / totalIn) * 100) : 0;

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-card">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">セッション</span>
        {loading && <Icon name="loader" className="size-3.5 animate-spin text-muted-foreground" />}
        <Button
          variant="ghost"
          size="xs"
          className="ml-auto"
          onClick={() => void load()}
          title="refresh"
        >
          <Icon name="refresh" className="size-3.5" />
          refresh
        </Button>
      </header>

      <div className="mr-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {!view || !view.available ? (
          <p className="text-sm text-muted-foreground">
            この部屋のセッション情報は opencode アダプタのときだけ表示します。
          </p>
        ) : (
          <>
            <Head>セッション</Head>
            {view.context ? (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">コンテキスト</span>
                  <span className="font-mono">
                    {view.context.pct}% ・ {fmtNum(view.context.used)}
                  </span>
                </div>
                <Bar pct={view.context.pct} />
                {view.context.pct >= 70 && (
                  <div className="text-xs text-warning">
                    {view.context.pct}% — compact を検討（上限 {fmtNum(view.context.limit)}）
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-muted-foreground">
                コンテキスト: 計測できません（まだ実行がないか、上限が不明）
              </div>
            )}

            <Row
              label="費用"
              value={stats?.cost != null ? `$${Number(stats.cost).toFixed(4)}` : '—'}
            />
            {tokens && (
              <>
                <Row label="トークン ↑" value={fmtNum(tokens.input)} />
                <Row label="トークン ↓" value={fmtNum(tokens.output)} />
                <Row label="reasoning" value={fmtNum(tokens.reasoning)} />
                <Row label="キャッシュ" value={`${cached}%`} />
              </>
            )}
            <Row label="状態" value={stats?.outcome ?? '—'} />
            {stats?.model && <Row label="model" value={stats.model} />}
            {view.workspace && <Row label="workspace" value={view.workspace} />}

            {view.mcp && view.mcp.length > 0 && (
              <>
                <Head>MCP</Head>
                {view.mcp.map((server) => (
                  <Row
                    key={server.name}
                    label={server.name}
                    value={server.error ? `${server.status}: ${server.error}` : server.status}
                  />
                ))}
              </>
            )}
            {view.skills && view.skills.length > 0 && (
              <Row label="スキル" value={String(view.skills.length)} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
