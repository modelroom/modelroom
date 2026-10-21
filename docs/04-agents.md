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

modelroom runs a private OpenCode server of its own and drives the turn through its API:

```
opencode serve --hostname 127.0.0.1 --port <free>   # one per modelroom process
```

It creates the room's session (`POST /api/session`), sends the prompt
(`POST /api/session/<id>/prompt`), and follows the turn until the session goes idle. That is
the same private server `--standalone` starts, only kept alive across turns — and it is the
point of the whole thing: a one-shot `opencode run` has nobody to answer the agent's question,
so it cancels the question and the tool errors instead.

Two things are worth knowing, both learned the hard way:

- **Set `model`.** Many agents resolve to a free tier by default, and the CLI then refuses to
  run outside its own app (`OpenCode's free tier can only be used from within OpenCode`).
- **The private server inherits this process's environment**, which is what makes provider keys
  visible to it. `standalone` no longer changes how opencode is run — modelroom always owns its
  own server — and stays in the config for compatibility.

### What the chat shows

modelroom runs the agent, but it does not read the *turn* out of the CLI's prose. It reads the
session the server is writing: the text, the reasoning, one entry per tool call, and the patch an
edit wrote. So a tool call is a row you can open, an edit shows its diff, and reasoning folds
away. The turn ends when the session goes idle, not when a process exits.

If the session cannot be reached, or the adapter has no such place to look, the chat is exactly
what the process printed. That is the `command` adapter, and it is why `structured` exists.

### Questions

An agent that needs a decision asks a question and blocks on it. modelroom answers the
permission requests the way `opencode run --auto` would — a request that *asks* is approved, a
configured `deny` is respected — and it does **not** answer questions on the person's behalf. It
shows the question above the composer, with the agent's options and a free-form field; the answer
goes back to the same turn, and the agent carries on from where it stopped.

The question is opencode's `form`; modelroom projects it onto the driver-agnostic `Ask`
(`api/chat.ts`) so the chat never learns opencode's shape. A second driver (Claude Code, say)
would produce the same `Ask` and reuse the same card.

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

## The snapshot and the pull request

A room's reviewable output is the docs and the snapshot `index.png`, not the markup. An
agent that only reads `index.html` is reading half the room, so the layer ships three skills
(`init` writes them to `modelroom/.agents/skills/`):

| Skill | When | What it does |
|---|---|---|
| `read-modelroom` | before changing or implementing a room | `render` (idempotent), then read the docs **and the picture** |
| `create-modelroom-pr` | when a change is ready to review | `render`, commit the room's files together, open a PR with the image, the context and the BEHAVIOUR |
| `manage-modelroom-rooms` | a room is added, renamed or removed | use the CLI so the unique name and its references move together |

The first two lean on two commands:

```
modelroom render <room>            # bring the snapshot up to date
modelroom render <room> --check    # prove the pixels did not move (CI gate)
modelroom pr-body <room>           # the description's material, as markdown
```

Rooms are added, renamed and removed through the CLI, which is what keeps the directory name
unique and the references to it in step: `modelroom add`, `rename` and `remove`. The script
rewrites what is a reference (`superseded_by`, `/rooms/<name>`, relative links) and lists the
prose it leaves alone; the skill carries the reasoning and the approval a removal needs.
When the layer is upgraded, `modelroom update` refreshes the skills and `AGENTS.md` — the
files modelroom generated — and never `DESIGN.md`, a room or `modelroom.json`. Upgrading is
a person's decision: when `serve`, the dashboard or `doctor` says a newer modelroom exists,
name the command and leave it there — modelroom does not install anything, and neither
should an agent.

Skills are plain `SKILL.md` files. They are written to `.agents/skills/`, which OpenCode
and Claude Code both read; OpenCode also reads its own `.opencode/skills/`. To use the
shipped skills with an agent that reads neither, copy or symlink the three directories.

**modelroom never touches git or `gh`.** It renders and prints; the agent owns the branch,
the commit and the pull request. That is the same line the rest of the design layer holds:
the tool stays inside `rooms/` and hands the rest over.

Merge the pull request with **Squash and Merge**. The snapshot is a binary under a fixed
name, so the branch holds one per revision; squashing leaves main with a single current
image and lets git collect the rest. `05-preview-images.md` has the reasoning.

## The design system, and MCP

A room is drawn from the project's design system, and an agent often reads that design
system through its **MCP server** — component and token lookups instead of guessing. The
layer keeps the two halves apart:

- `DESIGN.md` names the design system, where its truth lives, and the MCP server that
  carries it. It is the project's file; `update` never touches it.
- When the rooms are drawn *with* that system, the layer keeps one copy of it — `vendor/` for
  third-party files and the layer's own shared CSS beside it — and a room links the copy by
  relative path, so it renders offline and travels with the layer. `DESIGN.md` names the copy
  and the version it was taken from; `docs/02-convention.md` ("The design system, shared once")
  has the rules. A room never installs a framework of its own.
- The server itself is *configured* in `opencode.json`. modelroom runs `opencode serve`
  with its working directory set to the layer (`modelroom/`), so OpenCode reads
  `modelroom/opencode.json`, plus any `opencode.json` above it up to the repository root.
  Add the server under `mcp`:

  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "mcp": {
      "design-system": { "type": "remote", "url": "https://example.com/mcp" }
    }
  }
  ```

  OpenCode V2 nests these under `mcp.servers` instead. Keep secrets in the environment —
  OpenCode substitutes `{env:NAME}` — and out of the committed file.

  The room's MCP panel reads its list from that same server, the one the turn runs on —
  not from the shared `opencode` service, whose servers belong to another directory — so
  what the panel lists is what the agent can actually call.

There is no portable MCP file across agents: `.mcp.json` is Claude Code's,
`.cursor/mcp.json` is Cursor's, `.vscode/mcp.json` is VS Code's, and OpenCode reads none
of them. If the layer is driven by more than one agent, each gets its own file; OpenCode's
is `opencode.json`. The shipped `read-modelroom` skill carries the *how*: read `DESIGN.md`,
use the design system's MCP tools before writing markup, and read the vendored copy the room
links when there is one.

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
   that the agent keeps it somewhere modelroom can ask for it. The reading lives in
   `server/opencode.ts` (`sessionParts`). If the claim is wrong, the agent's *prose* lands in the
   chat and nothing else breaks.

`run` is optional: an adapter without one is driven by modelroom itself rather than by a spawned
process. The `opencode` adapter is that case — modelroom owns an `opencode serve` and follows the
turn through its API (`server/opencode-turn.ts`), which is what lets a question stay open long
enough for the person to answer it.
