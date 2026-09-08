# Toolhub — Design guidelines

Version 1.1 · 2026-09-08 · English interface

## Direction

A calm internal workspace with readable content, restrained color and clear actions. The visual direction adapts the user's Notion-design-analysis reference. Values below are project decisions, not verified official Notion design tokens.

The current delivery contains account UI only. A static connection diagram communicates the future product context without pretending to be a live board.

## Principles

- Put the user's task first: make the form immediately usable.
- Keep controls rectangular, typography clear and surfaces mostly flat.
- Use purple for the primary action, pastel for contextual categories and explicit text for status.
- Provide labels, focus states, validation, loading and clear completion messages.
- Use English for every visible label, placeholder, error, accessible name and status.
- Use Toolhub as the working brand. Do not reuse Notion logos or proprietary fonts.

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
| Primary | #5645d4 |
| Primary hover/pressed | #4534b3 |
| On-primary | #ffffff |
| Error text | #b42318 |
| Success text | #236b3b |
| Peach | #ffe8d4 / text #793400 |
| Mint | #d9f3e1 / text #236b3b |
| Lavender | #e6e0f5 / text #391c57 |
| Sky | #dcecfa / text #005bab |
| Yellow | #fef7d6 / text #793400 |

## Typography and spacing

System sans-serif, with Inter as an optional later asset. Body 16px, primary labels 14px, secondary metadata 12–13px. Form heading 30px/1.3, weight 600; mobile 28px. Brand heading uses a responsive 30–46px size.

Spacing is based on 4px increments. Form controls are 46px high; form width is capped at 384px. Buttons and inputs use 8px radius, content containers 12px. Pill shapes are reserved for appropriate status badges and tabs.

## Account layout

Desktop uses a 47/53 split: warm neutral context panel on the left and white form surface on the right. The left panel has the brand, a short product explanation and a small static connection diagram. The form remains the dominant interactive area.

At 760px and below, collapse the contextual panel into a compact brand header. Keep one form column with 24px side padding. Allow vertical scrolling for registration and enlarged text.

## Components

- Primary button: purple, white text, clear loading indicator and disabled submission while busy.
- Inputs: persistent labels, 16px text, explicit password visibility control with accessible names.
- Secondary actions: clear text links or outlined buttons, always keyboard reachable.
- Error messages: text plus a tinted surface; never color alone.
- Success feedback: icon and text; no unsupported claims about real authentication.
- Diagram cards: pastel icon tiles, neutral labels and fine connection lines. Never display fake live status.

## Interaction and accessibility

Color/opacity transitions use roughly 150ms. Respect reduced-motion preferences. Use real form, label and button semantics. Move focus to the heading when changing screens and preserve a visible keyboard outline.

Ensure no full-page horizontal overflow. Touch controls should provide approximately 44px targets. Validate contrast, keyboard use and 200% zoom on the actual production UI before claiming accessibility conformance.

## Prototype disclosure

The preview must clearly say authentication is not connected. It must never store real passwords, claim an email was sent or portray in-memory UI state as a secure session.

## Future workspace

Once requested, use a collapsible sidebar, content-first pages and node connections similar to workflow editors. Keep tool metadata separate from its position on a board. Do not add these features as part of the account-only release.

## References

- User-supplied Notion-design-analysis, alpha: source for palette and shape direction.
- [Notion page customization](https://www.notion.com/help/customize-and-style-your-content): content styling and page-width inspiration.
- [Notion sidebar navigation](https://www.notion.com/help/guides/navigating-with-the-sidebar): future navigation inspiration.
