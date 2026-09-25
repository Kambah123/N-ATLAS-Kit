/**
 * Transcribe a file with the NCAIR1 ASR model for one language.
 *
 *   pnpm --filter n-atlas build
 *   NATLAS_BASE_URL=... NATLAS_API_KEY=... node examples/js/transcribe.mjs note.ogg ha
 *
 * Language defaults to ha. Aliases such as hausa, igbo, yoruba, and english work.
 */
import { NAtlas } from '../../packages/js-sdk/dist/index.js';

const baseURL = process.env.NATLAS_BASE_URL;
const apiKey = process.env.NATLAS_API_KEY;
const file = process.argv[2];
const language = process.argv[3] ?? 'ha';

if (!baseURL || !apiKey) {
  process.stderr.write(
    'Set NATLAS_BASE_URL and NATLAS_API_KEY to a running N-ATLaS gateway. Nothing was sent.\n',
  );
  process.exit(1);
}
if (!file) {
  process.stderr.write('Usage: node examples/js/transcribe.mjs <audio-file> [language]\n');
  process.exit(1);
}

const natlas = new NAtlas({ baseURL, apiKey });
const heard = await natlas.transcribe({ audio: file, language });
process.stdout.write(`${heard.text}\n`);
