'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';

type GraphNode = { id: string; number: number; x: number; y: number };
type GraphLink = { id: string; source: string; target: string };

const storageKey = 'toolhub:designer-graph:v2';
const previousStorageKey = 'toolhub:designer-graph:v1';
const nodeWidth = 28;
const nodeHeight = 48;
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

function linkPath(source: GraphNode, target: GraphNode) {
  const sourceX = source.x + nodeRadius;
  const sourceY = source.y + nodeRadius;
  const targetX = target.x + nodeRadius;
  const targetY = target.y + nodeRadius;
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY) || 1;
  const directionX = (targetX - sourceX) / distance;
  const directionY = (targetY - sourceY) / distance;
  const x1 = sourceX + directionX * nodeRadius;
  const y1 = sourceY + directionY * nodeRadius;
  const x2 = targetX - directionX * (nodeRadius + 6);
  const y2 = targetY - directionY * (nodeRadius + 6);
  const bend = Math.max(42, Math.abs(x2 - x1) * .45);
  if (Math.abs(x2 - x1) < 32) {
    const verticalBend = Math.max(42, Math.abs(y2 - y1) * .45) * Math.sign(y2 - y1 || 1);
    return `M ${x1} ${y1} C ${x1} ${y1 + verticalBend}, ${x2} ${y2 - verticalBend}, ${x2} ${y2}`;
  }
  const horizontalBend = bend * Math.sign(x2 - x1);
  return `M ${x1} ${y1} C ${x1 + horizontalBend} ${y1}, ${x2 - horizontalBend} ${y2}, ${x2} ${y2}`;
}

export function AgentWorkflowGraph({ onOpenAgentCard }: { onOpenAgentCard: () => void }) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const graph = JSON.parse(saved) as { nodes?: unknown; links?: unknown; pan?: { x?: unknown; y?: unknown } };
        const savedNodes = Array.isArray(graph.nodes) ? graph.nodes.filter(isGraphNode).slice(0, 100) : [];
        const nodeIds = new Set(savedNodes.map(node => node.id));
        setNodes(savedNodes);
        setLinks(Array.isArray(graph.links) ? graph.links.filter(isGraphLink).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target)).slice(0, 300) : []);
        if (Number.isFinite(graph.pan?.x) && Number.isFinite(graph.pan?.y)) setPan({ x: graph.pan!.x as number, y: graph.pan!.y as number });
      } else {
        const previous = JSON.parse(localStorage.getItem(previousStorageKey) || '[]') as unknown;
        if (Array.isArray(previous)) setNodes(previous.filter(isGraphNode).slice(0, 100));
      }
    } catch { /* Start with an empty draft if local storage is unavailable. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ nodes, links, pan })); }
    catch { /* The graph remains usable for this session. */ }
  }, [nodes, links, pan, loaded]);

  function addNode() {
    setNodes(current => {
      const number = Math.max(0, ...current.map(node => node.number)) + 1;
      const branchIndex = current.length - 1;
      const column = Math.floor(branchIndex / 5);
      const row = branchIndex % 5;
      return [...current, {
        id: crypto.randomUUID(), number,
        x: Math.max(24, (current.length === 0 ? 105 : 310 + column * 170) - pan.x),
        y: Math.max(24, (current.length === 0 ? 206 : 72 + row * 84 + (column % 2) * 20) - pan.y),
      }];
    });
  }

  function focusNode(node: GraphNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPan({ x: canvas.clientWidth / 2 - node.x - nodeRadius, y: canvas.clientHeight / 2 - node.y - nodeRadius });
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
    event.stopPropagation();
    if (event.button !== 0) return;
    draggedRef.current = false;
    if (connecting) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.id !== id || !stage) return;
    if (Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) > 4) draggedRef.current = true;
    const x = Math.max(8, drag.x + event.clientX - drag.pointerX);
    const y = Math.max(8, drag.y + event.clientY - drag.pointerY);
    setNodes(current => current.map(node => node.id === id ? { ...node, x, y } : node));
  }

  const stageHeight = Math.max(440, ...nodes.map(node => node.y + nodeHeight + 28));
  const stageWidth = Math.max(760, ...nodes.map(node => node.x + nodeWidth + 28));

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget && event.target !== stageRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, x: pan.x, y: pan.y };
    setPanning(true);
    setSelectedLink(null);
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const gesture = panRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    setPan({ x: gesture.x + event.clientX - gesture.pointerX, y: gesture.y + event.clientY - gesture.pointerY });
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    setPanning(false);
  }

  return <section className="workflow-graph" aria-label="UI/UX workflow graph">
    <div className="workflow-graph-toolbar">
      <div><strong>UI/UX workflow</strong><span role="status">{sourceId ? 'Select a target node' : connecting ? 'Select a source node' : `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} · ${links.length} ${links.length === 1 ? 'link' : 'links'} · Drag space to pan`}</span></div>
      <button type="button" className="workflow-graph-agent-card" onClick={onOpenAgentCard}>Agent card</button>
    </div>
    <div className="workflow-graph-body">
    <div ref={canvasRef} className="workflow-graph-canvas" data-panning={panning} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight, minWidth: stageWidth, transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><span className="workflow-graph-empty-orb"/><strong>Start with a node</strong><span>Use Add node to sketch the UI/UX workflow.</span></div>}
        <svg className="workflow-graph-links" aria-label="Workflow links">
          <defs><marker id="workflow-link-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#9eb9c6" strokeWidth="1.5"/></marker></defs>
          {links.map(link => {
            const source = nodes.find(node => node.id === link.source);
            const target = nodes.find(node => node.id === link.target);
            if (!source || !target) return null;
            const d = linkPath(source, target);
            return <g key={link.id} className={selectedLink === link.id ? 'workflow-graph-link is-selected' : 'workflow-graph-link'}>
              <path d={d} className="connection-hit" role="button" tabIndex={0} aria-label={`Link from Node ${source.number} to Node ${target.number}. Select to remove.`} onPointerDown={event => event.stopPropagation()} onClick={() => { setSelectedLink(link.id); setSourceId(null); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLink(link.id); setSourceId(null); } }}/>
              <path d={d} className="connection-line" markerEnd="url(#workflow-link-arrow)"/>
              <path d={d} className="connection-motion"/>
            </g>;
          })}
        </svg>
        {nodes.map((node, index) => <button
          key={node.id} type="button" className="workflow-graph-node" data-root={index === 0} data-link-source={sourceId === node.id} data-connecting={connecting} style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}
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
            setNodes(current => current.map(item => item.id === node.id ? {
              ...item,
              x: Math.max(8, item.x + delta[0]),
              y: Math.max(8, item.y + delta[1]),
            } : item));
          }}
        ><span className="workflow-graph-node-label">Node {node.number}</span></button>)}
      </div>
    </div>
    <aside className="workflow-graph-sidebar" aria-label="Graph tools and nodes">
      <strong>Graph tools</strong>
      <div className="workflow-graph-actions">
        <button type="button" onClick={addNode} disabled={!loaded || nodes.length >= 100}><Plus size={16}/>Add node</button>
        <button type="button" className="workflow-connect-button" aria-pressed={connecting} disabled={!loaded || nodes.length < 2} onClick={() => { draggedRef.current = false; setConnecting(current => !current); setSourceId(null); setSelectedLink(null); }}><Link2 size={16}/>Connect nodes</button>
        <button type="button" onClick={() => setPan({ x: 0, y: 0 })}><RotateCcw size={14}/>Reset view</button>
        {selectedLink && <button type="button" onClick={() => { setLinks(current => current.filter(link => link.id !== selectedLink)); setSelectedLink(null); }}><Trash2 size={15}/>Remove link</button>}
      </div>
      <div className="workflow-graph-node-list"><strong>Nodes</strong>{nodes.length === 0 ? <span>No nodes yet</span> : nodes.map(node => <button key={node.id} type="button" onClick={() => focusNode(node)}><i aria-hidden="true"/>Node {node.number}</button>)}</div>
    </aside>
    </div>
  </section>;
}
