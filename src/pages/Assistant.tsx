import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bot,
  BrainCircuit,
  CloudOff,
  Database,
  Info,
  KeyRound,
  PhoneCall,
  Send,
  Sparkles,
  Trash2,
  User,
  Wifi,
} from 'lucide-react';
import clsx from 'clsx';
import type { Analysis } from '../lib/engine/analysis';
import {
  answerQuery,
  hotlineForSituation,
  knowledgeStats,
  SUGGESTED_QUESTIONS,
  type AssistantReply,
} from '../lib/engine/assistant';
import { buildSituationBrief, chatComplete, splitReply } from '../lib/engine/llm';
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

  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState(residentProfile);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const offline = simulateOffline || connectivity !== 'online';
  const onlineLlm = llm.mode === 'online' && llm.apiKey.trim().length > 0 && !offline;
  const stats = knowledgeStats();
  const messages = chat.filter((m) => m.text.length > 0 || m.reply);
  const location = LOCATION_BY_ID[liveLocationId];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat.length, thinking]);

  /** Shared weather context so the offline assistant can answer weather questions too. */
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

  const ask = async (question: string) => {
    if (!question.trim() || thinking) return;
    pushUser(question);
    setInput('');
    setThinking(true);
    setModelError(null);

    // Online model path — genuinely unlimited conversation, grounded in the
    // live brief so it cannot invent conditions.
    if (onlineLlm) {
      try {
        const brief = buildSituationBrief(analysis, weather);
        const history = messages.slice(-12).map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content:
            m.role === 'user'
              ? m.text
              : (m.reply?.body.join('\n\n') || m.reply?.title || '') +
                (m.reply?.bullets.length ? `\n${m.reply.bullets.map((b) => `- ${b}`).join('\n')}` : ''),
        }));
        const turns = [...history.filter((t) => t.content.trim().length > 0), { role: 'user' as const, content: question }];
        const text = await chatComplete(llm, turns, brief, residentProfile, offline);
        const { paragraphs, bullets } = splitReply(text);
        const hotline = hotlineForSituation(`${question} ${text}`);
        pushAssistant({
          id: uid('msg'),
          at: Date.now(),
          role: 'assistant',
          text: '',
          reply: {
            id: 'llm',
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
          },
        });
      } catch (err) {
        setModelError(
          err instanceof Error && /401|403/.test(err.message)
            ? 'The AI provider rejected the API key. Check it in Assistant settings — REACH has fallen back to the offline knowledge base.'
            : 'Could not reach the AI provider. REACH has fallen back to the offline knowledge base for this answer.',
        );
        fallback(question);
      } finally {
        setThinking(false);
      }
      return;
    }

    fallback(question);
  };

  const fallback = (question: string) => {
    window.setTimeout(() => {
      const reply = answerQuery(question, {
        analysis,
        offline,
        profile: residentProfile,
        selectedZoneId,
        ...weatherCtx(),
      });
      pushAssistant({ id: uid('msg'), at: Date.now(), role: 'assistant', text: '', reply });
      setThinking(false);
    }, 280);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
      <Panel className="flex h-[calc(100vh-190px)] min-h-[560px] flex-col overflow-hidden">
        <PanelHead
          title="REACH Assistant"
          subtitle="Local emergency intelligence — works with no internet"
          icon={<Bot size={15} />}
          tone="accent"
          right={
            <div className="flex items-center gap-1.5">
              <span
                className="chip"
                style={{
                  color: onlineLlm ? TONE_HEX.accent : TONE_HEX.low,
                  borderColor: onlineLlm ? `${TONE_HEX.accent}55` : `${TONE_HEX.low}55`,
                  background: onlineLlm ? `${TONE_HEX.accent}18` : `${TONE_HEX.low}18`,
                }}
              >
                {onlineLlm ? <Wifi size={11} /> : <BadgeCheck size={11} />}
                {onlineLlm ? `AI · ${llm.model}` : 'LOCAL ENGINE'}
              </span>
              {offline ? (
                <span
                  className="chip"
                  style={{
                    color: TONE_HEX.elevated,
                    borderColor: `${TONE_HEX.elevated}55`,
                    background: `${TONE_HEX.elevated}18`,
                  }}
                >
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
                I am the REACH Assistant. I answer from two clearly separated sources:
              </p>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-threat-low/30 bg-threat-low/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: TONE_HEX.low }}>
                    <BadgeCheck size={12} /> VERIFIED SYSTEM DATA
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                    Live hazard field, shelter capacity, road status and the decision engine — cached on your device.
                  </p>
                </div>
                <div className="rounded-xl border border-threat-info/30 bg-threat-info/10 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: TONE_HEX.info }}>
                    <Database size={12} /> GENERAL GUIDANCE
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">
                    A fixed emergency knowledge base that ships with the app. It never pretends to know live conditions.
                  </p>
                </div>
              </div>
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
                  <div className="rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="chip"
                        style={{ color: tone, borderColor: `${tone}55`, background: `${tone}18` }}
                      >
                        <Sparkles size={10} /> {r.badge}
                      </span>
                      <span className="font-mono text-[10px] text-ink-faint">
                        confidence {Math.round(r.confidence * 100)}%
                      </span>
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
                          <span className="block font-mono text-[17px] font-bold text-ink">
                            {r.hotline.number}
                          </span>
                          <span className="block truncate text-[10.5px] text-ink-faint">{r.hotline.label}</span>
                        </span>
                        <span className="chip shrink-0 border-threat-critical/50 bg-threat-critical/15 text-threat-critical">
                          Call
                        </span>
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

          {thinking ? (
            <div className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-threat-accent/40 bg-threat-accent/10 text-threat-accent">
                <BrainCircuit size={15} className="animate-pulse" />
              </span>
              <div className="rounded-2xl rounded-tl-sm border border-base-700/70 bg-base-850/70 px-3.5 py-3">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint"
                      style={{ animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                  <span className="ml-1 text-[11px] text-ink-faint">Retrieving from offline knowledge base…</span>
                </div>
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        <div className="border-t border-base-700/60 p-3">
          {modelError ? (
            <div className="mb-2">
              <Banner tone="elevated" icon={<Info size={13} />} title="AI model unavailable">
                {modelError}
              </Banner>
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              className="field flex-1"
              placeholder="Ask anything — floods, fire, heat, first aid, shelters, routes, missing persons…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(input);
                }
              }}
            />
            <button type="button" className="btn btn-primary !px-4" onClick={() => ask(input)} disabled={!input.trim()}>
              <Send size={15} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
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
            title="Assistant status"
            subtitle="What it can and cannot do right now"
            icon={<BrainCircuit size={15} />}
            tone="accent"
          />
          <div className="space-y-3 p-4">
            <div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-ink-muted">Knowledge base coverage</span>
                <span className="font-mono text-ink">{stats.entries} topics</span>
              </div>
              <Bar className="mt-2" value={Math.min(1, stats.entries / 40)} tone="accent" height={6} />
              <p className="mt-1.5 text-[10.5px] text-ink-faint">
                {stats.bullets} actionable instructions across {stats.hazards} hazard categories — floods, landslides,
                wildfire, earthquake, cyclone, heatwave, first aid and more.
              </p>
            </div>

            <div className="space-y-1.5">
              <StatusRow
                ok
                label="Verified system data"
                detail="Hazard field, shelters, roads, decisions — cached locally"
              />
              <StatusRow ok label="Emergency knowledge base" detail="Ships with the app, requires no network" />
              <StatusRow ok label="Emergency contacts" detail="Including air ambulance and NDRF numbers" />
              <StatusRow
                ok
                label="Live weather & fire danger"
                detail={
                  weather
                    ? `${LOCATION_BY_ID[weather.locationId]?.name ?? 'Location'} · ${weather.source === 'open-meteo' ? 'live Open-Meteo feed' : weather.source === 'cached' ? 'last downloaded reading' : 'modelled estimate'}`
                    : 'Not loaded yet'
                }
              />
              <StatusRow
                ok={onlineLlm}
                label="Open-ended AI model"
                detail={
                  onlineLlm
                    ? `${llm.provider} · unlimited conversation`
                    : llm.mode === 'online'
                      ? 'Add an API key or go online to enable'
                      : 'Off — using the built-in engine'
                }
              />
              <StatusRow
                ok={!offline}
                label="New community reports"
                detail={offline ? 'Queued locally, not visible until sync' : 'Live from the community board'}
              />
            </div>

            {offline ? (
              <Banner tone="elevated" icon={<CloudOff size={13} />} title="You are offline">
                I will not claim to know current weather, new road closures reported by others, or live satellite imagery.
                Everything I give you is either cached system data or fixed guidance.
              </Banner>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="AI model"
            subtitle="Talk without limits — connect your own model, or stay on the built-in offline engine"
            icon={<KeyRound size={15} />}
            tone="accent"
            right={
              <span
                className="chip"
                style={{
                  color: onlineLlm ? TONE_HEX.accent : TONE_HEX.neutral,
                  borderColor: `${onlineLlm ? TONE_HEX.accent : TONE_HEX.neutral}55`,
                  background: `${onlineLlm ? TONE_HEX.accent : TONE_HEX.neutral}18`,
                }}
              >
                {onlineLlm ? 'UNLIMITED CHAT' : 'OFFLINE ENGINE'}
              </span>
            }
          />
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(['offline', 'online'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLlm({ mode: m })}
                  className={clsx('btn !px-3 !py-1.5 text-[11.5px]', llm.mode === m && 'btn-primary')}
                >
                  {m === 'offline' ? 'Built-in engine' : 'My AI model'}
                </button>
              ))}
            </div>

            {llm.mode === 'online' ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {(['openai', 'gemini', 'custom'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setLlm({ provider: p })}
                      className={clsx('btn !px-2.5 !py-1 text-[11px]', llm.provider === p && 'btn-primary')}
                    >
                      {p === 'openai' ? 'OpenAI-compatible' : p === 'gemini' ? 'Google Gemini' : 'Custom endpoint'}
                    </button>
                  ))}
                </div>
                <input
                  className="field"
                  type="password"
                  placeholder="Paste your API key (stored only on this device)"
                  value={llm.apiKey}
                  onChange={(e) => setLlm({ apiKey: e.target.value })}
                />
                <input
                  className="field"
                  placeholder="Model, e.g. gpt-4o-mini or gemini-1.5-flash"
                  value={llm.model}
                  onChange={(e) => setLlm({ model: e.target.value })}
                />
                {llm.provider !== 'gemini' ? (
                  <input
                    className="field"
                    placeholder="Base URL, e.g. https://api.openai.com/v1"
                    value={llm.baseUrl}
                    onChange={(e) => setLlm({ baseUrl: e.target.value })}
                  />
                ) : null}
                <p className="text-[10.5px] leading-relaxed text-ink-faint">
                  The key stays in this browser and is sent only to the provider you configure. When the model is
                  unreachable REACH falls back to the built-in engine automatically.
                </p>
              </>
            ) : (
              <p className="text-[10.5px] leading-relaxed text-ink-faint">
                The built-in engine answers from {stats.entries} curated emergency topics plus your live REACH data. It
                works with no internet and needs no key. Switch to “My AI model” for open-ended conversation.
              </p>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHead
            title="Personalise guidance"
            subtitle="Stored on this device only — used to tailor answers"
            icon={<User size={15} />}
            tone="info"
          />
          <div className="space-y-3 p-4">
            <textarea
              className="field min-h-[84px]"
              placeholder="e.g. elderly parent with mobility issues, an infant, a pet, no car, third floor flat"
              value={profileDraft}
              onChange={(e) => setProfileDraft(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary w-full"
              onClick={() => setResidentProfile(profileDraft.trim())}
            >
              Save personal context
            </button>
            {residentProfile ? (
              <div className="rounded-xl border border-base-700/60 bg-base-900/50 p-3 text-[11px] text-ink-muted">
                Active context: <span className="text-ink">{residentProfile}</span>
              </div>
            ) : (
              <p className="text-[10.5px] text-ink-faint">
                Adding context changes how the assistant frames guidance but never changes the underlying hazard data.
              </p>
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
              <span className="font-mono text-ink">
                {messages.length ? relativeTime(messages[messages.length - 1].at) : '—'}
              </span>
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
      <span
        className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full')}
        style={{ background: ok ? TONE_HEX.low : TONE_HEX.elevated }}
      />
      <div className="min-w-0">
        <div className="text-[11.5px] text-ink">{label}</div>
        <div className="text-[10.5px] text-ink-faint">{detail}</div>
      </div>
    </div>
  );
}
