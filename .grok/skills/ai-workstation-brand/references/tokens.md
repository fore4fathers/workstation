# Tokens

Copy this `:root` into `web/src/styles.css`.

```css
:root {
  --canvas: #F4F5F7;
  --surface: #FFFFFF;
  --ink: #1B1F24;
  --ink-soft: #5C6370;
  --line: #E6E8EB;
  --accent: #1A7A72;
  --accent-hover: #15665F;
  --on-accent: #FFFFFF;
  --success: #2F6B4F;
  --danger: #B42318;
  --type-image: #1A7A72;
  --type-text: #3D5C4A;
  --type-intent: #9A6700;
  --warn-bg: #F8F1D8;
  --ok-bg: #E4F0E8;
  --bad-bg: #F8E4E1;
  --font-ui: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --radius: 12px;
  --radius-sm: 8px;
  --radius-pill: 999px;
  --shadow: 0 1px 2px rgba(27, 31, 36, 0.06);
  --shadow-float: 0 8px 28px rgba(27, 31, 36, 0.12);
  --safe-bottom: 72px;
  --nav-expanded: 80px;
}
```

## Color

| Token | Hex | Role |
|---|---|---|
| `--canvas` | `#F4F5F7` | Page |
| `--surface` | `#FFFFFF` | Cards, nav |
| `--ink` | `#1B1F24` | Text, money |
| `--ink-soft` | `#5C6370` | Meta |
| `--line` | `#E6E8EB` | Borders |
| `--accent` | `#1A7A72` | Buttons, active nav |
| `--accent-hover` | `#15665F` | Hover |
| `--on-accent` | `#FFFFFF` | Text on accent |
| `--success` / `--danger` | `#2F6B4F` / `#B42318` | Status |
| `--type-*` | teal / sage / ochre | Task type chips only |

## Type

| Role | Family | Weights |
|---|---|---|
| UI | IBM Plex Sans | 400, 500, 600 |
| Mono | IBM Plex Mono | 500 |

Scale: 13 / 15 / 16 / 20 / 24. No uppercase tracked eyebrows.

Google Fonts: `IBM Plex Sans 400/500/600` + `IBM Plex Mono 500`, `display=swap`.

## Nav

- &lt;900px: fixed bottom bar, all worker routes.
- ≥900px: fixed top bar, full viewport width, height `--nav-expanded`. After 24px scroll: `top/left/right` inset, height 52px, `--radius`, `--shadow-float`.
