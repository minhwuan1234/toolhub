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

// Fingerprints of the initial seeded content, so a later catalog update does not erase user edits.
export const initialUiScreenContextHashes: Record<string, number> = {
  'screen-structure': 281804676,
  'layout-spacing': 1975007660,
  color: 2208762848,
  typography: 1482273381,
  surface: 2058241151,
  navigation: 1863675016,
  button: 3410815380,
  'input-form': 513462856,
  'content-display': 1652253424,
  'icon-media': 1892716409,
  'state-feedback': 3606716750,
  'responsive-accessibility': 4084694822,
};

export function uiScreenContextHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
