import type { AdapterResult, Platform, SearchParams } from '../types.js';

/**
 * Contrato de cada fuente (AGENT_BRIEF.md §8). El adaptador (a) guarda el crudo en
 * `rawPayloads`, (b) valida con Zod, (c) normaliza y (d) devuelve el resultado.
 * La persistencia la hace el orquestador, nunca el adaptador.
 */
export interface PlatformAdapter {
  platform: Platform;
  search(params: SearchParams): Promise<AdapterResult>;
  detail?(listingExternalId: string, params: SearchParams): Promise<AdapterResult>;
  calendar?(listingExternalId: string, months: number): Promise<AdapterResult>;
}

export function emptyResult(status: AdapterResult['status'], warnings: string[] = []): AdapterResult {
  return { status, listings: [], snapshots: [], rawPayloads: [], warnings };
}
