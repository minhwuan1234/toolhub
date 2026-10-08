# Toolhub — Agent workspace design

Version 3.18 · 2026-10-08 · English interface

## Current product direction

Toolhub is a canvas workspace for three AI agents: Business Analyst, UI/UX Designer, and Developer. The canvas and chat are the primary interface. Keep every visible label, placeholder, menu item, status, and accessible name in English. The seven former department tabs are hidden from the UI; the underlying roles remain available.

## Canvas

- Place Add node, Add note, Fit view, Zoom in, and Zoom out in one vertical toolbar at the canvas's upper right. Separate creation from viewport controls with a subtle divider. Show the current zoom percentage below the controls.
- New AI Agent nodes immediately open their Agent card and remain in Setup needed until saved.
- Selecting an AI Agent node opens its Agent card. The card contains name, role, mission, responsibilities, inputs, outputs, collaboration, and an option to use the current Toolhub DESIGN.md guidance. Saving the card activates a custom agent, persists it in the shared workspace, and makes it discoverable by MCP and the chat target menu. Only admins can edit cards; signed-in members can read them.
- Keep the Agent card header compact: show the current status tag beside the title, with a glowing green indicator when the agent is active. Do not show explanatory intro copy above the form fields.
- Give the Agent card dialog a width of 60% of the viewport on desktop and about 80% of the viewport height. On narrow screens, let it fill the available width with a small margin. Scroll the card form within the dialog. Use taller single-line fields and text areas that show several lines of agent instructions without immediate scrolling.
- The default BA, UI/UX, and Developer nodes use editable cards that reflect their distinct roles. New custom agents start in Setup needed until their card is saved. Custom agent nodes remain after reload; their canvas positions are stored with the cards.
- Selecting the UI/UX Agent enters a dedicated Graph screen within the Toolhub workspace, with the breadcrumb `Workspace > Toolhub > UI/UX Graph`; do not place the graph in the Agent card popup. The graph fills the workspace content area beneath the shared top bar, without a second page title, back button, inset card, or surrounding padding. Put Agent card on the same row as `UI/UX workflow` and open the card from there. Use the main canvas's flat 2D style: a white dotted field that covers the entire visible panel and remains continuous while panning, 64px rounded square nodes with a centered icon and short label below, the same node border, hover, focus, and grab states, plus input/output ports and curved animated edges. The right sidebar matches the main Add node picker and offers Workflow node and Context Builder. A Context Builder holds pasted text or the contents of a local text or Markdown file; connecting it to a workflow node expresses which context that workflow node receives. Context connections are optional while graph execution is still being developed. Every graph node has the same right-click actions: Rename, Change icon, Set active/inactive, a disabled Write ticket placeholder, and Delete node; Context Builder also offers Edit context. Click or drag either picker tile to add it. With the graph focused, `+`, `=`, or `N` adds a Workflow node at the visible center, and `0` resets pan. With a node or link focused, Backspace/Delete removes it. Drag an output port to another node's input to connect; keyboard users can activate output then input ports. Drag existing nodes to move them, use arrow keys to nudge them, and drag empty space to pan. Store node type, name, icon, active state, context text, file name, IDs, positions, links, and pan offset in this browser. Node execution behavior comes later. On narrow screens, place the compact node picker below the field.
- Keep the canvas open and quiet, with the three agent nodes visible and a compact chat composer floating near its lower center. Avoid a right-side chat panel.

## Chat composer and agent menu

- Use a single white rounded composer inspired by the supplied reference: a generous text area above a short tool row, with a dark send button at the lower right. Avoid controls that have no working action.
- The agent target control sits at the lower left. Its default is Auto, which sends the request to the full team. The user can choose Business Analyst, UI/UX Designer, Developer, or any saved custom agent. Auto runs the three built-in roles in sequence.
- Open target choices in a floating white menu above the control. Each choice has an icon, a concise name, and a muted one-line description. Give the selected or highlighted choice a soft gray surface. Maintain keyboard navigation and visible focus.
- Show model setup, loading, and errors only when applicable. Conversation messages appear above the composer; preserve the working agent status and readable agent attribution.
- Enter sends; Shift+Enter inserts a new line. Disable sending while a request is running or the model is unconfigured.

## Admin account selectors

- Let account table dropdown menus size to their longest option label so department names remain fully visible. Keep the menu within the viewport on narrow screens.

## Visual language and responsive behavior

Use a restrained neutral palette: white surfaces, dark text, subtle gray borders and shadows. Keep controls rounded, compact, and clearly clickable. Maintain at least 40px touch targets for primary chat and canvas actions. On narrow screens, keep the composer inside the viewport, let messages scroll, and keep the canvas toolbar reachable. Honor reduced-motion preferences.

## Design file maintenance

Every UI change should update this current Toolhub section in the same change and reflect the actual shipped behavior. Historical guidance below is retained for context and is not the current product specification.

---

# Historical LinkedIn Daily Scanner design draft

Version 2.0 · 2026-09-22 · English interface

## Direction

A calm internal workspace for LinkedIn scanning and review. The visual direction adapts the user's Notion-design-analysis reference: readable content, restrained surfaces, generous spacing and clear actions. LinkedIn blue is the product accent; Notion is a visual reference, not a brand to copy. Values below are project decisions, not verified official Notion or LinkedIn design tokens.

The existing LinkedIn tool's functions, API contracts, data model and business logic must not change as part of the visual redesign. Replace the current frontend presentation with a friendly, content-first application shell for scanning, filtering and reviewing LinkedIn results. Do not add slogans, marketing copy, fake activity, unsupported claims or demo controls.

## Principles

- Put the user's task first: make scanning, filtering and reviewing results immediately understandable.
- Keep controls rectangular, typography clear and surfaces mostly flat.
- Use LinkedIn blue for primary actions and brand emphasis. Use pure black or a dark neutral for text and keyboard focus where it provides stronger contrast.
- Provide labels, focus states, validation, loading and clear completion messages.
- Use English for every visible label, placeholder, error, accessible name and status.
- Use the LinkedIn tool's existing product name and logo treatment. Do not use the Notion logo or imply affiliation with Notion or LinkedIn beyond the tool's intended integration.
- Prefer progressive disclosure: show the most useful information first and keep advanced filters and secondary actions easy to find but visually quiet.

## Tokens

| Role | Value |
|---|---|
| Canvas | #ffffff |
| Secondary surface | #f6f5f4 |
| Soft surface | #fafaf9 |
| Heading | #262520 |
| Body | #37352f |
| Secondary text | #5d5b54 |
| Decorative border | #e5e3df |
| Primary / LinkedIn blue | #0A66C2 |
| Primary hover/pressed | #004182 |
| Primary soft surface | #E8F3FF |
| On-primary | #ffffff |
| Keyboard focus | #0A66C2 |
| Error text | #b42318 |
| Success text | #236b3b |
| Peach | #ffe8d4 / text #793400 |
| Mint | #d9f3e1 / text #236b3b |
| Lavender | #e6e0f5 / text #391c57 |
| Sky | #dcecfa / text #005bab |
| Yellow | #fef7d6 / text #793400 |

## Typography and spacing

System sans-serif, with Inter as an optional later asset. Body 16px, primary labels 14px, secondary metadata 12–13px. Form and page headings use 24px/1.35, weight 600. Section headings use 18–20px, weight 600. Brand wordmark is 20–24px depending on the shell context.

Spacing is based on 4px increments. Form controls are 44px high; form width is capped at 360px. Buttons and inputs use 8px radius, content containers 12px. Pill shapes are reserved for appropriate status badges, filters and tabs.

## Application shell

Desktop: use a quiet left sidebar for primary navigation and a content-first main area. The sidebar may contain the product mark, scan/navigation destinations and account controls; it must not compete with the results. Use a compact top bar for page title, scan status and high-value actions.

The main content should use a readable max-width rather than stretching dense data edge to edge. Use a 12-column grid when useful, with a 24–32px desktop gutter. Mobile collapses to one column, uses 24px gutters and allows vertical scrolling. Hide non-essential navigation and decorative illustration on small screens.

Do not wrap every section in a heavy card. Use borders, spacing and soft surfaces to establish grouping. Reserve elevated cards and modals for meaningful hierarchy or confirmation.

## LinkedIn scanner workspace

The primary workspace should make four things clear at a glance: what was scanned, when it ran, whether it succeeded, and what the user can do with the results.

- Keep scan controls near the page title and make the primary scan action visually dominant.
- Show the last-run timestamp, result count and current status as compact metadata.
- Present results in a scannable table or responsive list with stable columns, clear row spacing and a visible empty state.
- Use filters, search and sort controls with persistent labels or clear accessible names. Show active filters as removable chips.
- Keep row-level actions concise; place destructive or irreversible actions behind confirmation.
- Preserve the existing LinkedIn result fields and behavior. This document defines presentation, not new product functionality.

## Account layout

Account screens use a centered form on a white canvas. The form is capped at 360px and has no unnecessary surrounding card. Mobile uses a compact logo header and one-column form. Keep headings and account-switch links centered; input labels remain left-aligned.

## Components

- Primary button: LinkedIn blue, white text, clear loading indicator and disabled submission while busy.
- Inputs: persistent labels, 16px text, explicit password visibility control with accessible names.
- Secondary actions: clear text links or outlined buttons, always keyboard reachable.
- Error messages: text plus a tinted surface; never color alone.
- Success feedback: icon and text; no unsupported claims about real authentication or completed scans.
- Tables, filters and scan controls must expose labels, status and actionable feedback without relying on color alone.
- Keep only necessary labels, password requirements, account navigation and actionable error messages.

## Interaction and accessibility

Color/opacity transitions use roughly 150ms. Respect reduced-motion preferences. Use real form, label and button semantics. Move focus to the heading when changing screens and preserve a visible keyboard outline. Use approximately 44px touch targets for primary controls.

Ensure no full-page horizontal overflow. Validate contrast, keyboard use, 200% zoom and responsive behavior on the actual production UI before claiming accessibility conformance.

## Backend and function boundary

Do not change the existing LinkedIn scanner functions, API contracts, authentication behavior, database behavior or permissions during this visual redesign. Show scan success, result counts and account state only after the server confirms them. Never present decorative animation as real system activity. Do not add a design-review bypass, fake data or unsupported authentication claims. Only admins see account management, and the server enforces the same permission. Email delivery and password recovery remain unimplemented unless separately requested.

## Future workspace

If future workspace features are requested, use a collapsible sidebar, content-first pages and node connections similar to workflow editors. Keep tool metadata separate from its position on a board. Do not add future workspace features as part of the visual-only release unless they already exist functionally.

## References

- User-supplied Notion-design-analysis, alpha: source for palette and shape direction.
- [Notion page customization](https://www.notion.com/help/customize-and-style-your-content): content styling and page-width inspiration.
- [Notion sidebar navigation](https://www.notion.com/help/guides/navigating-with-the-sidebar): future navigation inspiration.
- [LinkedIn brand guidelines](https://brand.linkedin.com/): color and brand usage reference; product decisions in this document take precedence.

## Optional decorative diagram

If the existing product includes a department selector, use the installed Select primitive, a 44px trigger and keyboard-accessible options. Do not add a department concept if it is not already part of the product function.

Any existing decorative diagram should remain secondary to the scanner workflow. Use LinkedIn blue for the hub or selected state, retain pastel icon backgrounds, and keep motion subtle. Gentle node float, moving connection dashes and a subtle hub outline may provide looping motion. A compact pause control stops animation; reduced-motion preferences disable it. Mobile hides the illustration to keep the form compact. The motion is decorative, not actual system activity.

## Visual QA checklist

Before considering the frontend redesign complete, verify:

- The main scan action and current scan status are immediately discoverable.
- Results remain readable with long names, empty data and error states.
- Active filters, sorting and pagination state are understandable without color alone.
- Keyboard navigation, focus visibility, 200% zoom and responsive layouts work on every primary screen.
- LinkedIn blue is reserved for brand emphasis, primary actions and selected states; it does not overwhelm the content.
- Loading states disable duplicate submissions and do not imply progress that the server has not confirmed.
- No frontend-only change has altered existing functions or backend behavior.
