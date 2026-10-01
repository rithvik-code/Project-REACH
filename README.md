# REACH — Intelligent Disaster Response & Resilience System

A disaster **operating system**, not a dashboard. REACH closes the loop
**Detect → Analyze → Simulate → Communicate → Evacuate → Adapt → Recover** for
multi-hazard risk analysis, least-risk emergency routing, live weather
intelligence, offline resilience, AI guidance and community response — built
**India-first**.

Two coordinate systems live side by side:

- **Live India layer** — 12 real districts (Dehradun, Wayanad, Mumbai, Shimla,
  Jaipur …) with real coordinates pulling live weather, forecast disturbances and
  fire-weather danger, plus real road routing on the OpenStreetMap network.
- **Varun Valley District (VVD-04)** — the modelled district used for the hazard
  field, road graph, shelters, hospitals and the decision engine (8 zones, 19
  road nodes, 26 roads, 3 hospitals, 7 shelters, ~88,000 residents).

### What v2 adds

- **Global disaster map** — live **USGS earthquakes**, **GDACS floods / cyclones /
  wildfires / volcanoes** and **ReliefWeb disaster records** on a world map, with a
  **2 / 5 / 10 km proximity-ring engine** around your home pin, an estimated
  **flood-flow direction** from the elevation gradient, one-tap SOS + situation
  reports inside the rings, and automatic **local-coordinator escalation** when an
  event closes within 10 km.
- **Tiny offline AI** — a real LLM (default **Qwen2-0.5B**, optional
  **Llama-3.2-1B**) running **fully on-device via WebGPU** after a one-time
  download; it answers with zero internet, grounded in the REACH knowledge base.
- **Voice conversation** — talk to the assistant; it replies **out loud,
  sentence-by-sentence as it generates**, in **10 Indian languages**, with barge-in
  (talking over it interrupts it). Offline speech-to-text via in-browser
  **Whisper-tiny**. Web Speech recognition online.
- **Citizen & Management portals** — the sidebar adapts per role; coordinators
  post **official broadcasts** to a live news feed, verify reports and run the
  command center; citizens get news-style updates, maps, SOS and the assistant.
  Both portals **share data across devices in realtime** through an optional free
  **Supabase** backend (`supabase/schema.sql` + 5-minute setup in
  `supabase/README.md`); without it, REACH stays fully functional offline-first.
- **Tech-stack document** — `npm run doc:stack` regenerates
  `docs/REACH-tech-stack.docx`.

---

## Quick start

```bash
npm install
npm run dev        # http://127.0.0.1:5273
npm run build      # typecheck + production build
npm run verify     # headless engine checks (70+ assertions)
npm run preview:file   # single self-contained dist/reach-preview.html
```

---

## Real maps and real directions

The map uses **real street tiles** (CARTO Voyager — roads, junctions and
settlements rendered the way a navigation app shows them), with switchable
**Streets / Satellite (Esri) / Terrain (OpenTopoMap) / Dark** basemaps.

**Directions** are real: pin a start and destination (tap on the map, or snap to
the selected zone / assigned shelter / nearest hospital) and REACH calls the
**OSRM** routing engine over OpenStreetMap. You get the true road-following
geometry, distance, travel time, arrival clock time and **turn-by-turn
instructions**. When the routing service is unreachable it falls back to a
clearly-labelled straight-line estimate rather than pretending.

Two route models are drawn at once and deliberately distinct:

| Line | Meaning |
| --- | --- |
| **Blue** | Live road directions (OSRM) — the way you would actually drive |
| **Green dashed** | REACH least-risk route — hazard-weighted, avoids roads taken out of service |

---

## Live weather, from real forecasts, for India

`src/lib/engine/weather.ts` pulls the **Open-Meteo** forecast (no API key) for the
selected Indian district: current conditions, a 24-hour hourly series, a 3-day
outlook, and derived intelligence:

- **Predicted disturbances** — consecutive-hour windows flagged for *very heavy
  rainfall* (≥15 mm/h), *heavy rainfall* (≥7.5 mm/h), *thunderstorms*, *high wind*
  (gusts ≥60 km/h), *heatwave* (≥40 °C) and *critical fire weather*, each with
  onset time, peak value, lead time and severity.
- **Fire-weather danger** — a **Fosberg Fire Weather Index** computed from live
  temperature, relative humidity and wind, damped by recent rainfall and bucketed
  into low → moderate → high → very high → extreme.
- **Model bias** — the live rain rate and fire index feed straight into the hazard
  engine, so “now” reflects the sky rather than only the synthetic scenario.

Offline-first: the last successful pull is cached per location, served instantly
on load, and honestly labelled `LIVE` / `CACHED` / `OFFLINE MODEL ESTIMATE`.

Every disturbance carries the number to call for that specific hazard, so the
weather panel is a safety mechanism, not just a readout.

---

## Modules

| Module | What it does |
| --- | --- |
| **Start Here** | Intent tiles + the four questions, audience-aware, with a live "Happening now" news strip |
| **Global Map** | Worldwide live events, home pin + 2/5/10 km rings, flood-direction estimate, coordinator escalation |
| **Command Center** | Live weather watch, ranked priority actions, domino chain, zone risk board, scenario simulator |
| **Live Map** | 11 toggleable layers, real basemaps, directions, zone detail with evacuation + medical access |
| **SafeRoute** | Least-risk routing, road scanning, blocking, isolation detection, **Why this route?** |
| **Timeline** | 12 h history ↔ 24 h simulation, hourly slider, peak detection |
| **Shelters** | Capacity, occupancy, distance, accessibility, risk, facilities; manager updates and community suggestions |
| **SOS** | One-tap SOS with geolocation, offline queue, emergency number cards |
| **Community Reports** | Alert feed with verification workflow + missing / safe person board, **official broadcasts**, optional Supabase live sync |
| **REACH Assistant** | 45-topic emergency engine, **offline tiny LLM (WebGPU)**, **voice conversation**, or unlimited cloud chat — every reply ends with the situation hotline |
| **Preparedness** | Interactive before / during / after checklists per hazard, including fire |

---

## Hazards modelled

**Flood · Landslide · Wildfire.**

Rainfall follows a monsoon burst peaked at **T+6h**. Flood pressure is linear in
accumulated catchment rainfall plus river surge. Slope pressure is 45 % recent
6-hour intensity + 55 % accumulated saturation, then exponentiated (`lp^1.6`)
because slopes hold until near-saturation and then release quickly. Fire pressure
is driven by fuel load × observed fire-weather, suppressed hard by rain — a
saturated catchment cannot carry a running fire. A road is compromised by its
**most exposed end**, not the average, and bridges/causeways fail first.

---

## How the intelligence works

- **Least-risk routing** — edge cost `length × (0.55 + 7.2 × risk)` minimised with
  Dijkstra, so a longer dry corridor beats a short submerged one. Every route is
  also computed on the naive shortest metric to power *Why this route?*.
  Impassable and manually blocked roads are **removed from the graph entirely**,
  so recalculation and newly isolated areas fall out naturally.
- **Domino chain** — three waves (direct hazard → loss of access → capacity and
  service overload) so the chain can be broken at its weakest link.
- **Decision engine** — ranked actions with a `because` breakdown across risk,
  population exposure, route accessibility and shelter capacity, plus a written
  rationale and per-category caps.
- **Assistant** — retrieval over a curated knowledge base *plus* data-grounded
  answers, with synonym expansion, typo tolerance and hazard-topic boosting.

---

## The assistant

- **32 emergency topics** covering flood, landslide, **fire (during / preparing /
  smoke inhalation / reporting)**, earthquake, cyclone, lightning, heatwave,
  drowning and water rescue, **CPR and first aid**, snakebite, gas leaks, power
  outages, missing persons, vulnerable-person care, mental health, shelter life —
  each with actionable bullets and offline availability.
- **Every single reply ends with an emergency number matched to the situation** —
  101 for fire, 108 for medical, 1078 for flood/landslide, 112 for police and
  missing persons, 011-24363260 for rescue/aerial, 9540161344 for air ambulance —
  as a tappable call card.
- **Unlimited chat** — switch *AI model* to **My AI model** and paste a key for
  OpenAI-compatible or Google Gemini endpoints. The model is grounded in a live
  situation brief (weather, disturbances, hazard field, exposure, shelters, closed
  roads, priority actions) and is instructed to end every reply with a helpline.
  If the provider is unreachable, REACH silently falls back to the built-in engine.
- Offline it works fully from the knowledge base and never invents live data.

---

## Offline-first design

**OFFLINE** — cached map tiles, the last downloaded weather pull, emergency
contacts, SOS queue (stored and auto-transmitted when signal returns), shelter
information, previously calculated routes, preparedness guides, local assistant
knowledge base, emergency numbers.

**ONLINE** — live forecast and forecast disturbances, real road routing, cloud
synchronisation, new community reports, live updates, remote alerts.

A visible **ONLINE / OFFLINE / SYNCING** indicator sits in the top bar and can be
clicked to simulate connectivity loss. State persists via `localStorage`; a
service worker caches the shell, build assets and map tiles with a bounded LRU.

---

## Phone preview

A preview switcher (bottom-right) renders the **full app inside a phone-sized
frame** — portrait 390×844 or landscape 844×390 — so the real responsive layout is
exercised. Inside the frame the app behaves exactly as it does on a handset:
navigation collapses to a drawer, panels reflow, the emergency dock stays reachable.

---

## Emergency numbers

| Service | Number |
| --- | --- |
| National emergency (police / fire / medical) | **112** |
| Ambulance / medical emergency | **108** or **102** |
| Disaster management control room | **108** or **1078** |
| Fire & rescue | **101** |
| NDRF — national disaster response force | **011-24363260** / **9711077372** |
| Air ambulance / helicopter rescue | **9540161344** |

All are stored on-device as tappable cards and are surfaced by the assistant even
with no connectivity.

---

## Design

Minimalist command aesthetic: near-black base, flat panels with hairline borders,
quiet typography, plain-language labels and red/orange/green risk semantics. The
top bar answers *where am I, what is the weather, am I online, how do I get help*
without clutter; the emergency dock keeps SOS, helplines, SafeRoute and the
assistant permanently reachable. Fully responsive from phone to wide desktop.

---

## Verification

`scripts/verify.ts` exercises the real engines headlessly and asserts behaviour:
hazard evolution over time, riverine-before-hill flooding, least-risk routing never
exceeding the shortest path's exposure, Riverbend **becoming isolated** at peak
hazard, domino strengthening after closures, capacity overrides closing the shelter
gap, hospital outages producing medical actions, **fire pressure rising in dry
fire weather and staying low in rain**, **fire-index monotonicity in wind and
humidity**, **all six disturbance types being detected from a synthetic series**,
assistant answers offline for every sample question, **a situation-matched
emergency number on every reply**, and safety questions returning guidance instead
of district status.

```
npm run verify   →  ✅ ALL CHECKS PASSED
```

---

## Disclaimer

The India weather and routing layers are live and real. The hazard field, district
road graph, shelters, hospitals and capacities of Varun Valley District are
**modelled, not surveyed**. In a real emergency, always follow instructions from
your district disaster management authority.
