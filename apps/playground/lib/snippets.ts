import { type AsrLanguage, type ChatRequestBody } from '@/lib/types';

export type CodeRequest =
  | { kind: 'chat'; body: ChatRequestBody }
  | { kind: 'transcription'; language: AsrLanguage; filename: string };

export type SnippetSet = {
  curl: string;
  javascript: string;
  python: string;
};

export const SDK_NOTE =
  'The official SDKs (n-atlas-kit: `n-atlas` on npm and `natlas` on PyPI) are coming. Until then these snippets use plain fetch and httpx against the OpenAI-compatible API. Keep NATLAS_API_KEY on the server.';

const V1_BASH = `# NATLAS_BASE_URL may be the origin or the origin plus /v1.
base="\${NATLAS_BASE_URL%/}"
case "$base" in
  */v1) ;;
  *) base="$base/v1" ;;
esac`;

const V1_JS = `// NATLAS_BASE_URL may be the origin or the origin plus /v1.
const root = process.env.NATLAS_BASE_URL.replace(/\\/$/, '');
const base = root.endsWith('/v1') ? root : \`\${root}/v1\`;
const apiKey = process.env.NATLAS_API_KEY;`;

const V1_PY = `import os
import httpx

# NATLAS_BASE_URL may be the origin or the origin plus /v1.
root = os.environ["NATLAS_BASE_URL"].rstrip("/")
base = root if root.endswith("/v1") else f"{root}/v1"
api_key = os.environ["NATLAS_API_KEY"]`;

export function renderSnippets(request: CodeRequest): SnippetSet {
  if (request.kind === 'transcription')
    return renderTranscription(request.language, request.filename);
  return renderChat(request.body);
}

function renderChat(body: ChatRequestBody): SnippetSet {
  const json = JSON.stringify(body, null, 2);
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
    javascript: `${V1_JS}

const response = await fetch(\`\${base}/chat/completions\`, {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${json}),
});

if (!response.ok) {
  throw new Error(await response.text());
}
${
  body.stream
    ? `
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    const chunk = JSON.parse(data);
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) process.stdout.write(delta);
  }
}
`
    : `
const completion = await response.json();
console.log(completion.choices?.[0]?.message?.content ?? '');
`
}`,
    python: `${V1_PY}

payload = ${json}

${
  body.stream
    ? `import json

with httpx.stream(
    "POST",
    f"{base}/chat/completions",
    headers={"Authorization": f"Bearer {api_key}"},
    json=payload,
    timeout=180,
) as response:
    response.raise_for_status()
    for line in response.iter_lines():
        if not line.startswith("data:"):
            continue
        data = line.removeprefix("data:").strip()
        if not data or data == "[DONE]":
            continue
        delta = json.loads(data)["choices"][0].get("delta", {}).get("content")
        if delta:
            print(delta, end="", flush=True)
print()
`
    : `response = httpx.post(
    f"{base}/chat/completions",
    headers={"Authorization": f"Bearer {api_key}"},
    json=payload,
    timeout=180,
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])
`
}`,
  };
}

function renderTranscription(language: AsrLanguage, filename: string): SnippetSet {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '') || 'voice-note.ogg';
  return {
    curl: `${V1_BASH}

curl "$base/audio/transcriptions" \\
  -H "Authorization: Bearer $NATLAS_API_KEY" \\
  -F file=@${safe} \\
  -F language=${language}`,
    javascript: `${V1_JS}

const form = new FormData();
form.append('file', file, '${safe}'); // File or Blob from the recording / upload
form.append('language', '${language}');

const response = await fetch(\`\${base}/audio/transcriptions\`, {
  method: 'POST',
  headers: { Authorization: \`Bearer \${apiKey}\` },
  body: form,
});

if (!response.ok) throw new Error(await response.text());
const transcript = await response.json();
console.log(transcript.text);`,
    python: `${V1_PY}

with open("${safe}", "rb") as audio:
    response = httpx.post(
        f"{base}/audio/transcriptions",
        headers={"Authorization": f"Bearer {api_key}"},
        data={"language": "${language}"},
        files={"file": ("${safe}", audio)},
        timeout=180,
    )
response.raise_for_status()
print(response.json()["text"])`,
  };
}
