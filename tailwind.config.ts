import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Input-based variants: phones "hover" on tap, so hover-only UI must not show there.
      screens: {
        mouse: { raw: '(hover: hover) and (pointer: fine)' },
        touch: { raw: '(hover: none), (pointer: coarse)' },
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        brand: 'rgb(var(--accent-rgb) / <alpha-value>)',
        // No `base` colour here: it would also generate `text-base` as a text *colour*, which collides
        // with the font-size `text-base` and made text (e.g. the dialog Cancel button) near-black.
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
      },
      borderColor: {
        subtle: 'var(--border-subtle)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
