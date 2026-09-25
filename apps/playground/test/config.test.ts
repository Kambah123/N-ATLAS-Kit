import { describe, expect, it } from 'vitest';
import { resolveEndpoints } from '@/lib/config';

describe('resolveEndpoints', () => {
  it('accepts an origin and an OpenAI-style /v1 base', () => {
    const fromOrigin = resolveEndpoints('https://gateway.example');
    const fromV1 = resolveEndpoints('https://gateway.example/v1/');
    expect(fromOrigin).toEqual(fromV1);
    expect(fromOrigin.healthUrl).toBe('https://gateway.example/health');
    expect(fromOrigin.chatUrl).toBe('https://gateway.example/v1/chat/completions');
    expect(fromOrigin.transcriptionsUrl).toBe('https://gateway.example/v1/audio/transcriptions');
    expect(fromOrigin.speechUrl).toBe('https://gateway.example/v1/audio/speech');
    expect(fromOrigin.trustedOrigin).toBe('https://gateway.example');
  });
});
