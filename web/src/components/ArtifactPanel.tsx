// The artifact column: the room's screen, at a device width, as HTML or its PNG.

import { useCallback, useEffect, useRef, useState } from 'react';
import { postRender, type RoomInfo } from '../lib/api.ts';
import { useServerEvent } from '../hooks/useServerEvents.tsx';
import { Button } from './ui/button.tsx';
import { Icon } from './ui/Icon.tsx';
import { Segmented } from './ui/Segmented.tsx';

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

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Segmented
          value={device}
          onChange={setDevice}
          options={DEVICES.map((entry) => ({ value: entry.value, label: entry.label }))}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={fit}
            onChange={(event) => setFit(event.target.checked)}
          />
          fit
        </label>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'artifact', label: 'artifact' },
            { value: 'png', label: 'png' },
          ]}
        />
        <Button variant="outline" size="xs" disabled={busy} onClick={() => void render()}>
          <Icon
            name={busy ? 'loader' : 'image'}
            className={busy ? 'size-3.5 animate-spin' : 'size-3.5'}
          />
          make png
        </Button>
        <Button variant="ghost" size="xs" className="ml-auto" asChild>
          <a
            href={`/files/${roomsPath}/${room}/${artifact}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            open raw
            <Icon name="external" className="size-3.5" />
          </a>
        </Button>
      </header>

      <div ref={stage} className="mr-scroll relative flex-1 overflow-auto bg-muted/20 p-3">
        {!info.hasArtifact ? (
          <div className="mx-auto mt-16 max-w-sm rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No artifact yet — <span className="font-mono">{artifact}</span>. Ask the agent to create
            it.
          </div>
        ) : view === 'artifact' ? (
          <div ref={inner} className="relative mx-auto">
            <div
              ref={frame}
              className="absolute top-0 left-0 origin-top-left overflow-hidden rounded-lg border border-border bg-card shadow-sm"
            >
              <iframe
                ref={iframe}
                src={src}
                onLoad={fitFrame}
                title="artifact"
                className="block h-full w-full border-0 bg-white"
              />
            </div>
          </div>
        ) : thumb ? (
          <img
            src={pngSrc}
            alt="artifact thumbnail"
            className="w-full rounded-lg border border-border bg-card"
          />
        ) : (
          <div className="mx-auto mt-16 max-w-sm rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No PNG yet. Use “make png” — it needs Playwright.
          </div>
        )}
      </div>
    </section>
  );
}
