# 🎨 GlobalDeets Style Guide

## Color Palette

### Primary Colors
```
Primary Blue:    #2563eb  ███████  Main brand color, links, buttons
Hover Blue:      #1d4ed8  ███████  Button hover states
Secondary:       #64748b  ███████  Secondary text, icons
```

### Status Colors
```
Success:         #10b981  ███████  Active projects, success messages
Warning:         #f59e0b  ███████  Beta projects, warnings
Danger:          #ef4444  ███████  Archived projects, errors
```

### Dark Theme (Default)
```
Background:      #0f172a  ███████  Page background
Secondary BG:    #1e293b  ███████  Cards, header, footer
Card BG:         #334155  ███████  Inputs, tags, buttons
Text Primary:    #f1f5f9  ███████  Main text
Text Secondary:  #cbd5e1  ███████  Descriptions
Text Muted:      #94a3b8  ███████  Metadata, timestamps
Border:          #475569  ███████  Card borders, dividers
```

### Light Theme
```
Background:      #f8fafc  ███████  Page background
Secondary BG:    #ffffff  ███████  Cards, header, footer
Card BG:         #f1f5f9  ███████  Inputs, tags, buttons
Text Primary:    #0f172a  ███████  Main text
Text Secondary:  #475569  ███████  Descriptions
Text Muted:      #64748b  ███████  Metadata, timestamps
Border:          #cbd5e1  ███████  Card borders, dividers
```

## Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
```

### Font Sizes
```
Logo:             2.5rem (40px)
Modal Title:      1.75rem (28px)
Card Title:       1.25rem (20px)
Stat Number:      2.5rem (40px)
Body:             1rem (16px)
Small:            0.95rem (15.2px)
Tiny:             0.85rem (13.6px)
Micro:            0.75rem (12px)
```

### Font Weights
```
Light:    300  - Taglines
Regular:  400  - Body text
Medium:   500  - Buttons
Semibold: 600  - Card titles
Bold:     700  - Logo, headings, stats
```

## Spacing

### Padding/Margin Scale
```
xs:   0.25rem (4px)
sm:   0.5rem  (8px)
md:   1rem    (16px)
lg:   1.5rem  (24px)
xl:   2rem    (32px)
2xl:  3rem    (48px)
```

### Common Patterns
```css
Card Padding:        1.5rem
Container Padding:   2rem
Header Padding:      2rem
Button Padding:      0.5rem 1rem
Input Padding:       0.75rem 1rem
Tag Padding:         0.25rem 0.75rem
```

## Border Radius

```css
Small:   0.375rem (6px)   - Tags
Medium:  0.5rem   (8px)   - Inputs, buttons
Large:   0.75rem  (12px)  - Cards, footer
XLarge:  1rem     (16px)  - Header, cards
Circle:  50%              - Scroll-to-top, avatar
Pill:    9999px           - Status badges
```

## Shadows

### Depth Levels
```css
/* Standard */
box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3),
            0 2px 4px -1px rgba(0, 0, 0, 0.2);

/* Large (hover states) */
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3),
            0 4px 6px -2px rgba(0, 0, 0, 0.2);
```

## Animations

### Duration
```css
Default:  0.3s
Quick:    0.2s
Slow:     0.5s
```

### Easing
```css
ease        - Default
ease-in-out - Smooth acceleration
ease-out    - Smooth deceleration
```

### Common Animations
```css
/* Fade In */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* Spin (loading) */
@keyframes spin {
    to { transform: rotate(360deg); }
}
```

## Component Styles

### Buttons

#### Primary Button
```css
background: #2563eb
color: white
padding: 0.5rem 1rem
border-radius: 0.5rem
font-weight: 500
transition: 0.3s

hover:
  background: #1d4ed8
```

#### Icon Button
```css
background: transparent → #2563eb (hover)
padding: 0.75rem
border-radius: 0.5rem
color: text-primary → white (hover)
```

### Cards

#### Project Card
```css
background: var(--bg-secondary)
border: 1px solid var(--border-color)
border-radius: 1rem
padding: 1.5rem
transition: 0.3s

hover:
  transform: translateY(-4px)
  border-color: var(--primary-color)
  box-shadow: large
  
  ::before (top border):
    background: gradient(primary → purple)
    transform: scaleX(1)
```

### Status Badges
```css
padding: 0.25rem 0.75rem
border-radius: 9999px
font-size: 0.75rem
font-weight: 600
text-transform: uppercase

Active:
  background: rgba(16, 185, 129, 0.2)
  color: #10b981

Beta:
  background: rgba(245, 158, 11, 0.2)
  color: #f59e0b

Maintenance:
  background: rgba(100, 116, 139, 0.2)
  color: #cbd5e1

Archived:
  background: rgba(239, 68, 68, 0.2)
  color: #ef4444
```

### Tags
```css
background: var(--bg-card)
border: 1px solid var(--border-color)
border-radius: 0.375rem
padding: 0.25rem 0.75rem
font-size: 0.75rem
color: var(--text-secondary)
```

### Inputs
```css
background: var(--bg-card)
border: 1px solid var(--border-color)
border-radius: 0.5rem
padding: 0.75rem 1rem
color: var(--text-primary)
font-size: 0.95rem

focus:
  border-color: var(--primary-color)
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1)
```

## Category Colors

```css
Development:  #60a5fa (blue)
Creative:     #a78bfa (purple)
Business:     #34d399 (green)
Experimental: #fbbf24 (yellow)
```

## Gradients

### Page Background
```css
/* Dark */
background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);

/* Light */
background: linear-gradient(135deg, #f8fafc 0%, #e0e7ff 100%);
```

### Logo Text
```css
background: linear-gradient(135deg, #3b82f6, #8b5cf6);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

### Card Top Border (hover)
```css
background: linear-gradient(90deg, #2563eb, #8b5cf6);
```

## Responsive Breakpoints

```css
Mobile:  max-width: 768px
  - Single column grid
  - Stacked controls
  - Full width inputs
  - Simplified header

Tablet:  769px - 1024px
  - 2 column grid
  - Compact controls

Desktop: 1025px+
  - 3+ column grid
  - Full features
```

## Grid System

### Projects Grid
```css
display: grid
grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))
gap: 1.5rem

/* List View */
grid-template-columns: 1fr
```

### Stats Bar
```css
display: grid
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))
gap: 1rem
```

## Accessibility

### Focus Styles
```css
*:focus-visible {
  outline: 2px solid var(--primary-color)
  outline-offset: 2px
}
```

### Color Contrast
- All text meets WCAG AA standards
- Interactive elements have clear hover/focus states
- Status colors work in both themes

## Icons

Using inline SVG from Feather Icons style:
- 20x20 for buttons
- 24x24 for scroll-to-top
- stroke-width: 2
- Rounded line caps/joins

## Best Practices

1. **Consistent spacing** - Use the spacing scale
2. **Color variables** - Always use CSS variables
3. **Transitions** - Add to all interactive elements
4. **Hover states** - Provide visual feedback
5. **Mobile first** - Design for smallest screen first
6. **Accessibility** - Test keyboard navigation
7. **Dark/Light** - Test in both themes
8. **Performance** - Minimize animations on mobile

## Quick Copy-Paste

### New Section
```css
.new-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  padding: 2rem;
  margin-bottom: 2rem;
}
```

### New Button
```css
.new-button {
  padding: 0.75rem 1.5rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.new-button:hover {
  background: var(--primary-hover);
  transform: translateY(-2px);
}
```

### New Card
```css
.new-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 1rem;
  padding: 1.5rem;
  transition: all 0.3s ease;
}

.new-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}
```

---

**Note**: All colors and styles are already implemented in `styles.css`. This guide helps you understand and extend the design system.
