import type { Analysis } from './analysis';
import type { LlmConfig } from '../store';
import { ZONE_BY_ID } from '../data/region';
import { LOCATION_BY_ID } from '../data/india';
import type { WeatherSnapshot } from '../types';
import { formatCompact, formatNumber } from '../geo';

export interface LlmTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * A compact, factual brief of everything REACH knows right now. The model is
 * grounded in this rather than allowed to invent live conditions.
 */
export function buildSituationBrief(analysis: Analysis, weather: WeatherSnapshot | null): string {
  const loc = weather ? LOCATION_BY_ID[weather.locationId] : null;
  const lines: string[] = [];

  lines.push('=== REACH LIVE SITUATION BRIEF ===');
  lines.push(
    `Monitored location: ${loc ? `${loc.name}, ${loc.state} (India)` : 'Varun Valley District (modelled)'}`,
  );
  if (weather) {
    lines.push(
      `Weather: ${weather.current.condition}, ${weather.current.temperatureC.toFixed(1)}C, ` +
        `humidity ${Math.round(weather.current.humidity)}%, wind ${Math.round(weather.current.windKmh)} km/h ` +
        `(gusts ${Math.round(weather.current.windGustKmh)}), rain now ${weather.current.precipMm.toFixed(1)} mm. ` +
        `Fire-weather index ${Math.round(weather.fireDanger * 100)}/100 (${weather.fireClass}).`,
    );
    if (weather.disturbances.length) {
      lines.push(
        'Forecast disturbances: ' +
          weather.disturbances
            .slice(0, 4)
            .map((d) => `${d.label} in ~${d.leadHours}h (peak ${d.peakValue.toFixed(1)} ${d.unit}, ${d.severity})`)
            .join('; '),
      );
    } else {
      lines.push('Forecast disturbances: none significant in the next 72 hours.');
    }
  } else {
    lines.push('Weather: unavailable (offline or not yet loaded).');
  }

  lines.push(
    `Hazard field now: flood pressure ${Math.round(analysis.hazard.floodPressure * 100)}%, ` +
      `slope pressure ${Math.round(analysis.hazard.landslidePressure * 100)}%, ` +
      `fire pressure ${Math.round(analysis.hazard.firePressure * 100)}%.`,
  );
  lines.push(
    `Exposure: ${formatNumber(analysis.totals.populationAtRisk)} residents at risk, ` +
      `${formatNumber(analysis.totals.populationNeedingAssistance)} need evacuation assistance, ` +
      `${analysis.totals.isolatedZones} zone(s) isolated, ${analysis.totals.blockedRoads} road(s) out of service.`,
  );
  lines.push(
    `Shelter capacity: ${formatNumber(analysis.totals.shelterCapacityAvailable)} spaces free vs demand of ` +
      `${formatNumber(analysis.totals.shelterDemand)} (gap ${formatCompact(Math.max(0, analysis.totals.shelterGap))}).`,
  );

  lines.push('Highest-risk zones:');
  for (const z of analysis.zones.slice(0, 4)) {
    lines.push(
      `  - ${ZONE_BY_ID[z.zoneId]?.name ?? z.zoneId}: risk ${Math.round(z.risk)}/100 (${z.level}), ` +
        `flood ${Math.round(z.flood * 100)}%, slope ${Math.round(z.landslide * 100)}%, fire ${Math.round(z.fire * 100)}%` +
        `${z.isolated ? ', ISOLATED' : ''}, assigned shelter: ${
          analysis.plans[z.zoneId]?.shelterId
            ? analysis.shelters.find((s) => s.id === analysis.plans[z.zoneId].shelterId)?.name
            : 'none reachable'
        }`,
    );
  }

  if (analysis.graph.removed.length) {
    lines.push('Roads out of service:');
    for (const r of analysis.graph.removed.slice(0, 6)) lines.push(`  - ${r.roadId}: ${r.reason}`);
  } else {
    lines.push('Roads: all passable.');
  }

  if (analysis.actions.length) {
    lines.push('Current priority actions from the decision engine:');
    for (const a of analysis.actions.slice(0, 5)) lines.push(`  ${a.priority}. ${a.title} — ${a.directive}`);
  }

  lines.push('=== END BRIEF ===');
  return lines.join('\n');
}

export function buildSystemPrompt(brief: string, profile: string, offline: boolean): string {
  return [
    'You are REACH Assistant, the emergency advisor inside REACH — an Indian disaster response and resilience platform.',
    'You help ordinary people stay safe, and coordinators act decisively, during floods, landslides, wildfires, cyclones, earthquakes and other emergencies in India.',
    '',
    'GROUNDING RULES — follow these exactly:',
    '1. Use the live situation brief below for anything about current conditions, routes, shelters or risk. Never invent live data.',
    offline
      ? '2. You are OFFLINE. You cannot see current weather, new reports or live imagery. Say so plainly if asked about them, and answer from general emergency knowledge instead.'
      : '2. Live data feeds are available; prefer the brief over general statements whenever they conflict.',
    '3. If the brief does not contain the answer, say what you do not know rather than guessing.',
    '4. Distinguish clearly between verified system data (from the brief) and general safety guidance.',
    '5. Be calm, concrete and short. Prefer numbered or bulleted actions a frightened person can follow immediately.',
    '6. Never tell someone to move into danger. Priority order is always: preserve life, then reach shelter, then protect property.',
    '7. Use Indian context: helplines 112 (all emergencies), 108/102 (ambulance), 101 (fire), 1078 (disaster management), 011-24363260 or 9711077372 (NDRF), 9540161344 (air ambulance). Monsoon, NDRF, district control rooms, panchayat and ward-level reality apply.',
    '8. If the situation sounds life-threatening, lead with the number to call before the explanation.',
    '9. End EVERY reply with one final line in exactly this form: "Emergency number: <number> — <what it is for>". Pick the single most relevant number for what was asked.',
    profile ? `10. The user has shared this personal context — tailor advice to it: ${profile}` : '',
    '',
    brief,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Calls the configured provider. Throws on any failure so the caller can fall back. */
export async function chatComplete(
  llm: LlmConfig,
  turns: LlmTurn[],
  brief: string,
  profile: string,
  offline: boolean,
  signal?: AbortSignal,
): Promise<string> {
  const system = buildSystemPrompt(brief, profile, offline);

  if (llm.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      llm.model || 'gemini-1.5-flash',
    )}:generateContent?key=${encodeURIComponent(llm.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: turns.map((t) => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })),
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      }),
    });
    if (!res.ok) throw new Error(`gemini request failed (${res.status})`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text.trim()) throw new Error('empty response');
    return text.trim();
  }

  const base = (llm.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${llm.apiKey}`,
    },
    body: JSON.stringify({
      model: llm.model || 'gpt-4o-mini',
      temperature: 0.4,
      messages: [{ role: 'system', content: system }, ...turns.map((t) => ({ role: t.role, content: t.content }))],
    }),
  });
  if (!res.ok) throw new Error(`llm request failed (${res.status})`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('empty response');
  return text.trim();
}

/** Splits a model reply into paragraphs, and strips a trailing hotline line for structured rendering. */
export function splitReply(text: string): { paragraphs: string[]; bullets: string[] } {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const bullets: string[] = [];
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim());
    const isList = lines.length > 1 && lines.every((l) => /^(\d+[.)]|[-*•])\s+/.test(l));
    if (isList) {
      lines.forEach((l) => bullets.push(l.replace(/^(\d+[.)]|[-*•])\s+/, '')));
    } else {
      paragraphs.push(block.replace(/\n/g, ' '));
    }
  }
  return { paragraphs, bullets };
}
