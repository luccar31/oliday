import type { RawPayloadInput } from '../types.js';

/** Subconjunto de playwright.Response que usamos (facilita los tests). */
export interface ResponseLike {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  request(): { method(): string; postData(): string | null };
  json(): Promise<unknown>;
}

export interface PageLike {
  on(event: 'response', listener: (res: ResponseLike) => void): unknown;
  off(event: 'response', listener: (res: ResponseLike) => void): unknown;
}

export interface JsonCaptureOptions {
  /** Decide si la respuesta interesa (p. ej. `POST /dml/graphql`). */
  match(url: URL, method: string): boolean;
  /** `kind` del RawPayload, p. ej. `booking.graphql.FullSearch`. */
  kindOf(url: URL, postData: string | null): string;
}

export interface JsonCapture {
  payloads: RawPayloadInput[];
  errors: string[];
  /** Espera a que terminen de leerse los cuerpos pendientes y deja de escuchar. */
  stop(): Promise<void>;
}

/**
 * Intercepta con `page.on('response')` las respuestas JSON que interesan y guarda el cuerpo
 * crudo (regla 3). Nunca guarda headers de request/response (tokens CSRF, cookies).
 */
export function attachJsonCapture(page: PageLike, opts: JsonCaptureOptions): JsonCapture {
  const payloads: RawPayloadInput[] = [];
  const errors: string[] = [];
  const pending = new Set<Promise<void>>();

  const listener = (res: ResponseLike) => {
    let url: URL;
    try {
      url = new URL(res.url());
    } catch {
      return;
    }
    const req = res.request();
    if (!opts.match(url, req.method())) return;
    const contentType = res.headers()['content-type'] ?? '';
    if (!contentType.includes('json')) return;
    const task = res
      .json()
      .then((body) => {
        payloads.push({ kind: opts.kindOf(url, req.postData()), url: stripQuerySecrets(url), body });
      })
      .catch((err: unknown) => {
        errors.push(`no se pudo leer ${url.pathname}: ${(err as Error).message}`);
      })
      .finally(() => pending.delete(task));
    pending.add(task);
  };

  page.on('response', listener);
  return {
    payloads,
    errors,
    async stop() {
      page.off('response', listener);
      await Promise.all([...pending]);
    },
  };
}

/** `operationName` de un body GraphQL (objeto o array batch). */
export function graphqlOperationName(postData: string | null, url?: URL): string {
  const fromUrl = url?.searchParams.get('operationName');
  if (fromUrl) return fromUrl;
  if (!postData) return 'unknown';
  try {
    const body: unknown = JSON.parse(postData);
    const first = Array.isArray(body) ? body[0] : body;
    if (
      first &&
      typeof first === 'object' &&
      'operationName' in first &&
      typeof first.operationName === 'string'
    ) {
      return first.operationName;
    }
  } catch {
    /* body no JSON */
  }
  return 'unknown';
}

const SECRET_QUERY_KEYS = /^(key|api_?key|token|csrf.*|auth.*|session.*|sid)$/i;

/** Quita de la URL parámetros que puedan ser secretos antes de guardarla. */
export function stripQuerySecrets(url: URL): string {
  const copy = new URL(url.toString());
  for (const k of [...copy.searchParams.keys()]) {
    if (SECRET_QUERY_KEYS.test(k)) copy.searchParams.set(k, 'REDACTED');
  }
  return copy.toString();
}
