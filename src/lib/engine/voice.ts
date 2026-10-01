/**
 * Voice conversation layer: speech-to-text in, speech-out sentence-by-sentence.
 *
 * STT: Web Speech API when online (fast, on-device in Chrome). Offline falls
 * back to Whisper-tiny running in-browser (see whisperAsr.ts).
 * TTS: the device's own speech voices, matched to the language the user spoke.
 *
 * The key UX property: as the model streams its reply, completed sentences are
 * spoken IMMEDIATELY rather than waiting for the full answer — that is the
 * "responds the second it has the info" feel.
 */

export type SpeechLang = string; // BCP-47, e.g. 'hi-IN', 'en-IN'

export function speechSupported(): boolean {
  try {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  } catch {
    return false;
  }
}

export function ttsSupported(): boolean {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Speech recognition                                                  */
/* ------------------------------------------------------------------ */

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function createRecognition(lang: string): RecognitionLike | null {
  try {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => RecognitionLike)
      | undefined;
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    return rec;
  } catch {
    return null;
  }
}

export interface ListenHandlers {
  /** interim text while the user is still talking */
  onInterim?: (text: string) => void;
  /** a finalised phrase — the assistant should start thinking */
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

export interface ListenHandle {
  stop: () => void;
}

/**
 * Starts continuous recognition. Each finalised phrase fires `onFinal`
 * immediately — no "send button" exists in voice mode.
 */
export function startListening(lang: SpeechLang, handlers: ListenHandlers): ListenHandle {
  const rec = createRecognition(lang);
  if (!rec) {
    handlers.onError?.('Speech recognition is not available in this browser. Chrome or Edge on desktop works best.');
    return { stop: () => undefined };
  }

  let stopped = false;
  let restartTimer: number | null = null;

  rec.onresult = (e: unknown) => {
    const ev = e as {
      resultIndex: number;
      results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number };
    };
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
      const r = ev.results[i];
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        if (text) handlers.onFinal(text);
      } else {
        interim += r[0].transcript;
      }
    }
    if (interim) handlers.onInterim?.(interim.trim());
  };

  rec.onerror = (e: unknown) => {
    const err = e as { error?: string };
    const code = err?.error ?? 'unknown';
    if (code === 'no-speech' || code === 'aborted') return; // benign
    handlers.onError?.(
      code === 'not-allowed'
        ? 'Microphone permission was denied. Enable it in the browser address bar.'
        : `Speech recognition error: ${code}`,
    );
  };

  rec.onend = () => {
    // Chrome ends the session periodically; restart unless the user stopped us.
    if (!stopped) {
      restartTimer = window.setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }, 250);
    } else {
      handlers.onEnd?.();
    }
  };

  try {
    rec.start();
  } catch {
    handlers.onError?.('Could not start the microphone.');
  }

  return {
    stop: () => {
      stopped = true;
      if (restartTimer) window.clearTimeout(restartTimer);
      try {
        rec.onend = null;
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Speech synthesis — sentence streaming                               */
/* ------------------------------------------------------------------ */

/** Splits text into speakable sentences (keeps decimals like 5.5 intact). */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  // Shield decimal points (5.5, 112.5) from the splitter, split on real
  // terminators, then restore them.
  const shielded = cleaned.replace(/(\d)\.(\d)/g, '$1\u0001$2');
  const parts = shielded.match(/[^.!?。！？…]+[.!?。！？…]+|[^.!?。！？…]+$/g) ?? [shielded];
  return parts
    .map((p) => p.replace(/\u0001/g, '.').trim())
    .filter((p) => p.length > 1);
}

/** Strips markdown and hotline noise so speech sounds natural. */
export function speakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\s*[-•]\s+/g, '. ')
    .replace(/Emergency number:.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SpeakOptions {
  lang?: SpeechLang;
  /** called once the first sentence actually starts playing */
  onFirstSpoken?: () => void;
}

export interface SpeakHandle {
  cancel: () => void;
}

class SentenceSpeaker {
  private queue: string[] = [];
  private lang: SpeechLang = 'en-IN';
  private voice: SpeechSynthesisVoice | null = null;
  private speaking = false;
  private cancelled = false;
  private started = false;
  private onFirst: (() => void) | null = null;

  begin(lang: SpeechLang, onFirstSpoken?: () => void): SpeakHandle {
    this.cancel();
    this.queue = [];
    this.lang = lang;
    this.cancelled = false;
    this.started = false;
    this.onFirst = onFirstSpoken ?? null;
    this.voice = this.pickVoice(lang);
    return { cancel: () => this.cancel() };
  }

  /** Feed more text as it streams; completed sentences are spoken at once. */
  push(text: string) {
    if (this.cancelled) return;
    this.queue.push(text);
    this.flush();
  }

  /** Call when the stream is done — speaks the trailing fragment. */
  finish() {
    this.flush(true);
  }

  private flush(final = false) {
    const joined = this.queue.join('');
    if (!joined) {
      if (final && !this.speaking) this.cancelled = true;
      return;
    }
    const sentences = splitSentences(speakableText(joined));
    if (sentences.length <= 1 && !final) return; // wait for a full sentence
    const speakable = sentences.slice(0, sentences.length - (final ? 0 : 1)).join(' ');
    this.queue = final ? [] : [sentences[sentences.length - 1] ?? ''];
    if (!speakable.trim()) {
      if (final && !this.speaking) this.cancelled = true;
      return;
    }
    this.enqueue(speakable, final);
  }

  private enqueue(text: string, final: boolean) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = this.lang;
      u.rate = 1.02;
      u.pitch = 1;
      u.onstart = () => {
        if (!this.started) {
          this.started = true;
          this.onFirst?.();
        }
      };
      u.onend = () => {
        if (final && !this.queue.length) {
          this.speaking = false;
        } else {
          this.speaking = false;
        }
      };
      this.speaking = true;
      window.speechSynthesis.speak(u);
    } catch {
      this.speaking = false;
    }
  }

  cancel() {
    this.cancelled = true;
    this.speaking = false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }

  get isSpeaking() {
    return this.speaking || window.speechSynthesis.speaking;
  }

  private pickVoice(lang: SpeechLang): SpeechSynthesisVoice | null {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return null;
      const base = lang.split('-')[0].toLowerCase();
      const exact = voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase());
      if (exact) return exact;
      const sameLang = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
      const preferred = sameLang.find((v) => /female|google|natural/i.test(v.name)) ?? sameLang[0];
      return preferred ?? null;
    } catch {
      return null;
    }
  }
}

export function createSpeaker(): SentenceSpeaker {
  return new SentenceSpeaker();
}

/** One-shot speech helper (used for alerts and voice-mode greetings). */
export function speakOnce(text: string, lang: SpeechLang = 'en-IN'): SpeakHandle {
  const speaker = createSpeaker();
  const handle = speaker.begin(lang);
  speaker.push(text);
  speaker.finish();
  return handle;
}
