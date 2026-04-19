# sunbit-hr-design

This skill provides branded design foundations for the Sunbit HR platform (SUNBIT Inc.'s Japanese human-resources management system).

Read `README.md` for full content/visual/iconography guidelines, then explore:

- `colors_and_type.css` — design tokens (color, type, spacing, radius, shadow)
- `assets/` — logo and imagery
- `ui_kits/hr-app/` — component recreations (dashboard, evaluation, goals, 1on1)
- `preview/` — token preview cards

## When to use

Use this skill when creating Sunbit HR artifacts — mockups, slide decks, throwaway prototypes, or production UI code. The system targets Japanese enterprise HR workflows: 360° evaluation, skill mapping, OKR/MBO goals, 1on1 logging, career wishes, AI-coached feedback.

## Core rules

- Japanese-first UI; body copy is 敬体 (です・ます). No emoji.
- Primary: Sunbit Navy `#1F2C69` (from official logo). Neutrals: Slate scale. AI contexts: Violet `#7C3AED`.
- Typography: Noto Sans JP (UI body) + Inter (numeric/Latin) + JetBrains Mono (logs).
- Icons: Lucide (2px stroke, 24×24).
- Cards: white bg, 1px slate-200 border, 8px radius, elevation-1.
- Avoid gradients, glassmorphism, full-bleed imagery, bounce animations.
- Dashboard density is medium; tabular-nums for all numeric columns.

## Workflow

For visual artifacts: copy needed assets from this skill, write self-contained HTML referencing the Google Fonts CDN and Lucide CDN, apply tokens from `colors_and_type.css`.

For production code: this system targets Next.js 15 + shadcn/ui + Tailwind CSS 4. Map tokens to Tailwind theme variables.

If invoked without guidance, ask what the user wants to build (mockup / slide / production component?), which HR domain (evaluation / goals / 1on1 / skill / dashboard?), and target role (ADMIN / HR_MANAGER / MANAGER / EMPLOYEE).
