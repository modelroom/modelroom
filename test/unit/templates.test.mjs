import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readTemplate, ROOM_FILES, SKILLS } from '../../core/templates.ts';
import { LANGS } from '../../i18n/lang.ts';

const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates');

test('every language ships the agent instructions and every room file', async () => {
  for (const lang of LANGS) {
    const agents = await readFile(join(templatesDir, lang, 'AGENTS.md'), 'utf8');
    assert.ok(agents.length > 100, `${lang}/AGENTS.md is not empty`);
    const design = await readFile(join(templatesDir, lang, 'DESIGN.md'), 'utf8');
    assert.ok(design.length > 100, `${lang}/DESIGN.md is not empty`);
    for (const file of ROOM_FILES) {
      const text = await readFile(join(templatesDir, lang, 'room', file), 'utf8');
      assert.ok(text.length > 50, `${lang}/room/${file} is not empty`);
    }
  }
});

test('the Japanese room templates keep the machine-facing keys in English', async () => {
  const brief = await readFile(join(templatesDir, 'ja', 'room', 'BRIEF.md'), 'utf8');
  assert.match(brief, /^---\ntitle: \{\{room\}\}\nstatus: draft\n/);
  assert.doesNotMatch(brief, /^status: 下書き/m);
  const behaviour = await readFile(join(templatesDir, 'ja', 'room', 'BEHAVIOUR.md'), 'utf8');
  assert.match(behaviour, /@first-1/);
  const artifact = await readFile(join(templatesDir, 'ja', 'room', 'index.html'), 'utf8');
  assert.match(artifact, /<html lang="ja">/);
});

test('the config template is filled in, not copied with placeholders left', async () => {
  const raw = await readFile(join(templatesDir, 'modelroom.json'), 'utf8');
  for (const placeholder of ['{{rooms}}', '{{state}}', '{{lang}}']) {
    assert.ok(raw.includes(placeholder), `config template has ${placeholder}`);
  }
  assert.ok(raw.includes('"thumbnail"'), 'config template names the snapshot device');
});

test('every language ships the skills, with a name and a description', async () => {
  for (const lang of LANGS) {
    for (const id of SKILLS) {
      const text = await readFile(join(templatesDir, lang, 'skills', id, 'SKILL.md'), 'utf8');
      assert.match(text, /^---\nname: /, `${lang}/skills/${id} has frontmatter`);
      assert.match(text, /\ndescription:/, `${lang}/skills/${id} has a description`);
      assert.match(text, /\{\{cli\}\} render/, `${lang}/skills/${id} names the render command`);
    }
  }
});

test('the generated files defer the command to the project, not to a hardcoded npx', async () => {
  for (const lang of LANGS) {
    const files = ['AGENTS.md', ...SKILLS.map((id) => join('skills', id, 'SKILL.md'))];
    for (const file of files) {
      const text = await readFile(join(templatesDir, lang, file), 'utf8');
      assert.doesNotMatch(text, /npx modelroom/, `${lang}/${file} has no hardcoded npx`);
      assert.match(text, /\{\{cli\}\}/, `${lang}/${file} uses {{cli}}`);
    }
  }
});

test('readTemplate falls back to English for a language that is not shipped', async () => {
  const text = await readTemplate(templatesDir, 'fr', join('room', 'BRIEF.md'));
  assert.match(text, /One sentence the next person can decide from/);
});
