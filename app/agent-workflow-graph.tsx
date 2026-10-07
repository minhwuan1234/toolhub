'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CircleDot, Plus } from 'lucide-react';

type GraphNode = { id: string; number: number; x: number; y: number };

const storageKey = 'toolhub:designer-graph:v1';
const nodeWidth = 160;
const nodeHeight = 72;

function isGraphNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === 'string' && typeof node.number === 'number' && Number.isInteger(node.number) && node.number > 0 && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y);
}

export function AgentWorkflowGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]') as unknown;
      if (Array.isArray(saved)) setNodes(saved.filter(isGraphNode).slice(0, 100));
    } catch { /* Start with an empty draft if local storage is unavailable. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify(nodes)); }
    catch { /* The graph remains usable for this session. */ }
  }, [nodes, loaded]);

  function addNode() {
    const width = stageRef.current?.clientWidth || 640;
    const columns = Math.max(1, Math.floor((width - 48) / 216));
    setNodes(current => {
      const number = Math.max(0, ...current.map(node => node.number)) + 1;
      const index = current.length;
      const column = index % columns;
      const row = Math.floor(index / columns);
      return [...current, {
        id: crypto.randomUUID(), number,
        x: Math.min(24 + column * 216 + (row % 2) * 36, Math.max(12, width - nodeWidth - 12)),
        y: 78 + row * 132 + (column % 2) * 22,
      }];
    });
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: GraphNode) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.id !== id || !stage) return;
    const x = Math.max(8, Math.min(stage.clientWidth - nodeWidth - 8, drag.x + event.clientX - drag.pointerX));
    const y = Math.max(8, Math.min(stage.clientHeight - nodeHeight - 8, drag.y + event.clientY - drag.pointerY));
    setNodes(current => current.map(node => node.id === id ? { ...node, x, y } : node));
  }

  const stageHeight = Math.max(440, ...nodes.map(node => node.y + nodeHeight + 28));

  return <section className="workflow-graph" aria-label="UI/UX workflow graph">
    <div className="workflow-graph-toolbar">
      <div><strong>UI/UX workflow</strong><span>{nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}</span></div>
      <button type="button" onClick={addNode} disabled={!loaded || nodes.length >= 100}><Plus size={16}/>Add node</button>
    </div>
    <div className="workflow-graph-canvas">
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><CircleDot size={28}/><strong>Start with a node</strong><span>Use Add node to sketch the UI/UX workflow.</span></div>}
        {nodes.map(node => <button
          key={node.id} type="button" className="workflow-graph-node" data-depth={node.number % 3} style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}
          aria-label={`Node ${node.number}. Drag or use arrow keys to move.`}
          onPointerDown={event => startDrag(event, node)}
          onPointerMove={event => moveDrag(event, node.id)}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={event => {
            const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key] as [number, number] | undefined;
            if (!delta) return;
            event.preventDefault();
            const width = stageRef.current?.clientWidth || 640;
            setNodes(current => current.map(item => item.id === node.id ? {
              ...item,
              x: Math.max(8, Math.min(width - nodeWidth - 8, item.x + delta[0])),
              y: Math.max(8, item.y + delta[1]),
            } : item));
          }}
        ><span className="workflow-graph-port" aria-hidden="true"/><CircleDot size={16}/><span>Node {node.number}</span><span className="workflow-graph-port" aria-hidden="true"/></button>)}
      </div>
    </div>
  </section>;
}
