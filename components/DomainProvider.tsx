"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getDomain, resolveDomainId, type DomainConfig } from "@/lib/domain";

const DomainContext = createContext<DomainConfig | null>(null);

export function DomainProvider({ children }: { children: ReactNode }) {
  const domain = getDomain(resolveDomainId());
  return (
    <DomainContext.Provider value={domain}>{children}</DomainContext.Provider>
  );
}

export function useDomain(): DomainConfig {
  const domain = useContext(DomainContext);
  if (!domain) {
    return getDomain(resolveDomainId());
  }
  return domain;
}
