---
name: ai-workstation-brand
description: >
  AI Workstation visual system — IBM Plex Sans/Mono, slate canvas, teal accent.
  Use when polishing UI, adding screens, theming, fonts, colors, or /ai-workstation-brand.
---

# AI Workstation brand

Quiet product UI. One sans family, one accent, short copy.

Load `references/tokens.md` for values. `web/src/styles.css` must match it.

## Rules

1. Use CSS variables. Do not add hex.
2. IBM Plex Sans everywhere. IBM Plex Mono for money and IDs only. No display serif.
3. `--accent` for primary buttons, active nav, links. Money stays `--ink`.
4. Mobile: bottom nav on every worker screen. Desktop (≥900px): top header, full-bleed, then compact and detached on scroll.
5. Copy: short. No taglines or “atelier” language.
6. Icons: 20px stroke SVG. Touch ≥44px. Honor `prefers-reduced-motion`.

Existing React + CSS. No Tailwind or Framer.
