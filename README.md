# Voice GenUI (LiveKit)

Open-source **voice + generative UI** framework. Speak a concept and watch the full viewport become an interactive Three.js demo with a live voice teacher.

Built on [LiveKit Agents](https://livekit.io/agents), [Next.js](https://nextjs.org), and the [Vercel AI SDK](https://ai-sdk.dev) (Anthropic, OpenAI, or Google). Fork it, add a domain, deploy your own vertical.

## What makes this different

- **Voice-first** — real-time STT/TTS with a conversational teacher
- **Generative UI** — the LLM calls `render_canvas` to build full-viewport Three.js scenes from a visual brief (not pre-authored sims)
- **Async teaching** — the agent keeps talking while demos assemble in the background
- **Quizzes** — `render_quiz` checks understanding on screen without spoiling answers aloud
- **Multi-domain** — one codebase, many subjects (physics, chemistry, math, biology, programming)

## Quick start

```bash
cp .env.example .env.local
# fill in LiveKit, LLM provider, and Deepgram keys
npm install
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

## LLM provider

Switch models by changing env vars — no code changes required:

```bash
LLM_PROVIDER=anthropic   # or openai | google
LLM_MODEL=claude-sonnet-4-5-20250929
ANTHROPIC_API_KEY=...
```

| Provider | API key env | Example models |
|----------|-------------|----------------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5-20250929` |
| `openai` | `OPENAI_API_KEY` | `gpt-4.1`, `gpt-4o` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.5-flash` |

Optional `LLM_RENDER_MODEL` overrides the model used for async Three.js scene generation.

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
| LLM | Vercel AI SDK (provider-agnostic) |
| STT / TTS | Deepgram (ElevenLabs optional) |
| GenUI | Async Three.js scene generation via tool calls |

## Deploy

### Web (Vercel)

1. Import this repo in [Vercel](https://vercel.com/new).
2. Add environment variables from `.env.example`.
3. Set `DOMAIN` and `NEXT_PUBLIC_DOMAIN` to your vertical.
4. Deploy.

### Voice agent (required)

Vercel hosts the UI only. Run the agent on your machine, a VM, or [LiveKit Cloud Agents](https://docs.livekit.io/agents/ops/deployment/):

```bash
npm run dev:agent
```

Use the **same** `DOMAIN` env var on the agent as on the web app.

### Publish multiple verticals

Deploy the same repo multiple times with different `DOMAIN` / `NEXT_PUBLIC_DOMAIN` values — one deployment per subject. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project structure

```
agent/           LiveKit voice agent + render tools
  tools/         render_canvas, render_quiz
  llm.ts         AI SDK LLM adapter (Anthropic / OpenAI / Google)
  canvasRenderWorker.ts  Async Three.js generation
lib/domain/      Domain presets (physics, chemistry, …)
components/world/  Lab viewport, captions, quiz overlay
app/             Next.js pages + token API
```

## Contributing

We welcome new domains and improvements. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
