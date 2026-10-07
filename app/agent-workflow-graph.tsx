'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CircleDot, Link2, Plus, Trash2 } from 'lucide-react';

type GraphNode = { id: string; number: number; x: number; y: number };
type GraphLink = { id: string; source: string; target: string };

const storageKey = 'toolhub:designer-graph:v2';
const previousStorageKey = 'toolhub:designer-graph:v1';
const nodeWidth = 76;
const nodeHeight = 108;
const nodeRadius = nodeWidth / 2;

function isGraphNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === 'string' && typeof node.number === 'number' && Number.isInteger(node.number) && node.number > 0 && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y);
}

function isGraphLink(value: unknown): value is GraphLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  return typeof link.id === 'string' && typeof link.source === 'string' && typeof link.target === 'string' && link.source !== link.target;
}

function endpoints(source: GraphNode, target: GraphNode) {
  const sourceX = source.x + nodeRadius;
  const sourceY = source.y + nodeRadius;
  const targetX = target.x + nodeRadius;
  const targetY = target.y + nodeRadius;
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const directionX = (targetX - sourceX) / distance;
  const directionY = (targetY - sourceY) / distance;
  return {
    x1: sourceX + directionX * nodeRadius,
    y1: sourceY + directionY * nodeRadius,
    x2: targetX - directionX * (nodeRadius + 5),
    y2: targetY - directionY * (nodeRadius + 5),
  };
}

export function AgentWorkflowGraph() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const graph = JSON.parse(saved) as { nodes?: unknown; links?: unknown };
        const savedNodes = Array.isArray(graph.nodes) ? graph.nodes.filter(isGraphNode).slice(0, 100) : [];
        const nodeIds = new Set(savedNodes.map(node => node.id));
        setNodes(savedNodes);
        setLinks(Array.isArray(graph.links) ? graph.links.filter(isGraphLink).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target)).slice(0, 300) : []);
      } else {
        const previous = JSON.parse(localStorage.getItem(previousStorageKey) || '[]') as unknown;
        if (Array.isArray(previous)) setNodes(previous.filter(isGraphNode).slice(0, 100));
      }
    } catch { /* Start with an empty draft if local storage is unavailable. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ nodes, links })); }
    catch { /* The graph remains usable for this session. */ }
  }, [nodes, links, loaded]);

  function addNode() {
    const width = stageRef.current?.clientWidth || 640;
    const columns = Math.max(1, Math.min(5, Math.floor((width - 40) / 156)));
    setNodes(current => {
      const number = Math.max(0, ...current.map(node => node.number)) + 1;
      const index = current.length;
      const column = index % columns;
      const row = Math.floor(index / columns);
      const clusterWidth = (columns - 1) * 156 + nodeWidth;
      const startX = Math.max(20, (width - clusterWidth) / 2);
      return [...current, {
        id: crypto.randomUUID(), number,
        x: Math.min(startX + column * 156 + (row % 2) * 24, Math.max(12, width - nodeWidth - 12)),
        y: 94 + row * 142 + (column % 2) * 28,
      }];
    });
  }

  function chooseNode(id: string) {
    if (draggedRef.current) { draggedRef.current = false; return; }
    if (!connecting) return;
    if (!sourceId) { setSourceId(id); setSelectedLink(null); return; }
    if (sourceId === id) { setSourceId(null); return; }
    setLinks(current => current.some(link => link.source === sourceId && link.target === id) ? current : [...current, { id: crypto.randomUUID(), source: sourceId, target: id }]);
    setSourceId(null);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: GraphNode) {
    if (event.button !== 0) return;
    draggedRef.current = false;
    if (connecting) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    dragRef.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.id !== id || !stage) return;
    if (Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) > 4) draggedRef.current = true;
    const x = Math.max(8, Math.min(stage.clientWidth - nodeWidth - 8, drag.x + event.clientX - drag.pointerX));
    const y = Math.max(8, Math.min(stage.clientHeight - nodeHeight - 8, drag.y + event.clientY - drag.pointerY));
    setNodes(current => current.map(node => node.id === id ? { ...node, x, y } : node));
  }

  const stageHeight = Math.max(440, ...nodes.map(node => node.y + nodeHeight + 28));

  return <section className="workflow-graph" aria-label="UI/UX workflow graph">
    <div className="workflow-graph-toolbar">
      <div><strong>UI/UX workflow</strong><span role="status">{sourceId ? 'Select a target node' : connecting ? 'Select a source node' : `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} · ${links.length} ${links.length === 1 ? 'link' : 'links'}`}</span></div>
      <div className="workflow-graph-actions">
        {selectedLink && <button type="button" onClick={() => { setLinks(current => current.filter(link => link.id !== selectedLink)); setSelectedLink(null); }}><Trash2 size={15}/>Remove link</button>}
        <button type="button" className="workflow-connect-button" aria-pressed={connecting} disabled={!loaded || nodes.length < 2} onClick={() => { draggedRef.current = false; setConnecting(current => !current); setSourceId(null); setSelectedLink(null); }}><Link2 size={16}/>Connect</button>
        <button type="button" onClick={addNode} disabled={!loaded || nodes.length >= 100}><Plus size={16}/>Add node</button>
      </div>
    </div>
    <div className="workflow-graph-canvas">
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><CircleDot size={28}/><strong>Start with a node</strong><span>Use Add node to sketch the UI/UX workflow.</span></div>}
        <svg className="workflow-graph-links" aria-label="Workflow links">
          <defs><marker id="workflow-link-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7"/></marker></defs>
          {links.map(link => {
            const source = nodes.find(node => node.id === link.source);
            const target = nodes.find(node => node.id === link.target);
            if (!source || !target) return null;
            const line = endpoints(source, target);
            return <g key={link.id} className="workflow-graph-link" data-selected={selectedLink === link.id}>
              <line {...line} className="workflow-graph-link-line" markerEnd="url(#workflow-link-arrow)"/>
              <line {...line} className="workflow-graph-link-hit" role="button" tabIndex={0} aria-label={`Link from Node ${source.number} to Node ${target.number}. Select to remove.`} onClick={() => { setSelectedLink(link.id); setSourceId(null); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLink(link.id); setSourceId(null); } }}/>
            </g>;
          })}
        </svg>
        {nodes.map(node => <button
          key={node.id} type="button" className="workflow-graph-node" data-depth={node.number % 3} data-link-source={sourceId === node.id} data-connecting={connecting} style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}
          aria-label={`Node ${node.number}. Drag or use arrow keys to move.`}
          onClick={() => chooseNode(node.id)}
          onPointerDown={event => startDrag(event, node)}
          onPointerMove={event => moveDrag(event, node.id)}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={event => {
            if (event.key === 'Escape' && connecting) { event.preventDefault(); setSourceId(null); setConnecting(false); return; }
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
        ><CircleDot size={22} aria-hidden="true"/><span className="workflow-graph-node-label">Node {node.number}</span></button>)}
      </div>
    </div>
  </section>;
}
