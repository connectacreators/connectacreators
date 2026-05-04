# Landing Page Design Specification

## Design Direction: Bold, Modern, Purpose-Driven

### Overview
A premium SaaS landing page designed to convert video creators and agencies. The aesthetic balances professionalism with creative energy, using dynamic animations and distinctive typography.

---

## Visual System

### Color Psychology

#### Primary Palette
| Color | HSL Value | Usage | Psychology |
|-------|-----------|-------|------------|
| **Gold/Amber** | 43° 74% 49% | Primary accent, CTAs, highlights | Premium, luxury, trustworthy, energetic |
| **Deep Dark** | 0° 0% 10% | Background | Professional, focused, modern |
| **Foreground** | 0° 0% 90% | Text | Clean, readable, high contrast |
| **Muted Gray** | 0° 0% 50% | Secondary text | Hierarchy, scanability |

#### Gradient Accents (Multi-use)
- **Blue → Cyan**: Trust, technology, professionalism
- **Cyan → Teal**: Innovation, progress, sustainability
- **Emerald → Green**: Growth, success, positivity
- **Rose → Pink**: Community, creativity, warmth
- **Amber → Orange**: Energy, enthusiasm, action

### Typography Hierarchy

#### Headlines
- **Font Family**: System fonts (Arial, Helvetica)
- **Weight**: 900 (black) for main titles, 700 (bold) for subsections
- **Tracking**: Tight (-0.02em) for impact
- **Line Height**: 0.95-0.9 for compact feel
- **Size Scale**:
  - H1 (Hero): 2.25rem (mobile) → 4rem (desktop)
  - H2 (Sections): 1.875rem (mobile) → 3.75rem (desktop)
  - H3 (Cards): 1.125rem
  - H4 (Labels): 0.875rem

#### Body Text
- **Font Family**: System fonts
- **Weight**: 400 (regular), 500 (medium for labels)
- **Size**: 1rem (base), 1.125rem (large descriptions)
- **Line Height**: 1.6 (readable, generous spacing)
- **Color**: `text-muted-foreground` for secondary text

#### Micro-copy
- **Size**: 0.75rem (12px)
- **Weight**: 600 (semibold)
- **Transform**: UPPERCASE for badges and labels
- **Tracking**: 0.3em for spacing

### Spacing System

```
Base unit: 4px

Spacing scale:
- xs: 2px
- sm: 4px
- md: 8px
- lg: 16px (default)
- xl: 24px
- 2xl: 32px
- 3xl: 48px
- 4xl: 64px
```

**Applied Patterns:**
- Section padding: `py-32` (128px vertical)
- Card padding: `p-8` (32px)
- Gap between items: `gap-6` to `gap-8`
- Hero section margins: `mb-12` between elements

---

## Component Specifications

### Navbar
**Desktop Height**: 64px
**Mobile Height**: 56px

**States:**
- **Scrolled**: Backdrop blur activated, border appears
- **Top**: Transparent, no blur (clean aesthetic)
- **Hover**: Logo scales 1.05x, button brightens

**Spacing:**
- Logo left margin: 24px
- Nav gaps: 32px between items
- Button padding: 16px (x), 8px (y)

### Hero Section

**Layout:**
- Full viewport height (min-h-screen)
- Vertically centered content
- 80px top padding (accounting for navbar)

**Typography Sizes (Responsive):**
- Main headline (H1):
  - Mobile: 2.25rem (36px)
  - Tablet: 3rem (48px)
  - Desktop: 3.75rem (60px)
  - Large desktop: 4rem+ (64px+)

**Key Elements:**
1. **Pill Badge**: Amber accent, small, centered
   - Padding: 8px (x), 4px (y)
   - Border radius: full (9999px)
   - Background: amber-500/10
   - Border: amber-500/20

2. **Animated Headline**:
   - "Creators" → Animated gradient text (amber-400 → yellow-300 → amber-500)
   - "who build" → Normal text
   - "viral content" → Highlighted box (primary/20 background, primary/40 border)

3. **Subheading**:
   - Gray muted text
   - Max width: 42rem (672px)
   - Generous line height: 1.75

4. **CTA Buttons**:
   - Primary: `.btn-17-hero` (gold gradient glass)
   - Secondary: `.btn-17-secondary` (neutral glass)
   - Both: Rounded full (9999px)
   - Padding: 16px (x), 12px (y)
   - Gap between: 16px

5. **Trust Indicators**:
   - 3 user avatar circles (colored circles, overlapping)
   - Text: "Used by 200+ creators"
   - Divider: 1px line between sections
   - Text: "2.5x more leads average" with green icon

**Background Animation:**
- Dual gradient overlays (amber + blue)
- Continuous floating animation (8-10s loops)
- Blur effect (blur-3xl)
- Opacity: /10 for subtlety

### Feature Cards

**Layout:**
- Grid: 2 cols (mobile) → 3 cols (desktop)
- Gap: 24px between cards
- Card aspect: Auto-height (content-driven)

**Card Structure:**
1. **Icon Box** (48x48):
   - Rounded: 12px
   - Gradient background (unique per feature)
   - Shadow and border: Subtle glass effect
   - Color: Bright, vibrant gradients

2. **Title**:
   - Font: Bold, 1.125rem
   - Color: Foreground (white in dark mode)
   - Margin bottom: 12px

3. **Description**:
   - Font: Muted-foreground, small (0.875rem)
   - Line height: 1.5
   - Margin bottom: 24px

4. **Benefits List**:
   - 3 items, each with green checkmark
   - Font: 0.75rem
   - Color: Muted-foreground
   - Spacing: 8px between items
   - Border top: White/10 divider

5. **Hover Arrow**:
   - Animated: x-axis movement (0 → 4px → 0)
   - Color: Amber-400 on hover
   - Initial opacity: 0

**Card Interaction:**
- Hover: Slight Y-axis lift (-3px), gold glow shadow
- Background brightens slightly
- Border color shifts to gold
- Arrow animates in

### Pricing Cards

**Layout:**
- 3 columns (stacked on mobile)
- Gap: 32px
- Growth plan: `md:scale-105` + `z-10` (scales up on desktop)

**Card Styling:**
- Glass card with badge
- "MOST POPULAR" badge on Growth plan
- Position: Negative margin top (-16px)
- Background: Gradient amber/orange

**Card Contents:**
1. **Header** (margin-bottom: 24px):
   - Plan name: 1.5rem bold
   - Description: Small, muted text

2. **Price** (margin-bottom: 32px):
   - Price: 2.25rem bold
   - Period: Muted text
   - Format: "$60/month"

3. **CTA Button** (width: 100%, margin-bottom: 32px):
   - Primary plan (highlighted): `.btn-17-hero`
   - Secondary plans: `.btn-17-secondary`
   - Full width, medium padding

4. **Features List**:
   - 5-7 items depending on plan
   - Each item: Check icon + text
   - Check color: Green-500
   - Spacing: 12px between items
   - Font: 0.875rem

**Highlights:**
- Growth plan: Ring-2 ring-amber-500/50
- Growth plan: Background slightly brighter

### Workflow Diagram

**Step Cards:**
1. **Icon Box** (64x64):
   - Gradient background (unique)
   - White icons (24x24)
   - Border radius: 12px
   - Center aligned

2. **Label**:
   - Font: Small, bold
   - Text: "Step 1", "Step 2", etc.
   - Gray subtext: "Step 1 of 4"

3. **Connection Lines** (Desktop only):
   - Horizontal lines between cards
   - Arrow indicators on right
   - Animated on scroll
   - Color: White/20 opacity

**Sub-section Cards** (4 cards below workflow):
- Icon box (40x40) with rounded border
- Title: Bold, small
- Description: Muted text, small
- Glass card styling

### Metrics Section

**Layout:**
- 4-column grid (2x2 on mobile)
- Gap: 32px

**Metric Cards:**
1. **Icon Box** (56x56):
   - Gradient background
   - Amber icon
   - Animated scale pulse (1 → 1.1 → 1 over 2s)
   - Staggered delays for each

2. **Value**:
   - Font: 2.25rem bold
   - Color: Foreground
   - Margin: 8px bottom

3. **Label**:
   - Font: Small, muted
   - Color: Muted-foreground

**Testimonial Card:**
- Centered content
- 5 star emojis (⭐)
- Quote: 1.5rem bold
- Author: 12px text
- Avatar circle: 48x48 gradient box

### FAQ Accordion

**Layout:**
- Full width cards stacked
- Gap: 16px
- Max width: 56rem (896px) centered

**Card Styling:**
- Glass card with padding: 24px
- Flex row: title (flex-1), icon (flex-shrink-0)

**Title:**
- Font: 1.125rem bold
- Color: Foreground
- Padding right: 16px (gap from icon)

**Icon States:**
- Closed: Plus icon, muted-foreground color
- Open: X icon, amber-400 color
- Rotation animation: 0° → 180° (300ms)

**Answer:**
- Margin top: 16px
- Font: Small, muted-foreground
- Line height: 1.6
- Max height animation: 0 → auto (300ms)

---

## Animation Specifications

### Entrance Animations

**Fade In Up:**
```
Duration: 600ms
Delay: Staggered 80ms between items
Easing: cubic-bezier(0.25, 0.46, 0.45, 0.94)
Transform: Y -30px → 0px
Opacity: 0% → 100%
```

**Scale In:**
```
Duration: 500ms
Delay: 100-200ms
Transform: scale(0.8) → 1
Opacity: 0% → 100%
```

### Hover/Interaction Animations

**Button Hover:**
```
Scale: 1 → 1.05
Y-offset: 0 → -2px to -4px
Duration: 200-250ms
```

**Card Hover:**
```
Scale: 1 → 1.02 (or 1)
Y-offset: 0 → -3px
Border color: gray → gold
Box shadow: Increase size
Duration: 300ms
```

**Icon Hover:**
```
Scale: 1 → 1.1
Duration: 200ms
Easing: ease-out
```

### Continuous Animations

**Floating:**
```
Y-axis: 0px → -10px → 0px
Duration: 3000ms
Repeat: Infinite
Easing: ease-in-out
```

**Pulsing Scale:**
```
Scale: 1 → 1.1 → 1
Duration: 2000ms
Repeat: Infinite (staggered)
```

**Gradient Animation:**
```
Background-position: 0% → 100%
Duration: 3000ms
Repeat: Infinite (reverse)
```

**Arrow Animation:**
```
X-offset: 0px → 4px → 0px
Duration: 1500ms
Repeat: Infinite on hover
```

### Scroll Triggered Animations

**Viewport Detection:**
- Trigger: Element enters viewport - 100px
- Once: true (animate only on first scroll into view)

**Stagger Pattern:**
- Parent: Sequential reveal
- Child items: Delay by index × 80ms
- Total stagger: 0.1-0.3s range

---

## Interactive States

### Button States

**Resting:**
- Opacity: 100%
- Scale: 1
- Border: Defined
- Shadow: Standard

**Hover:**
- Opacity: 100%
- Scale: 1.05
- Border: Brightened
- Shadow: Expanded glow
- Transition: 200-250ms

**Active (Pressed):**
- Scale: 0.98
- Y-offset: +1-2px
- Transition: Immediate (50ms)

**Disabled:**
- Opacity: 50%
- Cursor: not-allowed
- No hover effects

### Link States

**Resting:**
- Color: Muted-foreground
- Underline: None

**Hover:**
- Color: Foreground or amber-400
- Underline: Appears for text links
- Transition: 200ms

### Card States

**Resting:**
- Border: Subtle white/10
- Background: White/5 glass
- Shadow: Standard

**Hover:**
- Border: Gold-tinted
- Background: White/9
- Shadow: Larger glow
- Y-offset: -3px
- Transition: 300ms

---

## Responsive Design

### Breakpoints & Adjustments

#### Mobile (320px - 639px)
- Font sizes: Smaller base sizes
- Spacing: Reduced gaps (16px → 12px)
- Grid: Single column layouts
- Padding: 24px horizontal
- Images: No feature-heavy sections

#### Tablet (640px - 1023px)
- Font sizes: Medium sizes
- Grid: 2 columns for features/pricing
- Spacing: 24px gaps
- Padding: 32px horizontal
- Some animations simplified

#### Desktop (1024px+)
- Font sizes: Full sizes (3xl+)
- Grid: 3 columns for features, 4 columns for metrics
- Spacing: 32px gaps
- Padding: 48px+ horizontal
- Full animations enabled

### Specific Responsive Rules

**Hero Section:**
- `text-5xl sm:text-6xl lg:text-7xl xl:text-8xl`
- Mobile buttons: Stack vertically
- Desktop buttons: Flex row

**Feature Grid:**
- `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`

**Metrics Grid:**
- `grid-cols-2 md:grid-cols-4`

**Pricing Cards:**
- `grid-cols-1 md:grid-cols-3`
- Growth card: `md:scale-105` (desktop only)

**Footer:**
- `grid-cols-2 md:grid-cols-4`

---

## Accessibility

### Color Contrast
- Foreground (white/90): WCAG AAA on dark background
- Amber accent: WCAG AA on both backgrounds
- Muted text: 4.5:1 contrast ratio

### Keyboard Navigation
- All interactive elements: Tab accessible
- Buttons: Space/Enter to activate
- Links: Tab + Enter navigation
- Modals/Accordions: Escape to close

### Semantic HTML
- Proper heading hierarchy (H1 → H6)
- Nav landmark for navigation
- Main landmark for content
- Alt text for icon descriptions

### Motion
- Respects `prefers-reduced-motion`
- All animations have duration ≥ 200ms
- No strobing or flashing effects

---

## Performance Guidelines

### Asset Optimization
- No images (vector icons only)
- CSS gradients instead of image backgrounds
- SVG icons with correct sizing

### Animation Performance
- Use `transform` and `opacity` only
- Avoid animating `width`, `height`, `top`, `left`
- Hardware acceleration: GPU-enabled transforms
- Frame budget: 60fps target (16.7ms per frame)

### Code Optimization
- Lazy load below-the-fold sections
- useInView hook for scroll-triggered animations
- useCallback for expensive calculations
- React.memo for stable components

---

## Conversion Optimization

### CTA Placement
1. **Hero**: Primary CTA in viewport (start of page)
2. **Features**: Hover on feature cards
3. **Pricing**: Primary CTA on each plan
4. **FAQ**: Secondary CTA in footer

### Trust Elements
- Social proof (user count, leads generated)
- Customer testimonial with 5 stars
- Security/guarantee badges
- 30-day money-back guarantee

### Friction Reduction
- Single-step signup (no multi-form process)
- Clear pricing (no hidden fees)
- FAQ addresses common objections
- Multiple CTAs throughout (reinforce action)

### Copy Tone
- Action-oriented ("Generate", "Create", "Build")
- Benefit-focused ("More leads", "Save time", "Grow faster")
- Social proof ("200+ creators", "2.5x increase")
- Urgency (limited time offers) - optional

---

## Dark/Light Mode Support

### Dark Mode (Default)
- Background: 0° 0% 10% (nearly black)
- Foreground: 0° 0% 90% (bright white)
- Cards: 0° 0% 13% (slightly lighter)
- Accents: 43° 74% 49% (gold, unchanged)

### Light Mode
- Background: 220° 5% 96% (off-white)
- Foreground: 220° 15% 12% (dark gray)
- Cards: 0° 0% 100% (white)
- Accents: 210° 80% 50% (blue, see index.css)

**Implementation:**
- CSS variables switch based on `.dark` class
- Framer Motion components respond to theme hook
- All colors defined in HSL for consistency

---

## Browser Support Matrix

| Browser | Version | Support | Notes |
|---------|---------|---------|-------|
| Chrome  | Latest  | ✅ Full | Backdrop filter supported |
| Firefox | Latest  | ✅ Full | Backdrop filter via flag |
| Safari  | 15+     | ✅ Full | All features supported |
| Edge    | 88+     | ✅ Full | Chromium-based |
| Mobile Safari | 15+ | ✅ Full | Touch interactions work |

**Fallbacks:**
- Backdrop filter: Solid background color fallback
- CSS Grid: Flexbox fallback for old browsers
- Gradients: Solid colors if not supported

---

**Design System Version**: 1.0
**Last Updated**: March 2026
**Status**: Production Ready
