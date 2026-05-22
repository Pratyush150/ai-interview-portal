# ApertureAI — AI Interview Portal (Web)

Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui frontend for the AI
Interview Portal. Sits parallel to the original `frontend/` (vanilla JS,
still wired to the FastAPI backend) — this app uses a mocked API layer
defined in `src/lib/mock-api.ts`.

## Run it

```bash
cd web
npm install --legacy-peer-deps   # peer-dep flag is for react-hook-form quirk
npm run dev                      # http://localhost:3000
```

Useful demo URLs:

| Path                                   | What it shows                                  |
|----------------------------------------|------------------------------------------------|
| `/`                                    | redirects to `/dashboard`                      |
| `/dashboard`                           | recruiter home (stat cards, activity, roles)   |
| `/candidates`                          | pipeline (table / kanban / grid + filters)     |
| `/candidates/cand_priya_sharma`        | full candidate detail (the canonical example)  |
| `/interview/sess_priya_001`            | candidate live interview surface               |
| `/roles/new`                           | JD intake stepper (5 steps)                    |
| `/analytics`                           | hiring funnel + skill heatmap                  |
| `/settings`                            | workspace / team / billing / integrations      |
| `/login`                               | recruiter sign-in                              |

`Cmd+K` (or `/` outside an input) opens the command palette. `?` opens the
keyboard-shortcut help. `G` then `D / C / A / S` jumps to dashboard /
candidates / analytics / settings. `N` then `R` opens the new-role flow.

## File tree

```
web/
├── PLAN.md                            architecture / scope notes
├── components.json                    shadcn config
├── next.config.ts
├── postcss.config.mjs                 tailwind v4 plugin
├── tsconfig.json
├── package.json
└── src/
    ├── app/
    │   ├── globals.css                design tokens via @theme (Tailwind v4)
    │   ├── layout.tsx                 root: fonts + theme + sonner
    │   ├── page.tsx                   redirect → /dashboard
    │   ├── (app)/
    │   │   ├── layout.tsx             sidebar + topbar shell
    │   │   ├── dashboard/page.tsx
    │   │   ├── candidates/page.tsx
    │   │   ├── candidates/[id]/page.tsx
    │   │   ├── roles/new/page.tsx
    │   │   ├── analytics/page.tsx
    │   │   └── settings/page.tsx
    │   ├── (auth)/login/page.tsx
    │   └── (interview)/interview/[sessionId]/page.tsx
    ├── components/
    │   ├── providers.tsx              theme + react-query + tooltip
    │   ├── ui/                        shadcn primitives (button, card, …)
    │   └── app/                       composed components
    │       ├── sidebar.tsx
    │       ├── topbar.tsx
    │       ├── command-palette.tsx
    │       ├── shortcut-help.tsx
    │       ├── theme-toggle.tsx
    │       ├── stat-card.tsx
    │       ├── score-badge.tsx
    │       ├── status-pill.tsx
    │       ├── empty-state.tsx
    │       ├── candidate-table.tsx    TanStack Table v8
    │       ├── candidate-kanban.tsx
    │       ├── candidate-grid.tsx
    │       ├── transcript-viewer.tsx
    │       ├── audio-waveform.tsx     custom canvas, 4 states
    │       ├── code-editor.tsx        Monaco (autocomplete OFF)
    │       ├── pre-interview-check.tsx
    │       ├── skill-bar-chart.tsx    Recharts
    │       ├── funnel-chart.tsx
    │       ├── time-trend.tsx
    │       └── score-distribution.tsx
    ├── hooks/use-keyboard-shortcuts.ts
    ├── lib/
    │   ├── utils.ts                   cn()
    │   ├── format.ts                  ₹, IST, relative time
    │   ├── mock-data.ts               50+ candidates, 8 roles, transcript
    │   └── mock-api.ts                TanStack Query mock fetchers
    ├── stores/ui-store.ts             zustand: palette/help/sidebar
    └── types/index.ts
```

## Design system, in one paragraph

Tailwind v4 with `@theme inline` blocks in `globals.css` — every token is a
CSS variable so dark mode is a single class swap on `<html>`. Indigo
(#4F46E5) is reserved for primary CTAs only; everything else uses
slate-on-warm-off-white in light, slate-on-near-black in dark. 1px borders
and `rounded-lg` cards, no default shadows. Headings use `font-semibold`,
never bold. All numeric displays use `.tabular` (Geist Mono +
`tabular-nums`). Motion is `duration-200 ease-out` everywhere; no springs,
no transforms on hover. Skeletons for content loads, inline spinners only
inside buttons. Empty states are line-art SVG illustrations, never emoji.

## Mock data note

Everything is generated deterministically from a small PRNG seed in
`mock-data.ts` so the same candidate IDs render the same data each load.
The canonical demo candidate is **Priya Sharma** at
`/candidates/cand_priya_sharma` — she has a fully fleshed transcript, two
cheat flags, and matched scoring. Other candidates have realistic but less
detailed bodies.

## Out of scope (deliberately)

- Real WebRTC (LiveKit/Daily) — the live-interview surface simulates the
  state machine in dev so the visual / UX is verifiable without a media
  server. Swap `useEffect` block in
  `src/app/(interview)/interview/[sessionId]/page.tsx` for a LiveKit room
  when ready.
- API hookup to the FastAPI backend — the contract surface is `mock-api.ts`,
  point those hooks at real fetchers and the UI keeps working.
- Mobile pixel-perfect polish for recruiter pages — desktop-first per spec.
