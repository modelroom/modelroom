// The flow view: each app's screens, wired by `next`.
//
// React Flow draws the graph; `@dagrejs/dagre` decides where the boxes go, so a
// chain reads left to right and a branch sits under its parent. The nodes are
// Mantine's, not React Flow's — the graph is part of the tool, not a second
// design system. A click opens the room, so the diagram is also a way in.

import { useMemo } from 'react';
import { Box, Group, Paper, Text, useComputedColorScheme } from '@mantine/core';
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre';
import type { DashboardRoom } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { ToneBadge, toneForStatus } from '../components/Status.tsx';
import { buildFlows, type FlowGroup } from './flow.ts';

const NODE_W = 216;
const NODE_H = 118;

/** Small, themed connection dots: present for React Flow, not loud. */
const HANDLE_STYLE = { width: 6, height: 6, background: 'var(--mr-border)', border: 0 };

type RoomNodeData = { room: DashboardRoom };
type RoomNode = Node<RoomNodeData, 'room'>;

function RoomNodeView({ data }: NodeProps<RoomNode>) {
  const room = data.room;
  return (
    <Paper
      withBorder
      radius="md"
      p={0}
      style={{
        width: NODE_W,
        height: NODE_H,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* React Flow needs a handle at each end for an edge to have somewhere to land. */}
      <Handle type="target" position={Position.Left} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE} />
      {room.hasThumb && room.thumbUrl ? (
        <Box
          component="img"
          src={`${room.thumbUrl}?v=${room.updatedAt}`}
          alt=""
          style={{
            height: 50,
            objectFit: 'cover',
            objectPosition: 'top',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        />
      ) : null}
      <Box
        p={8}
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 4,
          minWidth: 0,
        }}
      >
        <Group gap={6} wrap="nowrap">
          <Text size="xs" fw={600} truncate style={{ minWidth: 0 }}>
            {room.title || room.name}
          </Text>
          {room.status && <ToneBadge tone={toneForStatus(room.status)}>{room.status}</ToneBadge>}
        </Group>
        <Text size="xs" ff="monospace" c="dimmed" truncate>
          rooms/{room.name}
        </Text>
      </Box>
    </Paper>
  );
}

// Defined once: React Flow warns (and re-renders) when `nodeTypes` changes identity.
const NODE_TYPES = { room: RoomNodeView };

interface LaidOut {
  group: FlowGroup;
  nodes: RoomNode[];
  edges: Edge[];
}

/** dagre wants positions; React Flow just draws them. */
function layoutGroup(group: FlowGroup, roomsByName: Map<string, DashboardRoom>): LaidOut {
  const graph = new graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 72, marginx: 8, marginy: 8 });
  for (const name of group.nodes) graph.setNode(name, { width: NODE_W, height: NODE_H });
  for (const edge of group.edges) graph.setEdge(edge.from, edge.to);
  dagreLayout(graph);

  const nodes: RoomNode[] = group.nodes.flatMap((name) => {
    const room = roomsByName.get(name);
    if (!room) return [];
    const point = graph.node(name);
    return [
      {
        id: name,
        type: 'room',
        position: { x: (point?.x ?? 0) - NODE_W / 2, y: (point?.y ?? 0) - NODE_H / 2 },
        data: { room },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
      },
    ];
  });

  const edges: Edge[] = group.edges.map((edge) => ({
    id: `${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
  }));

  return { group, nodes, edges };
}

export function FlowView({
  rooms,
  app,
  known,
}: {
  rooms: DashboardRoom[];
  /** The selected app tab, or null for every app. */
  app: string | null;
  /** Every room name: a `next` that names none is not an edge. */
  known: Set<string>;
}) {
  const { t } = useI18n();
  const colorScheme = useComputedColorScheme('light');
  const roomsByName = useMemo(() => new Map(rooms.map((room) => [room.name, room])), [rooms]);
  const groups = useMemo(() => buildFlows(rooms, known), [rooms, known]);
  const shown = useMemo(
    () => (app === null ? groups : groups.filter((group) => (group.app ?? '') === app)),
    [app, groups],
  );
  const laidOut = useMemo(
    () => shown.map((group) => layoutGroup(group, roomsByName)),
    [roomsByName, shown],
  );

  if (!laidOut.length) {
    return (
      <Paper withBorder radius="md" p="lg" maw={560}>
        <Text size="sm" c="dimmed">
          {t('dashboard.flowEmpty')}
        </Text>
      </Paper>
    );
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {laidOut.map(({ group, nodes, edges }) => (
        <Box key={group.app ?? '__none__'}>
          <Group gap="xs" mb={6} wrap="nowrap">
            <ToneBadge tone="secondary">{group.app ?? t('dashboard.appNone')}</ToneBadge>
            <Text size="xs" c="dimmed" truncate>
              {t('dashboard.flowHint')}
            </Text>
          </Group>
          <Box
            className="mr-flow"
            style={{
              height: 360,
              border: '1px solid var(--mantine-color-default-border)',
              borderRadius: 'var(--mantine-radius-md)',
              overflow: 'hidden',
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              colorMode={colorScheme}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
              onNodeClick={(_event, node) =>
                window.location.assign(`/rooms/${encodeURIComponent(node.id)}`)
              }
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
