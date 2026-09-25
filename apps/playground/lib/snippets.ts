import { type AsrLanguage, type ChatRequestBody } from '@/lib/types';

export type CodeRequest =
  | { kind: 'chat'; body: ChatRequestBody }
  | { kind: 'transcription'; language: AsrLanguage; filename: string };

export type SnippetSet = {
  curl: string;
  javascript: string;
  python: string;
};

/** Language codes `n-atlas` and `natlas` accept. Pidgin (`pcm`) is not one of them. */
const SDK_LANGUAGES = new Set(['ha', 'ig', 'yo', 'en']);

export const JS_SDK_HREF = 'https://github.com/Kambah123/N-ATLAS-Kit/tree/main/packages/js-sdk';

export const PY_SDK_HREF = 'https://github.com/Kambah123/N-ATLAS-Kit/tree/main/packages/python-sdk';

export const SDK_NOTE =
  'JavaScript uses n-atlas (npm install n-atlas). Python uses natlas (pip install natlas). Not on npm/PyPI yet? Install from GitHub (the repo must be public): pnpm add "github:Kambah123/N-ATLAS-Kit#path:packages/js-sdk" and pip install "git+https://github.com/Kambah123/N-ATLAS-Kit.git#subdirectory=packages/python-sdk". Curl is the raw gateway call. Keep NATLAS_API_KEY on the server.';

const V1_BASH = `# NATLAS_BASE_URL may be the origin or the origin plus /v1.
base="\${NATLAS_BASE_URL%/}"
case "$base" in
  */v1) ;;
  *) base="$base/v1" ;;
esac`;

const JS_CLIENT = `import { NAtlas } from 'n-atlas';

const natlas = new NAtlas({
  baseURL: process.env.NATLAS_BASE_URL,
  apiKey: process.env.NATLAS_API_KEY,
});`;

const PY_CLIENT = `import os

from natlas import NAtlas`;

export function renderSnippets(request: CodeRequest): SnippetSet {
  if (request.kind === 'transcription') {
    return renderTranscription(request.language, request.filename);
  }
  return renderChat(request.body);
}

function renderChat(body: ChatRequestBody): SnippetSet {
  const json = JSON.stringify(body, null, 2);
  const messages = JSON.stringify(body.messages, null, 2);
  const streamNote = body.stream
    ? ''
    : '\n# stream is false, so the response is one JSON object.\n';
  return {
    curl: `${V1_BASH}
${streamNote}
curl ${body.stream ? '-N ' : ''}"$base/chat/completions" \\
  -H "Authorization: Bearer $NATLAS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d @- <<'NATLAS_BODY'
${json}
NATLAS_BODY`,
    javascript: renderJsChat(body, messages),
    python: renderPyChat(body, messages),
  };
}

function renderJsChat(body: ChatRequestBody, messages: string): string {
  const call = `natlas.chat({
  messages,
${jsLanguageField(body.language)}  temperature: ${body.temperature},
  maxTokens: ${body.max_tokens},
  model: ${JSON.stringify(body.model)},
  stream: ${body.stream ? 'true' : 'false'},
})`;
  const tail = body.stream
    ? `const stream = await ${call};

for await (const chunk of stream) {
  if (chunk.delta) process.stdout.write(chunk.delta);
}`
    : `const reply = await ${call};
console.log(reply.content);`;
  return `${JS_CLIENT}

const messages = ${messages};

${tail}
`;
}

function renderPyChat(body: ChatRequestBody, messages: string): string {
  const args = `messages=messages,
${pyLanguageArg(body.language)}        temperature=${body.temperature},
        max_tokens=${body.max_tokens},
        model=${JSON.stringify(body.model)},
        stream=${body.stream ? 'True' : 'False'},`;
  const bodyBlock = body.stream
    ? `    for chunk in natlas.chat(
        ${args}
    ):
        if chunk.delta:
            print(chunk.delta, end="", flush=True)
    print()`
    : `    reply = natlas.chat(
        ${args}
    )
    print(reply.content)`;
  return `${PY_CLIENT}

messages = ${messages}

with NAtlas(
    base_url=os.environ["NATLAS_BASE_URL"],
    api_key=os.environ["NATLAS_API_KEY"],
) as natlas:
${bodyBlock}
`;
}

function jsLanguageField(language: string): string {
  if (SDK_LANGUAGES.has(language)) {
    return `  language: ${JSON.stringify(language)},\n`;
  }
  return `  // ${JSON.stringify(language)} is not an n-atlas language (ha, ig, yo, en).\n  // The system message already asks the model to reply in that language.\n`;
}

function pyLanguageArg(language: string): string {
  if (SDK_LANGUAGES.has(language)) {
    return `        language=${JSON.stringify(language)},\n`;
  }
  return `        # ${JSON.stringify(language)} is not a natlas language (ha, ig, yo, en).\n        # The system message already asks the model to reply in that language.\n`;
}

function renderTranscription(language: AsrLanguage, filename: string): SnippetSet {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '') || 'voice-note.ogg';
  return {
    curl: `${V1_BASH}

curl "$base/audio/transcriptions" \\
  -H "Authorization: Bearer $NATLAS_API_KEY" \\
  -F file=@${safe} \\
  -F language=${language}`,
    javascript: `${JS_CLIENT}

// \`file\` is a path (Node), Blob, File, or bytes.
const heard = await natlas.transcribe({
  audio: file,
  language: ${JSON.stringify(language)},
  filename: ${JSON.stringify(safe)},
});
console.log(heard.text);
`,
    python: `${PY_CLIENT}

with NAtlas(
    base_url=os.environ["NATLAS_BASE_URL"],
    api_key=os.environ["NATLAS_API_KEY"],
) as natlas:
    heard = natlas.transcribe(
        audio=${JSON.stringify(safe)},
        language=${JSON.stringify(language)},
        filename=${JSON.stringify(safe)},
    )
    print(heard.text)
`,
  };
}
