# Landing Page Quick Start Guide

## For Developers

### 5-Minute Setup

```bash
# 1. Navigate to project
cd /Users/admin/Desktop/connectacreators

# 2. Install dependencies (if needed)
npm install

# 3. Start dev server
npm run dev

# 4. Visit http://localhost:5173/
# You should see the new landing page!
```

### File Locations
- **Main Component**: `/src/pages/LandingPageNew.tsx`
- **Routes**: `/src/App.tsx` (line 9, 53)
- **Styles**: `/src/index.css` (CSS variables + utilities)
- **Documentation**: `/LANDING_PAGE_*.md` (4 guides)

### Make Your First Change

**Change the main headline:**
1. Open `/src/pages/LandingPageNew.tsx`
2. Find line ~327: `"Creators"`
3. Replace `"Creators who build"` with your own text
4. Save file
5. Browser auto-reloads - done!

**Change primary color:**
1. Open `/src/index.css`
2. Find `--primary: 43 74% 49%` (line 22)
3. Change HSL values (e.g., `210 80% 50%` for blue)
4. Save - all amber accents now change!

**Change a feature card:**
1. Open `/src/pages/LandingPageNew.tsx`
2. Find `const features = [` (line ~345)
3. Edit any feature object
4. Example:
```jsx
{
  icon: Brain,
  title: "New Feature Name", // Change this
  description: "New description", // And this
  benefits: ["Benefit 1", "Benefit 2", "Benefit 3"], // And this
  gradient: "from-blue-500 to-purple-600", // And this
}
```

### Common Edits Reference

| Element | Location | Change |
|---------|----------|--------|
| Main Headline | Line 327 | "Creators who build" → your text |
| Subheading | Line 335 | Full paragraph text |
| Feature Cards | Line 345+ | Array of feature objects |
| Pricing Plans | Line 810+ | Array of plan objects |
| FAQ Items | Line 919+ | Array of FAQ objects |
| Primary Color | index.css:22 | HSL values |
| CTA Button Text | Throughout | Search "Start Free Trial" |

---

## For Marketing/Content Team

### Update Copy Without Code

All landing page copy is in plain text JSX:

```jsx
// These are easy to find and edit:
"Start Free Trial"
"Creators who build viral content"
"From script to lead in minutes"
"Used by 200+ creators"
```

**To update:**
1. Open `/src/pages/LandingPageNew.tsx`
2. Use Ctrl+F (Cmd+F on Mac) to find text
3. Edit the text
4. Save
5. Done!

### Update Copy With Tracking

If you need to add analytics to copy changes:

```jsx
<button
  onClick={() => {
    // Track the click
    trackEvent('landing_cta', { section: 'hero' });
  }}
>
  Start Free Trial
</button>
```

---

## For Designers

### Customizing Colors

**Option 1: CSS Variables (Global)**
Edit `/src/index.css` to change all instances of a color:
```css
--primary: 43 74% 49%;  /* Change once, updates everywhere */
--primary-light: 45 80% 60%;
--primary-dark: 40 70% 40%;
```

**Option 2: Tailwind Classes (Specific)**
Edit inline Tailwind classes in component:
```jsx
from-amber-400 to-orange-500  // Change gradient
bg-gradient-to-br from-blue-500 to-purple-600  // Change specific gradient
```

### Customizing Fonts

Current font stack in `/src/index.css`:
```css
font-family: Arial, Helvetica, sans-serif;
```

To change to Google Fonts:
1. Import in component:
```jsx
import { Poppins, Playfair Display } from 'next/font/google';
```
2. Update tailwind config
3. Apply in component: `className="font-poppins"`

### Customizing Spacing

Modify Tailwind spacing in specific places:
```jsx
py-32  // Change vertical padding
gap-8  // Change gap between elements
px-6   // Change horizontal padding
```

---

## For Marketers - Copy Variations

### Test Different Headlines

**Current (High Ambition):**
```
"Creators who build viral content"
```

**Alternative 1 (Speed Focus):**
```
"Create viral content in minutes, not weeks"
```

**Alternative 2 (ROI Focus):**
```
"Turn every video into leads and revenue"
```

**To Test:**
1. Duplicate the landing page file
2. Change the headline
3. Test with A/B testing tool
4. Keep the winner

### Test Different CTAs

**Current:**
```
"Start Free Trial"
```

**Alternatives:**
```
"Get Started Free"
"Try Now"
"Launch My Growth"
"Create Free Account"
```

**To Test:**
Find and replace in component, measure conversion rates.

---

## Deployment Checklist

- [ ] Run `npm run build` (no errors)
- [ ] Test locally with `npm run dev`
- [ ] Test on mobile device
- [ ] Test dark/light mode toggle
- [ ] Test all CTA buttons (go to /dashboard)
- [ ] Test all links in footer
- [ ] Check spelling and grammar
- [ ] Verify images/assets load
- [ ] Verify animations are smooth
- [ ] Deploy to VPS: `npm run build && scp dist/`
- [ ] Test live on connectacreators.com
- [ ] Monitor analytics for conversion rate

---

## Performance Tips

### Check Performance
```bash
npm run build
# Check file size in dist/

# Test Lighthouse score:
# Chrome DevTools → Lighthouse → Analyze page load
```

### Optimize Images (if added)
- Use WebP format
- Compress with TinyPNG
- Set width/height attributes
- Use lazy loading: `loading="lazy"`

### Monitor Bundle Size
```bash
npm install --save-dev source-map-explorer
npm run build
npx source-map-explorer 'dist/**/*.js'
```

---

## Troubleshooting

### Landing page shows error
**Problem**: "Cannot find module"
**Solution**:
- Check all imports are correct
- Run `npm install` to install dependencies
- Check file paths (case-sensitive)

### Animations not working
**Problem**: Animations are choppy or not playing
**Solution**:
- Check browser supports CSS transforms (modern browsers only)
- Verify Framer Motion is installed: `npm list framer-motion`
- Check browser DevTools → Elements → Computed (verify CSS applies)

### Colors look wrong
**Problem**: Gold is now blue, or colors inverted
**Solution**:
- Check dark/light mode toggle
- Verify CSS variables in `index.css`
- Check browser cache (hard refresh: Ctrl+Shift+R)

### Layout broken on mobile
**Problem**: Elements overflow or stack incorrectly
**Solution**:
- Check viewport meta tag: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Verify responsive classes: `md:`, `lg:`, etc.
- Test in mobile device browser, not just DevTools

### Scroll animations not triggering
**Problem**: Elements don't animate when scrolling
**Solution**:
- Verify `useInView` hook is working
- Check `margin: "-100px"` in viewport config
- Clear browser cache and reload
- Check JavaScript console for errors

---

## Quick Reference - Common Patterns

### Add a new feature card
```jsx
{
  icon: ShoppingCart,  // Pick any icon from lucide-react
  title: "Feature Name",
  description: "What it does",
  benefits: ["Benefit 1", "Benefit 2", "Benefit 3"],
  gradient: "from-green-500 to-emerald-600",  // Pick gradient colors
}
```

### Add a new FAQ item
```jsx
{
  question: "What is your question?",
  answer: "Here is the detailed answer to the question asked above.",
}
```

### Add a new pricing plan
```jsx
{
  name: "Plan Name",
  price: "$99",
  period: "month",
  description: "Perfect for...",
  features: [
    "Feature 1",
    "Feature 2",
    "Feature 3",
  ],
  cta: "Button Text",
  highlighted: false,  // Set true for "Most Popular" badge
}
```

### Add a new metric
```jsx
{ value: "500+", label: "Your Metric", icon: Users }
```

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Animations | ✅ | ✅ | ✅ | ✅ |
| Glassmorphism | ✅ | ✅ | ✅ | ✅ |
| Gradients | ✅ | ✅ | ✅ | ✅ |
| Grid/Flex | ✅ | ✅ | ✅ | ✅ |
| Scroll Effects | ✅ | ✅ | ✅ | ✅ |

**Fallbacks**: Older browsers show solid colors instead of gradients/effects, but layout remains intact.

---

## Getting Help

### Questions About Code
- Check `/src/pages/LandingPageNew.tsx` comments
- Review `/LANDING_PAGE_GUIDE.md` for architecture
- Check Framer Motion docs: https://www.framer.com/motion/

### Questions About Design
- Review `/LANDING_PAGE_DESIGN_SPEC.md`
- Check `/LANDING_PAGE_VISUAL_OVERVIEW.md`
- Reference colors in `/src/index.css`

### Questions About Copy
- Review `/LANDING_PAGE_COPY_GUIDE.md`
- Check conversion principles
- Review A/B testing recommendations

### Report a Bug
1. Note exactly what's broken
2. Check browser console for errors
3. Test in different browser
4. Note device/OS/browser version
5. Report with screenshot

---

## Next Steps

1. **Deploy**: Push to VPS and test live
2. **Monitor**: Track analytics and conversion rate
3. **Optimize**: A/B test headlines and CTAs
4. **Iterate**: Refine based on user feedback
5. **Enhance**: Add video, more testimonials, etc.

---

## Contact

**Technical Issues**: Check error messages in browser DevTools → Console
**Design Questions**: Reference design spec in LANDING_PAGE_DESIGN_SPEC.md
**Copy Questions**: Reference copy guide in LANDING_PAGE_COPY_GUIDE.md
**General**: Review LANDING_PAGE_GUIDE.md for comprehensive documentation

---

**Quick Start Version**: 1.0
**Created**: March 2026
**Status**: Ready for immediate use
