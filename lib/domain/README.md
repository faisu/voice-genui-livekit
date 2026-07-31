# Domain configurations

A **domain** is a complete vertical preset: agent persona, render prompts, UI copy, and starter concept chips. The core Voice GenUI engine (LiveKit voice, async `render_canvas`, Three.js Recipe Skills via `SceneBuilder`) stays the same; only the domain config changes.

## Built-in domains

| ID | Lab name | Best for |
|----|----------|----------|
| `physics` | Physics Lab | Forces, motion, fields (default) |
| `chemistry` | Chemistry Lab | Molecules, reactions, bonding |
| `mathematics` | Math Studio | Graphs, geometry, calculus |
| `biology` | Biology Lab | Cells, processes, anatomy |
| `programming` | Code Lab | Algorithms, data structures |

## Switching domains

Set both env vars (agent reads `DOMAIN`, browser reads `NEXT_PUBLIC_DOMAIN`):

```bash
DOMAIN=chemistry
NEXT_PUBLIC_DOMAIN=chemistry
```

Restart `npm run dev:all` after changing.

## DomainConfig fields

| Field | Purpose |
|-------|---------|
| `id` | Slug used in env vars |
| `labName` | Welcome screen header |
| `teacherTitle` | Chat overlay label |
| `tagline` | Main prompt on empty canvas |
| `conceptSuggestions` | Starter chips before first demo |
| `systemPrompt` | Full LLM system prompt for teaching agent |
| `agentInstructions` | Shorter voice.Agent instructions |
| `renderSystemPrompt` | Three.js scene generation prompt |
| `visualBriefDescription` | Tool schema hint for `render_canvas` |
| `greetingInstructions` | First message when student joins |

Shared lesson flow, quiz guidance, and voice rules live in `shared.ts` — override only what differs per subject.

## Publishing multiple products from one repo

**Option A — Multiple deployments (recommended)**

- One GitHub repo, multiple Vercel/Railway projects
- Each project sets a different `DOMAIN` / `NEXT_PUBLIC_DOMAIN`
- Custom domain per vertical: `physics.example.com`, `chem.example.com`

**Option B — Fork**

- Fork the repo, change default domain in `lib/domain/index.ts`
- Rebrand UI colors in `app/globals.css` if needed

**Option C — Community domain PR**

- Add your domain file and register it
- Others deploy with your domain id

## Tips for good domains

1. **visual_brief examples** — Be specific in `visualBriefDescription` (units, colors, what to animate).
2. **Concept suggestions** — Provide 4–6 prompts that reliably produce strong demos.
3. **Accuracy notes** — Use `renderSystemPrompt` to enforce subject conventions (e.g. CPK colors for chemistry).
4. **Quiz concepts** — Use `quizConceptDescription` with 2–3 real examples from your curriculum.

## Architecture

```
Student speaks
    → LiveKit voice agent (domain.agentInstructions + domain.systemPrompt)
    → render_canvas tool (domain.visualBriefDescription)
    → canvasRenderWorker (domain.renderSystemPrompt → emit_recipe / skillId)
    → scene_ops published to browser
    → SceneBuilder (Three.js primitives + Recipe Skills)
```

All domain-specific text is resolved at startup via `resolveDomain()` in `lib/domain/index.ts`.
