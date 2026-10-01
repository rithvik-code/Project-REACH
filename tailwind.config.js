/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#05070c',
          900: '#080b12',
          850: '#0b0f18',
          800: '#0f141f',
          750: '#141a27',
          700: '#1b2233',
          600: '#2a3348',
        },
        ink: {
          DEFAULT: '#e7ecf5',
          muted: '#9aa7bd',
          faint: '#67748c',
        },
        threat: {
          critical: '#ff3b47',
          high: '#ff7a29',
          elevated: '#ffb020',
          moderate: '#ffd84d',
          safe: '#22d38b',
          info: '#38bdf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 18px 40px -18px rgba(0,0,0,0.9)',
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 8px 30px -8px rgba(56,189,248,0.35)',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.9)', opacity: '0.85' },
          '70%': { transform: 'scale(1.7)', opacity: '0' },
          '100%': { transform: 'scale(1.7)', opacity: '0' },
        },
        sweep: {
          '0%': { transform: 'translateX(-30%)', opacity: '0' },
          '50%': { opacity: '0.55' },
          '100%': { transform: 'translateX(130%)', opacity: '0' },
        },
        riseIn: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        sweep: 'sweep 2.6s ease-in-out infinite',
        riseIn: 'riseIn 0.35s ease-out both',
        fadeIn: 'fadeIn 0.25s ease-out both',
        ticker: 'ticker 38s linear infinite',
      },
    },
  },
  plugins: [],
};
