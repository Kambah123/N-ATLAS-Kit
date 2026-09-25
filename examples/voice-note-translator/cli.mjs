/**
 * Transcribe a voice note, then translate it or ask N-ATLaS to reply.
 *
 *   pnpm --filter n-atlas build
 *   NATLAS_BASE_URL=... NATLAS_API_KEY=... node cli.mjs note.ogg --language ha --to en
 */
import { isDirectRun, runCli } from './lib.mjs';

if (isDirectRun(import.meta.url)) {
  const result = await runCli(process.argv, process.env);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}
