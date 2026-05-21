# AI Interview Portal — Frontend Plan

Next.js 15 (App Router) + TS + Tailwind v4 + shadcn/ui. Lives under `web/`,
parallel to the existing `frontend/` (vanilla JS, still wired to the FastAPI
backend). Mock data only — no live API integration in this phase.

## Build order
1. **Design system & scaffolding** — package.json, tsconfig, globals.css with
   `@theme` tokens (Tailwind v4), root layout, font wiring (Geist), theme provider.
2. **UI primitives** (`components/ui/`) — button, card, input, badge, tabs,
   dialog, dropdown, tooltip, separator, skeleton, progress, command, select,
   checkbox, scroll-area, avatar, sheet.
3. **App shell** — sidebar (240px), topbar (60px), command palette, theme
   toggle, breadcrumbs, keyboard-shortcut help modal.
4. **Mock data layer** — 50+ Indian-named candidates, 8 roles, full transcripts,
   evaluation timelines, score breakdowns. Wrapped in TanStack Query hooks
   that resolve from the in-memory store with realistic delays.
5. **Pages** — `/dashboard` → `/candidates` → `/candidates/[id]` →
   `/interview/[sessionId]` → `/roles/new` → `/analytics` → `/settings` →
   `(auth)/login`.

## Deliberate scope cuts
- **dnd-kit kanban**: ship Kanban as static columns first; add drag if budget allows.
- **LiveKit / Daily**: simulate the WebRTC state machine in dev — the canvas
  waveform reacts to a state setter (idle / listening / thinking / speaking).
- **@vercel/og**: skip for v1, add later when we own a marketing surface.
- **Wavesurfer**: use a hand-rolled canvas waveform; lower bundle cost, matches
  the design constraint of "no flashy".

## Design system summary
Tokens in `globals.css` via `@theme`:
- `--primary` `#4F46E5` — used only on primary CTAs
- Light bg `#FAFAF9`, dark bg `#0A0A0A`, slate-900 fg
- Borders 1px (`--border`), no shadows by default, rounded-lg cards
- Geist Sans for UI, Geist Mono on every numeric / score display via a
  `.tabular` utility (`font-variant-numeric: tabular-nums`)
- Motion: `duration-200 ease-out`, no transforms on hover, no spring

## Anti-patterns explicitly avoided
No purple gradients, no glassmorphism, no neon glows, no emoji in labels,
no font-bold, no center-aligned dashboards, no carousels, no AI-sparkle spam.

## Indian context
₹ formatting, IST default, names like Priya Sharma / Rahul Verma / Arjun Iyer,
language tags (English, Hindi, Tamil, Telugu, Marathi, Bengali, Kannada).

## File tree (target)
```
web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── components.json
├── .gitignore
├── public/
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx                     root: fonts + theme provider + sonner
│   │   ├── page.tsx                       redirects to /dashboard
│   │   ├── (app)/
│   │   │   ├── layout.tsx                 sidebar + topbar shell
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── candidates/page.tsx
│   │   │   ├── candidates/[id]/page.tsx
│   │   │   ├── roles/new/page.tsx
│   │   │   ├── analytics/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   └── (interview)/
│   │       └── interview/[sessionId]/page.tsx
│   ├── components/
│   │   ├── ui/                            shadcn primitives
│   │   └── app/                           composed components
│   │       ├── sidebar.tsx
│   │       ├── topbar.tsx
│   │       ├── theme-toggle.tsx
│   │       ├── command-palette.tsx
│   │       ├── shortcut-help.tsx
│   │       ├── stat-card.tsx
│   │       ├── score-badge.tsx
│   │       ├── empty-state.tsx
│   │       ├── candidate-table.tsx
│   │       ├── candidate-kanban.tsx
│   │       ├── candidate-grid.tsx
│   │       ├── audio-waveform.tsx
│   │       ├── transcript-viewer.tsx
│   │       ├── pre-interview-check.tsx
│   │       ├── code-editor.tsx            Monaco wrapper
│   │       ├── skill-bar-chart.tsx
│   │       ├── funnel-chart.tsx
│   │       ├── score-distribution.tsx
│   │       └── time-trend.tsx
│   ├── lib/
│   │   ├── utils.ts                       cn()
│   │   ├── format.ts                      ₹, IST, relative time
│   │   ├── mock-data.ts                   50+ candidates, 8 roles, transcripts
│   │   ├── query-client.tsx               TanStack Query provider
│   │   └── mock-api.ts                    simulated fetchers
│   ├── stores/
│   │   └── ui-store.ts                    Zustand: command palette open, etc.
│   ├── hooks/
│   │   └── use-keyboard-shortcuts.ts
│   └── types/
│       └── index.ts                       Candidate, Role, Interview, etc.
```

## Out of scope for this drop
- Real API hookup to FastAPI backend (mock layer is the contract surface)
- Authentication wiring
- E2E tests
- Mobile candidate flow polish (functional, not pixel-perfect)
- Production deployment config
