import type {Config} from 'tailwindcss'

/**
 * shadcn/ui token layout, tuned for an infrastructure console.
 *
 * Everything resolves through CSS variables in globals.css so a theme change
 * is one file, and so the semantic status colours (operational / degraded /
 * down) are named rather than spelled out as hex in fifty components.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    container: {center: true, padding: '2rem', screens: {'2xl': '1400px'}},
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))'},
        secondary: {DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))'},
        muted: {DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))'},
        accent: {DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))'},
        destructive: {DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))'},
        card: {DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))'},
        popover: {DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))'},
        // Status is semantic, never decorative.
        status: {
          operational: 'hsl(var(--status-operational))',
          degraded: 'hsl(var(--status-degraded))',
          down: 'hsl(var(--status-down))',
          info: 'hsl(var(--status-info))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', {lineHeight: '1rem'}],
      },
      keyframes: {
        'accordion-down': {from: {height: '0'}, to: {height: 'var(--radix-accordion-content-height)'}},
        'accordion-up': {from: {height: 'var(--radix-accordion-content-height)'}, to: {height: '0'}},
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
