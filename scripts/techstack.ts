/**
 * Generates docs/REACH-tech-stack.docx — the full technology-stack document
 * covering frontend, engines, data sources, AI/ML, backend and offline
 * strategy. Run: npm run doc:stack
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { mkdirSync, writeFileSync } from 'node:fs';

const ACCENT = '2563EB';
const DARK = '0B0E14';

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 260, after: 140 } });
}

function para(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 21 })],
    spacing: { after: 110 },
  });
}

function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 70 } });
}

function cell(text: string, opts: { bold?: boolean; shade?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, size: 20, color: opts.shade ? 'FFFFFF' : undefined })],
      }),
    ],
  });
}

function table(headers: string[], rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => cell(h, { bold: true, shade: DARK, width: i === 0 ? 26 : undefined })),
      }),
      ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) })),
    ],
  });
}

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Calibri', size: 21 } },
    },
  },
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'REACH', bold: true, size: 56, color: ACCENT }),
          ],
          spacing: { before: 200, after: 40 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Intelligent Disaster Response & Resilience System', size: 30, bold: true })],
          spacing: { after: 60 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: 'Technology Stack & Architecture Documentation — Version 2.0 (Tiny-LLM Voice AI · Global Map · Two Portals)',
              size: 22,
              italics: true,
              color: '555555',
            }),
          ],
          spacing: { after: 320 },
        }),

        heading('1. Purpose and system overview'),
        para(
          'REACH is a disaster-response operating system delivered as an offline-first web platform. It combines multi-hazard geospatial analysis, least-risk evacuation routing, a cascading-failure ("domino") engine, a prioritised decision engine, a scenario simulator, emergency communication (SOS, hotlines, broadcasts, missing persons) and a three-tier conversational AI that keeps working with zero internet.',
        ),
        para(
          'The continuous loop the product implements: Detect → Analyze → Simulate → Communicate → Evacuate → Adapt → Recover.',
        ),

        heading('2. Frontend stack'),
        table(
          ['Layer', 'Technology', 'Role'],
          [
            ['UI framework', 'React 18 + TypeScript', 'Component model, strict typing across ~40 modules'],
            ['Build tool', 'Vite 5', 'Dev server and production bundling'],
            ['Styling', 'Tailwind CSS 3 + custom CSS tokens', 'Dark command-center design system, responsive desktop/mobile'],
            ['Map engine', 'Leaflet + react-leaflet', 'Interactive geospatial maps (district and global)'],
            ['Basemaps', 'CARTO Voyager/Dark, Esri World Imagery, OpenTopoMap', 'Real street/satellite/terrain tiles, switchable at runtime'],
            ['Icons', 'lucide-react', 'Consistent iconography'],
            ['State', 'Zustand 4 (persist middleware)', 'Single offline-first store persisted to localStorage'],
            ['Charts/indicators', 'Custom panel/Stat/Bar components', 'Risk pills, readiness meters, decision cards'],
            ['Device preview', 'Custom DevicePreview frame', 'Phone portrait/landscape render modes'],
          ],
        ),

        heading('3. Intelligence engines (pure TypeScript, no server needed)'),
        table(
          ['Engine', 'File', 'What it does'],
          [
            ['Hazard model', 'lib/engine/hazard.ts', 'Flood/landslide/wildfire pressure fields per zone and road, hourly time machine, live-weather biasing'],
            ['Least-risk routing', 'lib/engine/routing.ts', 'Dijkstra over risk-weighted road graph; blocked-road removal; "Why this route?" explanations vs naive shortest path'],
            ['Domino analysis', 'lib/engine/domino.ts', 'Three-wave cascade detection: direct hazard → loss of access → capacity/service overload; bottleneck and isolation discovery'],
            ['Decision engine', 'lib/engine/decision.ts', 'Ranked priority actions with per-category caps and "because" evidence across risk, exposure, access, capacity'],
            ['Scenario simulator', 'lib/engine/analysis.ts + Scenario', 'Rainfall multipliers, road closures, shelter capacity overrides, hospital outages — full recalculation chain'],
            ['Weather intelligence', 'lib/engine/weather.ts', 'Open-Meteo live pull, 24 h series, 3-day outlook, disturbance detection, Fosberg fire-weather index'],
            ['Real directions', 'lib/engine/directions.ts', 'OSRM over OpenStreetMap: live driving routes, geometry, turn-by-turn steps, time/distance'],
            ['Global feeds', 'lib/engine/globalFeeds.ts', 'USGS + GDACS + ReliefWeb normalisation, 2/5/10 km proximity rings, flood-direction estimator via elevation gradient'],
            ['Assistant (KB tier)', 'lib/engine/assistant.ts', '45-topic controlled emergency knowledge base, synonym/typo-tolerant retrieval, urgency pre-pass, hotline resolution'],
            ['Assistant (tiny tier)', 'lib/engine/tinyLlm.ts + llm glue', 'WebLLM WebGPU runtime: Qwen2-0.5B default, Llama-3.2-1B optional, streaming, KB-grounded system prompt'],
            ['Assistant (cloud tier)', 'lib/engine/llm.ts', 'OpenAI-compatible / Gemini / custom endpoints; unlimited chat grounded in a live situation brief'],
            ['Voice pipeline', 'lib/engine/voice.ts + whisperAsr.ts', 'Web Speech recognition, sentence-streaming TTS, barge-in, language matching; offline Whisper-tiny ASR fallback'],
          ],
        ),

        heading('4. AI / ML stack in detail'),
        para('The assistant runs on three tiers with automatic fallback. All tiers share the same grounding discipline: retrieved knowledge-base topics plus a verified live situation brief; free invention of live conditions is prohibited at the prompt level.', { italics: true }),
        table(
          ['Tier', 'When it runs', 'Model / runtime', 'Notes'],
          [
            ['1 · Cloud AI', 'Online + user API key configured', 'OpenAI-compatible or Gemini (user-supplied key)', 'Unlimited open-ended chat; grounded in REACH brief; 12-turn memory'],
            ['2 · Offline AI', 'Tiny model downloaded (one-time)', 'Qwen2-0.5B-Instruct q4f16 (~500 MB) via WebLLM/WebGPU; Llama-3.2-1B optional (~880 MB)', 'Runs fully on-device with zero internet; streams tokens; answers end with the situation hotline'],
            ['3 · Knowledge base', 'Always — instant fallback', '45-topic curated emergency KB with synonym expansion + Levenshtein typo tolerance', 'Deterministic, verifiable, works on any device including no-WebGPU'],
          ],
        ),
        bullet('Urgency pre-pass: life-threatened phrasing ("trapped", "not breathing", "fire in my kitchen") escalates the hotline card before the explanation on every tier.'),
        bullet('Every reply — all tiers — ends with the single most relevant emergency number for the situation (101 fire, 108/102 ambulance, 1078 disaster, 112 national, NDRF 011-24363260 / 9711077372, air ambulance 9540161344).'),
        bullet('Voice conversation: Web Speech API online; Whisper-tiny in-browser offline (~40 MB, lazy CDN import); replies spoken sentence-by-sentence as tokens stream; user speech interrupts the bot (barge-in); 10 Indian languages selectable.'),

        heading('5. Live data sources (all keyless)'),
        table(
          ['Source', 'Feed', 'Used for'],
          [
            ['Open-Meteo', 'Forecast + elevation APIs', 'Live weather, 24 h hourly series, 3-day outlook, disturbance prediction, elevation grid for flood direction'],
            ['OSRM', 'public router over OpenStreetMap', 'Real driving directions with time, distance and turn-by-turn steps'],
            ['USGS', 'earthquake GeoJSON summary (all_day)', 'Global earthquakes with magnitude, depth, place, tsunami flag'],
            ['GDACS', 'GeoJSON event feed', 'Global floods, cyclones, wildfires, volcanoes with alert colour belts'],
            ['ReliefWeb', 'Disasters API v1 (appname registered)', 'Global disaster records, countries affected, situation-report links'],
            ['OpenStreetMap / CARTO / Esri', 'Raster tiles', 'Streets, satellite, terrain and dark basemaps'],
          ],
        ),
        para('Feed hygiene: every fetch is timeout-guarded (8 s), each source fails independently, and the last good snapshot is cached to localStorage so the global map renders offline.'),

        heading('6. Backend and sync (optional, free tier)'),
        table(
          ['Concern', 'Choice', 'Details'],
          [
            ['Shared backend', 'Supabase (Postgres + Realtime)', 'Five tables: community_reports, missing_persons, sos_events, broadcasts, shelter_updates'],
            ['Realtime', 'Supabase Realtime (postgres_changes)', 'Inserts stream to every device — citizen and management portals stay in sync live'],
            ['Conflict model', 'Local-first mirror', 'The device store is always authoritative; pushes upsert by id; pulls dedupe by id'],
            ['Privacy', 'Column-level', 'Responder-only contacts of missing persons are never synced (null on the server)'],
            ['Setup', 'supabase/schema.sql + README', 'One SQL-editor run, paste URL + anon key in the app; nothing else to deploy'],
          ],
        ),
        para('Without Supabase configured, REACH remains fully functional as an offline-first single-device system: SOS queue, reports, broadcasts and chat all persist locally and push when connectivity returns.'),

        heading('7. Offline-first strategy'),
        bullet('App shell: Vite PWA manifest + service worker caching the bundle and map tile prefixes.'),
        bullet('State: entire operational store persisted to localStorage (contacts, SOS queue, reports, closures, capacity patches, chat, portal and AI configuration).'),
        bullet('Weather: last snapshot cached per location with TTL; served instantly offline with a stale flag.'),
        bullet('Global feeds: last snapshot cached; the world map still renders from cache.'),
        bullet('Assistant: KB tier is fully offline by construction; tiny-model tier downloads once and then needs no network; voice offline via Whisper-tiny and device TTS voices.'),
        bullet('Directions: the last computed route remains available; new OSRM lookups require connectivity (visible status).'),

        heading('8. Verification and quality gates'),
        bullet('TypeScript strict mode: tsc --noEmit must pass (CI gate).'),
        bullet('Engine test-suite: npm run verify — 70+ assertions covering hazard physics, routing risk reduction, domino chains, decision caps, urgency detection, KB retrieval, proximity rings, feed normalisation (fixture-based, network-free).'),
        bullet('Production build: vite build with bundle budget; WebLLM and transformers.js are dynamic imports so the main bundle stays small.'),
        bullet('Browser smoke tests: all pages mount, voice round-trip, offline toggle, model download, realtime sync.'),

        heading('9. Repository layout'),
        table(
          ['Path', 'Contents'],
          [
            ['src/components', 'Shell (sidebar/topbar/dock/portal switcher), MapView, DirectionsPanel, WeatherPanel, DevicePreview, UI kit'],
            ['src/pages', 'Home, GlobalMap, CommandCenter, LiveMap, SafeRoute, Timeline, Shelters, Sos, CommunityReports, Assistant, Preparedness'],
            ['src/lib/engine', 'All intelligence: hazard, routing, domino, decision, analysis, weather, directions, globalFeeds, assistant, tinyLlm, llm, voice, whisperAsr, supabaseSync'],
            ['src/lib/data', 'Synthetic district (zones/roads/shelters/hospitals), India locations, emergency contacts, preparedness checklists'],
            ['supabase', 'schema.sql + setup README for the optional shared backend'],
            ['docs', 'This document (REACH-tech-stack.docx)'],
            ['scripts', 'verify.ts engine test-suite, inline.mjs static preview builder, techstack.mjs document generator'],
          ],
        ),

        heading('10. Honest limitations'),
        bullet('District hazard fields, the modelled road graph and shelter registry are synthetic demonstration data; live feeds (weather, directions, global events) are real.'),
        bullet('The tiny-model tier needs a WebGPU browser (Chrome/Edge desktop); other environments automatically use the KB tier with a clear notice.'),
        bullet('GDACS is occasionally rate-limited; the UI shows per-source status and falls back to cache.'),
        bullet('Supabase policies are intentionally open (anon key) for account-free disaster reporting; production would add phone-OTP auth and rate limits.'),
      ],
    },
  ],
});

mkdirSync('docs', { recursive: true });
const buffer = await Packer.toBuffer(doc);
writeFileSync('docs/REACH-tech-stack.docx', buffer);
console.log('Wrote docs/REACH-tech-stack.docx');
