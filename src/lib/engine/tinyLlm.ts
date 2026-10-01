/**
 * Tiny offline LLM engine.
 *
 * Tier 2 of the assistant brain: a quantised small model (Qwen2-0.5B by
 * default, Llama-3.2-1B optional) running fully in-browser on WebGPU via
 * WebLLM. After a one-time download the model is cached by the browser and
 * generation works with ZERO internet — which is the point in a disaster.
 *
 * The module is dynamically imported by callers so ~2 MB of WebLLM never
 * enters the main bundle.
 */

import type * as WebLlmTypes from '@mlc-ai/web-llm';
import type { TinyModelId, TinyModelInfo } from '../types';

export const TINY_MODELS: Record<TinyModelId, TinyModelInfo> = {
  'qwen-0.5b': {
    id: 'qwen-0.5b',
    label: 'Qwen2 0.5B',
    modelId: 'Qwen2-0.5B-Instruct-q4f16_1-MLC',
    sizeMb: 500,
    note: 'Default · ~500 MB · good multilingual balance',
  },
  'llama-1b': {
    id: 'llama-1b',
    label: 'Llama 3.2 1B',
    modelId: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    sizeMb: 880,
    note: 'Sharper answers · ~880 MB · needs more GPU memory',
  },
};

export const DEFAULT_TINY_MODEL: TinyModelId = 'qwen-0.5b';

export interface TinyProgress {
  status: 'idle' | 'downloading' | 'ready' | 'error' | 'unsupported';
  /** 0..1, or null when indeterminate */
  progress: number | null;
  message: string;
}

type Listener = (p: TinyProgress) => void;

interface TinyState {
  engine: WebLlmTypes.MLCEngineInterface | null;
  loadedModel: string | null;
  progress: TinyProgress;
  listeners: Set<Listener>;
}

const state: TinyState = {
  engine: null,
  loadedModel: null,
  progress: { status: 'idle', progress: null, message: '' },
  listeners: new Set(),
};

export function onTinyProgress(fn: Listener): () => void {
  state.listeners.add(fn);
  fn(state.progress);
  return () => state.listeners.delete(fn);
}

function setProgress(p: TinyProgress) {
  state.progress = p;
  state.listeners.forEach((fn) => fn(p));
}

export function tinyProgressNow(): TinyProgress {
  return state.progress;
}

/** WebGPU + browser support probe. Safe to call anywhere. */
export function tinySupported(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { gpu?: unknown };
    return typeof nav.gpu !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Loads (or reuses) the engine for the given model. The import is dynamic so
 * the WebLLM runtime is only fetched when someone actually enables offline AI.
 */
export async function ensureTinyEngine(
  model: TinyModelId = DEFAULT_TINY_MODEL,
  /* test hook: inject a stub engine */
  inject?: WebLlmTypes.MLCEngineInterface,
): Promise<WebLlmTypes.MLCEngineInterface> {
  if (inject) {
    state.engine = inject;
    state.loadedModel = TINY_MODELS[model].modelId;
    setProgress({ status: 'ready', progress: 1, message: 'Model ready (offline)' });
    return inject;
  }
  if (state.engine && state.loadedModel === TINY_MODELS[model].modelId) return state.engine;
  if (!tinySupported()) {
    setProgress({
      status: 'unsupported',
      progress: null,
      message: 'This browser has no WebGPU — offline AI unavailable. The local knowledge base still works.',
    });
    throw new Error('webgpu-unsupported');
  }

  setProgress({ status: 'downloading', progress: 0, message: 'Fetching WebLLM runtime…' });
  const webllm = (await import('@mlc-ai/web-llm')) as typeof WebLlmTypes;

  let lastPct = -1;
  const engine = await webllm.CreateMLCEngine(TINY_MODELS[model].modelId, {
    initProgressCallback: (r: WebLlmTypes.InitProgressReport) => {
      const pct = Math.max(0, Math.min(1, r.progress ?? 0));
      // Report only on meaningful jumps to avoid render storms.
      if (pct - lastPct >= 0.01 || pct === 1) {
        lastPct = pct;
        setProgress({
          status: 'downloading',
          progress: pct,
          message: r.text || 'Downloading model…',
        });
      }
    },
  });

  state.engine = engine;
  state.loadedModel = TINY_MODELS[model].modelId;
  setProgress({ status: 'ready', progress: 1, message: `${TINY_MODELS[model].label} ready — runs offline` });
  return engine;
}

export interface TinyChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Reset the conversation context (keeps the loaded model in memory). */
export async function resetTinyChat(): Promise<void> {
  if (state.engine) await state.engine.resetChat();
}

export interface TinyStreamHandlers {
  onDelta?: (full: string, delta: string) => void;
  signal?: AbortSignal;
}

/**
 * Streams a completion from the loaded tiny model. `grounding` (system prompt)
 * carries the situation brief + retrieved KB facts; the model is instructed to
 * stay inside them, which is how a 0.5B model behaves above its weight.
 */
export async function tinyChatStream(
  system: string,
  turns: TinyChatTurn[],
  handlers: TinyStreamHandlers = {},
): Promise<string> {
  const engine = state.engine;
  if (!engine) throw new Error('tiny-engine-not-loaded');

  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'system', content: system }, ...turns],
    temperature: 0.35,
    max_tokens: 700,
    stream: true,
    stream_options: { include_usage: true },
  });

  let full = '';
  for await (const chunk of chunks) {
    if (handlers.signal?.aborted) {
      await engine.interruptGenerate();
      break;
    }
    const delta = chunk.choices?.[0]?.delta?.content ?? '';
    if (delta) {
      full += delta;
      handlers.onDelta?.(full, delta);
    }
  }
  return full.trim();
}

/** One-shot, non-streaming variant (used in tests and fallbacks). */
export async function tinyChat(system: string, turns: TinyChatTurn[]): Promise<string> {
  const engine = state.engine;
  if (!engine) throw new Error('tiny-engine-not-loaded');
  const res = await engine.chat.completions.create({
    messages: [{ role: 'system', content: system }, ...turns],
    temperature: 0.35,
    max_tokens: 700,
    stream: false,
  });
  return (res.choices?.[0]?.message?.content ?? '').trim();
}

/** Model size in memory is non-trivial — callers can drop it to free the GPU. */
export async function unloadTiny(): Promise<void> {
  if (state.engine) {
    try {
      await state.engine.unload();
    } catch {
      /* best effort */
    }
    state.engine = null;
    state.loadedModel = null;
    setProgress({ status: 'idle', progress: null, message: '' });
  }
}
