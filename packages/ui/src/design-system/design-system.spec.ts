import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(join(process.cwd(), 'src', 'design-system', 'tokens.css'), 'utf8');
const recipesCss = readFileSync(join(process.cwd(), 'src', 'design-system', 'recipes.css'), 'utf8');
const appCss = readFileSync(join(process.cwd(), 'src', 'App.css'), 'utf8');

/**
 * Contract seam for the design system. Asserts the system's guarantees —
 * token inventory completeness, WCAG contrast pairs, recipe presence — not
 * CSS implementation details.
 */

type VarMap = Map<string, string>;

const THEMES = [':root', "[data-theme='light']"] as const;

const SEMANTIC_TOKENS = [
  '--dash-bg',
  '--dash-surface',
  '--dash-surface-elevated',
  '--dash-border',
  '--dash-text',
  '--dash-text-muted',
  '--dash-text-faint',
  '--dash-accent',
  '--dash-accent-hover',
  '--dash-accent-contrast',
  '--dash-focus-ring',
  '--dash-overlay',
  '--dash-selected',
  '--dash-state-waiting',
  '--dash-state-active',
  '--dash-state-delayed',
  '--dash-state-completed',
  '--dash-state-failed',
  '--dash-state-paused',
];

const STATE_COLORS = [
  '--dash-state-waiting',
  '--dash-state-active',
  '--dash-state-delayed',
  '--dash-state-completed',
  '--dash-state-failed',
  '--dash-state-paused',
];

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Extracts the top-level rule body for a given selector. */
function extractBlock(css: string, selector: string): string {
  const match = stripComments(css).match(
    new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\}`)
  );
if (!match) {
      throw new Error(`tokens.css is missing the "${selector}" block`);
    }
    return match[1]!;
}

function parseVars(block: string): VarMap {
  const vars: VarMap = new Map();
  for (const declaration of block.split(';')) {
    const match = declaration.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/);
    if (match) {
      vars.set(match[1]!, match[2]!);
    }
  }
  return vars;
}

/** Resolves a var() reference (one level) against the primitives map. */
function resolveValue(value: string, primitives: VarMap): string {
  const match = value.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!match) {
    return value;
  }
  const resolved = primitives.get(match[1]!);
  if (resolved === undefined) {
    throw new Error(`cannot resolve ${match[1]}`);
  }
  return resolved;
}

function oklchToSrgb(color: string): { r: number; g: number; b: number } {
  const match = color.match(
    /^oklch\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/
  );
  if (!match) {
    throw new Error(`not an oklch() color: ${color}`);
  }
  const L = Number(match[1]);
  const C = Number(match[2]);
  const H = Number(match[3]);
  const alpha = match[4] === undefined ? undefined : Number(match[4]);
  const hue = (H * Math.PI) / 180;
  const a = C * Math.cos(hue);
  const b = C * Math.sin(hue);

  const lPrime = L + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = L - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  const toGamma = (linear: number) => {
    const clamped = Math.min(1, Math.max(0, linear));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };

  if (alpha !== undefined && alpha < 1) {
    throw new Error(`translucent colors cannot be contrast-checked: ${color}`);
  }

  return {
    r: Math.round(toGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s) * 255),
    g: Math.round(toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s) * 255),
    b: Math.round(toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s) * 255),
  };
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  const linearize = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b)
  );
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function themeContext(selector: string) {
  const primitives = parseVars(extractBlock(tokensCss, ':root'));
  const semantic = parseVars(extractBlock(tokensCss, selector));
  const token = (name: string) => {
    const fullName = name.startsWith('--') ? name : `--dash-${name}`;
    const raw = semantic.get(fullName);
    if (raw === undefined) {
      throw new Error(`${selector} is missing ${fullName}`);
    }
    return resolveValue(raw, primitives);
  };
  const srgb = (name: string) => oklchToSrgb(token(name));
  return { token, srgb };
}

describe('token inventory', () => {
  for (const theme of THEMES) {
    it(`defines every semantic token for ${theme}`, () => {
      const { token } = themeContext(theme);
      for (const name of SEMANTIC_TOKENS) {
        expect(token(name), `${theme} must define ${name}`).not.toBe('');
      }
    });
  }

  it('encodes state colors as semantic-only (no state ramps)', () => {
    expect(extractBlock(tokensCss, ':root')).not.toMatch(/--dash-state-.*-0/);
  });
});

describe('WCAG contrast locks', () => {
  const pairs: Array<[string, string]> = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['accent', 'bg'],
    ['accent', 'surface'],
    ['accent-contrast', 'accent'],
  ];

  for (const theme of THEMES) {
    const { srgb } = themeContext(theme);
    const name = theme === ':root' ? 'dark' : 'light';

    it(`holds 4.5:1 for all text-level pairs (${name})`, () => {
      for (const [fg, bg] of pairs) {
        const ratio = contrastRatio(srgb(fg), srgb(bg));
        expect(ratio, `${fg} on ${bg} (${name}) must be >= 4.5:1`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`holds 4.5:1 for all six state colors against bg and surface (${name})`, () => {
      for (const state of STATE_COLORS) {
        for (const surface of ['bg', 'surface']) {
          const ratio = contrastRatio(srgb(state), srgb(surface));
          expect(ratio, `${state} on ${surface} (${name}) must be >= 4.5:1`).toBeGreaterThanOrEqual(
            4.5
          );
        }
      }
    });

    it(`holds 3:1 for the focus ring against bg (${name})`, () => {
      const ratio = contrastRatio(srgb('focus-ring'), srgb('bg'));
      expect(ratio, `focus-ring on bg (${name}) must be >= 3:1`).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('recipe presence', () => {
  it('ships the button recipe with primary/ghost, disabled and press-scale', () => {
    expect(recipesCss).toContain('.dash-button');
    expect(recipesCss).toContain('.dash-button--primary');
    expect(recipesCss).toContain('.dash-button--ghost');
    expect(recipesCss).toMatch(/\.dash-button:active[^{]*\{[\s\S]*?scale\(0\.98\)/);
    expect(recipesCss).toMatch(/\.dash-button:disabled/);
  });

  it('ships the chip recipe with the six state modifiers', () => {
    expect(recipesCss).toContain('.dash-chip');
    for (const state of ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused']) {
      expect(recipesCss).toContain(`.dash-chip--${state}`);
    }
  });

  it('ships the tab recipe with the selected frost state', () => {
    expect(recipesCss).toContain('.dash-tab');
    expect(recipesCss).toContain('.dash-tab--selected');
    expect(recipesCss).toContain('.dash-tab[data-active]');
    for (const state of ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused']) {
      expect(recipesCss).toContain(`.dash-tab--${state}`);
    }
  });

  it('ships the input recipe with the command-bar treatment', () => {
    expect(recipesCss).toContain('.dash-input');
    expect(recipesCss).toContain('.dash-input--command');
  });

  it('ships the table recipe with sticky head, row hover and soft separators', () => {
    expect(recipesCss).toContain('.dash-table');
    expect(recipesCss).toMatch(/\.dash-table th[^{]*\{[\s\S]*?position:\s*sticky/);
    expect(recipesCss).toMatch(/\.dash-table tbody tr:hover/);
  });

  it('ships the panel recipe with code, meta and logs variants', () => {
    expect(recipesCss).toContain('.dash-panel');
    expect(recipesCss).toContain('.dash-panel--code');
    expect(recipesCss).toContain('.dash-panel--meta');
    expect(recipesCss).toContain('.dash-panel--logs');
  });

  it('ships the dialog recipe with scrim, popup and reduced-transparency gate', () => {
    expect(recipesCss).toContain('.dash-dialog');
    expect(recipesCss).toContain('.dash-dialog__popup');
    expect(recipesCss).toMatch(/prefers-reduced-transparency/);
  });

  it('ships the pager recipe with prev/next buttons', () => {
    expect(recipesCss).toContain('.dash-pager');
    expect(recipesCss).toContain('.dash-pager__button');
  });

  it('ships the shared focus-ring utility', () => {
    expect(recipesCss).toMatch(/\.dash-focus-ring:focus-visible/);
  });

  it('ships the shell switch recipe with a data-checked thumb', () => {
    expect(recipesCss).toContain('.dash-switch');
    expect(recipesCss).toContain('.dash-switch__thumb');
    expect(recipesCss).toMatch(/\.dash-switch\[data-checked\]/);
  });

  it('ships the shared status, form and text recipes used by migrated views', () => {
    expect(recipesCss).toContain('.dash-shell');
    expect(recipesCss).toContain('.dash-tab-list');
    expect(recipesCss).toContain('.dash-status');
    expect(recipesCss).toContain('.dash-status--error');
    expect(recipesCss).toContain('.dash-form__field');
    expect(recipesCss).toContain('.dash-input--code');
    expect(recipesCss).toContain('.dash-job-id');
    expect(recipesCss).toContain('.dash-view-title');
    expect(recipesCss).toContain('.dash-view-job-name');
    expect(recipesCss).toContain('.dash-text-muted');
    expect(recipesCss).toContain('.dash-text-small');
    expect(recipesCss).toContain('.dash-text-italic');
    expect(recipesCss).toContain('.dash-panel__title');
    expect(recipesCss).toContain('.dash-stat-label');
    expect(recipesCss).toContain('.dash-stat-value');
    expect(recipesCss).toContain('.dash-table--interactive');
    for (const variant of ['chart', 'table', 'table-frame', 'form', 'stats']) {
      expect(appCss).toContain(`.dash-panel.dash-panel--${variant}`);
    }
  });

  it('resets the browser page margin for the full-height dashboard shell', () => {
    expect(recipesCss).toMatch(/body\s*\{[\s\S]*?margin:\s*0;/);
    expect(recipesCss).toContain('#root');
    expect(appCss).toMatch(/\.app__main\s*\{[\s\S]*?margin:\s*0 auto;/);
  });

  it('ships flow-node state modifiers and preserves BullMQ aliases', () => {
    expect(recipesCss).toContain('.flow-node');
    for (const state of ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused']) {
      expect(recipesCss).toContain(`.flow-node--${state}`);
    }
    expect(recipesCss).toContain('.flow-node--waiting-children');
    expect(recipesCss).toContain('.flow-node--prioritized');
  });

  it('maps the installed React Flow variables to dashboard tokens', () => {
    const flowRecipe = recipesCss.match(/\.dash-flow\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    for (const variable of [
      '--xy-background-color',
      '--xy-background-pattern-color',
      '--xy-edge-stroke',
      '--xy-edge-stroke-selected',
      '--xy-connectionline-stroke',
      '--xy-node-color',
      '--xy-node-background-color',
      '--xy-node-border',
      '--xy-handle-background-color',
      '--xy-handle-border-color',
      '--xy-selection-background-color',
      '--xy-selection-border',
      '--xy-controls-button-background-color',
      '--xy-controls-button-color',
      '--xy-controls-button-border-color',
      '--xy-controls-box-shadow',
      '--xy-minimap-background-color',
      '--xy-edge-label-background-color',
      '--xy-edge-label-color',
    ]) {
      const declaration = flowRecipe.match(
        new RegExp(`${escapeRegExp(variable)}\\s*:\\s*([^;]+)`)
      );
      expect(declaration, `flow recipe must map ${variable}`).not.toBeNull();
      expect(declaration?.[1], `${variable} must consume a dashboard token`).toMatch(/var\(--dash-/);
    }
    expect(recipesCss).not.toContain('--xy-background-color-dot');
    expect(recipesCss).toContain('.dash-flow .react-flow__controls-button:focus-visible');
  });

  it('contains no known legacy component selectors or temporary token aliases', () => {
    for (const selector of [
      '.chip',
      '.action-btn',
      '.job-table',
      '.queue-jobs__back',
      '.queue-nav__tab',
      '.metrics-range__button',
      '.scheduler-form',
      '.queues-status',
    ]) {
      expect(appCss).not.toContain(selector);
      expect(recipesCss).not.toContain(selector);
    }
    expect(tokensCss).not.toContain('--dash-muted');
  });
});
