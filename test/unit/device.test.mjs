import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  BUILTIN_DEVICES,
  DEFAULT_DEVICE,
  isDeviceName,
  listDevices,
  normalizeDevices,
  resolveDevice,
  resolveDeviceName,
} from '../../core/device.ts';

test('the built-in devices are a phone, a tablet and a desktop, with a height', () => {
  assert.deepEqual(resolveDevice(undefined, 'sp'), {
    name: 'sp',
    width: 390,
    height: 844,
    rotated: false,
  });
  assert.deepEqual(resolveDevice(undefined, 'pc'), {
    name: 'pc',
    width: 1280,
    height: 800,
    rotated: false,
  });
  // No name, or one that does not exist, resolves to the default.
  assert.equal(resolveDevice(undefined).name, DEFAULT_DEVICE);
  assert.equal(resolveDevice(undefined, 'tv').name, DEFAULT_DEVICE);
  assert.equal(resolveDevice(undefined, '').name, DEFAULT_DEVICE);
});

test('a project names its own devices and may redefine a built-in', () => {
  const devices = normalizeDevices({
    kiosk: { width: 1024, height: 768, rotated: false },
    phone: { width: 360, height: 800, rotated: true },
    tablet: { width: 834, height: 1112 }, // the project's tablet, not the built-in
    bad: { width: 'wide', height: 10 },
    nope: { width: -1, height: 10 },
    'not a name': { width: 10, height: 10 },
  });
  assert.ok(Object.hasOwn(BUILTIN_DEVICES, 'sp'), 'built-ins are kept');
  assert.deepEqual(devices.kiosk, { width: 1024, height: 768, rotated: false });
  assert.deepEqual(devices.tablet, { width: 834, height: 1112, rotated: false });
  assert.equal(devices.bad, undefined);
  assert.equal(devices.nope, undefined);
  assert.equal(devices['not a name'], undefined);
});

test('a rotated device swaps its width and height', () => {
  const devices = normalizeDevices({ kiosk: { width: 1024, height: 768, rotated: true } });
  assert.deepEqual(resolveDevice(devices, 'kiosk'), {
    name: 'kiosk',
    width: 768,
    height: 1024,
    rotated: true,
  });
});

test('a name resolves in order: explicit, then room, then project', () => {
  const devices = normalizeDevices({ kiosk: { width: 1024, height: 768 } });
  assert.equal(
    resolveDeviceName(devices, 'pc', 'kiosk', 'tablet'),
    'pc',
    'the explicit choice wins',
  );
  assert.equal(resolveDeviceName(devices, undefined, 'kiosk', 'tablet'), 'kiosk');
  assert.equal(resolveDeviceName(devices, 'gone', null, 'tablet'), 'tablet');
  assert.equal(resolveDeviceName(devices, 'gone', undefined), DEFAULT_DEVICE);
});

test('the picker lists the built-ins first, then the project’s own', () => {
  const devices = normalizeDevices({ kiosk: { width: 1024, height: 768 } });
  assert.deepEqual(
    listDevices(devices).map((d) => d.name),
    ['sp', 'tablet', 'pc', 'kiosk'],
  );
  assert.equal(isDeviceName(devices, 'kiosk'), true);
  assert.equal(isDeviceName(devices, 'nope'), false);
  assert.equal(isDeviceName(undefined, 'sp'), true);
});
