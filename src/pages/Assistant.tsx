import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  BrainCircuit,
  CloudOff,
  Cpu,
  Database,
  Download,
  Info,
  KeyRound,
  Languages,
  Mic,
  MicOff,
  PhoneCall,
  Send,
  Sparkles,
  Square,
  Trash2,
  User,
  Wifi,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import {
  answerQuery,
  answerWithTiny,
  hotlineForSituation,
  knowledgeStats,
  SUGGESTED_QUESTIONS,
  type AssistantReply,
} from '../lib/engine/assistant';
import { buildSituationBrief, chatComplete, splitReply } from '../lib/engine/llm';
import { DEFAULT_TINY_MODEL, ensureTinyEngine, onTinyProgress, TINY_MODELS, tinyProgressNow, tinySupported, type TinyProgress } from '../lib/engine/tinyLlm';
import { createSpeaker, speakableText, speechSupported, startListening, ttsSupported, type ListenHandle } from '../lib/engine/voice';
import { recordAndTranscribe } from '../lib/engine/whisperAsr';
import { useReach } from '../lib/store';
import { LOCATION_BY_ID } from '../lib/data/india';
import { Bar, Banner, Panel, PanelHead, TONE_HEX } from '../components/ui';
import { relativeTime, uid } from '../lib/geo';

const BADGE_TONE: Record<AssistantReply['kind'], string> = {
  system: TONE_HEX.low,
  guidance: TONE_HEX.info,
  contact: TONE_HEX.critical,
  unknown: TONE_HEX.elevated,
  chat: TONE_HEX.accent,
};

const LANGUAGES: { code: string; label: string; name: string }[] = [
  { code: 'en-IN', label: 'English', name: 'English' },
  { code: 'hi-IN', label: 'हिन्दी', name: 'Hindi' },
  { code: 'ta-IN', label: 'தமிழ்', name: 'Tamil' },
  { code: 'te-IN', label: 'తెలుగు', name: 'Telugu' },
  { code: 'bn-IN', label: 'বাংলা', name: 'Bengali' },
  { code: 'mr-IN', label: 'मराठी', name: 'Marathi' },
  { code: 'gu-IN', label: 'ગુજરાતી', name: 'Gujarati' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ', name: 'Kannada' },
  { code: 'ml-IN', label: 'മലയാളം', name: 'Malayalam' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ', name: 'Punjabi' },
];

export function Assistant({ analysis }: { analysis: Analysis }) {
  const chat = useReach((s) => s.chat);
  const pushUser = useReach((s) => s.pushUser);
  const pushAssistant = useReach((s) => s.pushAssistant);
  const clearChat = useReach((s) => s.clearChat);
  const residentProfile = useReach((s) => s.residentProfile);
  const setResidentProfile = useReach((s) => s.setResidentProfile);
  const connectivity = useReach((s) => s.connectivity);
  const simulateOffline = useReach((s) => s.simulateOffline);
  const selectedZoneId = useReach((s) => s.selectedZoneId);

  const weather = useReach((s) => s.weather);
  const liveLocationId = useReach((s) => s.liveLocationId);
  const llm = useReach((s) => s.llm);
  const setLlm = useReach((s) => s.setLlm);

  /* tiny offline LLM */
  const tinyModel = useReach((s) => s.tinyModel);
  const setTinyModel = useReach((s) => s.setTinyModel);
  const [tinyProgress, setTinyProgress] = useState<TinyProgress>(tinyProgressNow);
  useEffect(() => onTinyProgress(setTinyProgress), []);

  /* voice */
  const voiceLang = useReach((s) => s.voiceLang);
  const setVoiceLang = useReach((s) => s.setVoiceLang);
  const voicePhase = useReach((s) => s.voicePhase);
  const setVoicePhase = useReach((s) => s.setVoicePhase);
  const voiceOn = llm.voice;

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [streamText, setStreamText] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [pttBusy, setPttBusy] = useState(false);
  const [pttStatus, setPttStatus] = useState('');
  const [profileDraft, setProfileDraft] = useState(residentProfile);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const listenRef = useRef<ListenHandle | null>(null);
  const speakerRef = useRef<ReturnType<typeof createSpeaker> | null>(null);
  const resumeTimer = useRef<number | null>(null);

  const offline = simulateOffline || connectivity !== 'online';
  const onlineLlm = llm.mode === 'online' && llm.apiKey.trim().length > 0 && !offline;
  const tinyReady = tinyProgress.status === 'ready';
  const webSpeech = speechSupported();
  const stats = knowledgeStats();
  const messages = chat.filter((m) => m.text.length > 0 || m.reply);
  const location = LOCATION_BY_ID[liveLocationId];
  const langName = LANGUAGES.find((l) => l.code === voiceLang)?.name ?? 'English';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, thinking, streamText]);

  useEffect(() => () => {
    listenRef.current?.stop();
    speakerRef.current?.cancel();
    if (resumeTimer.current) window.clearInterval(resumeTimer.current);
  }, []);

  /** Shared weather context so every tier can answer weather questions. */
  const weatherCtx = () => ({
    locationName: location ? `${location.name}, ${location.state}` : undefined,
    weatherSummary: weather
      ? `${weather.current.condition}, ${weather.current.temperatureC.toFixed(1)}°C, humidity ${Math.round(
          weather.current.humidity,
        )}%, wind ${Math.round(weather.current.windKmh)} km/h, fire-weather index ${Math.round(
          weather.fireDanger * 100,
        )}/100 (${weather.fireClass})`
      : undefined,
    disturbanceSummary: weather?.disturbances.length
      ? `Most significant: ${weather.disturbances[0].label} in about ${weather.disturbances[0].leadHours}h — ${weather.disturbances[0].detail}`
      : undefined,
    disturbanceBullets: weather?.disturbances
      .slice(0, 5)
      .map((d) => `${d.label} — in ~${d.leadHours}h, peak ${d.peakValue.toFixed(1)} ${d.unit} (${d.severity})`),
  });

  const speakReply = (r: AssistantReply) => {
    if (!ttsSupported()) return;
    if (!speakerRef.current) speakerRef.current = createSpeaker();
    const speaker = speakerRef.current;
    const text =
      speakableText(`${r.title}. ${r.body.join(' ')} ${r.bullets.map((b) => `${b}.`).join(' ')}`) +
      (r.hotline ? ` If you need help, call ${r.hotline.number}, ${r.hotline.label}.` : '');
    speaker.begin(voiceLang, () => setVoicePhase('speaking'));
    speaker.push(text);
    speaker.finish();
    // Return to listening when speech ends.
    if (resumeTimer.current) window.clearInterval(resumeTimer.current);
    const started = Date.now();
    resumeTimer.current = window.setInterval(() => {
      if (!speaker.isSpeaking) {
        window.clearInterval(resumeTimer.current!);
        resumeTimer.current = null;
        if (useReach.getState().llm.voice) startVoiceListening();
        else setVoicePhase('idle');
      } else if (Date.now() - started > 120_000) {
        window.clearInterval(resumeTimer.current!);
        resumeTimer.current = null;
      }
    }, 400);
  };

  const startVoiceListening = () => {
    if (!webSpeech) {
      // Whisper push-to-talk is used instead; surface that in the phase.
      setVoicePhase('idle');
      return;
    }
    setVoicePhase('listening');
    listenRef.current?.stop();
    listenRef.current = startListening(voiceLang, {
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        setInterim('');
        // Barge-in: speaking stops the moment the user talks.
        speakerRef.current?.cancel();
        listenRef.current?.stop();
        void ask(t, true);
      },
      onError: (m) => setModelError(m),
      onEnd: () => {
        if (useReach.getState().voicePhase === 'listening') setVoicePhase('idle');
      },
    });
  };

  const toggleVoice = () => {
    if (voiceOn) {
      setLlm({ voice: false });
      listenRef.current?.stop();
      speakerRef.current?.cancel();
      setVoicePhase('idle');
      setInterim('');
      return;
    }
    setLlm({ voice: true });
    startVoiceListening();
  };

  const togglePtt = async () => {
    if (pttBusy) {
      pttCancelRef.current?.();
      return;
    }
    setPttBusy(true);
    setPttStatus('Listening… tap to stop');
    try {
      const rec = await recordAndTranscribe({
        onStatus: setPttStatus,
      });
      pttCancelRef.current = rec.cancel;
      const text = await rec.text;
      setPttStatus('');
      if (text) void ask(text, true);
    } finally {
      setPttBusy(false);
    }
  };
  const pttCancelRef = useRef<(() => void) | null>(null);

  const historyTurns = (limit = 12) =>
    messages
      .slice(-limit)
      .map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
        content:
          m.role === 'user'
            ? m.text
            : (m.reply?.body.join('\n\n') || m.reply?.title || '') +
              (m.reply?.bullets.length ? `\n${m.reply.bullets.map((b) => `- ${b}`).join('\n')}` : ''),
      }))
      .filter((t) => t.content.trim().length > 0);

  const ask = async (question: string, fromVoice = false) => {
    const q = question.trim();
    if (!q || thinking) return;
    pushUser(q);
    setInput('');
    setThinking(true);
    setModelError(null);
    if (fromVoice) setVoicePhase('thinking');

    /* ---- Tier 1: cloud model (unlimited, online) ---- */
    if (onlineLlm) {
      setLlm({ engine: 'cloud' });
      try {
        const brief = buildSituationBrief(analysis, weather);
        const turns = [...historyTurns(), { role: 'user' as const, content: q }];
        const text = await chatComplete(llm, turns, brief, residentProfile, offline, voiceOn ? langName : undefined);
        const { paragraphs, bullets } = splitReply(text);
        const hotline = hotlineForSituation(`${q} ${text}`);
        const reply: AssistantReply = {
          id: uid('msg'),
          kind: 'chat',
          badge: 'LIVE AI ASSISTANT · GROUNDED IN REACH SYSTEM DATA',
          title: `REACH Assistant — ${location ? location.name : 'district'} answer`,
          body: paragraphs,
          bullets,
          sources: ['REACH live situation brief', `${llm.provider} · ${llm.model}`],
          disclaimer: offline
            ? 'You are offline — this reply used general knowledge only.'
            : 'Generated live and grounded in the current REACH brief. Verify against the Live Map before acting.',
          confidence: 0.85,
          hotline,
          followups: [],
        };
        pushAssistant({ id: uid('msg'), at: Date.now(), role: 'assistant', text: '', reply });
        if (voiceOn) speakReply(reply);
        else if (fromVoice) setVoicePhase('idle');
      } catch (err) {
        setModelError(
          err instanceof Error && /401|403/.test(err.message)
            ? 'The AI provider rejected the API key. Check it in Assistant settings — REACH has fallen back to the offline knowledge base.'
            : 'Could not reach the AI provider. Falling back to the on-device engine.',
        );
        await tinyOrKb(q, fromVoice);
      } finally {
        setThinking(false);
      }
      return;
    }

    await tinyOrKb(q, fromVoice);
  };

  /** Tier 2 (tiny offline model when downloaded) with Tier 3 (KB) fallback. */
  const tinyOrKb = async (q: string, fromVoice: boolean) => {
    if (tinyReady && !offline) {
      // The tiny model can also answer offline; the "not offline" guard only
      // avoids first-use downloads while the network is down.
    }
    if (tinyReady) {
      setLlm({ engine: 'tiny' });
      setStreamText('');
      try {
        const { reply } = await answerWithTiny(
          q,
          historyTurns(6),
          {
            analysis,
            offline,
            profile: residentProfile,
            selectedZoneId,
            ...weatherCtx(),
          },
          {
            model: tinyModel || DEFAULT_TINY_MODEL,
            language: voiceOn ? langName : undefined,
            onDelta: (full) => setStreamText(full),
          },
        );
        setStreamText(null);
        pushAssistant({ id: uid('msg'), at: Date.now(), role: 'assistant', text: '', reply });
        if (voiceOn) speakReply(reply);
        else if (fromVoice) setVoicePhase('idle');
        setThinking(false);
        return;
      } catch (err) {
        setStreamText(null);
        setModelError(
          err instanceof Error && err.message === 'webgpu-unsupported'
            ? 'This browser has no WebGPU, so the offline AI model cannot run here. The knowledge-base engine answered instead.'
            : 'The offline AI model failed for this answer — the knowledge-base engine took over.',
        );
      }
    }

    /* ---- Tier 3: local knowledge base ---- */
    setLlm({ engine: 'kb' });
    window.setTimeout(() => {
      const reply = answerQuery(q, {
        analysis,
        offline,
        profile: residentProfile,
        selectedZoneId,
        ...weatherCtx(),
      });
      pushAssistant({ id: uid('msg'), at: Date.now(), role: 'assistant', text: '', reply });
      setThinking(false);
      if (voiceOn) speakReply(reply);
      else if (fromVoice) setVoicePhase('idle');
    }, 280);
  };

  const downloadModel = async () => {
    setModelError(null);
    try {
      await ensureTinyEngine(tinyModel || DEFAULT_TINY_MODEL);
    } catch {
      /* progress + error surface through the listener */
    }
  };

  const engineChip =
    llm.engine === 'cloud' && onlineLlm
      ? { label: `AI · ${llm.model}`, icon: <Wifi size={11} />, color: TONE_HEX.accent }
      : llm.engine === 'tiny' && tinyReady
        ? { label: `OFFLINE AI · ${TINY_MODELS[tinyModel].label}`, icon: <Cpu size={11} />, color: '#8b5cf6' }
        : { label: 'LOCAL ENGINE', icon: <BadgeCheck size={11} />, color: TONE_HEX.low };

  const phaseLabel: Record<string, string> = {
    idle: '',
    listening: 'Listening — just start talking',
    thinking: 'Thinking…',
    speaking: 'Speaking — talk to interrupt',
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
      <Panel className="flex h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden">
        <PanelHead
          title="REACH Assistant"
          subtitle="Three brains: cloud AI → offline AI → knowledge base. Ask by voice or text."
          icon={<Bot size={15} />}
          tone="accent"
          right={
            <div className="flex items-center gap-1.5">
              <span className="chip" style={{ color: engineChip.color, borderColor: `${engineChip.color}55`, background: `${engineChip.color}18` }}>
                {engineChip.icon} {engineChip.label}
              </span>
              <button
                type="button"
                onClick={toggleVoice}
                className={clsx('chip transition', voiceOn && 'animate-pulse')}
                style={{
                  color: voiceOn ? TONE_HEX.critical : TONE_HEX.neutral,
                  borderColor: `${voiceOn ? TONE_HEX.critical : TONE_HEX.neutral}55`,
                  background: `${voiceOn ? TONE_HEX.critical : TONE_HEX.neutral}18`,
                }}
                title={voiceOn ? 'Voice conversation ON — tap to stop' : 'Start a voice conversation'}
              >
                {voiceOn ? <Mic size={11} /> : <MicOff size={11} />} VOICE
              </button>
              {offline ? (
                <span className="chip" style={{ color: TONE_HEX.elevated, borderColor: `${TONE_HEX.elevated}55`, background: `${TONE_HEX.elevated}18` }}>
                  <CloudOff size={11} /> OFFLINE
                </span>
              ) : null}
              <button type="button" className="btn !px-2 !py-1.5" onClick={clearChat} title="Clear conversation">
                <Trash2 size={13} />
              </button>
            </div>
          }
        />

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-threat-accent/40 bg-threat-accent/10 text-threat-accent">
              <Bot size={15} />
            </span>
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 p-3.5">
              <p className="text-[12.5px] leading-relaxed text-ink">
                I am the REACH Assistant. I run on three brains, falling back automatically, and I answer by voice in your language:
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-threat-accent/30 bg-threat-accent/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: TONE_HEX.accent }}>
                    <Wifi size={12} /> CLOUD AI
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">Unlimited open conversation, grounded in live REACH data.</p>
                </div>
                <div className="rounded-xl border border-[#8b5cf6]/30 bg-[#8b5cf6]/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: '#a78bfa' }}>
                    <Cpu size={12} /> OFFLINE AI
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">A tiny model on your device (WebGPU). Works with zero internet after download.</p>
                </div>
                <div className="rounded-xl border border-threat-info/30 bg-threat-info/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: TONE_HEX.info }}>
                    <Database size={12} /> KNOWLEDGE BASE
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">{stats.entries} curated emergency topics. Instant, always available.</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">
                Every answer ends with the emergency number for that situation. {voiceOn ? 'Voice mode is ON — speak naturally.' : 'Tap VOICE to talk instead of typing.'}
              </p>
            </div>
          </div>

          {messages.map((m) => {
            if (m.role === 'user') {
              return (
                <div key={m.id} className="flex justify-end gap-3">
                  <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-threat-info/30 bg-threat-info/10 px-3.5 py-2.5">
                    <p className="text-[12.5px] leading-relaxed text-ink">{m.text}</p>
                  </div>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-base-600/70 bg-base-800/70 text-ink-muted">
                    <User size={15} />
                  </span>
                </div>
              );
            }
            const r = m.reply;
            if (!r) return null;
            const tone = BADGE_TONE[r.kind];
            return (
              <div key={m.id} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-threat-accent/40 bg-threat-accent/10 text-threat-accent">
                  <Bot size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  {r.urgent ? (
                    <div className="mb-1.5 rounded-xl border border-threat-critical/60 bg-threat-critical/15 px-3 py-2 text-[11.5px] font-semibold text-threat-critical">
                      🚨 URGENT — {r.urgentReason}. Call {r.hotline?.number ?? '112'} now while you read this.
                    </div>
                  ) : null}
                  <div className="rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip" style={{ color: tone, borderColor: `${tone}55`, background: `${tone}18` }}>
                        <Sparkles size={10} /> {r.badge}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">confidence {Math.round(r.confidence * 100)}%</span>
                    </div>

                    <h3 className="mt-2.5 text-[13.5px] font-semibold text-ink">{r.title}</h3>
                    {r.body.map((p, i) => (
                      <p key={i} className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                        {p}
                      </p>
                    ))}

                    {r.bullets.length ? (
                      <ul className="mt-2.5 space-y-1.5">
                        {r.bullets.map((b, i) => (
                          <li key={i} className="flex gap-2 text-[12px] leading-relaxed text-ink-muted">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: tone }} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {r.disclaimer ? (
                      <div className="mt-3 flex items-start gap-2 rounded-lg border border-base-700/60 bg-base-900/60 px-2.5 py-2">
                        <Info size={12} className="mt-0.5 shrink-0 text-ink-faint" />
                        <span className="text-[10.5px] leading-relaxed text-ink-faint">{r.disclaimer}</span>
                      </div>
                    ) : null}

                    {r.hotline ? (
                      <a
                        href={`tel:${r.hotline.number.replace(/\s/g, '')}`}
                        className="mt-3 flex items-center gap-3 rounded-xl border border-threat-critical/50 bg-threat-critical/12 px-3 py-2.5 transition hover:border-threat-critical/80 hover:bg-threat-critical/20"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-threat-critical/50 bg-threat-critical/15 text-threat-critical">
                          <PhoneCall size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] uppercase tracking-[0.16em] text-threat-critical">
                            Emergency number for this situation
                          </span>
                          <span className="block font-mono text-[17px] font-bold text-ink">{r.hotline.number}</span>
                          <span className="block truncate text-[10.5px] text-ink-faint">{r.hotline.label}</span>
                        </span>
                        <span className="chip shrink-0 border-threat-critical/50 bg-threat-critical/15 text-threat-critical">Call</span>
                      </a>
                    ) : null}

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-base-700/50 pt-2.5">
                      <span className="hud-text">Sources</span>
                      {r.sources.map((s) => (
                        <span key={s} className="chip border-base-600/70 bg-base-800/60 text-ink-faint">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {r.followups.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.followups.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => ask(f)}
                          className="rounded-full border border-base-600/70 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-threat-accent/50 hover:text-ink"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {streamText ? (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#8b5cf6]/40 bg-[#8b5cf6]/10 text-[#a78bfa]">
                <Cpu size={15} className="animate-pulse" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 p-3.5">
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">{streamText}▍</p>
              </div>
            </div>
          ) : null}

          {thinking && !streamText ? (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-threat-accent/40 bg-threat-accent/10 text-threat-accent">
                <BrainCircuit size={15} className="animate-pulse" />
              </span>
              <div className="rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                  <span className="ml-1 text-[11px] text-ink-faint">
                    {llm.engine === 'tiny' ? 'Offline AI is generating…' : onlineLlm ? 'Cloud AI is thinking…' : 'Retrieving from offline knowledge base…'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {interim ? (
            <div className="flex justify-end">
              <div className="max-w-[82%] rounded-2xl rounded-tr-sm border border-dashed border-base-600/70 px-3.5 py-2.5 text-[12.5px] italic text-ink-faint">
                {interim}
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-base-700/60 p-3">
          {voiceOn && phaseLabel[voicePhase] ? (
            <div className="mb-2 flex items-center justify-between rounded-xl border border-threat-critical/40 bg-threat-critical/10 px-3 py-2">
              <span className="flex items-center gap-2 text-[11.5px] font-medium text-threat-critical">
                <span className={clsx('h-2 w-2 rounded-full bg-threat-critical', voicePhase !== 'idle' && 'animate-pulse')} />
                {phaseLabel[voicePhase]}
              </span>
              <span className="text-[10.5px] text-ink-faint">{LANGUAGES.find((l) => l.code === voiceLang)?.label} · tap VOICE to stop</span>
            </div>
          ) : null}
          {modelError ? (
            <div className="mb-2">
              <Banner tone="elevated" icon={<Info size={13} />} title="Notice">
                {modelError}
              </Banner>
            </div>
          ) : null}
          <div className="flex gap-2">
            {!voiceOn && webSpeech ? (
              <button type="button" className="btn !px-3" onClick={toggleVoice} title="Start voice conversation">
                <Mic size={15} className="text-threat-critical" />
              </button>
            ) : null}
            {!webSpeech ? (
              <button
                type="button"
                className={clsx('btn !px-3', pttBusy && 'btn-danger')}
                onClick={() => void togglePtt()}
                title={pttBusy ? 'Stop and transcribe' : 'Hold a conversation by voice (tap to talk, tap to stop)'}
              >
                {pttBusy ? <Square size={14} /> : <Mic size={15} className="text-threat-critical" />}
              </button>
            ) : null}
            <input
              className="field flex-1"
              placeholder={voiceOn ? 'Voice mode is on — or type here…' : 'Ask anything — floods, fire, heat, first aid, shelters, routes…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
            />
            <button type="button" className="btn btn-primary !px-4" onClick={() => void ask(input)} disabled={!input.trim()}>
              <Send size={15} />
            </button>
          </div>
          {pttBusy || pttStatus ? <p className="mt-1.5 text-[10.5px] text-ink-faint">{pttStatus || 'Transcribing offline with Whisper…'}</p> : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void ask(q)}
                className="rounded-full border border-base-600/70 px-2.5 py-1 text-[11px] text-ink-muted transition hover:border-threat-accent/50 hover:text-ink"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        <Panel>
          <PanelHead
            title="Offline AI — tiny model"
            subtitle="A real LLM that runs on this device with zero internet"
            icon={<Cpu size={15} />}
            tone="accent"
            right={
              <span
                className="chip"
                style={{
                  color: tinyReady ? '#a78bfa' : tinyProgress.status === 'downloading' ? TONE_HEX.elevated : TONE_HEX.neutral,
                  borderColor: `${tinyReady ? '#a78bfa' : TONE_HEX.neutral}55`,
                  background: `${tinyReady ? '#a78bfa' : TONE_HEX.neutral}18`,
                }}
              >
                {tinyReady ? 'READY · OFFLINE' : tinyProgress.status === 'downloading' ? 'DOWNLOADING' : 'NOT INSTALLED'}
              </span>
            }
          />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TINY_MODELS) as (keyof typeof TINY_MODELS)[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTinyModel(id)}
                  className={clsx('btn !px-2.5 !py-1 text-[11px]', tinyModel === id && 'btn-primary')}
                >
                  {TINY_MODELS[id].label}
                </button>
              ))}
            </div>
            <p className="text-[10.5px] leading-relaxed text-ink-faint">{TINY_MODELS[tinyModel].note}</p>

            {tinyProgress.status === 'downloading' ? (
              <div>
                <Bar className="mt-1" value={tinyProgress.progress ?? 0} tone="accent" height={8} />
                <p className="mt-1.5 text-[10.5px] text-ink-faint">
                  {Math.round((tinyProgress.progress ?? 0) * 100)}% · {tinyProgress.message}
                </p>
              </div>
            ) : null}

            {!tinyReady ? (
              tinySupported() ? (
                <button type="button" className="btn btn-primary w-full" onClick={() => void downloadModel()}>
                  <Download size={14} /> Download offline AI ({TINY_MODELS[tinyModel].sizeMb} MB, one time)
                </button>
              ) : (
                <Banner tone="elevated" icon={<Info size={13} />} title="WebGPU not available in this browser">
                  Use Chrome or Edge on desktop for the on-device model. The knowledge-base engine and voice still work everywhere.
                </Banner>
              )
            ) : (
              <p className="text-[10.5px] leading-relaxed text-ink-faint">
                {tinyProgress.message}. Answers are grounded in the REACH knowledge base and live brief, so the small model stays factual. It keeps working in airplane mode.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Voice conversation"
            subtitle="Talk to REACH — it replies out loud, in your language"
            icon={<Mic size={15} />}
            tone="accent"
            right={
              <span className="chip" style={{ color: voiceOn ? TONE_HEX.critical : TONE_HEX.neutral, borderColor: `${voiceOn ? TONE_HEX.critical : TONE_HEX.neutral}55` }}>
                {voiceOn ? 'LIVE' : 'OFF'}
              </span>
            }
          />
          <div className="space-y-3 p-4">
            <label className="flex items-center gap-2 text-[11.5px] text-ink-muted">
              <Languages size={13} /> Spoken language
              <select className="field !py-1.5" value={voiceLang} onChange={(e) => setVoiceLang(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.code})
                  </option>
                ))}
              </select>
            </label>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
              <li>• Online: fast on-device recognition (Chrome/Edge) with live captions.</li>
              <li>• Offline: Whisper-tiny transcription tap-to-talk — downloads once (~40 MB).</li>
              <li>• Replies are spoken sentence-by-sentence the moment they are generated.</li>
              <li>• Talk over the assistant to interrupt it — it stops and listens.</li>
            </ul>
            {voiceOn ? (
              <button type="button" className="btn btn-danger w-full" onClick={toggleVoice}>
                <MicOff size={14} /> Stop voice conversation
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary w-full"
                onClick={toggleVoice}
                disabled={!webSpeech && !ttsSupported()}
              >
                <Mic size={14} /> Start talking to REACH
              </button>
            )}
            {!webSpeech ? (
              <p className="text-[10.5px] text-ink-faint">
                This browser has no built-in speech recognition, so the mic button uses tap-to-talk with offline Whisper.
              </p>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Assistant status" subtitle="What it can and cannot do right now" icon={<BrainCircuit size={15} />} tone="accent" />
          <div className="space-y-3 p-4">
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-ink-muted">Knowledge base coverage</span>
                <span className="font-mono text-ink">{stats.entries} topics</span>
              </div>
              <Bar className="mt-2" value={Math.min(1, stats.entries / 48)} tone="accent" height={6} />
              <p className="mt-1.5 text-[10.5px] text-ink-faint">
                {stats.bullets} actionable instructions across {stats.hazards} hazard categories.
              </p>
            </div>

            <div className="space-y-1.5">
              <StatusRow ok label="Verified system data" detail="Hazard field, shelters, roads, decisions — cached locally" />
              <StatusRow ok label="Emergency knowledge base" detail="Ships with the app, requires no network" />
              <StatusRow ok={tinyReady} label="Offline AI model" detail={tinyReady ? `${TINY_MODELS[tinyModel].label} on-device via WebGPU` : 'Not downloaded — optional'} />
              <StatusRow ok={onlineLlm} label="Cloud AI model" detail={onlineLlm ? `${llm.provider} · unlimited conversation` : 'Add an API key to enable (optional)'} />
              <StatusRow ok label="Voice conversation" detail={webSpeech ? 'Live recognition available' : 'Whisper tap-to-talk available'} />
              <StatusRow
                ok
                label="Live weather & fire danger"
                detail={
                  weather
                    ? `${LOCATION_BY_ID[weather.locationId]?.name ?? 'Location'} · ${weather.source === 'open-meteo' ? 'live Open-Meteo feed' : weather.source === 'cached' ? 'last downloaded reading' : 'modelled estimate'}`
                    : 'Not loaded yet'
                }
              />
            </div>

            {offline ? (
              <Banner tone="elevated" icon={<CloudOff size={13} />} title="You are offline">
                {tinyReady
                  ? 'The offline AI model keeps answering. Verified system data reflects the last sync.'
                  : 'I will not claim to know current weather or new reports. Everything I give you is cached system data or fixed guidance.'}
              </Banner>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="AI model"
            subtitle="Connect your own cloud model for unlimited chat"
            icon={<KeyRound size={15} />}
            tone="accent"
          />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(['offline', 'online'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setLlm({ mode: m })} className={clsx('btn !px-3 !py-1.5 text-[11.5px]', llm.mode === m && 'btn-primary')}>
                  {m === 'offline' ? 'Built-in / offline AI' : 'My AI model'}
                </button>
              ))}
            </div>

            {llm.mode === 'online' ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(['openai', 'gemini', 'custom'] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setLlm({ provider: p })} className={clsx('btn !px-2.5 !py-1 text-[11px]', llm.provider === p && 'btn-primary')}>
                      {p === 'openai' ? 'OpenAI-compatible' : p === 'gemini' ? 'Google Gemini' : 'Custom endpoint'}
                    </button>
                  ))}
                </div>
                <input className="field" type="password" placeholder="Paste your API key (stored only on this device)" value={llm.apiKey} onChange={(e) => setLlm({ apiKey: e.target.value })} />
                <input className="field" placeholder="Model, e.g. gpt-4o-mini or gemini-1.5-flash" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />
                {llm.provider !== 'gemini' ? (
                  <input className="field" placeholder="Base URL, e.g. https://api.openai.com/v1" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} />
                ) : null}
                <p className="text-[10.5px] leading-relaxed text-ink-faint">
                  The key stays in this browser and is sent only to the provider you configure. Cloud → offline AI → knowledge base fallback is automatic.
                </p>
              </>
            ) : (
              <p className="text-[10.5px] leading-relaxed text-ink-faint">
                Built-in mode uses the knowledge base plus the downloaded offline AI model — no key, no network needed. Switch to “My AI model” for open-ended cloud conversation.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Personalise guidance" subtitle="Stored on this device only — used to tailor answers" icon={<User size={15} />} tone="info" />
          <div className="space-y-3 p-4">
            <textarea
              className="field min-h-[84px]"
              placeholder="e.g. elderly parent with mobility issues, an infant, a pet, no car, third floor flat"
              value={profileDraft}
              onChange={(e) => setProfileDraft(e.target.value)}
            />
            <button type="button" className="btn btn-primary w-full" onClick={() => setResidentProfile(profileDraft.trim())}>
              Save personal context
            </button>
            {residentProfile ? (
              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3 text-[11px] text-ink-muted">
                Active context: <span className="text-ink">{residentProfile}</span>
              </div>
            ) : (
              <p className="text-[10.5px] text-ink-faint">Adding context changes how the assistant frames guidance but never changes the underlying hazard data.</p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead title="Conversation" subtitle="This session only" icon={<Info size={15} />} tone="info" />
          <div className="space-y-1.5 p-4 text-[11px] text-ink-muted">
            <div className="flex justify-between">
              <span>Messages</span>
              <span className="font-mono text-ink">{messages.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Last activity</span>
              <span className="font-mono text-ink">{messages.length ? relativeTime(messages[messages.length - 1].at) : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Storage</span>
              <span className="font-mono text-ink">On-device, cleared on request</span>
            </div>
            <button type="button" className="btn mt-2 w-full" onClick={clearChat}>
              <Trash2 size={13} /> Clear conversation
            </button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function StatusRow({ label, detail, ok }: { label: string; detail: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-base-700/50 bg-base-900/40 px-2.5 py-2">
      <span className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full')} style={{ background: ok ? TONE_HEX.low : TONE_HEX.elevated }} />
      <div className="min-w-0">
        <div className="text-[11.5px] text-ink">{label}</div>
        <div className="text-[10.5px] text-ink-faint">{detail}</div>
      </div>
    </div>
  );
}
