export const uiScreenContextCatalog = [
  { id: 'screen-structure', name: 'Screen structure' },
  { id: 'layout-spacing', name: 'Layout & spacing' },
  { id: 'color', name: 'Color' },
  { id: 'typography', name: 'Typography' },
  { id: 'surface', name: 'Surface' },
  { id: 'navigation', name: 'Navigation' },
  { id: 'button', name: 'Button' },
  { id: 'input-form', name: 'Input & form' },
  { id: 'content-display', name: 'Content display' },
  { id: 'icon-media', name: 'Icon & media' },
  { id: 'state-feedback', name: 'States & feedback' },
  { id: 'responsive-accessibility', name: 'Responsive & access' },
] as const;

export type UiScreenContext = { id: string; name: string; content: string };
