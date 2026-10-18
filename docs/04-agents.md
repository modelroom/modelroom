# Agents

modelroom does not bundle a model and does not own a chat product. It runs the agent you
configure, one session per room, and shows you what changed.

## Built-in adapters

| Adapter | What it runs | Notes |
|---|---|---|
| `opencode` | [OpenCode](https://opencode.ai) CLI | sessions, model and agent selection |
| `command` | any CLI | you provide `agent.args`; `{prompt}` and `{session}` are substituted |

### opencode

```jsonc
{
  "agent": {
    "adapter": "opencode",
    "command": "opencode",
    "agent": "build",           // an agent defined in .opencode/agents/
    "model": "openrouter/deepseek/deepseek-v4.1-flash",
    "standalone": true
  }
}
```

modelroom runs, roughly:

```
opencode run --standalone --agent <agent> --model <model> --session <id> --auto "<prompt>"
```

Two things are worth knowing, both learned the hard way:

- **Set `model`.** Many agents resolve to a free tier by default, and the CLI then refuses to
  run outside its own app (`OpenCode's free tier can only be used from within OpenCode`).
- **`standalone: true`** runs the agent against a private server that inherits this process's
  environment, which is what makes provider keys visible to it. If your shared service already
  has keys, either setting works.

Agents that need to *write* only the room's files should be scoped on their side, for example
with OpenCode `permissions`:

```yaml
# .opencode/agents/design.md
permissions:
  - { action: "*", resource: "*", effect: deny }
  - { action: read, resource: "rooms/*", effect: allow }
  - { action: edit, resource: "rooms/*", effect: allow }
  - { action: glob, resource: "*", effect: allow }
  - { action: grep, resource: "*", effect: allow }
  - { action: external_directory, resource: "*", effect: deny }
```

### command

For anything else — Claude Code, Codex, a local model, a shell script:

```jsonc
{
  "agent": { "adapter": "command", "command": "claude", "args": ["-p", "{prompt}"] }
}
```

`{session}` is substituted with the room's session id. Sessions are stored per room in
`.modelroom/state.json`; **new session** in the room UI starts a fresh one.

## Writing an adapter

An adapter is one object:

```js
export const mine = {
  name: 'mine',
  newSessionId: () => `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
  run({ cfg, cwd, prompt, sessionId, onChunk, onExit }) {
    // spawn your CLI; stream output with onChunk('stdout'|'stderr', text)
    // call onExit(code, errorMessage?) once it finishes
  },
};
```

Add it to `lib/agents/index.mjs`. Two rules keep adapters honest:

1. **Close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`). A CLI that reads stdin will hang
   forever if the pipe stays open.
2. **Do not parse the output into meaning.** modelroom shows the agent's words as they are.
   Interpretation belongs to the person reading the room.
