# Voice GenUI (LiveKit)

Open-source **voice + generative UI** framework. Speak a concept and watch the full viewport become an interactive Three.js demo with a live voice teacher.

Built on [LiveKit Agents](https://livekit.io/agents) with [LiveKit Inference](https://livekit.com/products/inference) for STT/LLM/TTS, [Next.js](https://nextjs.org), and the [Vercel AI SDK](https://ai-sdk.dev) for async Three.js scene generation. Fork it, add a domain, deploy your own vertical.

## What makes this different

- **Voice-first** — real-time STT/TTS with a conversational teacher
- **Generative UI** — the LLM calls `render_canvas` to build full-viewport Three.js scenes from a visual brief (not pre-authored sims)
- **Async teaching** — the agent keeps talking while demos assemble in the background
- **Quizzes** — `render_quiz` checks understanding on screen without spoiling answers aloud
- **Multi-domain** — one codebase, many subjects (physics, chemistry, math, biology, programming)

## Quick start

```bash
cp .env.example .env.local
# fill in LiveKit credentials + an LLM provider key for canvas rendering
npm install
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

## Voice models

| Role | Default |
|------|---------|
| STT | Deepgram (`STT_PROVIDER=deepgram`) or LiveKit Inference |
| LLM | Qwen 3.8 Max via AI SDK (`LLM_PROVIDER` / `LLM_MODEL`) — bills your provider key, not LiveKit Inference |
| TTS | Deepgram or LiveKit Inference (`cartesia/sonic-3`) |

Optional STT/TTS Inference overrides: `LIVEKIT_STT_MODEL`, `LIVEKIT_TTS_MODEL`, `LIVEKIT_TTS_VOICE`.

## Canvas LLM provider

Async Three.js / scene-ops generation uses the same Vercel AI SDK provider. Default is **Qwen 3.8 Max** (DashScope OpenAI-compatible). The render worker emits a complete constrained `scene_ops` lab in one shot; call `render_canvas` again to improve or update the illustration.

```bash
LLM_PROVIDER=qwen
LLM_MODEL=qwen3.8-max
DASHSCOPE_API_KEY=...
```

| Provider | API key env | Example models |
|----------|-------------|----------------|
| `qwen` (default) | `DASHSCOPE_API_KEY` (or `QWEN_API_KEY`) | `qwen3.8-max` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-5` |
| `kimi` | `MOONSHOT_API_KEY` (or `KIMI_API_KEY`) | `kimi-k3` |
| `openai` | `OPENAI_API_KEY` | `gpt-4.1`, `gpt-4o` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |

Optional `LLM_RENDER_MODEL` overrides the model used for async canvas generation. Optional `QWEN_BASE_URL` / `DASHSCOPE_BASE_URL` overrides the DashScope endpoint (default `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`). Optional `KIMI_BASE_URL` overrides the Moonshot endpoint.

## Choose a domain (subject)

Set in `.env.local`:

```bash
DOMAIN=physics              # agent prompts
NEXT_PUBLIC_DOMAIN=physics  # UI labels & suggestions
```

| Domain | Lab | Example prompt |
|--------|-----|----------------|
| `physics` | Physics Lab | "Explain projectile motion with an interactive demo" |
| `chemistry` | Chemistry Lab | "Show the structure and polarity of a water molecule" |
| `mathematics` | Math Studio | "Explain the derivative as a tangent slope" |
| `biology` | Biology Lab | "Walk through DNA replication with an animation" |
| `programming` | Code Lab | "Visualize binary search on a sorted array" |

See [lib/domain/README.md](lib/domain/README.md) for adding custom domains.

## Stack

| Layer | Tech |
|-------|------|
| Web client | Next.js, React Three Fiber, LiveKit React |
| Token API | `/api/token` on Vercel |
| Voice agent | LiveKit Agents worker (runs separately) |
| Voice STT / TTS | Deepgram or LiveKit Inference |
| Voice LLM | Vercel AI SDK (Qwen / Anthropic / OpenAI / Google / Kimi) |
| Canvas LLM | Vercel AI SDK (same provider keys) |
| GenUI | Async single-shot scene_ops generation via tool calls |

## Deploy

You need **both** a web deployment and a voice agent worker. Vercel only hosts the UI.

### 1. Web (Vercel)

1. Import this repo in [Vercel](https://vercel.com/new).
2. Add environment variables from `.env.example` (LiveKit keys, domain, canvas LLM key, feedback code).
3. Set `DOMAIN` and `NEXT_PUBLIC_DOMAIN` to your vertical.
4. Deploy.

### 2. Voice agent (LiveKit Cloud)

Install the [LiveKit CLI](https://docs.livekit.io/intro/basics/cli/), then from the repo root:

```bash
lk cloud auth

# First deploy — creates livekit.toml and builds from ./Dockerfile
# Run from the repo root (where package.json lives).
lk agent create --secrets-file .env.local --region ap-south

# Later updates (uses livekit.toml)
lk agent deploy --secrets-file .env.local

lk agent status
lk agent logs
```

If you see `no agent project detected`, confirm you’re in the repo root (`ls package.json Dockerfile`) and retry.

**Secrets the agent needs** (LiveKit injects `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` itself):

| Secret | Purpose |
|--------|---------|
| `DOMAIN` | Must match the Vercel `DOMAIN` |
| `DASHSCOPE_API_KEY` (or Anthropic / OpenAI / Google / Moonshot) | Canvas generation via AI SDK |

Optional: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_RENDER_MODEL`, `QWEN_BASE_URL`, `KIMI_BASE_URL`, `LIVEKIT_STT_MODEL`, `LIVEKIT_LLM_MODEL`, `LIVEKIT_TTS_MODEL`, `LIVEKIT_TTS_VOICE`.

The worker registers as `voice-genui-agent` — the same name the web token API dispatches.

### Local agent (dev / VM)

```bash
npm run dev:agent          # development
npm run start:agent        # production mode on a VM
```

### Publish multiple verticals

Deploy the same repo multiple times with different `DOMAIN` / `NEXT_PUBLIC_DOMAIN` values — one deployment per subject. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project structure

```
agent/           LiveKit voice agent + render tools
  tools/         render_canvas
  llm.ts         Voice LLM via AI SDK (default Qwen)
  canvasRenderWorker.ts  Async single-shot scene_ops generation (AI SDK)
Dockerfile       LiveKit Cloud agent image
lib/ai/          AI SDK provider helpers (Qwen / Anthropic / …)
lib/domain/      Domain presets (physics, chemistry, …)
lib/recipes/     Motion solvers + material presets (no skill catalog)
components/world/  Lab viewport, captions, SceneBuilder
app/             Next.js pages + token API
```

## Contributing

We welcome new domains and improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
