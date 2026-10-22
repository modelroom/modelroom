// The artifact column: the room's screen, at a device width, as HTML or its PNG.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  SegmentedControl,
  Text,
  Tooltip,
} from '@mantine/core';
import { postRender, type DeviceInfo, type RoomInfo } from '../lib/api.ts';
import { useI18n } from '../lib/i18n.tsx';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Icon } from './Icon.tsx';
import { Panel } from './Status.tsx';

type View = 'artifact' | 'png';

export function ArtifactPanel({
  room,
  roomsPath,
  artifact,
  info,
  snapshotDevice,
  devices,
}: {
  room: string;
  roomsPath: string;
  artifact: string;
  info: RoomInfo;
  /** The device this room's snapshot uses; "make png" starts here. */
  snapshotDevice: string;
  /** Every device the project knows, built-ins first. */
  devices: DeviceInfo[];
}) {
  const { t } = useI18n();
  const [device, setDevice] = useState<string>(snapshotDevice);
  const [fit, setFit] = useState(true);
  const [view, setView] = useState<View>('artifact');
  const [nonce, setNonce] = useState(() => Date.now());
  const [pngNonce, setPngNonce] = useState(() => Date.now());
  const [thumb, setThumb] = useState(info.hasThumb);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  /** True once a link inside the artifact moved the frame off this room's screen. */
  const [navigated, setNavigated] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const iframe = useRef<HTMLIFrameElement>(null);

  const widthOf = useCallback(
    (name: string): number => devices.find((entry) => entry.name === name)?.width ?? 1024,
    [devices],
  );

  // The room can change the device it renders at; follow it.
  useEffect(() => {
    setDevice(snapshotDevice);
  }, [snapshotDevice, room]);

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
  }, [device, fit, widthOf]);

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

  // Leaving for another room starts over: this room's screen, not the last click's.
  useEffect(() => {
    setNavigated(false);
    setExpanded(false);
  }, [room]);

  // Escape leaves the maximised view, the way it leaves a modal.
  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  // A link in the artifact can walk to another room's screen. The frame follows
  // it; the panel says so, and offers the way back to this room's own screen.
  const onFrameLoad = useCallback(() => {
    fitFrame();
    try {
      const path = iframe.current?.contentWindow?.location.pathname ?? '';
      setNavigated(Boolean(path) && path !== `/files/${roomsPath}/${room}/${artifact}`);
    } catch {
      setNavigated(true); // cross-origin: it certainly left
    }
  }, [artifact, fitFrame, room, roomsPath]);

  const resetArtifact = useCallback(() => {
    setNavigated(false);
    setNonce(Date.now());
  }, []);

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
            onChange={(value) => setDevice(value)}
            data={devices.map((entry) => ({
              value: entry.name,
              label: `${entry.name} ${entry.width}×${entry.height}`,
            }))}
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
          {navigated && (
            <Button
              size="compact-xs"
              variant="light"
              color="gray"
              onClick={resetArtifact}
              leftSection={<Icon name="arrow-left" size={13} />}
            >
              {t('artifact.backToArtifact')}
            </Button>
          )}
          <Tooltip label={expanded ? t('artifact.minimize') : t('artifact.maximize')} withArrow>
            <ActionIcon
              variant={expanded ? 'light' : 'default'}
              color="gray"
              size="md"
              aria-label={expanded ? t('artifact.minimize') : t('artifact.maximize')}
              aria-pressed={expanded}
              onClick={() => setExpanded((open) => !open)}
            >
              <Icon name={expanded ? 'minimize' : 'maximize'} size={15} />
            </ActionIcon>
          </Tooltip>
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
          position: expanded ? 'fixed' : 'relative',
          inset: expanded ? 0 : undefined,
          zIndex: expanded ? 300 : undefined,
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          backgroundColor: 'var(--mr-page)',
        }}
      >
        {expanded && (
          <Group gap="xs" style={{ position: 'fixed', top: 12, right: 12, zIndex: 301 }}>
            {navigated && (
              <Button
                size="compact-xs"
                variant="default"
                onClick={resetArtifact}
                leftSection={<Icon name="arrow-left" size={13} />}
              >
                {t('artifact.backToArtifact')}
              </Button>
            )}
            <ActionIcon
              variant="default"
              size="md"
              aria-label={t('artifact.minimize')}
              onClick={() => setExpanded(false)}
            >
              <Icon name="minimize" size={15} />
            </ActionIcon>
          </Group>
        )}
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
                onLoad={onFrameLoad}
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
          <Box>
            {info.thumbStale && (
              <Text size="xs" c="dimmed" mb={6}>
                {t('artifact.stale')}
              </Text>
            )}
            <img
              src={pngSrc}
              alt={t('artifact.thumbnail')}
              style={{
                width: '100%',
                borderRadius: 'var(--mantine-radius-md)',
                border: '1px solid var(--mantine-color-default-border)',
              }}
            />
          </Box>
        ) : (
          <Empty>{t('artifact.noPng')}</Empty>
        )}
      </Box>
    </Panel>
  );
}
