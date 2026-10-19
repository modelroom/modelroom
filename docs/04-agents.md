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

### What the chat shows

modelroom runs the agent, but it does not read the *turn* out of the CLI's prose. While the
process is alive, opencode's session already describes that turn — the text, the reasoning, one
entry per tool call, and the patch an edit wrote — and modelroom follows that instead. So a tool
call is a row you can open, an edit shows its diff, reasoning folds away, and the CLI's own
output stays in the run log. It is the same session the panel reads, asked about once a second.

If the session cannot be reached, or the adapter has no such place to look, the chat is exactly
what the process printed. That is the `command` adapter, and it is why `structured` exists.

The agent runs with its working directory set to `cfg.rootDir` — for a new
install, `modelroom/`. That is where it reads `AGENTS.md`, and it is the whole
tree modelroom will serve under `/files/...`.

Agents that need to *write* only the room's files should be scoped on their side, for example
with OpenCode `permissions`:

```yaml
# modelroom/.opencode/agents/design.md
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
`.modelroom/state.json` at the project root; **new session** in the room UI starts a fresh one.

The generated `AGENTS.md` tells the agent which language to write the room's prose in, and
that frontmatter keys and promise ids stay in English. Change `lang` in `modelroom.json`
to change that language for new rooms and for the UI; existing documents are not rewritten.

## Writing an adapter

An adapter is one object:

```js
export const mine = {
  name: 'mine',
  structured: false, // true only if the turn can be read while it still runs
  newSessionId: () => `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
  run({ cfg, cwd, prompt, sessionId, onChunk, onExit }) {
    // spawn your CLI; stream output with onChunk('stdout'|'stderr', text)
    // call onExit(code, errorMessage?) once it finishes
  },
};
```

Add it to `server/agents/index.ts`. Three rules keep adapters honest:

1. **Close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`). A CLI that reads stdin will hang
   forever if the pipe stays open.
2. **Do not parse the output into meaning.** modelroom shows the agent's words as they are.
   Interpretation belongs to the person reading the room.
3. **`structured: true` is a claim that the turn can be read while the run is in progress** —
   that the agent keeps it somewhere modelroom can ask for it. Only one adapter makes that
   claim today, and the reading lives in `server/opencode.ts` (`sessionParts`). If the claim is
   wrong, the agent's *prose* lands in the chat and nothing else breaks.
