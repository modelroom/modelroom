// The artifact column: the room's screen, at a device width, as HTML or its PNG.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  SegmentedControl,
  Text,
} from '@mantine/core';
import { postRender, type RoomInfo } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Icon } from './Icon.tsx';
import { Panel } from './Status.tsx';

const DEVICES = [
  { value: 'sp', label: 'sp 390', width: 390 },
  { value: 'tablet', label: 'tablet 1024', width: 1024 },
  { value: 'pc', label: 'pc 1280', width: 1280 },
] as const;

type Device = (typeof DEVICES)[number]['value'];
type View = 'artifact' | 'png';

const widthOf = (device: Device): number =>
  DEVICES.find((entry) => entry.value === device)?.width ?? 1024;

export function ArtifactPanel({
  room,
  roomsPath,
  artifact,
  info,
}: {
  room: string;
  roomsPath: string;
  artifact: string;
  info: RoomInfo;
}) {
  const { t } = useI18n();
  const [device, setDevice] = useState<Device>('tablet');
  const [fit, setFit] = useState(true);
  const [view, setView] = useState<View>('artifact');
  const [nonce, setNonce] = useState(() => Date.now());
  const [pngNonce, setPngNonce] = useState(() => Date.now());
  const [thumb, setThumb] = useState(info.hasThumb);
  const [busy, setBusy] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);

  const fitFrame = useCallback(() => {
    const stageEl = stage.current;
    const frameEl = frame.current;
    const innerEl = inner.current;
    if (!stageEl || !frameEl || !innerEl) return;
    const width = widthOf(device);
    const scale = fit ? Math.min(1, Math.max(0.2, (stageEl.clientWidth - 24) / width)) : 1;
    let height = 0;
    try {
      height = iframe.current?.contentDocument?.documentElement.scrollHeight ?? 0;
    } catch {
      height = 0; // cross-origin while it loads; fall back to the stage height
    }
    if (!height) height = Math.max(420, stageEl.clientHeight - 24);
    frameEl.style.width = `${width}px`;
    frameEl.style.height = `${height}px`;
    frameEl.style.transform = `scale(${scale})`;
    innerEl.style.width = `${Math.round(width * scale)}px`;
    innerEl.style.height = `${Math.round(height * scale)}px`;
  }, [device, fit]);

  useEffect(() => {
    fitFrame();
  }, [fitFrame, view]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(fitFrame);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fitFrame]);

  useServerEvent<{ room: string }>('render-done', (data) => {
    if (data.room && data.room !== room) return;
    setThumb(true);
    setPngNonce(Date.now());
  });
  useServerEvent<{ file: string }>('change', (data) => {
    const base = data.file.split('/').pop() ?? '';
    if (!data.file.startsWith(`${roomsPath}/${room}/`)) return;
    if (base === artifact) setNonce(Date.now());
    if (base === artifact.replace(/\.html?$/i, '.png')) {
      setThumb(true);
      setPngNonce(Date.now());
    }
  });

  const render = async () => {
    setBusy(true);
    try {
      await postRender(room, device);
    } finally {
      setBusy(false);
    }
  };

  const src = `/files/${roomsPath}/${room}/${artifact}?v=${nonce}`;
  const pngSrc = `/files/${roomsPath}/${room}/${artifact.replace(/\.html?$/i, '.png')}?v=${pngNonce}`;
  const rawHref = `/files/${roomsPath}/${room}/${artifact}`;

  const Empty = ({ children }: { children: React.ReactNode }) => (
    <Box
      mx="auto"
      mt={64}
      maw={380}
      p="lg"
      style={{
        borderRadius: 'var(--mantine-radius-md)',
        border: '1px dashed var(--mantine-color-default-border)',
        backgroundColor: 'var(--mr-panel)',
        textAlign: 'center',
      }}
    >
      <Text size="sm" c="dimmed">
        {children}
      </Text>
    </Box>
  );

  return (
    <Panel
      title={
        <Group gap="xs" wrap="wrap">
          <SegmentedControl
            size="xs"
            value={device}
            onChange={(value) => setDevice(value as Device)}
            data={DEVICES.map((entry) => ({ value: entry.value, label: entry.label }))}
            aria-label={t('artifact.deviceWidth')}
          />
          <Checkbox
            size="xs"
            label={t('artifact.fit')}
            checked={fit}
            onChange={(event) => setFit(event.currentTarget.checked)}
          />
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => setView(value as View)}
            data={[
              { value: 'artifact', label: t('artifact.title') },
              { value: 'png', label: t('artifact.png') },
            ]}
            aria-label={t('artifact.view')}
          />
          <Button
            size="compact-xs"
            variant="default"
            disabled={busy}
            onClick={() => void render()}
            leftSection={busy ? <Loader size={12} color="gray" /> : <Icon name="image" size={13} />}
          >
            {t('artifact.makePng')}
          </Button>
        </Group>
      }
      right={
        <Anchor href={rawHref} target="_blank" rel="noopener noreferrer" size="xs">
          <Group gap={4} wrap="nowrap">
            {t('artifact.openRaw')}
            <Icon name="external" size={13} />
          </Group>
        </Anchor>
      }
    >
      <Box
        ref={stage}
        className="mr-scroll"
        p="md"
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          backgroundColor: 'var(--mr-page)',
        }}
      >
        {!info.hasArtifact ? (
          <Empty>{t('artifact.noArtifact', { artifact })}</Empty>
        ) : view === 'artifact' ? (
          <Box ref={inner} style={{ position: 'relative' }} mx="auto">
            <Box
              ref={frame}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transformOrigin: 'top left',
                overflow: 'hidden',
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-default-border)',
                backgroundColor: 'var(--mr-panel)',
              }}
            >
              <iframe
                ref={iframe}
                src={src}
                onLoad={fitFrame}
                title={t('artifact.title')}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  border: 0,
                  backgroundColor: '#fff',
                }}
              />
            </Box>
          </Box>
        ) : thumb ? (
          <img
            src={pngSrc}
            alt={t('artifact.thumbnail')}
            style={{
              width: '100%',
              borderRadius: 'var(--mantine-radius-md)',
              border: '1px solid var(--mantine-color-default-border)',
            }}
          />
        ) : (
          <Empty>{t('artifact.noPng')}</Empty>
        )}
      </Box>
    </Panel>
  );
}
