// The session column: what the agent spent and where it is — opencode only.
// Cost, tokens, context window, MCP servers and skills, straight from the API.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Box, Button, Group, Loader, Progress, Text } from '@mantine/core';
import { clampPct, getSession, type SessionView } from '../lib/api.ts';
import { fmtNum } from '../lib/format.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Icon } from './Icon.tsx';
import { Panel } from './Status.tsx';

const Head = ({ children }: { children: ReactNode }) => (
  <Text size="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.04em' }}>
    {children}
  </Text>
);

const Row = ({ label, value }: { label: ReactNode; value: ReactNode }) => (
  <Group gap="xs" justify="space-between" wrap="nowrap" align="baseline">
    <Text size="sm" c="dimmed">
      {label}
    </Text>
    <Text size="sm" ff="monospace" ta="right" style={{ overflowWrap: 'anywhere' }}>
      {value}
    </Text>
  </Group>
);

export function SessionPanel({ room }: { room: string }) {
  const { t } = useI18n();
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
    <Panel
      title={t('session.title')}
      right={
        <Group gap="xs" wrap="nowrap">
          {loading && <Loader size={13} color="gray" />}
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => void load()}
            leftSection={<Icon name="refresh" size={13} />}
          >
            {t('common.refresh')}
          </Button>
        </Group>
      }
    >
      <Box
        className="mr-scroll"
        p="sm"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {!view || !view.available ? (
          <Text size="sm" c="dimmed">
            {t('session.unavailable')}
          </Text>
        ) : (
          <>
            <Head>{t('session.title')}</Head>
            {view.context ? (
              <>
                <Group gap="xs" justify="space-between" align="baseline">
                  <Text size="sm" c="dimmed">
                    {t('session.context')}
                  </Text>
                  <Text size="sm" ff="monospace">
                    {view.context.pct}% ・ {fmtNum(view.context.used)}
                  </Text>
                </Group>
                <Progress
                  value={clampPct(view.context.pct)}
                  size="sm"
                  radius="xl"
                  color={
                    view.context.pct >= 85
                      ? 'danger'
                      : view.context.pct >= 70
                        ? 'warning'
                        : 'success'
                  }
                  aria-label={t('session.contextUsed')}
                />
                {view.context.pct >= 70 && (
                  <Text size="xs" c="warning">
                    {t('session.contextHigh', {
                      pct: view.context.pct,
                      limit: fmtNum(view.context.limit),
                    })}
                  </Text>
                )}
              </>
            ) : (
              <Text size="xs" c="dimmed">
                {t('session.contextUnknown')}
              </Text>
            )}

            <Row
              label={t('session.cost')}
              value={stats?.cost != null ? `$${Number(stats.cost).toFixed(4)}` : '—'}
            />
            {tokens && (
              <>
                <Row label={t('session.tokensIn')} value={fmtNum(tokens.input)} />
                <Row label={t('session.tokensOut')} value={fmtNum(tokens.output)} />
                <Row label={t('session.reasoning')} value={fmtNum(tokens.reasoning)} />
                <Row label={t('session.cache')} value={`${cached}%`} />
              </>
            )}
            <Row label={t('session.state')} value={stats?.outcome ?? '—'} />
            {stats?.model && <Row label={t('session.model')} value={stats.model} />}
            {view.workspace && <Row label={t('session.workspace')} value={view.workspace} />}

            {view.mcp && view.mcp.length > 0 && (
              <>
                <Head>{t('session.mcp')}</Head>
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
              <Row label={t('session.skills')} value={String(view.skills.length)} />
            )}
          </>
        )}
      </Box>
    </Panel>
  );
}
