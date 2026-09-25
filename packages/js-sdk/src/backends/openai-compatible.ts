import { BadRequestError } from '../errors.js';

export interface GatewayEndpoints {
  /** Origin plus `/v1`, with no trailing slash. Chat, audio, and models live here. */
  apiBase: string;
  /** `GET /health` is on the gateway root, not under `/v1`. */
  healthUrl: string;
}

/**
 * Accept either form from `.env.example` and from the OpenAI client habit:
 *
 * - `http://localhost:8080`
 * - `http://localhost:8080/v1`
 *
 * `/health` is never under `/v1`. A trailing slash is ignored.
 */
export function resolveOpenAICompatibleBase(baseURL: string): GatewayEndpoints {
  let url: URL;
  try {
    url = new URL(baseURL);
  } catch (cause) {
    throw new BadRequestError(`baseURL is not a valid URL: ${baseURL}`, { cause });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestError('baseURL must use http or https.');
  }

  const trimmed = baseURL.trim().replace(/\/+$/u, '');
  const apiBase = trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  const root = apiBase.slice(0, -'/v1'.length);
  return { apiBase, healthUrl: `${root}/health` };
}
