/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#05060f',
          panel: '#0b0e1a',
          panel2: '#10142a',
          blue: '#3fd0ff',
          purple: '#a855f7',
          pink: '#ff3fd8',
          green: '#39ff88',
          red: '#ff3f5f',
          border: '#1e2440',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 8px rgba(63,208,255,0.6), 0 0 24px rgba(168,85,247,0.35)',
        neonPurple: '0 0 12px rgba(168,85,247,0.55)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(63,208,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(63,208,255,0.07) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
