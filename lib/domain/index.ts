import { biologyDomain } from "./biology";
import { chemistryDomain } from "./chemistry";
import { mathematicsDomain } from "./mathematics";
import { physicsDomain } from "./physics";
import { programmingDomain } from "./programming";
import type { DomainConfig } from "./types";

export type { ConceptSuggestion, DomainConfig } from "./types";

const DOMAIN_REGISTRY: Record<string, DomainConfig> = {
  [physicsDomain.id]: physicsDomain,
  [chemistryDomain.id]: chemistryDomain,
  [mathematicsDomain.id]: mathematicsDomain,
  [biologyDomain.id]: biologyDomain,
  [programmingDomain.id]: programmingDomain,
};

export const DEFAULT_DOMAIN_ID = "physics";

export const ALL_DOMAINS: DomainConfig[] = Object.values(DOMAIN_REGISTRY);

export function listDomainIds(): string[] {
  return Object.keys(DOMAIN_REGISTRY);
}

export function getDomain(id?: string | null): DomainConfig {
  const normalized = (id ?? "").trim().toLowerCase();
  if (normalized && DOMAIN_REGISTRY[normalized]) {
    return DOMAIN_REGISTRY[normalized]!;
  }
  return DOMAIN_REGISTRY[DEFAULT_DOMAIN_ID]!;
}

/** Resolve domain id from runtime env (works in Node and Next.js). */
export function resolveDomainId(): string {
  const fromPublic =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_DOMAIN?.trim().toLowerCase()
      : undefined;
  const fromServer =
    typeof process !== "undefined"
      ? process.env.DOMAIN?.trim().toLowerCase()
      : undefined;

  const candidate = fromPublic || fromServer;
  if (candidate && DOMAIN_REGISTRY[candidate]) {
    return candidate;
  }
  return DEFAULT_DOMAIN_ID;
}

export function resolveDomain(): DomainConfig {
  return getDomain(resolveDomainId());
}
