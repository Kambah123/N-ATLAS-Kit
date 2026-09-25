/**
 * A Hugging Face Inference Endpoint running N-ATLaS under vLLM speaks the
 * same OpenAI-compatible protocol as `/serve`. Point `baseURL` at that
 * endpoint. Speech routes exist only when the endpoint is the N-ATLAS Kit
 * gateway; a bare LLM endpoint has no `/v1/audio/transcriptions`.
 */
export { resolveOpenAICompatibleBase as resolveHfEndpointBase } from './openai-compatible.js';
