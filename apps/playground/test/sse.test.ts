import { describe, expect, it } from 'vitest';
import { deltaFromEvent, messageFromCompletion, takeSseData } from '@/lib/sse';

describe('sse parsing', () => {
  it('splits chunks and reads OpenAI deltas', () => {
    const partial = takeSseData('data: {"choi');
    expect(partial.data).toEqual([]);
    const first = takeSseData(`${partial.rest}ces":[{"delta":{"content":"San"}}]}\n`);
    const second = takeSseData(
      `${first.rest}data: {"choices":[{"delta":{"content":"nu"}}]}\r\n\r\ndata: [DONE]\r\n`,
    );
    expect(first.data.map(deltaFromEvent).join('') + second.data.map(deltaFromEvent).join('')).toBe(
      'Sannu',
    );
  });

  it('reads a non-streaming completion', () => {
    expect(
      messageFromCompletion({
        choices: [{ message: { role: 'assistant', content: 'Sannu' } }],
      }),
    ).toBe('Sannu');
  });
});
