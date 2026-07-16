# Contributing to Voice GenUI

Thanks for helping build open voice + generative UI labs. This project is designed so anyone can add a new **domain** (subject vertical) without rewriting the LiveKit agent or Three.js pipeline.

## Quick start

```bash
cp .env.example .env.local
# fill in API keys and pick a domain (see below)
npm install
npm run dev:all
```

## Adding a new domain

Domains live in `lib/domain/`. Each domain is a `DomainConfig` object that customizes prompts, UI copy, and starter suggestions.

1. Copy `lib/domain/physics.ts` → `lib/domain/your-domain.ts`
2. Update subject-specific prompts, suggestions, and labels
3. Register it in `lib/domain/index.ts`:

```ts
import { yourDomain } from "./your-domain";

const DOMAIN_REGISTRY: Record<string, DomainConfig> = {
  // ...
  [yourDomain.id]: yourDomain,
};
```

4. Set `DOMAIN=your-domain` and `NEXT_PUBLIC_DOMAIN=your-domain` in `.env.local`
5. Test with `npm run dev:all`

See [lib/domain/README.md](lib/domain/README.md) for field-by-field guidance.

## Publishing a domain as its own deployment

Each domain can be deployed as a separate product:

| Deployment | Env vars |
|------------|----------|
| Physics Lab | `DOMAIN=physics` `NEXT_PUBLIC_DOMAIN=physics` |
| Chemistry Lab | `DOMAIN=chemistry` `NEXT_PUBLIC_DOMAIN=chemistry` |
| Math Studio | `DOMAIN=mathematics` `NEXT_PUBLIC_DOMAIN=mathematics` |
| Biology Lab | `DOMAIN=biology` `NEXT_PUBLIC_DOMAIN=biology` |
| Code Lab | `DOMAIN=programming` `NEXT_PUBLIC_DOMAIN=programming` |

Deploy the same repo to multiple Vercel projects with different env vars and custom domains.

## Pull request guidelines

- Keep domains self-contained in one file under `lib/domain/`
- Do not hardcode subject-specific copy in shared components — use `DomainConfig`
- Run `npm run lint` before opening a PR
- Include a short test plan: which domain you tested and one example prompt

## Code of conduct

Be respectful and constructive. This project welcomes educators, developers, and domain experts.
