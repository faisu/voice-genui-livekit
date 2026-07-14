# Voice GenUI (LiveKit)

Speak a physics concept and watch the lab viewport become an interactive Three.js demo with a live voice teacher.

## Stack

- **Next.js** web client + `/api/token` (Vercel)
- **LiveKit** realtime room + voice agent worker (runs separately from Vercel)

## Local setup

```bash
cp .env.example .env.local
# fill in LiveKit + Anthropic + Deepgram keys, and FEEDBACK_ACCESS_CODE
npm install
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) and enter the access code from `FEEDBACK_ACCESS_CODE`.

## Deploy on Vercel

1. Import this GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js** (auto-detected).
3. Add these **Environment Variables** (Production + Preview):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_LIVEKIT_URL` | yes | `wss://…livekit.cloud` |
| `LIVEKIT_API_KEY` | yes | Server-only |
| `LIVEKIT_API_SECRET` | yes | Server-only |
| `FEEDBACK_ACCESS_CODE` | yes | Shared invite code for reviewers |
| `ALLOWED_ORIGINS` | recommended | e.g. `https://your-app.vercel.app` |

4. Deploy. Share the Vercel URL **and** the access code (never share API keys).

### Voice agent (required for full demos)

Vercel hosts the UI and token minting only. Run the LiveKit agent elsewhere (your machine, a VM, or [LiveKit Cloud Agents](https://docs.livekit.io/agents/ops/deployment/)):

```bash
# same secrets as .env.example, plus Anthropic / Deepgram / optional ElevenLabs
npm run dev:agent
```

Without a running agent, users can join rooms but will not get voice/canvas responses.

## Security notes

- API keys stay server-side / agent-side (not in the browser bundle).
- Production refuses to mint LiveKit tokens unless `FEEDBACK_ACCESS_CODE` is set.
- Token minting is rate-limited per IP.
