// Settings: how modelroom talks to your agent. Committed defaults live in
// `modelroom.json`; anything saved here is kept locally in `.modelroom/state.json`.

import { useEffect, useState } from 'react';
import {
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { getRooms, postSettings, type RoomConfig } from '../lib/api.ts';
import { clock } from '../lib/format.ts';
import { Icon } from '../components/Icon.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

const ADAPTERS = [
  { value: 'opencode', label: 'opencode — OpenCode CLI (sessions, model, agent)' },
  { value: 'command', label: 'command — any CLI, with args containing {prompt} and {session}' },
];

export function SettingsApp() {
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [adapter, setAdapter] = useState('opencode');
  const [command, setCommand] = useState('');
  const [agent, setAgent] = useState('');
  const [model, setModel] = useState('');
  const [standalone, setStandalone] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void (async () => {
      const data = await getRooms().catch(() => null);
      if (!data?.config) return;
      const cfg = data.config;
      setConfig(cfg);
      setAdapter(cfg.agent.adapter);
      setCommand(cfg.agent.command ?? '');
      setAgent(cfg.agent.agent ?? '');
      setModel(cfg.agent.model ?? '');
      setStandalone(cfg.agent.standalone);
    })();
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await postSettings({
        adapter,
        command: command.trim(),
        agent: agent.trim(),
        model: model.trim(),
        standalone,
      });
      if (result.config) setConfig(result.config);
      setFailed(Boolean(result.error));
      setSaved(result.error ? `failed: ${result.error}` : `saved ${clock()}`);
    } catch {
      setFailed(true);
      setSaved('failed: could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell header={{ height: 48 }} padding={0}>
      <AppShell.Header>
        <Group h="100%" gap="sm" px="md" wrap="nowrap">
          <Button
            component="a"
            href="/"
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<Icon name="arrow-left" size={15} />}
          >
            Rooms
          </Button>
          <Title order={1} fz="md" fw={600}>
            Settings
          </Title>
          <Box ml="auto">
            <ThemeToggle />
          </Box>
        </Group>
      </AppShell.Header>

      <AppShell.Main style={{ backgroundColor: 'var(--mr-page)' }}>
        <Stack gap="md" maw={720} mx="auto" p="md">
          <Card withBorder radius="md">
            <Stack gap="md">
              <Box>
                <Text fw={600}>Agent</Text>
                <Text size="sm" c="dimmed">
                  modelroom drives the agent you already use. Nothing here is sent anywhere by
                  modelroom itself.
                </Text>
              </Box>

              <Select
                label="Adapter"
                data={ADAPTERS}
                value={adapter}
                onChange={(value) => setAdapter(value ?? 'opencode')}
                allowDeselect={false}
                size="sm"
              />

              <Group grow align="flex-end">
                <TextInput
                  label="Command"
                  value={command}
                  onChange={(event) => setCommand(event.currentTarget.value)}
                  placeholder="opencode"
                  styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                  size="sm"
                />
                <TextInput
                  label="Agent name"
                  value={agent}
                  onChange={(event) => setAgent(event.currentTarget.value)}
                  placeholder="build"
                  styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                  size="sm"
                />
              </Group>

              <TextInput
                label="Model"
                description="optional — many agents fail on an unset default"
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
                placeholder="e.g. openrouter/deepseek/deepseek-v4.1-flash"
                styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                size="sm"
              />

              <Checkbox
                checked={standalone}
                onChange={(event) => setStandalone(event.currentTarget.checked)}
                label="Run the agent against its own server, using this process's environment (opencode)"
              />

              <Group gap="sm">
                <Button
                  size="compact-sm"
                  onClick={() => void submit()}
                  disabled={saving}
                  leftSection={saving ? <Loader size={13} color="currentColor" /> : undefined}
                >
                  Save
                </Button>
                {saved && (
                  <Text size="sm" c={failed ? 'danger' : 'dimmed'}>
                    {saved}
                  </Text>
                )}
              </Group>
            </Stack>
          </Card>

          <Card withBorder radius="md">
            <Stack gap="sm">
              <Text fw={600}>Config</Text>
              {config ? (
                <>
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="outline" radius="sm" ff="monospace">
                      root {config.root}
                    </Badge>
                    <Badge variant="outline" radius="sm" ff="monospace">
                      rooms {config.rooms}/
                    </Badge>
                    <Badge variant="outline" radius="sm" ff="monospace">
                      artifact {config.artifact}
                    </Badge>
                  </Group>
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      agent {config.agent.adapter}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      command {config.agent.command}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      agent name {config.agent.agent || '-'}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      model {config.agent.model || 'default'}
                    </Badge>
                  </Group>
                </>
              ) : (
                <Group gap="xs" c="dimmed">
                  <Loader size="xs" />
                  <Text size="sm">loading…</Text>
                </Group>
              )}
              <Text size="xs" c="dimmed">
                Committed settings live in <Code>modelroom.json</Code>. Anything you save here is
                kept locally in <Code>.modelroom/state.json</Code> (git-ignored). Editable room
                files are: <Code>{(config?.docs ?? []).join(', ')}</Code>.
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md">
            <Stack gap="xs">
              <Text fw={600}>Thumbnails</Text>
              <Alert variant="light" color="info" icon={<Icon name="image" size={14} />}>
                Rendering an artifact to PNG needs Playwright and a browser:{' '}
                <Code>npm i -D playwright &amp;&amp; npx playwright install chromium</Code>.
                modelroom works without it — rooms simply show no thumbnail.
              </Alert>
            </Stack>
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
