// Rendering one part of a turn.
//
// The chat used to have one shape — a bubble of text — because stdout has one
// shape. A turn does not: it is text, thinking, and calls the agent made, and
// each of those wants to look like itself. A tool row is one line; open it to
// see what it printed, or the patch it wrote.
//
// The open/closed state is Mantine's `Collapse` behind an `UnstyledButton`, so
// the disclosure is a real button: Tab reaches it, Enter and Space work.

import { useDisclosure } from '@mantine/hooks';
import { Badge, Box, Collapse, Group, ScrollArea, Text, UnstyledButton } from '@mantine/core';
import type { DiffFile, Part } from '../lib/api.ts';
import { Markdown } from './Markdown.tsx';
import { Icon, type IconName } from './Icon.tsx';

/** A tool's name is opencode's, so the icon is a hint, not a contract. */
const ICONS: Record<string, IconName> = {
  shell: 'terminal',
  bash: 'terminal',
  read: 'file',
  write: 'pencil',
  edit: 'pencil',
  patch: 'pencil',
  glob: 'search',
  grep: 'search',
  list: 'file',
  task: 'sparkles',
  fetch: 'external',
};

function statusColor(status: 'running' | 'completed' | 'error'): string {
  if (status === 'error') return 'danger';
  if (status === 'running') return 'brand';
  return 'gray';
}

function Patch({ file }: { file: DiffFile }) {
  const lines = file.patch.split('\n');
  return (
    <Box
      style={{
        overflow: 'hidden',
        borderRadius: 'var(--mantine-radius-sm)',
        border: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <Box
        px="xs"
        py={4}
        style={{
          borderBottom: '1px solid var(--mantine-color-default-border)',
          backgroundColor: 'var(--mr-subtle)',
        }}
      >
        <Text size="xs" ff="monospace" c="dimmed">
          {file.file}
        </Text>
      </Box>
      <ScrollArea.Autosize mah={256} type="auto">
        <Box p="xs" ff="monospace" fz={11} style={{ whiteSpace: 'pre' }}>
          {lines.map((line, index) => {
            const meta = line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@');
            const added = !meta && line.startsWith('+');
            const removed = !meta && line.startsWith('-');
            return (
              <div
                key={index}
                style={{
                  padding: '0 4px',
                  color: meta
                    ? 'var(--mr-dimmed)'
                    : added
                      ? 'var(--mr-success)'
                      : removed
                        ? 'var(--mr-danger)'
                        : undefined,
                  backgroundColor: added
                    ? 'color-mix(in oklab, var(--mr-success) 10%, transparent)'
                    : removed
                      ? 'color-mix(in oklab, var(--mr-danger) 10%, transparent)'
                      : undefined,
                }}
              >
                {line || ' '}
              </div>
            );
          })}
        </Box>
      </ScrollArea.Autosize>
    </Box>
  );
}

function Disclosure({
  label,
  children,
  muted = false,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  muted?: boolean;
}) {
  const [open, { toggle }] = useDisclosure(false);
  return (
    <Box
      style={{
        borderTop: '1px solid var(--mantine-color-default-border)',
      }}
    >
      <UnstyledButton
        onClick={toggle}
        aria-expanded={open}
        w="100%"
        px="xs"
        py={4}
        style={{ borderRadius: 'var(--mantine-radius-sm)' }}
      >
        <Group gap={4} wrap="nowrap">
          <Icon name="chevron-down" size={12} />
          <Text size="xs" c="dimmed">
            {label}
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open} keepMounted>
        <Box
          p="xs"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: muted ? 0.85 : 1 }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

function ToolRow({ part }: { part: Extract<Part, { kind: 'tool' }> }) {
  const icon = ICONS[part.name] ?? 'terminal';
  const hasBody = Boolean(part.output) || part.files.length > 0;
  return (
    <Box
      data-part="tool"
      w="100%"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mr-panel)',
      }}
    >
      <Group gap="xs" px="xs" py={4} wrap="nowrap">
        <Icon name={icon} size={14} />
        <Text size="xs" ff="monospace" fw={500} style={{ flexShrink: 0 }}>
          {part.name}
        </Text>
        {part.summary && (
          <Text
            size="xs"
            ff="monospace"
            c="dimmed"
            truncate
            title={part.summary}
            style={{ minWidth: 0 }}
          >
            {part.summary}
          </Text>
        )}
        <Group gap={4} ml="auto" wrap="nowrap">
          {part.exit !== null && part.exit !== 0 && (
            <Badge size="xs" radius="sm" color="danger">
              exit {part.exit}
            </Badge>
          )}
          {part.files.length > 0 && (
            <Badge size="xs" radius="sm" color="gray" variant="light">
              {part.files.length} file{part.files.length > 1 ? 's' : ''}
            </Badge>
          )}
          <Badge
            size="xs"
            radius="sm"
            variant={part.status === 'completed' ? 'light' : 'filled'}
            color={statusColor(part.status)}
            leftSection={part.status === 'running' ? <Icon name="loader" size={10} /> : undefined}
          >
            {part.status}
          </Badge>
        </Group>
      </Group>

      {hasBody && (
        <Disclosure label={part.files.length > 0 ? 'changes' : 'output'}>
          {part.files.map((file) => (
            <Patch key={file.file} file={file} />
          ))}
          {part.output && (
            <ScrollArea.Autosize mah={256} type="auto">
              <Box
                p="xs"
                style={{
                  borderRadius: 'var(--mantine-radius-sm)',
                  border: '1px solid var(--mantine-color-default-border)',
                  backgroundColor: 'var(--mr-subtle)',
                }}
              >
                <Text size="xs" ff="monospace" style={{ whiteSpace: 'pre-wrap' }}>
                  {part.output}
                </Text>
              </Box>
            </ScrollArea.Autosize>
          )}
          {part.truncated && (
            <Text size="xs" c="dimmed">
              output was truncated
            </Text>
          )}
        </Disclosure>
      )}
    </Box>
  );
}

function Reasoning({ text }: { text: string }) {
  const [open, { toggle }] = useDisclosure(false);
  return (
    <Box
      data-part="reasoning"
      w="100%"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px dashed var(--mantine-color-default-border)',
        backgroundColor: 'var(--mr-subtle)',
      }}
    >
      <UnstyledButton onClick={toggle} aria-expanded={open} w="100%" px="xs" py={4}>
        <Group gap={6} wrap="nowrap">
          <Icon name="sparkles" size={14} />
          <Text size="xs" c="dimmed">
            reasoning
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse expanded={open} keepMounted>
        <ScrollArea.Autosize mah={256} type="auto">
          <Box px="md" pb="xs" c="dimmed">
            <Markdown source={text} />
          </Box>
        </ScrollArea.Autosize>
      </Collapse>
    </Box>
  );
}

export function PartView({ part }: { part: Part }) {
  if (part.kind === 'text') {
    return (
      <Box
        data-part="text"
        maw="95%"
        px="sm"
        py="xs"
        style={{
          borderRadius: 'var(--mantine-radius-lg)',
          border: '1px solid var(--mantine-color-default-border)',
          backgroundColor: 'var(--mr-panel)',
        }}
      >
        <Markdown source={part.text} />
      </Box>
    );
  }

  if (part.kind === 'reasoning') return <Reasoning text={part.text} />;

  return <ToolRow part={part} />;
}
