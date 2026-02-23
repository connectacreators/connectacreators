
# iPhone Glass-Themed UI Redesign

Applying an iOS/Apple-inspired glassmorphism effect across buttons, cards, and key UI components.

## What Changes

### 1. Global CSS Updates (`src/index.css`)
- Add new `.glass-ios` utility class with frosted-glass effect: semi-transparent white background, strong backdrop blur (24px), subtle white border, and soft shadow
- Add `.glass-ios-dark` variant for dark mode with semi-transparent dark backgrounds
- Add `.glass-ios-button` class with hover states that increase brightness/opacity (mimicking iOS button press)
- Light mode: white at 60-70% opacity with light blur; Dark mode: dark gray at 30-40% opacity

### 2. Button Component (`src/components/ui/button.tsx`)
- Update the `default` variant to use glassmorphism: translucent background with backdrop blur instead of solid `bg-primary`
- Update `glass` variant to use the stronger iOS-style blur and border
- Add a new `glass-primary` variant: gold/blue tinted glass with blur effect
- Update `cta` variant with glass styling + primary color tint
- Add `rounded-xl` to base styles for the pill-like iOS feel

### 3. Card Component (`src/components/ui/card.tsx`)
- Replace solid `bg-card` with glassmorphism: translucent background, backdrop-blur, and subtle border
- Add a soft inner glow/shadow for depth

### 4. Sidebar (`src/components/DashboardSidebar.tsx`)
- Apply glass background to the sidebar container
- Nav items get translucent hover states with blur

### 5. Tailwind Config (`tailwind.config.ts`)
- Add `backdrop-blur` utilities if not already present (e.g., `blur-ios: '24px'`)

## Visual Result
- Buttons look like frosted glass pills with subtle transparency
- Cards have a see-through frosted appearance
- The sidebar has a translucent, layered feel
- Hover states subtly brighten the glass effect
- Maintains readability with proper contrast in both light and dark modes

## Technical Details

**New CSS classes:**
```css
.glass-ios {
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.light .glass-ios {
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
```

**Button variant update example:**
```typescript
default: "glass-ios text-foreground hover:brightness-110 shadow-soft",
glass: "glass-ios text-foreground hover:brightness-110 border-primary/20",
"glass-primary": "glass-ios bg-primary/20 text-primary-foreground hover:bg-primary/30",
```

**Card base class update:**
```typescript
"rounded-xl glass-ios text-card-foreground"
```

**Files to modify:**
- `src/index.css` -- add glass-ios utility classes
- `src/components/ui/button.tsx` -- update variants with glass styling + rounded-xl
- `src/components/ui/card.tsx` -- apply glass background
- `src/components/DashboardSidebar.tsx` -- glass sidebar background
- `tailwind.config.ts` -- add blur-ios backdrop utility
