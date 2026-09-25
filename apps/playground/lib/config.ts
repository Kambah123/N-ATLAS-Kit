/**
 * Server-only configuration. Route handlers import this module.
 * Client components must not. Values are read at request time so a Vercel
 * runtime env var is visible without being baked in as NEXT_PUBLIC_*.
 */

export type GatewayEndpoints = {
  healthUrl: string;
  chatUrl: string;
  transcriptionsUrl: string;
  speechUrl: string;
  trustedOrigin: string;
};

export type NatlasConfig = {
  apiKey: string;
  endpoints: GatewayEndpoints;
};

export function readServerEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Accept the origin (`https://host`) or an OpenAI-style base that already
 * ends in `/v1`. Health lives on the origin, not under `/v1`.
 */
export function resolveEndpoints(baseUrl: string): GatewayEndpoints {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  const withVersion = trimmed.endsWith('/v1') ? trimmed : `${trimmed}/v1`;
  const origin = withVersion.slice(0, -'/v1'.length).replace(/\/+$/, '');
  const trusted = new URL(withVersion);
  return {
    healthUrl: `${origin}/health`,
    chatUrl: `${withVersion}/chat/completions`,
    transcriptionsUrl: `${withVersion}/audio/transcriptions`,
    speechUrl: `${withVersion}/audio/speech`,
    trustedOrigin: trusted.origin,
  };
}

export function getConfig(): NatlasConfig | null {
  const baseUrl = readServerEnv('NATLAS_BASE_URL');
  const apiKey = readServerEnv('NATLAS_API_KEY');
  if (!baseUrl || !apiKey) return null;
  return { apiKey, endpoints: resolveEndpoints(baseUrl) };
}

export function isBackendConfigured(): boolean {
  return getConfig() !== null;
}
