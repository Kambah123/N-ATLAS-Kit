import { BACKENDS, LLM_MODEL_ID, type Backend } from './constants.js';
import { BadRequestError, NAtlasError } from './errors.js';
import { resolveHfEndpointBase } from './backends/hf-endpoint.js';
import { officialBackendUnavailable } from './backends/official.js';
import {
  resolveOpenAICompatibleBase,
  type GatewayEndpoints,
} from './backends/openai-compatible.js';
import { assertNcairModel } from './prompts.js';

export interface ResolvedConfig extends GatewayEndpoints {
  apiKey: string | null;
  backend: Backend;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  retryNonIdempotent: boolean;
}

export interface ConfigInput {
  baseURL?: string | undefined;
  apiKey?: string | undefined;
  backend?: string | undefined;
  model?: string | undefined;
  timeout?: number | undefined;
  maxRetries?: number | undefined;
  retryNonIdempotent?: boolean | undefined;
}

export function resolveConfig(input: ConfigInput): ResolvedConfig {
  const baseURL = firstText(input.baseURL, readEnv('NATLAS_BASE_URL'));
  if (!baseURL) {
    throw new NAtlasError(
      'Set baseURL or NATLAS_BASE_URL to your N-ATLaS gateway. There is no public hosted API.',
    );
  }
  const backend = resolveBackend(
    firstText(input.backend, readEnv('NATLAS_BACKEND')) ?? 'openai-compatible',
  );
  const endpoints =
    backend === 'hf-endpoint'
      ? resolveHfEndpointBase(baseURL)
      : resolveOpenAICompatibleBase(baseURL);
  const model = firstText(input.model, readEnv('NATLAS_MODEL')) ?? LLM_MODEL_ID;
  assertNcairModel(model);
  const apiKey = firstText(input.apiKey, readEnv('NATLAS_API_KEY')) ?? null;
  if (apiKey !== null && /[\r\n]/u.test(apiKey)) {
    throw new BadRequestError('apiKey contains invalid characters.');
  }
  return {
    ...endpoints,
    apiKey,
    backend,
    model,
    timeoutMs: resolveTimeout(input.timeout),
    maxRetries: resolveMaxRetries(input.maxRetries),
    retryNonIdempotent: input.retryNonIdempotent ?? false,
  };
}

function resolveBackend(value: string): Backend {
  if (!(BACKENDS as readonly string[]).includes(value)) {
    throw new BadRequestError(
      `Unknown backend "${value}". Expected one of: ${BACKENDS.join(', ')}.`,
    );
  }
  if (value === 'official') officialBackendUnavailable();
  return value as Backend;
}

function resolveTimeout(explicit: number | undefined): number {
  if (explicit !== undefined) return requireTimeout(explicit, 'timeout');
  const env = readEnv('NATLAS_TIMEOUT_MS');
  if (env !== undefined) {
    const parsed = Number(env);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestError('NATLAS_TIMEOUT_MS must be a positive number of milliseconds.');
    }
    return requireTimeout(parsed, 'NATLAS_TIMEOUT_MS');
  }
  return 60_000;
}

function resolveMaxRetries(explicit: number | undefined): number {
  if (explicit !== undefined) return requireRetries(explicit, 'maxRetries');
  const env = readEnv('NATLAS_MAX_RETRIES');
  if (env !== undefined) {
    const parsed = Number(env);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestError('NATLAS_MAX_RETRIES must be an integer from 0 to 8.');
    }
    return requireRetries(parsed, 'NATLAS_MAX_RETRIES');
  }
  return 2;
}

export function requireTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestError(`${name} must be a positive number of milliseconds.`);
  }
  return value;
}

export function requireRetries(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 8) {
    throw new BadRequestError(`${name} must be an integer from 0 to 8.`);
  }
  return value;
}

function firstText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function readEnv(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
