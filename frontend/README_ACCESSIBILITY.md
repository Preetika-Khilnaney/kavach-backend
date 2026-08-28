# Kavach — Accessibility & Landing Page Implementation

## What Changed

This implementation adds comprehensive accessibility features and a new landing page to the Kavach intrusion forecasting system. Accessibility is positioned as a **product differentiator**, not just a compliance requirement.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## New Routes

- **`/`** — Landing page (hero, problem statement, how it works, differentiators)
- **`/dashboard`** — Operations dashboard (moved from `/`)
- All other routes unchanged

## Key Features

### 🎯 Landing Page
Professional landing page with:
- Elevator pitch and CTAs
- 3D visual teaser (reuses existing Three.js components)
- Problem framing (attacker speed vs. detection gaps)
- 7-stage pipeline explanation
- Four differentiators: Predictive, Explainable, Offline, **Accessible**

### ♿ Accessibility Features

#### For Users
- **Text Scaling:** Small (12px), Default (14px), Large (16px)
- **High Contrast Mode:** WCAG AA compliant black/white palette
- **Reduce Motion:** Disables animations and transitions
- **Keyboard Navigation:** Full keyboard support with visible focus indicators
- **Screen Reader Support:** ARIA labels, live regions, semantic HTML
- **Table Alternatives:** Accessible HTML tables for network graphs and forecast trees

#### For Developers
- `AccessibilityContext` — global settings state
- `useFocusTrap` hook — modal/drawer focus management
- `SkipLink` component — jump to main content
- Comprehensive ARIA labels throughout
- Proper semantic HTML (`<nav>`, `<main>`, `<time>`, etc.)

### 🔐 Login (Demo Only)

**⚠️ STUB IMPLEMENTATION — NOT PRODUCTION READY**

Mock authentication for demo/prototype purposes:
- Accepts any email/password combination
- "Continue as Demo" button for quick access
- No real backend, tokens, or security
- Clearly marked in code as placeholder

## Accessibility Panel

Click the gear icon (⚙️) in the header to open accessibility settings:
- Adjust text size
- Toggle high contrast mode
- Toggle reduce motion
- Settings persist across sessions

## Table View Alternatives

For users who cannot access 3D visualizations:

1. **Network Graph** (`/internals/network`)
   - Toggle: Table | 2D | 3D
   - Table shows: hostname, IP, type, risk contribution, connections

2. **Forecast Tree** (`/internals/forecast`)
   - Toggle: Visual Tree | Table
   - Table shows: time steps, branch types, risk scores, probabilities

## Keyboard Navigation

- **Tab** — Move forward through interactive elements
- **Shift+Tab** — Move backward
- **Enter/Space** — Activate buttons and links
- **Escape** — Close modals and drawers
- **Skip Link** — Press Tab on page load to reveal "Skip to main content"

## Testing Checklist

### Before Demo
- [ ] Test keyboard navigation (Tab through entire app)
- [ ] Enable high contrast mode and verify visibility
- [ ] Try text scaling (small/large)
- [ ] Test with system `prefers-reduced-motion` enabled
- [ ] Verify modals trap focus (Login, Accessibility, Provenance)

### For Production
- [ ] Run Lighthouse accessibility audit (target: 90+)
- [ ] Test with NVDA/JAWS/VoiceOver screen readers
- [ ] Validate color contrast ratios with automated tool
- [ ] Manual keyboard testing by accessibility consultant
- [ ] Replace stub authentication with real backend

## File Structure

```
src/
├── contexts/
│   ├── AccessibilityContext.tsx    # Global accessibility state
│   └── AuthContext.tsx              # Mock auth (STUB)
├── components/
│   ├── AccessibilityPanel.tsx      # Settings panel
│   ├── LoginButton.tsx             # Header login UI
│   ├── LoginModal.tsx              # Login form (STUB)
│   └── SkipLink.tsx                # Keyboard skip link
├── hooks/
│   └── useFocusTrap.ts             # Focus trap for modals
├── pages/
│   ├── Landing.tsx                 # New landing page
│   ├── Operations.tsx              # Updated with ARIA
│   ├── InternalsPipeline.tsx       # Updated with ARIA
│   ├── InternalsNetwork.tsx        # Added table view
│   └── InternalsForecast.tsx       # Added table view
└── index.css                       # Accessibility CSS
```

## Browser Support

- Modern browsers with ES2020+ support
- Screen readers: NVDA, JAWS, VoiceOver, Narrator
- Keyboard navigation on all platforms
- `prefers-reduced-motion` support
- `prefers-contrast` future enhancement

## Pitch Positioning

When demoing, emphasize:

> **"Nothing about this system is a black box, including the interface itself."**

Accessibility is framed as:
1. **A trust signal** — we care about transparency at every level
2. **An operational necessity** — security analysts have diverse abilities
3. **A competitive differentiator** — not a checkbox, a product value

Position alongside:
- Explainability (features, provenance, audit trails)
- Predictiveness (forecasting, not just detection)
- Offline capability (local inference, no cloud)

## Known Limitations

1. **Authentication is a stub** — replace before production
2. **3D scenes have limited keyboard control** — table views compensate
3. **No automated WCAG audit yet** — manual testing performed
4. **Screen reader testing incomplete** — needs comprehensive validation

## Next Steps

1. Replace stub authentication with real backend
2. Run automated accessibility audit (axe-core/Lighthouse)
3. Conduct user testing with screen reader users
4. Add keyboard shortcuts for power users
5. Implement persistent user preferences (beyond localStorage)

## Support

For questions about accessibility implementation:
- See `ACCESSIBILITY_IMPLEMENTATION.md` for detailed documentation
- Check inline code comments marked with `ACCESSIBILITY:` or `A11Y:`
- All ARIA patterns follow WAI-ARIA best practices

---

**Built with accessibility as a first-class feature, not an afterthought.**
