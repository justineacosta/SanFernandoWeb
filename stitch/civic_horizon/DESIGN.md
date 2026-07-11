---
name: Civic Horizon
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#444653'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#747685'
  outline-variant: '#c4c5d5'
  surface-tint: '#3056c4'
  primary: '#002576'
  on-primary: '#ffffff'
  primary-container: '#0038a8'
  on-primary-container: '#96adff'
  inverse-primary: '#b6c4ff'
  secondary: '#115cb9'
  on-secondary: '#ffffff'
  secondary-container: '#659dfe'
  on-secondary-container: '#003370'
  tertiary: '#62000a'
  on-tertiary: '#ffffff'
  tertiary-container: '#8c0014'
  on-tertiary-container: '#ff918b'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#00164f'
  on-primary-fixed-variant: '#093cab'
  secondary-fixed: '#d7e2ff'
  secondary-fixed-dim: '#acc7ff'
  on-secondary-fixed: '#001a40'
  on-secondary-fixed-variant: '#004491'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ae'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930015'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
typography:
  headline-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
  headline-lg-mobile:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The brand personality of this design system is rooted in **transparency, accessibility, and institutional reliability**. Designed specifically for local government units (LGUs) and public services, it aims to evoke a sense of civic pride and trust. The visual language is authoritative yet welcoming, ensuring that every citizen—regardless of technical proficiency—can navigate essential services with ease.

The chosen style is **Corporate / Modern**. This approach prioritizes clarity and structure over decorative flair. It uses a clean, grid-based layout to organize complex information, high-contrast typography for legibility, and a professional color palette that aligns with national identity. The interface feels "official" through the use of traditional blue tones, while maintaining a contemporary edge through generous whitespace and refined iconography.

## Colors

The color palette is built upon a foundation of "National Blue" and "Clean White."

*   **Primary (#0038A8):** A deep, authoritative blue used for headers, primary branding, and structural elements to signify stability and trust.
*   **Secondary (#0056B3):** A more vibrant blue reserved for interactive elements like buttons, links, and active states.
*   **Tertiary (#CE1126):** A bold red used exclusively for high-priority information, such as emergency hotlines and urgent community alerts.
*   **Neutral (#F8F9FA):** A range of cool grays and off-whites that define surface areas, card backgrounds, and secondary information containers.

The default mode is **Light**, ensuring maximum readability for official documents and text-heavy service descriptions.

## Typography

This design system utilizes a dual-font strategy to balance character with utility. 

**Montserrat** is used for headlines to provide a bold, geometric, and modern feel that commands attention in hero sections and section titles. **Inter** is the workhorse for body text and labels, chosen for its exceptional legibility on digital screens and its neutral, systematic character.

Hierarchy is strictly enforced to help users scan large amounts of data. Use `headline-lg` for the main hero area to establish immediate impact. Use `label-sm` in all-caps for utility navigation or categories to provide a distinct visual break from standard body text.

## Layout & Spacing

The layout follows a **Fixed Grid** philosophy for desktop to maintain a professional, organized appearance, while transitioning to a fluid model for mobile devices. 

*   **Desktop:** A 12-column grid with a 1280px max-width container. Content is centered with 32px outer margins.
*   **Tablet:** An 8-column grid with 24px gutters.
*   **Mobile:** A 4-column grid with 16px margins. 

Vertical rhythm is maintained using a base-8 spacing system. Components should be stacked using the `stack` variables to ensure consistent grouping of related information (e.g., use `stack-sm` between a label and an input, and `stack-lg` between distinct sections).

## Elevation & Depth

Visual hierarchy in this design system is achieved through **low-contrast outlines** and **subtle tonal layering**. 

Instead of heavy shadows, the system uses thin 1px borders in a soft gray (#DEE2E6) to define card boundaries and input fields. This keeps the interface feeling "flat" and efficient. For "floating" elements like emergency widgets or navigation menus, use an extra-diffused ambient shadow: `0px 4px 20px rgba(0, 0, 0, 0.05)`. 

Depth is primarily communicated by background color changes—using slightly darker or lighter neutrals to separate the "page" from the "content cards."

## Shapes

The shape language is **Soft**. A 0.25rem (4px) corner radius is the standard for most interactive elements including buttons, input fields, and small cards. 

Large content containers, such as the "Emergency Hotlines" widget or "Quick Services" cards, should utilize `rounded-lg` (0.5rem) to feel more approachable. This subtle rounding softens the serious nature of government data without sacrificing the professional, structured look of the grid.

## Components

### Buttons
*   **Primary:** Solid Primary Blue with white text, 4px rounded corners. Use for "Apply Now" or "Submit."
*   **Secondary:** Outlined Blue with 1px border. Use for "View All" or "Learn More."

### Cards
Cards should have a white background, a 1px soft gray border, and a subtle vertical stack. Icons within cards should be contained in a soft blue circular or square housing to maintain a clean, categorized look.

### Emergency Hotlines
A specialized component using the Tertiary Red for icons and title. This should always be high-contrast and easily accessible, often positioned in a side rail or sticky footer.

### Input Fields
Fields should use a light gray background with a 1px border. Focus states must clearly use the Secondary Blue for the border to guide the user's attention.

### Chips & Badges
Use for status indicators (e.g., "New," "Upcoming"). These should have a light tinted background of the status color (e.g., light red for "Urgent") with high-contrast text.