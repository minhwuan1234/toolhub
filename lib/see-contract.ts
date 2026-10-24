export const seeStages = [
  { kind: 'ast-layers', name: 'AST Layers' },
  { kind: 'dependency-graph', name: 'Dependency Graph' },
  { kind: 'rule-classifier', name: 'Rule Classifier' },
  { kind: 'layer-assignment', name: 'layer_assignment' },
] as const;
export type SeeStage = typeof seeStages[number]['kind'];
export const isSeeStage = (kind: string): kind is SeeStage => seeStages.some(stage => stage.kind === kind);
export type CodeLayer = 'presentation' | 'business_logic' | 'database';
export type SeeSymbol = {
  id: string; path: string; name: string; kind: string; startLine: number; endLine: number;
  excerpt: string; parser: string; signals: string[]; calls: string[]; imports: Array<{ specifier: string; target?: string; names: Array<{ local: string; imported: string }> }>;
  routes: string[]; tables: string[];
};
export type SeeEdge = { source: string; target: string; relation: 'imports' | 'calls' | 'http'; evidence: string };
export type LayerRule = { id: string; path: string; name: string; startLine: number; endLine: number; excerpt: string; candidates: CodeLayer[]; evidence: string[]; confidence: 'high' | 'medium' | 'low' };
export type SeeOutput = {
  stage: SeeStage; analysis_query?: string; run_id: string; source_node_id: string; repository: string; commit: string; tool_id: string; model_calls: 0;
  coverage: string; truncated: boolean; notes: string[]; items: Array<SeeSymbol | SeeEdge | LayerRule | (LayerRule & { layer: CodeLayer | 'mixed' | 'unknown' })>;
  symbols?: SeeSymbol[]; edges?: SeeEdge[]; unresolved?: string[]; counts?: Record<string, number>; total_items: number;
};
