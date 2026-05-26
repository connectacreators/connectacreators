import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
    extend: {
      fontFamily: {
        sans:  ['var(--font-body, Figtree)', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        serif: ['var(--font-display, "EB Garamond")', 'Georgia', 'serif'],
        mono:  ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
					light: 'hsl(var(--primary-light))',
					dark: 'hsl(var(--primary-dark))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				/* === Editorial rebrand: remap default Tailwind color families
				   to the new palette so every bg-cyan-* / text-cyan-* /
				   bg-lime-* / bg-red-* hit across the codebase auto-resolves
				   to Aqua / Honey / Honey-deep tints without touching any
				   individual file. === */
				cyan: {
					50:  'hsl(184 41% 96%)',
					100: 'hsl(184 41% 92%)',
					200: 'hsl(184 41% 84%)',
					300: 'hsl(184 41% 76%)',
					400: 'hsl(184 41% 70%)',
					500: 'hsl(184 41% 60%)',
					600: 'hsl(184 41% 50%)',
					700: 'hsl(184 41% 40%)',
					800: 'hsl(184 41% 30%)',
					900: 'hsl(184 41% 20%)',
					950: 'hsl(184 41% 12%)',
					DEFAULT: 'hsl(184 41% 70%)',
				},
				lime: {
					50:  'hsl(30 67% 96%)',
					100: 'hsl(30 67% 90%)',
					200: 'hsl(30 67% 82%)',
					300: 'hsl(30 67% 75%)',
					400: 'hsl(30 67% 68%)',
					500: 'hsl(30 67% 63%)',
					600: 'hsl(30 67% 55%)',
					700: 'hsl(30 67% 45%)',
					800: 'hsl(30 67% 35%)',
					900: 'hsl(30 67% 25%)',
					950: 'hsl(30 67% 15%)',
					DEFAULT: 'hsl(30 67% 63%)',
				},
				red: {
					50:  'hsl(22 65% 96%)',
					100: 'hsl(22 65% 90%)',
					200: 'hsl(22 65% 80%)',
					300: 'hsl(22 65% 70%)',
					400: 'hsl(22 65% 60%)',
					500: 'hsl(22 65% 52%)',
					600: 'hsl(22 65% 47%)',
					700: 'hsl(22 65% 38%)',
					800: 'hsl(22 65% 30%)',
					900: 'hsl(22 65% 22%)',
					950: 'hsl(22 65% 14%)',
					DEFAULT: 'hsl(22 65% 47%)',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'fade-in': {
					'0%': {
						opacity: '0',
						transform: 'translateY(20px)'
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				'slide-up': {
					'0%': {
						opacity: '0',
						transform: 'translateY(30px)'
					},
					'100%': {
						opacity: '1',
						transform: 'translateY(0)'
					}
				},
				'scale-in': {
					'0%': {
						opacity: '0',
						transform: 'scale(0.9)'
					},
					'100%': {
						opacity: '1',
						transform: 'scale(1)'
					}
				},
				'glow': {
					'0%, 100%': {
						opacity: '1'
					},
					'50%': {
						opacity: '0.8'
					}
				},
				'slide-in-right': {
					'0%': {
						transform: 'translateX(100%)'
					},
					'100%': {
						transform: 'translateX(0)'
					}
				},
				'slide-out-right': {
					'0%': {
						transform: 'translateX(0)'
					},
					'100%': {
						transform: 'translateX(100%)'
					}
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.6s ease-out forwards',
				'slide-up': 'slide-up 0.8s ease-out forwards',
				'scale-in': 'scale-in 0.5s ease-out forwards',
				'glow': 'glow 2s ease-in-out infinite',
				'slide-in-right': 'slide-in-right 260ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
				'slide-out-right': 'slide-out-right 220ms cubic-bezier(0.4, 0, 1, 1) forwards'
			},
			backdropBlur: {
				'subtle': '20px',
				'strong': '40px'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
