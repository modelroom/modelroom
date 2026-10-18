// Settings: how modelroom talks to your agent. Committed defaults live in
// `modelroom.json`; anything saved here is kept locally in `.modelroom/state.json`.

import { useEffect, useState } from 'react';
import { getRooms, postSettings, type RoomConfig } from '../lib/api.ts';
import { clock } from '../lib/format.ts';
import { ThemeToggle } from '../components/ThemeToggle.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Icon } from '../components/ui/Icon.tsx';
import { Input } from '../components/ui/input.tsx';
import { Select } from '../components/ui/select.tsx';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {hint && <span className="ml-1 font-normal text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
);

export function SettingsApp() {
  const [config, setConfig] = useState<RoomConfig | null>(null);
  const [adapter, setAdapter] = useState('opencode');
  const [command, setCommand] = useState('');
  const [agent, setAgent] = useState('');
  const [model, setModel] = useState('');
  const [standalone, setStandalone] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const data = await getRooms().catch(() => null);
      if (!data?.config) return;
      const cfg = data.config;
      setConfig(cfg);
      setAdapter(cfg.agent.adapter);
      setCommand(cfg.agent.command ?? '');
      setAgent(cfg.agent.agent ?? '');
      setModel(cfg.agent.model ?? '');
      setStandalone(cfg.agent.standalone);
    })();
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await postSettings({
        adapter,
        command: command.trim(),
        agent: agent.trim(),
        model: model.trim(),
        standalone,
      });
      if (result.config) setConfig(result.config);
      setSaved(result.error ? `failed: ${result.error}` : `saved ${clock()}`);
    } catch {
      setSaved('failed: could not reach the server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-12 items-center gap-3 border-b border-border bg-card px-4">
        <Button variant="ghost" size="sm" asChild>
          <a href="/">
            <Icon name="arrow-left" className="size-4" />
            Rooms
          </a>
        </Button>
        <span className="font-semibold">Settings</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
        <Card>
          <CardHeader>
            <CardTitle>Agent</CardTitle>
            <p className="text-sm text-muted-foreground">
              modelroom drives the agent you already use. Nothing here is sent anywhere by modelroom
              itself.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Adapter">
              <Select value={adapter} onChange={(event) => setAdapter(event.target.value)}>
                <option value="opencode">opencode — OpenCode CLI (sessions, model, agent)</option>
                <option value="command">
                  command — any CLI, with args containing {'{prompt}'} and {'{session}'}
                </option>
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Command">
                <Input
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="opencode"
                  className="font-mono"
                />
              </Field>
              <Field label="Agent name">
                <Input
                  value={agent}
                  onChange={(event) => setAgent(event.target.value)}
                  placeholder="build"
                  className="font-mono"
                />
              </Field>
            </div>

            <Field label="Model" hint="(optional — many agents fail on an unset default)">
              <Input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder="e.g. openrouter/deepseek/deepseek-v4.1-flash"
                className="font-mono"
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={standalone}
                onCheckedChange={(checked) => setStandalone(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-muted-foreground">
                Run the agent against its own server, using this process's environment (opencode)
              </span>
            </label>

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => void submit()} disabled={saving}>
                {saving && <Icon name="loader" className="size-3.5 animate-spin" />}
                Save
              </Button>
              {saved && <span className="text-sm text-muted-foreground">{saved}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Config</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {config ? (
              <>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <Badge variant="outline">root {config.root}</Badge>
                  <Badge variant="outline">rooms {config.rooms}/</Badge>
                  <Badge variant="outline">artifact {config.artifact}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <Badge variant="secondary">agent {config.agent.adapter}</Badge>
                  <Badge variant="secondary">command {config.agent.command}</Badge>
                  <Badge variant="secondary">agent name {config.agent.agent || '-'}</Badge>
                  <Badge variant="secondary">model {config.agent.model || 'default'}</Badge>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">loading…</p>
            )}
            <p className="text-xs text-muted-foreground">
              Committed settings live in <Code>modelroom.json</Code>. Anything you save here is kept
              locally in <Code>.modelroom/state.json</Code> (git-ignored). Editable room files are:{' '}
              <span className="font-mono">{(config?.docs ?? []).join(', ')}</span>.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Thumbnails</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Rendering an artifact to PNG needs Playwright and a browser:{' '}
            <Code>npm i -D playwright &amp;&amp; npx playwright install chromium</Code>. modelroom
            works without it — rooms simply show no thumbnail.
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
