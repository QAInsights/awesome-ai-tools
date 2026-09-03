# ai.dosa.dev design language

One dark shell, gold accents, mono eyebrows. New pages and components should
reference the tokens below (defined in `src/styles/tokens.css`, exposed as
Tailwind utilities) instead of raw hex values.

## Shell

Every page renders the same chrome:

- `Sidebar` (left, `bg-panel`, `border-border`): navigation and context.
- `SiteHeader` (sticky top, `bg-black/80 backdrop-blur-xl border-b border-border`):
  search, page-specific controls (via the `overlay` slot on `/`), and the
  account control (`Sign in` button or avatar menu with Favorites · Zap
  Dashboard · Settings · Get Badge · Sign Out).
- `SignInModal` is mounted once in `BaseLayout`; any element with
  `data-auth-trigger` opens it in place. Never link to `/?signin=1`.
- Shared footer (`DashboardLayout`) closes every dashboard page.

## Tokens

| Token | Utility | Value | Use |
|---|---|---|---|
| `--color-page` | `bg-page` | `#000` | page background |
| `--color-panel` | `bg-panel` | `#0a0a0a` | sidebar, sticky bars, dropdowns |
| `--color-border` | `border-border` | `#222` | default hairline |
| `--color-border-strong` | `border-border-strong` | `#444` | hover / focus hairline |
| `--color-ink` | `text-ink` | `#fff` | primary text |
| `--color-ink-secondary` | `text-ink-secondary` | `#a3a3a3` | body / nav text |
| `--color-ink-muted` | `text-ink-muted` | `#737373` | eyebrows, metadata |
| `--color-ink-disabled` | `text-ink-disabled` | `#525252` | footers, placeholders |
| `--color-gold` | `text-gold` | `#F2C040` | Zap counts, live indicators |
| `--color-gold-soft` | `text-gold-soft` | `#e2c48a` | highlighted words in copy |
| `--color-gold-hi` / `--color-gold-lo` | gradient stops | `#f1d99f` / `#d6b77a` | primary gold gradient (`gradient-link`, gold CTAs) |
| `--color-danger` | `text-danger` | `#f87171` | Sign out, destructive |

Card surface is `bg-white/[0.02]` (hover `bg-white/[0.05]`); active nav item is
`bg-white/10`. Keep those as opacity utilities — they are intentionally
relative to the surface beneath.

## Type

- Body: Inter, `text-[15px]` default, `text-[14px]` for nav/menus.
- Headings: `font-semibold tracking-tight`; page title `text-[22px] md:text-[28px]`.
- Eyebrows / labels: JetBrains Mono, `text-[10px]`–`text-[12px]`, `uppercase`,
  `tracking-widest` (or `tracking-[0.2em]` for hero eyebrows), `text-ink-muted`.

## Shape and rhythm

- Radii: header controls and pills `rounded-full`; cards `rounded-xl`; inputs and
  menus `rounded-2xl`; the home filter mega-menu `rounded-[32px]`.
- Page padding `p-6 md:p-8`; max content width `max-w-[1400px] mx-auto`.
- Section gap `mb-7`; card padding `p-5`; list row gap `gap-1`.
- Sidebar width `320px`; header height ~64px.

## Motion

`transition-colors` / `transition-all duration-200` on interactive elements,
`active:scale-[0.98]` on buttons, `hover:-translate-y-px` on CTAs. Overlays use
`cubic-bezier(0.16, 1, 0.3, 1)` with opacity + max-height.

## Do / don't

- Do put page-level actions in `SiteHeader` slots, not in the sidebar.
- Do reuse `.filter-btn` for sidebar/nav rows and `.refine-btn` for header pills.
- Don't introduce new hex colors; add a token here first.
- Don't duplicate account links or search outside the header.
