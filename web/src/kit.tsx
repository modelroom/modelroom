// The workshop — a Storybook without the dependency tree.
//
// Every Mantine component the tool wires up can be seen here on its own, before
// it is used for real. It is served at `/ui/kit.html`, it is the same bundle as
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
import type { Facet } from './lib/api.ts';
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
  const [value, setValue] = useState('split');
  return (
    <Group gap="md" align="center">
      <SegmentedControl
        size="xs"
        value={value}
        onChange={setValue}
        aria-label="Doc view mode"
        data={[
          {
            value: 'edit',
            label: (
              <>
                <Icon name="pencil" size={14} />
                <VisuallyHidden>Edit</VisuallyHidden>
              </>
            ),
          },
          {
            value: 'split',
            label: (
              <>
                <Icon name="columns" size={14} />
                <VisuallyHidden>Edit and preview</VisuallyHidden>
              </>
            ),
          },
          {
            value: 'preview',
            label: (
              <>
                <Icon name="eye" size={14} />
                <VisuallyHidden>Preview</VisuallyHidden>
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
            ← Rooms
          </Button>
        </Group>
      </Group>

      <Stack gap="lg">
        <Section
          title="Filter — the facet control"
          hint="Mantine's provided parts: MultiSelect / Select under 500 candidates, Combobox + useVirtualizedCombobox above."
        >
          <FacetDemo />
        </Section>

        <Section
          title="Icons"
          hint="lucide-react behind a name — the tool's own set, drawn at the size the caller asks for."
        >
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

        <Section
          title="SegmentedControl"
          hint="The edit / split / preview, orientation and layout switches."
        >
          <SegmentedDemo />
        </Section>

        <Section title="Button · Badge · ActionIcon · CopyButton · Loader">
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
              <Tooltip label="refresh" withArrow>
                <ActionIcon variant="default" size="md" aria-label="refresh">
                  <Icon name="refresh" size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="session panel" withArrow>
                <ActionIcon variant="light" color="gray" size="md" aria-label="session panel">
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

        <Section
          title="Markdown — chat"
          hint="markdown-it with raw HTML disabled; code fences get a copy button; the rhythm is Mantine's Typography."
        >
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

        <Section
          title="Markdown — doc preview"
          hint="Frontmatter is split out by the panel, not here."
        >
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

        <Section
          title="Form controls"
          hint="TextInput, Checkbox, Select, MultiSelect — the settings form and the facets."
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }} maw={672}>
            <TextInput
              label="Command"
              placeholder="opencode"
              defaultValue="opencode"
              size="sm"
              styles={{ input: { fontFamily: 'var(--mr-mono)' } }}
            />
            <Select
              label="Model"
              defaultValue="default"
              size="sm"
              data={[
                { value: 'default', label: 'let the agent decide' },
                { value: 'fast', label: 'fast' },
              ]}
            />
            <MultiSelect
              label="Tags"
              size="sm"
              data={['auth', 'form', 'error']}
              defaultValue={['auth']}
              searchable
              clearable
            />
            <Checkbox label="archived (2)" defaultChecked />
          </SimpleGrid>
        </Section>

        <Section
          title="Card / surfaces"
          hint="The dashboard's room cards and the settings sections."
        >
          <Card withBorder radius="md" maw={448}>
            <Text fw={600}>No rooms yet</Text>
            <Text size="sm" c="dimmed" mt="xs">
              A room is one screen: <Code>rooms/&lt;name&gt;/</Code>.
            </Text>
            <Anchor href="/" size="sm" mt="sm">
              Rooms
            </Anchor>
          </Card>
        </Section>

        <Section
          title="Split (react-resizable-panels)"
          hint="Mantine has no split pane; the room's columns and the docs split use this one library."
        >
          <Split
            direction="horizontal"
            style={{
              height: 112,
              overflow: 'hidden',
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
            }}
          >
            <SplitPanel defaultSize={30} minSize={15}>
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
            <SplitPanel defaultSize={40} minSize={15}>
              <Box h="100%" style={{ display: 'grid', placeItems: 'center' }}>
                <Text size="xs" c="dimmed">
                  docs
                </Text>
              </Box>
            </SplitPanel>
            <SplitHandle />
            <SplitPanel defaultSize={30} minSize={15}>
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

        <Section title="Divider">
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
