// The workshop — a Storybook without the dependency tree.
//
// Every Mantine component the tool wires up can be seen here on its own, before
// it is used for real. It is served at `/web/kit.html`, it is the same bundle as
// the room, and it needs no build of its own: add a section below when you add a
// component, and a change is still reviewable in one screenshot.
//
// The filter section is the one that matters: it renders `FacetFilter` with 1000
// candidates, so the virtualised path and its keyboard behaviour can be tried
// without a room that happens to have 1000 tags.

import { useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Pill,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import { Markdown } from './components/Markdown.tsx';
import { CopyButton } from '@mantine/core';
import { Icon, ICON_NAMES } from './components/Icon.tsx';
import { Split, SplitHandle, SplitPanel } from './components/Split.tsx';
import { ToneBadge } from './components/Status.tsx';
import { FacetFilter, SYNC_LIMIT } from './dashboard/FacetFilter.tsx';
import { ThemeToggle } from './components/ThemeToggle.tsx';
import { QuestionCard } from './components/QuestionCard.tsx';
import { AddRoomDialog } from './components/AddRoomDialog.tsx';
import { RenameRoomDialog } from './components/RenameRoomDialog.tsx';
import { DeleteRoomDialog } from './components/DeleteRoomDialog.tsx';
import { UpdateBadge, UpdateCard } from './components/UpdateNotice.tsx';
import type { Ask, Facet, RoomInfo, UpdateInfo } from './lib/api.ts';
import { useI18n } from './lib/i18n.tsx';
import { renderDoc } from './lib/markdown.ts';

const SAMPLE_CHAT = `The sign-in room is **two states**, not one:

- \`idle\` — the form, the primary action disabled until both fields are filled.
- \`error\` — the same form, with one plain sentence above it.

\`\`\`ts
export type SignInState = 'idle' | 'submitting' | 'error';
\`\`\`
`;

const SAMPLE_DOC = `# Spec

What the artifact cannot show.

| Key | Value |
| --- | --- |
| device | tablet 1024 |
| states | idle, error |

> A statement lives in one file.
`;

/** 1000 candidates: one past the point where the control virtualises. */
const BIG_FACET: Facet = {
  key: 'component',
  kind: 'array',
  control: 'checkboxes',
  values: Array.from({ length: 1000 }, (_, index) => ({
    value: `component-${String(index + 1).padStart(4, '0')}`,
    count: (index % 7) + 1,
  })),
};

/** 12 candidates: the plain `MultiSelect` path. */
const SMALL_FACET: Facet = {
  key: 'tags',
  kind: 'array',
  control: 'checkboxes',
  values: ['auth', 'form', 'error', 'empty', 'loading', 'mobile'].map((value, index) => ({
    value,
    count: index + 1,
  })),
};

const SINGLE_FACET: Facet = {
  key: 'status',
  kind: 'string',
  control: 'radio',
  values: [
    { value: 'draft', count: 4 },
    { value: 'review', count: 2 },
    { value: 'adopted', count: 1 },
  ],
};

/** What the chat docks above the composer while an agent waits for an answer. */
const SAMPLE_ASK: Ask = {
  id: 'frm_sample',
  title: 'Questions',
  questions: [
    {
      key: 'q0',
      header: 'Spacing',
      question: 'Which spacing scale should the sign-in screen use?',
      options: [
        { label: 'Compact (Recommended)', description: 'Tighter gaps, an 8px rhythm' },
        { label: 'Airy', description: 'More whitespace, a 16px rhythm' },
      ],
    },
    {
      key: 'q1',
      header: 'States',
      question: 'Which states should the room cover?',
      multiple: true,
      options: [{ label: 'Loading' }, { label: 'Error' }, { label: 'Empty' }],
    },
  ],
};

const SAMPLE_ROOM: RoomInfo = {
  name: 'checkout',
  title: 'Checkout',
  status: 'review',
  summary: 'The order review, before the payment method is asked for.',
  tags: ['form', 'payment'],
  keyPoints: [],
  version: 2,
  deprecated: false,
  updatedAt: Date.now() - 1000 * 60 * 60 * 5,
  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 12,
  device: 'tablet',
  hasArtifact: true,
  hasThumb: true,
  thumbStale: false,
  artifactUrl: '/files/rooms/checkout/index.html',
  thumbUrl: '/files/rooms/checkout/index.png',
  behaviourIds: ['@verb-1'],
};

const SAMPLE_NAMES = ['checkout', 'sign-in', 'cart'];

/** The update notice, in each state it can be in. */
const SAMPLE_UPDATE: UpdateInfo = {
  current: '0.5.0',
  latest: '0.6.0',
  available: true,
  checkedAt: Date.now(),
  enabled: true,
  command: 'npm install --save-dev modelroom@latest && npm run modelroom update',
};

const SAMPLE_CURRENT: UpdateInfo = {
  ...SAMPLE_UPDATE,
  current: '0.6.0',
  latest: '0.6.0',
  available: false,
};

const SAMPLE_OFF: UpdateInfo = { ...SAMPLE_CURRENT, latest: null, enabled: false };

function UpdateDemo() {
  return (
    <Stack gap="md">
      <Group gap="xs" align="center">
        <UpdateBadge update={SAMPLE_UPDATE} />
        <UpdateBadge update={SAMPLE_CURRENT} />
        <Text size="xs" c="dimmed">
          only the first one exists — the second says nothing
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <UpdateCard update={SAMPLE_UPDATE} />
        <Stack gap="md">
          <UpdateCard update={SAMPLE_CURRENT} />
          <UpdateCard update={SAMPLE_OFF} />
        </Stack>
      </SimpleGrid>
    </Stack>
  );
}

function DialogsDemo() {
  const { t } = useI18n();
  const [add, setAdd] = useState(false);
  const [rename, setRename] = useState(false);
  const [remove, setRemove] = useState(false);
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Button variant="default" size="compact-sm" onClick={() => setAdd(true)}>
          {t('dashboard.addRoom')}
        </Button>
        <Button variant="default" size="compact-sm" onClick={() => setRename(true)}>
          {t('room.rename')}
        </Button>
        <Button variant="default" size="compact-sm" onClick={() => setRemove(true)}>
          {t('room.remove')}
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        Try: an empty name, <Code>Sign-in</Code> (invalid), <Code>cart</Code> (taken), then a free
        name. In the delete dialog, type <Code>checkout</Code> to enable the button.
      </Text>
      <AddRoomDialog
        opened={add}
        onClose={() => setAdd(false)}
        names={SAMPLE_NAMES}
        prefix="rooms"
        onCreated={() => setAdd(false)}
      />
      <RenameRoomDialog
        opened={rename}
        onClose={() => setRename(false)}
        current="checkout"
        names={SAMPLE_NAMES}
        prefix="rooms"
        onRenamed={() => setRename(false)}
      />
      <DeleteRoomDialog
        opened={remove}
        onClose={() => setRemove(false)}
        room={SAMPLE_ROOM}
        prefix="rooms"
        onDeleted={() => setRemove(false)}
      />
    </Stack>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p="lg">
      <Title order={2} fz="sm">
        {title}
      </Title>
      {hint && (
        <Text size="xs" c="dimmed" mt={2} mb="md">
          {hint}
        </Text>
      )}
      <Box mt="sm">{children}</Box>
    </Paper>
  );
}

function FacetDemo() {
  const [big, setBig] = useState<string[]>([]);
  const [small, setSmall] = useState<string[]>(['auth']);
  const [single, setSingle] = useState<string[]>([]);
  return (
    <Stack gap="md">
      <Alert variant="light" color="info" icon={<Icon name="alert" size={14} />}>
        Over {SYNC_LIMIT} candidates renders the virtualised `Combobox`; at or under it renders
        Mantine's `MultiSelect` / `Select`. Try: focus, type <Code>0042</Code>, ↑ ↓, Enter, Esc,
        Backspace on an empty search.
      </Alert>

      <Group align="flex-start" gap="lg" wrap="wrap">
        <FacetFilter facet={BIG_FACET} selected={big} onChange={setBig} />
        <FacetFilter facet={SMALL_FACET} selected={small} onChange={setSmall} />
        <FacetFilter facet={SINGLE_FACET} selected={single} onChange={setSingle} />
      </Group>

      <Stack gap={4}>
        <Text size="xs" c="dimmed">
          What the dashboard writes to the URL:
        </Text>
        <Code block>
          {[
            big.length ? `f.component=${big.join('|')}` : null,
            small.length ? `f.tags=${small.join('|')}` : null,
            single.length ? `f.status=${single.join('|')}` : null,
          ]
            .filter(Boolean)
            .join('\n') || '(no filters)'}
        </Code>
      </Stack>
    </Stack>
  );
}

function SegmentedDemo() {
  const { t } = useI18n();
  const [value, setValue] = useState('split');
  return (
    <Group gap="md" align="center">
      <SegmentedControl
        size="xs"
        value={value}
        onChange={setValue}
        aria-label={t('docs.docView')}
        data={[
          {
            value: 'edit',
            label: (
              <>
                <Icon name="pencil" size={14} />
                <VisuallyHidden>{t('common.edit')}</VisuallyHidden>
              </>
            ),
          },
          {
            value: 'split',
            label: (
              <>
                <Icon name="columns" size={14} />
                <VisuallyHidden>{t('common.split')}</VisuallyHidden>
              </>
            ),
          },
          {
            value: 'preview',
            label: (
              <>
                <Icon name="eye" size={14} />
                <VisuallyHidden>{t('common.preview')}</VisuallyHidden>
              </>
            ),
          },
        ]}
      />
      <Text size="xs" c="dimmed" ff="monospace">
        value: {value}
      </Text>
    </Group>
  );
}

export function Kit() {
  const { t } = useI18n();
  return (
    <Box component="main" maw={1024} mx="auto" p="lg">
      <Group gap="xs" mb="lg">
        <Icon name="sparkles" size={20} />
        <Title order={1} fz="lg">
          modelroom · workshop
        </Title>
        <Group ml="auto" gap="xs">
          <ThemeToggle />
          <Button component="a" href="/" variant="subtle" color="gray" size="compact-sm">
            ← {t('common.rooms')}
          </Button>
        </Group>
      </Group>

      <Stack gap="lg">
        <Section title={t('kit.filter')} hint={t('kit.filterHint')}>
          <FacetDemo />
        </Section>

        <Section title={t('kit.icons')} hint={t('kit.iconsHint')}>
          <Group gap="md">
            {ICON_NAMES.map((name) => (
              <Stack key={name} gap={2} align="center" w={64}>
                <Icon name={name} size={20} />
                <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 10 }}>
                  {name}
                </Text>
              </Stack>
            ))}
          </Group>
        </Section>

        <Section title={t('kit.segmented')} hint={t('kit.segmentedHint')}>
          <SegmentedDemo />
        </Section>

        <Section title={t('kit.buttons')}>
          <Stack gap="md">
            <Group gap="xs">
              {(['filled', 'light', 'outline', 'subtle', 'default', 'transparent'] as const).map(
                (variant) => (
                  <Button key={variant} variant={variant} size="compact-sm">
                    {variant}
                  </Button>
                ),
              )}
            </Group>
            <Group gap="xs">
              {(
                [
                  ['default', 'brand'],
                  ['secondary', 'gray'],
                  ['outline', 'gray'],
                  ['muted', 'gray'],
                  ['success', 'success'],
                  ['warning', 'warning'],
                  ['destructive', 'danger'],
                ] as const
              ).map(([tone]) => (
                <ToneBadge key={tone} tone={tone as Parameters<typeof ToneBadge>[0]['tone']}>
                  {tone}
                </ToneBadge>
              ))}
              <Badge variant="outline" radius="sm" ff="monospace">
                v0.0.6
              </Badge>
            </Group>
            <Group gap="xs" align="center">
              <Tooltip label={t('common.refresh')} withArrow>
                <ActionIcon variant="default" size="md" aria-label={t('common.refresh')}>
                  <Icon name="refresh" size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t('room.session')} withArrow>
                <ActionIcon variant="light" color="gray" size="md" aria-label={t('room.session')}>
                  <Icon name="panel-right" size={16} />
                </ActionIcon>
              </Tooltip>
              <CopyButton value="npx modelroom serve" timeout={1200}>
                {({ copied, copy }) => (
                  <Button
                    variant="default"
                    size="compact-sm"
                    onClick={copy}
                    leftSection={<Icon name={copied ? 'check' : 'copy'} size={13} />}
                  >
                    {copied ? 'copied' : 'copy command'}
                  </Button>
                )}
              </CopyButton>
              <Button
                size="compact-sm"
                disabled
                leftSection={<Loader size={13} color="currentColor" />}
              >
                working
              </Button>
              <Loader size="sm" />
              <Pill withRemoveButton onRemove={() => undefined} size="sm">
                queued prompt
              </Pill>
            </Group>
            <Group gap="md">
              <Skeleton h={16} w={160} />
              <Skeleton h={16} w={96} />
              <Skeleton h={32} w={32} circle />
            </Group>
          </Stack>
        </Section>

        <Section title={t('kit.markdownChat')} hint={t('kit.markdownHint')}>
          <Box
            maw={672}
            p="sm"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-lg)',
            }}
          >
            <Markdown source={SAMPLE_CHAT} />
          </Box>
        </Section>

        <Section title={t('kit.markdownDoc')} hint={t('kit.docHint')}>
          <Box
            maw={672}
            p="md"
            style={{
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <Markdown source={SAMPLE_DOC} render={renderDoc} />
          </Box>
        </Section>

        <Section title={t('kit.formControls')} hint={t('kit.formHint')}>
          <SimpleGrid cols={{ base: 1, sm: 2 }} maw={672}>
            <TextInput
              label={t('settings.command')}
              placeholder="opencode"
              defaultValue="opencode"
              size="sm"
              styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
            />
            <Select
              label={t('settings.model')}
              defaultValue="default"
              size="sm"
              data={[
                { value: 'default', label: 'let the agent decide' },
                { value: 'fast', label: 'fast' },
              ]}
            />
            <MultiSelect
              label={t('kit.tags')}
              size="sm"
              data={['auth', 'form', 'error']}
              defaultValue={['auth']}
              searchable
              clearable
            />
            <Checkbox label={t('dashboard.archived', { count: 2 })} defaultChecked />
          </SimpleGrid>
        </Section>

        <Section title={t('kit.ask')} hint={t('kit.askHint')}>
          <Box maw={448}>
            <QuestionCard ask={SAMPLE_ASK} onSubmit={() => undefined} onDismiss={() => undefined} />
          </Box>
        </Section>

        <Section title={t('kit.card')} hint={t('kit.cardHint')}>
          <Card withBorder radius="md" maw={448}>
            <Text fw={600}>{t('kit.noRooms')}</Text>
            <Text size="sm" c="dimmed" mt="xs">
              {t('kit.noRoomsHint')}
            </Text>
            <Anchor href="/" size="sm" mt="sm">
              Rooms
            </Anchor>
          </Card>
        </Section>

        <Section title={t('kit.dialogs')} hint={t('kit.dialogsHint')}>
          <DialogsDemo />
        </Section>

        <Section title={t('kit.update')} hint={t('kit.updateHint')}>
          <UpdateDemo />
        </Section>

        <Section title={t('kit.split')} hint={t('kit.splitHint')}>
          <Split
            orientation="horizontal"
            style={{
              height: 112,
              overflow: 'hidden',
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <SplitPanel defaultSize="30%" minSize="15%">
              <Box
                h="100%"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  backgroundColor: 'var(--mr-subtle)',
                }}
              >
                <Text size="xs" c="dimmed">
                  chat
                </Text>
              </Box>
            </SplitPanel>
            <SplitHandle withHandle />
            <SplitPanel defaultSize="40%" minSize="15%">
              <Box h="100%" style={{ display: 'grid', placeItems: 'center' }}>
                <Text size="xs" c="dimmed">
                  docs
                </Text>
              </Box>
            </SplitPanel>
            <SplitHandle />
            <SplitPanel defaultSize="30%" minSize="15%">
              <Box
                h="100%"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  backgroundColor: 'var(--mr-subtle)',
                }}
              >
                <Text size="xs" c="dimmed">
                  artifact
                </Text>
              </Box>
            </SplitPanel>
          </Split>
        </Section>

        <Section title={t('kit.divider')}>
          <Group gap="md" h={64} align="center">
            <Text size="xs" c="dimmed">
              before
            </Text>
            <Divider orientation="vertical" />
            <Text size="xs" c="dimmed">
              after
            </Text>
          </Group>
        </Section>
      </Stack>
    </Box>
  );
}
