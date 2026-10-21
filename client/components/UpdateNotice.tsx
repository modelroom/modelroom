// A newer modelroom, said once — and never installed for you.
//
// Two shapes, one meaning. `UpdateBadge` sits in the dashboard's header and is
// there only when something is worth saying; `UpdateCard` is the settings page's
// About, which is also the one place that explains a check that is switched off.
// In both, the payload is the command: the version is modelroom's own, so the
// notice has nothing else it could usefully do. Updating is a decision, and it
// happens in a terminal where the package manager's output can be read.

import { useState } from 'react';
import { Box, Button, Card, Code, CopyButton, Group, Modal, Stack, Text } from '@mantine/core';
import { Icon } from './Icon.tsx';
import { ToneBadge } from './Status.tsx';
import { useI18n } from '../lib/i18n.tsx';
import type { UpdateInfo } from '../lib/api.ts';

/** The command, and what running it does. The whole content of the notice. */
function UpdateCommand({ update }: { update: UpdateInfo }) {
  const { t } = useI18n();
  return (
    <Stack gap="sm">
      <Text size="sm">
        {t('update.available', { latest: update.latest ?? '', current: update.current })}
      </Text>
      <Box>
        <Text size="xs" c="dimmed" mb={4}>
          {t('update.command')}
        </Text>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <Code block style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {update.command}
          </Code>
          <CopyButton value={update.command} timeout={1200}>
            {({ copied, copy }) => (
              <Button
                variant="default"
                size="compact-sm"
                onClick={copy}
                leftSection={<Icon name={copied ? 'check' : 'copy'} size={13} />}
              >
                {copied ? t('common.copied') : t('update.copyCommand')}
              </Button>
            )}
          </CopyButton>
        </Group>
      </Box>
      <Text size="xs" c="dimmed">
        {t('update.hint')}
      </Text>
    </Stack>
  );
}

/** The dashboard's header: nothing at all until there is something to say. */
export function UpdateBadge({ update }: { update: UpdateInfo | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!update?.available) return null;
  return (
    <>
      <Button
        variant="default"
        size="compact-sm"
        leftSection={<Icon name="sparkles" size={14} />}
        onClick={() => setOpen(true)}
      >
        {t('update.badge', { latest: update.latest ?? '' })}
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title={t('update.title')}
        centered
        size="lg"
      >
        <UpdateCommand update={update} />
      </Modal>
    </>
  );
}

/** The settings page: the version always, the update when there is one. */
export function UpdateCard({ update }: { update: UpdateInfo | null }) {
  const { t } = useI18n();
  if (!update) return null;
  return (
    <Card withBorder radius="md">
      <Stack gap="sm">
        <Text fw={600}>{t('update.about')}</Text>
        <Group gap="xs" wrap="wrap">
          <ToneBadge tone="outline" ff="monospace">
            {t('update.current', { current: update.current })}
          </ToneBadge>
          {update.available ? (
            <ToneBadge tone="warning">{t('update.title')}</ToneBadge>
          ) : update.latest ? (
            <ToneBadge tone="success">{t('update.upToDate')}</ToneBadge>
          ) : null}
        </Group>
        {update.available && <UpdateCommand update={update} />}
        <Text size="xs" c="dimmed">
          {update.enabled ? t('update.checkOn') : t('update.off')}
        </Text>
      </Stack>
    </Card>
  );
}
