// The chat column: the conversation, the run log, and the composer.

import { useEffect, useRef } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  CopyButton,
  Group,
  Loader,
  ScrollArea,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import type { ChatApi, ChatMessage } from '../hooks/useChat.ts';
import { clock } from '../lib/format.ts';
import { Composer } from './Composer.tsx';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { Panel } from './Status.tsx';
import { PartView } from './parts.tsx';

const SUGGESTIONS = [
  'Tighten the spacing and the type scale.',
  'Add a loading state and an error state.',
  'Make the primary action the obvious one.',
  'Rewrite SPEC.md so it only holds what the screen cannot show.',
];

function LogBlock({ message }: { message: Extract<ChatMessage, { role: 'log' }> }) {
  return (
    <Box
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px solid var(--mantine-color-default-border)',
        backgroundColor: 'var(--mr-subtle)',
      }}
    >
      <Group gap={6} px="xs" py={4} wrap="nowrap">
        <Icon name="terminal" size={14} />
        <Text size="xs" ff="monospace" c="dimmed">
          agent log
        </Text>
        {!message.done && <Loader size={12} color="gray" />}
      </Group>
      <ScrollArea.Autosize mah={224} type="auto">
        <Text
          size="xs"
          ff="monospace"
          c="dimmed"
          px="xs"
          pb="xs"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {message.text}
        </Text>
      </ScrollArea.Autosize>
    </Box>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  if (message.role === 'log') return <LogBlock message={message} />;

  if (message.role === 'system') {
    return (
      <Text size="xs" ff="monospace" ta="center" c={message.tone === 'error' ? 'danger' : 'dimmed'}>
        {message.text}
      </Text>
    );
  }

  if (message.role === 'user') {
    return (
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Box
          maw="92%"
          px="sm"
          py="xs"
          style={{
            borderRadius: 'var(--mantine-radius-lg)',
            backgroundColor: 'var(--mantine-primary-color-filled)',
            color: 'var(--mantine-primary-color-contrast)',
          }}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {message.text}
          </Text>
        </Box>
        <Text size="xs" c="dimmed" style={{ alignSelf: 'flex-end' }}>
          {clock(message.at)}
        </Text>
      </Group>
    );
  }

  const parts = message.parts ?? [];

  return (
    <Box>
      {parts.length > 0 ? (
        <Box style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {parts.map((part, index) => (
            <PartView key={`${message.id}-${index}`} part={part} />
          ))}
        </Box>
      ) : (
        <Box
          maw="95%"
          px="sm"
          py="xs"
          style={{
            borderRadius: 'var(--mantine-radius-lg)',
            border: '1px solid var(--mantine-color-default-border)',
            backgroundColor: 'var(--mr-panel)',
          }}
        >
          <Markdown source={message.text} />
        </Box>
      )}
      <Group gap={2} mt={4} wrap="nowrap">
        <Text size="xs" c="dimmed">
          {clock(message.at)}
        </Text>
        {message.done && (
          <CopyButton value={message.text} timeout={1200}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'copied' : 'Copy reply'} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  aria-label="Copy reply"
                  onClick={copy}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={13} />
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        )}
      </Group>
    </Box>
  );
}

export function ChatPanel({
  room,
  chat,
  agentLabel,
}: {
  room: string;
  chat: ChatApi;
  agentLabel: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const element = scroller.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [chat.messages]);

  return (
    <Panel
      title={
        <Group gap={6} wrap="nowrap">
          <span>Chat</span>
          {chat.running && <Loader size={13} color="brand" />}
        </Group>
      }
      right={
        <Text size="xs" ff="monospace" c="dimmed" truncate title={agentLabel}>
          {agentLabel}
        </Text>
      }
    >
      <Box
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
        }}
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
        {chat.messages.length === 0 && (
          <Box
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              textAlign: 'center',
            }}
          >
            <ThemeIcon size={40} radius="xl" variant="light" color="brand">
              <Icon name="sparkles" size={20} />
            </ThemeIcon>
            <Text size="sm" c="dimmed" maw={240}>
              A room is one screen. Ask for the change; watch the artifact move.
            </Text>
            <Group gap={6} justify="center">
              {SUGGESTIONS.map((text) => (
                <Button
                  key={text}
                  variant="default"
                  size="compact-xs"
                  h="auto"
                  py={5}
                  px="xs"
                  styles={{
                    label: { whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.35 },
                  }}
                  onClick={() => void chat.submit(text)}
                >
                  {text}
                </Button>
              ))}
            </Group>
          </Box>
        )}
        {chat.messages.map((message) => (
          <MessageRow key={message.id} message={message} />
        ))}
      </Box>

      <Composer
        key={room}
        room={room}
        running={chat.running}
        queue={chat.queue}
        onSubmit={(text) => void chat.submit(text)}
        onRemoveQueued={chat.removeQueued}
      />
    </Panel>
  );
}
