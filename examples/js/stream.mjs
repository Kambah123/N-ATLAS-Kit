/**
 * Stream a Hausa reply from a running N-ATLaS gateway.
 *
 *   pnpm --filter n-atlas build
 *   NATLAS_BASE_URL=http://localhost:8080 NATLAS_API_KEY=... node examples/js/stream.mjs
 */
import { NAtlas } from '../../packages/js-sdk/dist/index.js';

const baseURL = process.env.NATLAS_BASE_URL;
const apiKey = process.env.NATLAS_API_KEY;
if (!baseURL || !apiKey) {
  process.stderr.write(
    'Set NATLAS_BASE_URL and NATLAS_API_KEY to a running N-ATLaS gateway. Nothing was sent.\n',
  );
  process.exit(1);
}

const natlas = new NAtlas({ baseURL, apiKey });
const stream = await natlas.chat({
  messages: [{ role: 'user', content: 'Menene ake nufi da gwagwarmaya?' }],
  language: 'ha',
  stream: true,
});
for await (const chunk of stream) {
  if (chunk.delta) process.stdout.write(chunk.delta);
}
process.stdout.write('\n');
