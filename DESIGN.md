# Toolhub — Design guidelines

Version 1.2 · 2026-09-08 · English interface

## Direction

A calm internal workspace with readable content, restrained color and clear actions. The visual direction adapts the user's Notion-design-analysis reference. Values below are project decisions, not verified official Notion design tokens.

The current delivery contains account UI only. Show a centered form and logo on a white canvas. Keep the left-hand connection diagram on desktop, with category names only. No slogans, long descriptions, footer copy or demo controls.

## Principles

- Put the user's task first: make the form immediately usable.
- Keep controls rectangular, typography clear and surfaces mostly flat.
- Use pure black (#000000) for primary actions and keyboard focus. This user decision overrides the original purple reference.
- Provide labels, focus states, validation, loading and clear completion messages.
- Use English for every visible label, placeholder, error, accessible name and status.
- Use Toolhub as the working brand. Use the Notion logo temporarily at the user’s explicit request; retain the Toolhub name. The asset comes from Simple Icons.

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
| Primary | #000000 |
| Primary hover/pressed | #262626 |
| On-primary | #ffffff |
| Error text | #b42318 |
| Success text | #236b3b |
| Peach | #ffe8d4 / text #793400 |
| Mint | #d9f3e1 / text #236b3b |
| Lavender | #e6e0f5 / text #391c57 |
| Sky | #dcecfa / text #005bab |
| Yellow | #fef7d6 / text #793400 |

## Typography and spacing

System sans-serif, with Inter as an optional later asset. Body 16px, primary labels 14px, secondary metadata 12–13px. Form heading 24px/1.35, weight 600. Brand wordmark 24px.

Spacing is based on 4px increments. Form controls are 44px high; form width is capped at 360px. Buttons and inputs use 8px radius, content containers 12px. Pill shapes are reserved for appropriate status badges and tabs.

## Account layout

Desktop: 47/53 split with the logo and connection diagram on the left, a centered 360px-wide form on the right. No surrounding form card or footer. Mobile: compact logo header and one-column form; hide the diagram. Use 24px mobile gutters and vertical scrolling when needed. Keep headings and account-switch links centered; input labels remain left-aligned.

## Components

- Primary button: pure black, white text, clear loading indicator and disabled submission while busy.
- Inputs: persistent labels, 16px text, explicit password visibility control with accessible names.
- Secondary actions: clear text links or outlined buttons, always keyboard reachable.
- Error messages: text plus a tinted surface; never color alone.
- Success feedback: icon and text; no unsupported claims about real authentication.
- Keep only necessary labels, password requirements, account navigation and actionable error messages.

## Interaction and accessibility

Color/opacity transitions use roughly 150ms. Respect reduced-motion preferences. Use real form, label and button semantics. Move focus to the heading when changing screens and preserve a visible keyboard outline.

Ensure no full-page horizontal overflow. Touch controls should provide approximately 44px targets. Validate contrast, keyboard use and 200% zoom on the actual production UI before claiming accessibility conformance.

## Backend boundary

Do not place prototype explanations or demo controls on the default form. Document the UI-only scope in the README. Until a backend exists, submission reports that the action is unavailable. Never claim successful sign-in, account creation or email delivery. The explicit `?view=account` design-review URL contains no protected data and establishes no session.

## Future workspace

Once requested, use a collapsible sidebar, content-first pages and node connections similar to workflow editors. Keep tool metadata separate from its position on a board. Do not add these features as part of the account-only release.

## References

- User-supplied Notion-design-analysis, alpha: source for palette and shape direction.
- [Notion page customization](https://www.notion.com/help/customize-and-style-your-content): content styling and page-width inspiration.
- [Notion sidebar navigation](https://www.notion.com/help/guides/navigating-with-the-sidebar): future navigation inspiration.
