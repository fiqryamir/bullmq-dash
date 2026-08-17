# DESIGN.md — bullmq-dash design system

> **Source of truth: `packages/ui/src/design-system/tokens.css`.** The values in the tables below mirror that file at slice-1 execution; if they diverge, the CSS wins. Any change to a token or recipe must update this document in the same change (see [How to add a token or recipe](#8-how-to-add-a-token-or-recipe)).

For the *why* behind this system — users, brand personality, aesthetic direction, design principles — read `.better-web-ui.md` at the repo root. This document holds the *what/how* and does not restate the context.

## 1. Overview

The dashboard is styled by a two-layer token system plus a recipe layer, all plain CSS with custom properties in the `--dash-*` namespace so embedding never collides with host-app styles.

- **`packages/ui/src/design-system/tokens.css`** — the authoritative token file. Two layers in one file:
  1. **Primitive ramps** (`:root`, theme-independent) — warm stone neutrals (`--dash-stone-*`, hue ≈ 55°, chroma ≈ 0.008), a slate accent (`--dash-accent-*` spanning both themes' accents), and all scale steps (spacing, type, radius, motion, glass). Defined once; both themes draw from them.
  2. **Semantic layer** (redefined per theme) — tokens named by use, not value (`--dash-bg`, `--dash-surface`, `--dash-text-muted`, …), pointing at the primitives. Dark is `:root` (default); light is `[data-theme='light']`. Job-state colors are semantic-only — six fixed meanings, no ramps.
- **`packages/ui/src/design-system/recipes.css`** — the `.dash-*` recipe classes (button, chip, tab, input, table, panel, dialog, pager, focus-ring, shared status/text/form utilities, flow-node, React Flow integration, and the shell's switch). They style component *look, states, and focus/press only* — page layout stays in view CSS.
- **`packages/ui/src/design-system/design-system.spec.ts`** — the contract seam: token inventory completeness, WCAG contrast locks, and recipe presence are asserted by the test suite.

All colors are encoded in `oklch()`. Hex values below are reference equivalents for documentation, communication, and design review — code must use the tokens.

Consumption rule: component styles consume **semantic color tokens** and **scale primitives** — never the color ramps directly (a palette retune must touch one file).

## 2. Palette

### Warm stone neutrals (primitive ramp, theme-independent)

| Token | oklch | Hex (reference) | Dark role | Light role |
| --- | --- | --- | --- | --- |
| `--dash-stone-0` | `0.1265 0.0073 42.78` | `#090605` | bg | — |
| `--dash-stone-1` | `0.1587 0.0081 48.11` | `#100c0a` | surface | — |
| `--dash-stone-2` | `0.1905 0.0088 59.04` | `#171310` | elevated | — |
| `--dash-stone-3` | `0.2086 0.0075 48.27` | `#1b1715` | — | text |
| `--dash-stone-4` | `0.2511 0.0082 59.22` | `#25211e` | border | — |
| `--dash-stone-5` | `0.39 0.008 55` | *derived* | faint (dark) | — |
| `--dash-stone-6` | `0.5311 0.0088 61.23` | `#706b67` | — | muted |
| `--dash-stone-7` | `0.66 0.008 55` | *derived* | — | faint (light) |
| `--dash-stone-8` | `0.7855 0.0079 61.24` | `#bdb8b4` | muted | — |
| `--dash-stone-9` | `0.8646 0.0078 48.33` | `#d7d1ce` | — | border |
| `--dash-stone-10` | `0.9004 0.0076 61.23` | `#e2ddd9` | text | — |
| `--dash-stone-11` | `0.959 0.0076 48.3` | `#f6f0ed` | — | bg |
| `--dash-stone-12` | `0.974 0.0075 48.29` | `#fbf5f2` | — | elevated |
| `--dash-stone-13` | `0.9856 0.0083 56.05` | `#fff9f5` | — | surface |

### Slate accent (primitive ramp, theme-independent)

| Token | oklch | Hex (reference) | Dark role | Light role |
| --- | --- | --- | --- | --- |
| `--dash-accent-0` | `0.4386 0.0559 236.11` | `#32576d` | — | hover |
| `--dash-accent-1` | `0.5 0.0498 235.75` | `#47687c` | — | accent |
| `--dash-accent-2` | `0.7396 0.0554 234.88` | `#89b1c9` | accent | — |
| `--dash-accent-3` | `0.8101 0.0503 234.37` | `#a2c7dd` | hover | — |

### Semantic colors (per theme)

| Token | Dark | Light |
| --- | --- | --- |
| `--dash-bg` | `--dash-stone-0` (`#090605`) | `--dash-stone-11` (`#f6f0ed`) |
| `--dash-surface` | `--dash-stone-1` (`#100c0a`) | `--dash-stone-13` (`#fff9f5`) |
| `--dash-surface-elevated` | `--dash-stone-2` (`#171310`) | `--dash-stone-12` (`#fbf5f2`) |
| `--dash-border` | `--dash-stone-4` (`#25211e`) | `--dash-stone-9` (`#d7d1ce`) |
| `--dash-text` | `--dash-stone-10` (`#e2ddd9`) | `--dash-stone-3` (`#1b1715`) |
| `--dash-text-muted` | `--dash-stone-8` (`#bdb8b4`) | `--dash-stone-6` (`#706b67`) |
| `--dash-text-faint` | `--dash-stone-5` (derived) | `--dash-stone-7` (derived) |
| `--dash-accent` | `--dash-accent-2` (`#89b1c9`) | `--dash-accent-1` (`#47687c`) |
| `--dash-accent-hover` | `--dash-accent-3` (`#a2c7dd`) | `--dash-accent-0` (`#32576d`) |
| `--dash-accent-contrast` | `0.139 0.0091 52.59` (`#0c0806`) | `--dash-stone-11` (`#f6f0ed`) |
| `--dash-focus-ring` | `--dash-accent-3` (`#a2c7dd`) | `--dash-accent-0` (`#32576d`) |
| `--dash-overlay` | `0.1265 0.0073 42.78 / 0.55` | `0.1265 0.0073 42.78 / 0.4` |
| `--dash-selected` | `color-mix(in oklab, accent-2 16%, surface)` | `color-mix(in oklab, accent-1 14%, surface)` |

### Job state colors (semantic-only, six fixed meanings)

| State | Dark (oklch → hex) | Light (oklch → hex) |
| --- | --- | --- |
| `--dash-state-waiting` | `0.7606 0.1051 82.69` → `#d2ab5f` | `0.4416 0.0923 77.19` → `#6f4b00` |
| `--dash-state-active` | `0.7596 0.0976 225.56` → `#66bee0` | `0.4472 0.088 228.83` → `#005d7b` |
| `--dash-state-delayed` | `0.7597 0.0747 295.12` → `#b4a8dc` | `0.4413 0.0752 295.12` → `#564a78` |
| `--dash-state-completed` | `0.7596 0.0974 151.71` → `#81c392` | `0.4388 0.0972 151.84` → `#1e6136` |
| `--dash-state-failed` | `0.7596 0.1206 27.67` → `#f49286` | `0.4407 0.1207 28.21` → `#89322a` |
| `--dash-state-paused` | `0.7594 0.0155 1.45` → `#baadb0` | `0.4395 0.0153 359.23` → `#5a4f52` |

Chip state backgrounds derive via `color-mix(currentColor 12%)`; tab state modifiers set `color` only. No extra ramp tokens.

## 3. Scales

### Spacing — 4px grid

| Token | Value |
| --- | --- |
| `--dash-space-0` … `--dash-space-8` | `0 4 8 12 16 24 32 48 64` px |

### Typography

| Token | Value |
| --- | --- |
| `--dash-font-sans` | `'Segoe UI', system-ui, -apple-system, sans-serif` |
| `--dash-font-mono` | `ui-monospace, Consolas, monospace` |
| `--dash-text-caption` / `--dash-text-sm` / `--dash-text-base` / `--dash-text-md` / `--dash-text-lg` / `--dash-text-display` | `11 12 13 16 18 24` px |
| `--dash-weight-regular` / `--dash-weight-semibold` / `--dash-weight-bold` | `400 600 700` |
| `--dash-leading-tight` / `--dash-leading-base` | `1.3` / `1.6` |

### Radius

| Token | Value |
| --- | --- |
| `--dash-radius-sm` / `--dash-radius-md` / `--dash-radius-lg` / `--dash-radius-pill` | `8 / 12 / 16 / 999` px |
| `--dash-radius-nested` | `max(5px, calc(var(--dash-radius-sm) - var(--dash-space-1) / 2))` — inner radius = `max(5px, outer − gap/2)` |

### Elevation (per theme)

| Token | Dark | Light |
| --- | --- | --- |
| `--dash-shadow-1` | `0 1px 2px oklch(0.05 0 0 / 0.4)` | `0 1px 2px oklch(0.2 0 0 / 0.08)` |
| `--dash-shadow-2` | `0 4px 12px oklch(0.05 0 0 / 0.5)` | `0 4px 12px oklch(0.2 0 0 / 0.1)` |
| `--dash-shadow-3` | `0 12px 32px oklch(0.05 0 0 / 0.55)` | `0 12px 32px oklch(0.2 0 0 / 0.12)` |

### Motion — GRADUATED

| Token | Value |
| --- | --- |
| `--dash-duration-fast` / `--dash-duration-base` / `--dash-duration-slow` | `0.1 / 0.15 / 0.2` s |
| `--dash-ease` | `cubic-bezier(0.2, 0, 0, 1)` |

### Glass

| Token | Value | Reduced-transparency fallback |
| --- | --- | --- |
| `--dash-blur-sm` | `10px` | `0` |
| `--dash-blur-lg` | `40px` | `0` |

Glass blur falls back to `0px` under `@media (prefers-reduced-transparency: reduce)`; the dialog scrim then uses a solid `--dash-bg`.

## 4. Recipes

Recipes style component **look + states + focus/press only** — page layout (headers, max-widths, view spacing, scroll-wrap heights) stays in view CSS. Recipes style plain HTML by default; Base UI primitives attach them via `className` with state from `data-*` selectors. Naming is BEM: `.dash-block__element`, `.dash-block--modifier`.

### Shared utility

**`.dash-focus-ring`** — the single `:focus-visible` ring definition all interactive recipes and components share (`2px solid var(--dash-focus-ring)`, offset 2px). Add this class to any focusable element or Base UI part that isn't covered by a recipe.

### Button — `.dash-button`

- **Purpose**: primary and quiet actions.
- **Classes**: `.dash-button`.
- **Modifiers**: `--primary` (accent fill, accent-contrast text), `--ghost` (transparent).
- **States**: `:hover` (accent border / fill), `:active` (press-scale `0.98`), `:disabled` (45% opacity).
- **Snippet**:
  ```html
  <button class="dash-button dash-button--primary dash-focus-ring">Retry</button>
  ```

### Chip — `.dash-chip`

- **Purpose**: compact status label — carries the six job state colors.
- **Classes**: `.dash-chip`, `.dash-chip__dot`.
- **Modifiers**: `--waiting`, `--active`, `--delayed`, `--completed`, `--failed`, `--paused` (set `color`; background derives via `color-mix(currentColor 12%)`).
- **Snippet**:
  ```html
  <span class="dash-chip dash-chip--failed"><span class="dash-chip__dot"></span>failed</span>
  ```

### Tab — `.dash-tab`

- **Purpose**: view/state switcher with a Zen "selected frost" treatment.
- **Classes**: `.dash-tab`.
- **Modifiers**: `--selected` and the `[data-active]` state selector (frost pill via `--dash-selected`); `--waiting` … `--paused` for state tabs.
- **Snippet**:
  ```html
  <button class="dash-tab dash-focus-ring" data-active>Jobs</button>
  ```
  A state tab combines the frost selection with a state modifier:
  ```html
  <button class="dash-tab dash-tab--failed dash-focus-ring" data-active>Failed</button>
  ```

### Input — `.dash-input`

- **Purpose**: text inputs and native selects.
- **Classes**: `.dash-input`.
- **Modifiers**: `--command` (command-palette treatment: `--dash-radius-md`, 14px 18px padding, `--dash-text-md`), `--select` (content width for in-header use).
- **States**: `:focus` (accent border + 3px accent-tint ring), `::placeholder` (faint).
- **Snippet**:
  ```html
  <input class="dash-input dash-focus-ring" placeholder="Search jobs…" />
  ```

### Table — `.dash-table`

- **Purpose**: dense job tables with sticky header, row hover, soft separators.
- **Classes**: `.dash-table`, `.dash-table__row--selected`.
- **States**: `tbody tr:hover` / `:focus-visible` (accent-tint row background); add `.dash-focus-ring` to focusable rows so the shared visible focus ring is retained.
- **Snippet**:
  ```html
  <table class="dash-table">
    <thead><tr><th>Job</th><th>State</th></tr></thead>
    <tbody><tr class="dash-table__row--selected"><td>a1</td><td>completed</td></tr></tbody>
  </table>
  ```

### Panel — `.dash-panel`

- **Purpose**: surface container with three content variants.
- **Classes**: `.dash-panel`.
- **Modifiers**: `--code` (mono block), `--meta` (dl/dt/dd key-value), `--logs` (mono list with soft separators).
- **Additional modifiers**: `--chart`, `--table`, `--table-frame`, `--form`, and `--stats` provide the shared surface treatments used by metrics, scheduler, worker, and Redis views.
- **Snippet**:
  ```html
   <dl class="dash-panel dash-panel--meta"><dt>Attempts</dt><dd>3</dd></dl>
   ```

### Status, text, and form utilities

- **`.dash-shell` / `.dash-shell__header` / `.dash-shell__brand`** — app shell surface, separator, and brand typography.
- **`.dash-tab-list`** — the shared rounded container around navigation and range tabs.
- **`.dash-status`** — loading, empty, notice, and error copy; combine with `--error` for failed states and `--summary` for metrics summaries.
- **`.dash-view-title` / `.dash-view-subtitle` / `.dash-view-job-name` / `.dash-section-title`** — shared view and section typography.
- **`.dash-job-id` / `.dash-code-inline` / `.dash-meta`** — tokenized monospace and muted metadata treatment.
- **`.dash-text-muted` / `.dash-text-small` / `.dash-text-italic`** — compact muted metadata variants.
- **`.dash-panel__title` / `.dash-stat-label` / `.dash-stat-value`** — shared panel headings and Redis statistic labels/values; `dash-stat-value--mono` uses the mono stack.
- **`.dash-form__*`** — scheduler form layout and labels; controls use `.dash-input`, with `--code` for JSON textareas.
- **`.dash-table--interactive`** — adds the pointer affordance to tables whose rows open a job; ordinary `.dash-table` remains non-interactive.
- **Panel variants**: `.dash-panel--chart`, `--table`, `--table-frame`, `--form`, and `--stats` identify the shared surface treatment used by metrics, data tables, scheduler forms, and Redis statistics. Their page-specific sizing and layout remain in `App.css`.

### Flow node and React Flow integration

- **`.flow-node`** — the custom React Flow node recipe. It carries the six canonical state modifiers: `--waiting`, `--active`, `--delayed`, `--completed`, `--failed`, and `--paused`.
- **BullMQ aliases**: `flow-node--waiting-children` consumes delayed state tokens and `flow-node--prioritized` consumes active state tokens. The rendered node also carries its canonical modifier so state meaning stays consistent with chips and tabs.
- **`.dash-flow`** — the React Flow surface. It maps the installed `@xyflow/react` 12.11.3 public `--xy-*` variables used by the rendered graph (background, pattern, edges, connection line, nodes, handles, selection, controls, and labels) to semantic dashboard tokens and passes the dashboard's `dark`/`light` theme as React Flow's `colorMode`. React Flow's structural stylesheet remains imported from the package; unrendered minimap and resize variables retain upstream defaults, and edge stroke width remains the upstream one-pixel default.
- **Focus**: React Flow node focus uses `--dash-focus-ring` because the upstream stylesheet removes the default selectable-node outline.

### Dialog — `.dash-dialog`

- **Purpose**: modal overlay with a translucent scrim and elevated popup.
- **Classes**: `.dash-dialog` (scrim), `.dash-dialog__popup`.
- **States**: falls back to solid `--dash-bg` under `prefers-reduced-transparency`.
- **Snippet**:
  ```html
  <div class="dash-dialog" role="presentation"><div class="dash-dialog__popup">…</div></div>
  ```

### Pager — `.dash-pager`

- **Purpose**: prev/next page controls with a status readout.
- **Classes**: `.dash-pager`, `.dash-pager__button`, `.dash-pager__status`.
- **States**: `:hover` (accent border), `:disabled` (45% opacity).
- **Snippet**:
  ```html
  <div class="dash-pager">
    <button class="dash-pager__button" disabled>‹ Prev</button>
    <span class="dash-pager__status">1 – 50 of 212</span>
    <button class="dash-pager__button">Next ›</button>
  </div>
  ```

### Switch (app shell) — `.dash-switch`

- **Purpose**: theme toggle in the app shell.
- **Classes**: `.dash-switch`, `.dash-switch__thumb`.
- **States**: `[data-checked]` (accent border; thumb translates `18px` and tints accent).
- **Snippet**:
  ```html
  <button class="dash-switch dash-focus-ring"><span class="dash-switch__thumb"></span></button>
  ```

## 5. Styling Base UI primitives

Base UI (`@base-ui-components/react`) ships zero CSS. Recipes attach to its unstyled primitives through two mechanisms:

1. **`className` on each part.** Put the recipe class on the part it styles. The base class goes on the part that carries the component's look (`.dash-switch` on `Switch.Root`); element classes go on their parts (`.dash-switch__thumb` on `Switch.Thumb`).
2. **`data-*` selectors for state.** Base UI renders its internal state as `data-*` attributes (e.g. `[data-checked]`, `[data-active]`, `[data-disabled]`, `[data-highlighted]`). Recipes select on those for state styling — never on component internals.

Example — the app-shell theme toggle:

```tsx
<Switch.Root
  checked={theme === 'light'}
  onCheckedChange={() => toggleTheme()}
  className="dash-switch dash-focus-ring"
>
  <Switch.Thumb className="dash-switch__thumb" />
</Switch.Root>
```

Rules of thumb:

- If the primitive has multiple parts, each part gets the recipe class or BEM element for its role; the focus-ring utility goes on the focusable part.
- If a recipe modifier matches a Base UI state (e.g. tab selected), Base UI's own `data-*` attribute takes precedence and the modifier class is unnecessary — but both are supported (`[data-active]` in `recipes.css` covers the Base UI tab case).
- Styling scope is look + states + focus/press only. Layout (headers, max widths, view spacing, scroll-wrap heights) belongs in view CSS, not in a recipe.

## 6. Theming & embedding

**Theme switch.** Dark is the default and lives on `:root` (`color-scheme: dark`). Light is activated by setting the `data-theme` attribute to `light` on the dashboard's root element — `[data-theme='light']` redefines the semantic layer. Add a `data-theme` attribute on the HTML element when embedding.

**Scope / isolation.** Every system value lives under the `--dash-*` namespace; recipes use the `.dash-` prefix. This keeps the dashboard self-contained in a host app — no host-app style can collide, and the dashboard won't leak tokens outward. Host apps that ship their own `--dash-*` variables should be treated as an explicit override surface.

**Elevation is per-theme; glass is theme-independent.** Shadows (3 levels) are redefined for light; blur values are defined once in `:root`. The reduced-transparency media query (`prefers-reduced-transparency: reduce`) zeroes the blur and the dialog scrim goes solid — users who opt out of transparency always get solid surfaces.

**React Flow follows the dashboard theme.** `.dash-flow` maps the supported React Flow 12.11.3 `--xy-*` variables to `--dash-*` tokens, while `FlowGraph` passes the current `ThemeProvider` value through `colorMode`. The installed public variable names are locked by the design-system contract test.

## 7. Accessibility

**Contrast — WCAG AA (≥ 4.5:1), both themes.** The contract seam (`design-system.spec.ts`) locks these pairs:

- `--dash-text` and `--dash-text-muted` against `--dash-bg` and `--dash-surface` — all ≥ 4.5:1 (measured ~10–17:1).
- `--dash-accent` against `--dash-bg` and `--dash-surface` — ≥ 4.5:1 (measured ~5.3–8.8:1).
- `--dash-accent-contrast` against `--dash-accent` — ≥ 4.5:1 (measured ~5.3–8.7:1) so primary buttons stay legible.
- All six state colors against both `--dash-bg` and `--dash-surface` — ≥ 4.5:1 (measured ~6.5–9.8:1). Jobs are never distinguished by color alone: chips carry text labels too.

`--dash-text-faint` is for placeholder / decorative text only (~2–3:1); it must not be used for meaningful content. The ~1.3:1 border contrast is a deliberate hairline exception for separation, not information.

**Focus.** Every interactive recipe and component declares a visible focus ring via the shared `.dash-focus-ring` utility (`2px solid var(--dash-focus-ring)`, offset 2px), tested at ≥ 3:1 against `--dash-bg`. Keyboard navigation and focus must not rely on color alone.

**Motion.** Durations are GRADUATED (fast/base/slow, 0.1–0.2s) and transitions use the project ease. No infinite or large-scale motion is part of the system.

## 8. How to add a token or recipe

**Update-in-same-change rule.** Any change that adds, renames, or changes a token or recipe must update this document in the same change. No ad-hoc tokens or classes without the doc. The contract seam also enforces the token inventory and recipe presence — a removal or rename without a matching test update fails CI.

To add a **token**:

1. Define the value in `packages/ui/src/design-system/tokens.css` — primitive in `:root` (theme-independent), semantic value in both `:root` (dark) and `[data-theme='light']` (light). Use `oklch()`; reference the palette anchors.
2. If it's a semantic color, add it to the `SEMANTIC_TOKENS` inventory in `design-system.spec.ts`; if it's a new state color, add it to `STATE_COLORS` and confirm both contrast locks (against `--dash-bg` and `--dash-surface`) still pass.
3. Document the token and its both-theme values in this file — palette, scales, or state table as appropriate.
4. If it's a scale step (space/type/radius/motion/glass), it's a contract, not a retune surface — document it and consume it directly.

To add a **recipe**:

1. Add the `.dash-*` class(es) to `packages/ui/src/design-system/recipes.css` with BEM naming and the shared `.dash-focus-ring` on the focusable part.
2. Add a presence assertion for the block and its modifiers to `design-system.spec.ts` (`recipe presence` describe block).
3. Document it in [Recipes](#4-recipes): purpose, class list, modifiers, and one snippet.
4. Style look + states + focus/press only; keep layout in view CSS.
