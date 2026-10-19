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
import { useI18n } from '../lib/i18n.tsx';
import { Icon } from '../components/Icon.tsx';
import { ThemeToggle } from '../components/ThemeToggle.tsx';

export function SettingsApp() {
  const { lang, t } = useI18n();
  const adapters = [
    { value: 'opencode', label: t('settings.adapter.opencode') },
    { value: 'command', label: t('settings.adapter.command') },
  ];
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
      setSaved(
        result.error
          ? t('settings.failed', { error: result.error })
          : t('settings.saved', { time: clock(Date.now(), lang) }),
      );
    } catch {
      setFailed(true);
      setSaved(t('settings.couldNotReach'));
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
            {t('common.rooms')}
          </Button>
          <Title order={1} fz="md" fw={600}>
            {t('settings.title')}
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
                <Text fw={600}>{t('settings.agent')}</Text>
                <Text size="sm" c="dimmed">
                  {t('settings.agentHint')}
                </Text>
              </Box>

              <Select
                label={t('settings.adapter')}
                data={adapters}
                value={adapter}
                onChange={(value) => setAdapter(value ?? 'opencode')}
                allowDeselect={false}
                size="sm"
              />

              <Group grow align="flex-end">
                <TextInput
                  label={t('settings.command')}
                  value={command}
                  onChange={(event) => setCommand(event.currentTarget.value)}
                  placeholder="opencode"
                  styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                  size="sm"
                />
                <TextInput
                  label={t('settings.agentName')}
                  value={agent}
                  onChange={(event) => setAgent(event.currentTarget.value)}
                  placeholder="build"
                  styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                  size="sm"
                />
              </Group>

              <TextInput
                label={t('settings.model')}
                description={t('settings.modelDescription')}
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
                placeholder="e.g. openrouter/deepseek/deepseek-v4.1-flash"
                styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
                size="sm"
              />

              <Checkbox
                checked={standalone}
                onChange={(event) => setStandalone(event.currentTarget.checked)}
                label={t('settings.standalone')}
              />

              <Group gap="sm">
                <Button
                  size="compact-sm"
                  onClick={() => void submit()}
                  disabled={saving}
                  leftSection={saving ? <Loader size={13} color="currentColor" /> : undefined}
                >
                  {t('common.save')}
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
              <Text fw={600}>{t('settings.config')}</Text>
              {config ? (
                <>
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="outline" radius="sm" ff="monospace">
                      {t('settings.root', { root: config.root })}
                    </Badge>
                    <Badge variant="outline" radius="sm" ff="monospace">
                      {t('settings.rooms', { rooms: config.rooms })}
                    </Badge>
                    <Badge variant="outline" radius="sm" ff="monospace">
                      {t('settings.artifact', { artifact: config.artifact })}
                    </Badge>
                    <Badge variant="outline" radius="sm" ff="monospace">
                      {t('settings.language', { lang: config.lang })}
                    </Badge>
                  </Group>
                  <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      {t('settings.adapterLine', { adapter: config.agent.adapter })}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      {t('settings.commandLine', { command: config.agent.command })}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      {t('settings.agentLine', { agent: config.agent.agent || '-' })}
                    </Badge>
                    <Badge variant="light" color="gray" radius="sm" ff="monospace">
                      {t('settings.modelLine', {
                        model: config.agent.model || t('settings.default'),
                      })}
                    </Badge>
                  </Group>
                </>
              ) : (
                <Group gap="xs" c="dimmed">
                  <Loader size="xs" />
                  <Text size="sm">{t('common.loading')}</Text>
                </Group>
              )}
              <Text size="xs" c="dimmed">
                {t('settings.configHint', {
                  path: 'modelroom.json',
                  state: '.modelroom/state.json',
                  docs: (config?.docs ?? []).join(', '),
                })}
              </Text>
            </Stack>
          </Card>

          <Card withBorder radius="md">
            <Stack gap="xs">
              <Text fw={600}>{t('settings.thumbnails')}</Text>
              <Alert variant="light" color="info" icon={<Icon name="image" size={14} />}>
                {t('settings.thumbnailsAlert', {
                  command: 'npm i -D playwright && npx playwright install chromium',
                })}
              </Alert>
            </Stack>
          </Card>
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
