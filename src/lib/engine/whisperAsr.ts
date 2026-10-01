/**
 * Offline speech-to-text via Whisper-tiny, running in-browser.
 *
 * Used when the Web Speech API is unavailable (offline mode, Firefox/Safari).
 * transformers.js is imported lazily from CDN the first time it is needed and
 * the ~40 MB Whisper-tiny weights are then cached by the browser, so the app
 * bundle never carries it and transcription works with zero internet after
 * the first use.
 *
 * Whisper auto-detects the spoken language, which is how voice mode replies in
 * the language the user actually spoke.
 */

export interface WhisperAsr {
  (audio: Float32Array): Promise<{ text: string }>;
}

interface WhisperModule {
  pipeline: (
    task: 'automatic-speech-recognition',
    model: string,
    options?: { dtype?: string; progress_callback?: (p: { status: string; progress?: number; file?: string }) => void },
  ) => Promise<{ (audio: Float32Array, opts?: { return_timestamps?: boolean }): Promise<{ text: string }> }>;
}

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.5';
export const WHISPER_MODEL = 'onnx-community/whisper-tiny.en';

let mod: WhisperModule | null = null;
let asr: WhisperAsr | null = null;

export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error';
let statusListeners: ((s: WhisperStatus, msg: string) => void)[] = [];
let whisperStatus: WhisperStatus = 'idle';
let whisperMessage = '';

function setStatus(s: WhisperStatus, msg = '') {
  whisperStatus = s;
  whisperMessage = msg;
  statusListeners.forEach((fn) => fn(s, msg));
}

export function onWhisperStatus(fn: (s: WhisperStatus, msg: string) => void): () => void {
  statusListeners.push(fn);
  fn(whisperStatus, whisperMessage);
  return () => {
    statusListeners = statusListeners.filter((f) => f !== fn);
  };
}

/** Injectable for tests: pretend the model is loaded. */
export function injectAsr(fn: WhisperAsr | null) {
  asr = fn;
  setStatus(fn ? 'ready' : 'idle');
}

/** Dynamic import from CDN so nothing heavyweight lands in the app bundle. */
async function loadModule(): Promise<WhisperModule> {
  if (mod) return mod;
  setStatus('loading', 'Fetching speech engine…');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- dynamic ESM import from CDN
  const importer = new Function(`return import(${JSON.stringify(TRANSFORMERS_URL)})`) as () => Promise<WhisperModule>;
  mod = await importer();
  return mod;
}

async function ensureAsr(): Promise<WhisperAsr> {
  if (asr) return asr;
  const m = await loadModule();
  setStatus('loading', 'Downloading Whisper-tiny (~40 MB, one time)…');
  const pipe = await m.pipeline('automatic-speech-recognition', WHISPER_MODEL, {
    dtype: 'q8',
    progress_callback: (p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        setStatus('loading', `Downloading Whisper-tiny… ${Math.round(p.progress)}%`);
      }
    },
  });
  asr = (audio: Float32Array) => pipe(audio);
  setStatus('ready', 'Whisper ready — works offline');
  return asr;
}

/** Decodes an audio blob to 16 kHz mono PCM that Whisper expects. */
export async function blobToAudio(blob: Blob): Promise<Float32Array> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    let data: Float32Array;
    if (buf.numberOfChannels > 1) {
      const left = buf.getChannelData(0);
      const right = buf.getChannelData(1);
      data = new Float32Array(left.length);
      for (let i = 0; i < left.length; i += 1) data[i] = (left[i] + right[i]) / 2;
    } else {
      data = new Float32Array(buf.getChannelData(0));
    }
    return data;
  } finally {
    void ctx.close();
  }
}

/**
 * Records from the microphone until `stop` is called, then transcribes.
 * Returns a cancel-safe promise resolving to the transcript (may be empty).
 */
export async function recordAndTranscribe(
  opts: { onLevel?: (level: number) => void; onStatus?: (msg: string) => void } = {},
): Promise<{ text: string; cancel: () => void }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  let cancelled = false;
  let analyser: AnalyserNode | null = null;
  let raf: number | null = null;
  try {
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
      opts.onLevel?.(peak);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  } catch {
    /* level metering is optional */
  }

  return {
    cancel: () => {
      cancelled = true;
      try {
        recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        if (raf) cancelAnimationFrame(raf);
      } catch {
        /* ignore */
      }
    },
    text: await new Promise<string>((resolve) => {
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (raf) cancelAnimationFrame(raf);
        if (cancelled) return resolve('');
        try {
          opts.onStatus?.('Transcribing…');
          const audio = await blobToAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          if (audio.length < 1600) return resolve(''); // < 0.1 s — ignore taps
          const fn = await ensureAsr();
          const out = await fn(audio);
          resolve((out.text ?? '').trim());
        } catch (err) {
          opts.onStatus?.(err instanceof Error ? err.message : 'Transcription failed');
          resolve('');
        }
      };
      recorder.onstop && recorder.state === 'inactive' && recorder.onstop(new Event('stop'));
    }),
  };
}
