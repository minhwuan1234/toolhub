# Toolhub UI design system

Version 4.0 · 2026-10-08 · English interface

/Design.Index/ *This file indexes the Toolhub UI/UX context collection. Each component specification is an independent Markdown context file under contexts/ui-design/.*
/Design.RuleSyntax/ *Write each normative design decision as a named slash block containing one concise requirement.*
/Design.SourceOfTruth/ *Treat named slash blocks in the component context files as the source of truth when designing or reviewing a screen.*
/Design.Unknowns/ *Do not invent behavior, content, or visual rules where the specification is silent. Surface the open question instead.*

## Component specifications

- [Product direction](contexts/ui-design/product-direction.md)
- [Color](contexts/ui-design/color.md)
- [Layout and spacing](contexts/ui-design/layout.md)
- [Buttons and controls](contexts/ui-design/buttons-controls.md)
- [Main canvas and graph](contexts/ui-design/canvas-graph.md)
- [Agent cards](contexts/ui-design/agent-card.md)
- [AI Agent node](contexts/ui-design/ai-agent-node.md)
- [Context Builder](contexts/ui-design/context-builder.md)
- [Agent Handoff](contexts/ui-design/agent-handoff.md)
- [Chat composer and agent menu](contexts/ui-design/chat-composer.md)
- [API spend indicator](contexts/ui-design/api-spend-indicator.md)
- [Admin account selectors](contexts/ui-design/admin-account-selectors.md)
- [Accessibility and responsive behavior](contexts/ui-design/accessibility-responsive.md)

## Usage

/Design.RuleFormat/ *Give every rule a clear name and one concise requirement.*
/Design.ReadScope/ *In Context Builder, attach only the context files relevant to the screen, plus Product direction, Color, Layout, Buttons and controls, and Accessibility and responsive behavior when needed.*
/Design.UIUXScope/ *UI/UX deliverables are designs or prototypes only unless a request explicitly asks for working behavior. A visible control does not imply a real API, persistence, or action.*
/Design.ContextSelection/ *Keep component contexts independent. Attach and connect only the contexts required for a task; do not load or merge every component file by default.*
/Design.Archive/ *Historical LinkedIn scanner guidance is archived at design/archive/linkedin-scanner-v2.md and does not apply to Toolhub.*

## Maintenance

/Design.Maintenance/ *When a UI decision changes, update its component context file and this index if the file map or usage rules change. Keep each context focused on its component.*
/Design.Loading/ *Component contexts are attached to Context Builder by the user and selected through graph connections. The application does not automatically load every context file.*
