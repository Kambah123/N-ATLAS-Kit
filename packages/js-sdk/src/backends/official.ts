import { NAtlasError } from '../errors.js';

/** There is no public NCAIR API yet. Fail loudly rather than invent one. */
export function officialBackendUnavailable(): never {
  throw new NAtlasError(
    'The official NCAIR API is not public yet. Use backend "openai-compatible" and point baseURL at a /serve gateway (see serve/README.md).',
  );
}
