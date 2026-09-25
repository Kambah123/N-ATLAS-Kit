import { type ApiErrorBody } from '@/lib/types';

export function errorJson(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return headers ? Response.json(body, { status, headers }) : Response.json(body, { status });
}

export function relayEventStream(upstream: Response, onDone: () => void): Response {
  const source = upstream.body;
  if (!source) {
    onDone();
    return errorJson(502, 'empty', 'The model returned an empty stream.');
  }
  const reader = source.getReader();

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    onDone();
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          release();
          return;
        }
        if (value) controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        release();
      }
    },
    cancel() {
      void reader.cancel().catch(() => undefined);
      release();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
