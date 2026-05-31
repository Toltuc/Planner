import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#12121a',
          700: '#1a1a25',
          600: '#252535',
        },
        neon: {
          purple: 'rgb(var(--accent))',
          blue: 'rgb(var(--accent-2))',
          cyan: 'rgb(var(--accent-2))',
          pink: 'rgb(var(--accent))',
        },
        brand: {
          orange:  '#f5a623',
          fire:    '#ff5500',
          red:     '#e8450a',
          purple:  '#5b3fd4',
          blue:    '#3d2bbf',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.05)',
          medium: 'rgba(255, 255, 255, 0.1)',
          heavy: 'rgba(255, 255, 255, 0.15)',
          border: 'rgba(255, 255, 255, 0.1)',
        }
      },
      backdropBlur: {
        'xs': '2px',
      },
      boxShadow: {
        'neon-purple': '0 0 20px rgba(var(--accent), 0.4)',
        'neon-blue': '0 0 20px rgba(var(--accent-2), 0.4)',
        'neon-orange': '0 0 20px rgba(var(--accent), 0.5)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dark': 'linear-gradient(135deg, #0a0a0f 0%, #1a1a25 100%)',
        'gradient-brand': 'linear-gradient(135deg, #f5a623 0%, #ff5500 50%, #5b3fd4 100%)',
      }
    },
  },
  plugins: [],
};

export default config;
