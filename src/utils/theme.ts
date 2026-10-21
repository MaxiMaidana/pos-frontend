// ─── Theming: color primario customizable por tienda ──────────────────────────
// El local elige UN color (ej. rosa de marca) y acá generamos los 9 tonos que
// Tailwind necesita (50 clarito → 900 oscuro), tomando el hue/saturación del
// color elegido y variando solo la luminosidad con una curva pareja. No
// reproduce exactamente la curva de Tailwind, pero da una rampa prolija para
// cualquier color de entrada.

const SHADE_LIGHTNESS: Record<number, number> = {
  50: 97,
  100: 94,
  200: 87,
  300: 78,
  400: 68,
  500: 60,
  600: 52,
  700: 45,
  800: 37,
  900: 29,
};

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;

  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
    case g: h = ((b - r) / d + 2) * 60; break;
    default: h = ((r - g) / d + 4) * 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) => lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (n: number) => Math.round(f(n) * 255).toString(16).padStart(2, '0');
  return `#${toHex(0)}${toHex(8)}${toHex(4)}`;
}

/** Genera la rampa de 9 tonos (50-900) a partir de un color base en hex. */
export function generateShades(baseHex: string): Record<number, string> | null {
  const hsl = hexToHsl(baseHex);
  if (!hsl) return null;

  const shades: Record<number, string> = {};
  for (const [shade, lightness] of Object.entries(SHADE_LIGHTNESS)) {
    shades[Number(shade)] = hslToHex(hsl.h, hsl.s, lightness);
  }
  return shades;
}

/** Aplica (o limpia) las variables CSS que tailwind.config.js usa para "indigo". */
export function applyPrimaryColor(baseHex: string | null | undefined): void {
  const root = document.documentElement.style;

  if (!baseHex) {
    for (const shade of Object.keys(SHADE_LIGHTNESS)) {
      root.removeProperty(`--color-primary-${shade}`);
    }
    return;
  }

  const shades = generateShades(baseHex);
  if (!shades) return;

  for (const [shade, hex] of Object.entries(shades)) {
    root.setProperty(`--color-primary-${shade}`, hex);
  }
}
