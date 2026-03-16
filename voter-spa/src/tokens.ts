export const DARK_THEME = {
  bg:          "#0A0A0F",
  surface:     "#111118",
  card:        "#16161F",
  border:      "#252535",
  borderLight: "#333348",
  borderTap:   "#4A4A6E",
  text:        "#F0EEE8",
  textMuted:   "#9A9AAE",
  textDim:     "#6A6A80",
  locked:      "#2A2A3E",
};

export const LIGHT_THEME = {
  bg:          "#F5F5F0",
  surface:     "#FFFFFF",
  card:        "#FAFAF8",
  border:      "#E0DED8",
  borderLight: "#D0CEC8",
  borderTap:   "#B0AEA8",
  text:        "#1A1A1A",
  textMuted:   "#6B6B80",
  textDim:     "#9A9AAE",
  locked:      "#E8E6E0",
};

export function applyTheme(theme: "dark" | "light") {
  const t = theme === "light" ? LIGHT_THEME : DARK_THEME;
  const root = document.documentElement;
  root.style.setProperty("--gg-bg",          t.bg);
  root.style.setProperty("--gg-surface",     t.surface);
  root.style.setProperty("--gg-card",        t.card);
  root.style.setProperty("--gg-border",      t.border);
  root.style.setProperty("--gg-borderLight", t.borderLight);
  root.style.setProperty("--gg-borderTap",   t.borderTap);
  root.style.setProperty("--gg-text",        t.text);
  root.style.setProperty("--gg-textMuted",   t.textMuted);
  root.style.setProperty("--gg-textDim",     t.textDim);
  root.style.setProperty("--gg-locked",      t.locked);
  root.style.background = t.bg;
  document.body.style.background = t.bg;
}

export const C = {
  bg:          "var(--gg-bg)",
  surface:     "var(--gg-surface)",
  card:        "var(--gg-card)",
  border:      "var(--gg-border)",
  borderLight: "var(--gg-borderLight)",
  borderTap:   "var(--gg-borderTap)",
  accent:      "#E8A020",
  accentDim:   "#7A5510",
  accentGlow:  "rgba(232,160,32,0.15)",
  green:       "#22C55E",
  greenDim:    "#14532D",
  red:         "#EF4444",
  redDim:      "#450A0A",
  blue:        "#3B82F6",
  blueDim:     "#1E3A5F",
  text:        "var(--gg-text)",
  textMuted:   "var(--gg-textMuted)",
  textDim:     "var(--gg-textDim)",
  locked:      "var(--gg-locked)",
} as const;

export const PHONE = { width: 390, height: 844 };

/**
 * Font scale — mobile-first, based on iOS HIG & Material Design guidelines.
 * Minimum readable body text on iPhone 15 / Pixel 7 = 16px.
 * Adjust FS.base to rescale the whole app.
 */
export const FS = {
  xs:    11,   // badge counts, tiny labels
  sm:    13,   // secondary meta, chips, captions
  base:  16,   // body text, synopsis, detail rows — iOS HIG minimum
  md:    17,   // primary labels, filter pills, button text
  lg:    19,   // card titles, section headings
  xl:    22,   // movie title in card
  h1:    26,   // winner name, large display
} as const;
