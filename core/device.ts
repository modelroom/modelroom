// modelroom — devices
//
// A snapshot is a screen at a device: a width and a height, sometimes rotated.
// Three built-ins cover the phone, the tablet and the desktop; a project may name
// its own in `modelroom.json`, and a room may pick one in its frontmatter. Every
// consumer — the CLI, the background pass, the render button, the check — asks
// this file for the same resolved spec, so a snapshot is never rendered at one
// device and compared at another.

export interface DeviceSpec {
  /** CSS pixels, portrait orientation. */
  width: number;
  height: number;
  /** Render the device sideways: width and height swap at resolve time. */
  rotated?: boolean;
}

export interface ResolvedDevice {
  name: string;
  width: number;
  height: number;
  rotated: boolean;
}

export const BUILTIN_DEVICES = {
  sp: { width: 390, height: 844 },
  tablet: { width: 1024, height: 768 },
  pc: { width: 1280, height: 800 },
} satisfies Record<string, DeviceSpec>;

export type Device = keyof typeof BUILTIN_DEVICES;
export const DEFAULT_DEVICE: Device = 'tablet';

/** Every device a project knows: the built-ins, plus whatever it named. */
export type DeviceRegistry = Record<string, DeviceSpec>;

// A name is what `--device`, frontmatter and `modelroom.json` all spell, so it
// stays a single token: no spaces, no punctuation that a shell would eat.
const NAME = /^[a-z0-9][a-z0-9_-]*$/i;

/** A valid spec, or `null` when the entry cannot describe a screen. */
function specOf(value: unknown): DeviceSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { width, height, rotated } = value as Record<string, unknown>;
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return null;
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return null;
  if (rotated !== undefined && typeof rotated !== 'boolean') return null;
  return { width: Math.round(width), height: Math.round(height), rotated: rotated === true };
}

/**
 * The built-ins plus the project's own names. A bad entry is dropped rather than
 * failing the load; a built-in name may be redefined (a project's tablet is its
 * own tablet), which is why the merge goes built-ins first.
 */
export function normalizeDevices(raw: unknown): DeviceRegistry {
  const out: DeviceRegistry = { ...BUILTIN_DEVICES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (!NAME.test(name)) continue;
    const spec = specOf(value);
    if (spec) out[name] = spec;
  }
  return out;
}

export const isDeviceName = (
  devices: DeviceRegistry | undefined,
  value: unknown,
): value is string => typeof value === 'string' && Object.hasOwn(devices ?? BUILTIN_DEVICES, value);

/** The first name that exists, else the default: explicit > room > project. */
export function resolveDeviceName(
  devices: DeviceRegistry | undefined,
  ...names: Array<string | null | undefined>
): string {
  for (const name of names) if (isDeviceName(devices, name)) return name;
  return DEFAULT_DEVICE;
}

/** One device, with rotation applied — what a renderer (or the browser) uses. */
export function resolveDevice(
  devices: DeviceRegistry | undefined,
  ...names: Array<string | null | undefined>
): ResolvedDevice {
  const registry: DeviceRegistry = devices ?? { ...BUILTIN_DEVICES };
  const chosen = resolveDeviceName(registry, ...names);
  const spec: DeviceSpec = registry[chosen] ?? BUILTIN_DEVICES[DEFAULT_DEVICE];
  const rotated = spec.rotated === true;
  return {
    name: chosen,
    width: rotated ? spec.height : spec.width,
    height: rotated ? spec.width : spec.height,
    rotated,
  };
}

/** Every device, built-ins first — the order the browser's picker shows. */
export function listDevices(devices: DeviceRegistry | undefined): ResolvedDevice[] {
  const registry: DeviceRegistry = devices ?? { ...BUILTIN_DEVICES };
  return Object.keys(registry).map((name) => resolveDevice(registry, name));
}
