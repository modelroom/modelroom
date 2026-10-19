// modelroom — where the package lives
//
// Works from source (`bin/`, `server/`, `core/`, `shared/`) and from the published
// layout (`dist/bin`, `dist/server`, …) alike: walk up until the directory that holds
// package.json.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findPackageRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
