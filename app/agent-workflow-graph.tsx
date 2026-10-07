'use client';
// The graph canvas owns pointer panning and keyboard shortcuts; SVG links are keyboard-focusable controls.
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Trash2, Workflow } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

type GraphNode = { id: string; number: number; x: number; y: number };
type GraphLink = { id: string; source: string; target: string };

const storageKey = 'toolhub:designer-graph:v2';
const previousStorageKey = 'toolhub:designer-graph:v1';
const nodeWidth = 64;
const nodeHeight = 92;

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
  return curve({ x: source.x + nodeWidth, y: source.y + nodeWidth / 2 }, { x: target.x, y: target.y + nodeWidth / 2 });
}

function curve(start: { x: number; y: number }, end: { x: number; y: number }) {
  const bend = Math.max(60, Math.abs(end.x - start.x) * .45);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function AgentWorkflowGraph({ onOpenAgentCard }: { onOpenAgentCard: () => void }) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ source: string; point: { x: number; y: number }; target: string | null } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const portDragRef = useRef<{ source: string; pointerId: number } | null>(null);

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

  function addNode(position?: { x: number; y: number }) {
    setNodes(current => {
      const number = Math.max(0, ...current.map(node => node.number)) + 1;
      const branchIndex = current.length - 1;
      const column = Math.floor(branchIndex / 4);
      const row = branchIndex % 4;
      return [...current, {
        id: crypto.randomUUID(), number,
        x: Math.max(8, position?.x ?? (current.length === 0 ? 105 : 310 + column * 190) - pan.x),
        y: Math.max(8, position?.y ?? (current.length === 0 ? 206 : 55 + row * 112 + (column % 2) * 20) - pan.y),
      }];
    });
  }

  function removeNode(id: string) {
    setNodes(current => current.filter(node => node.id !== id));
    setLinks(current => current.filter(link => link.source !== id && link.target !== id));
    setSelectedLink(null);
    if (draft?.source === id || draft?.target === id) setDraft(null);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function connect(source: string, target: string) {
    if (source !== target && nodes.some(node => node.id === source) && nodes.some(node => node.id === target)) {
      setLinks(current => current.some(link => link.source === source && link.target === target) ? current : [...current, { id: crypto.randomUUID(), source, target }]);
    }
    portDragRef.current = null;
    setDraft(null);
  }

  function targetAt(clientX: number, clientY: number, source: string) {
    const port = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-workflow-input]');
    const id = port?.dataset.workflowInput;
    return port && canvasRef.current?.contains(port) && id !== source && nodes.some(node => node.id === id) ? id! : null;
  }

  function startConnection(event: PointerEvent<HTMLButtonElement>, node: GraphNode) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    portDragRef.current = { source: node.id, pointerId: event.pointerId };
    setDraft({ source: node.id, point: { x: node.x + nodeWidth, y: node.y + nodeWidth / 2 }, target: null });
  }

  function moveConnection(event: PointerEvent<HTMLButtonElement>, source: string) {
    event.stopPropagation();
    if (portDragRef.current?.pointerId !== event.pointerId || portDragRef.current.source !== source) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    setDraft({ source, point: { x: event.clientX - box.left - pan.x, y: event.clientY - box.top - pan.y }, target: targetAt(event.clientX, event.clientY, source) });
  }

  function endConnection(event: PointerEvent<HTMLButtonElement>, source: string) {
    event.stopPropagation();
    if (portDragRef.current?.pointerId !== event.pointerId) return;
    const target = targetAt(event.clientX, event.clientY, source);
    if (target) connect(source, target);
    else { portDragRef.current = null; setDraft(null); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: GraphNode) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.id !== id || !stage) return;
    const x = Math.max(8, drag.x + event.clientX - drag.pointerX);
    const y = Math.max(8, drag.y + event.clientY - drag.pointerY);
    setNodes(current => current.map(node => node.id === id ? { ...node, x, y } : node));
  }

  const stageHeight = Math.max(440, ...nodes.map(node => node.y + nodeHeight + 28));
  const stageWidth = Math.max(760, ...nodes.map(node => node.x + nodeWidth + 28));

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.target !== event.currentTarget && event.target !== stageRef.current) return;
    event.currentTarget.focus();
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
      <div><strong>UI/UX workflow</strong><output>{draft ? 'Drop on a node input' : `${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} · ${links.length} ${links.length === 1 ? 'link' : 'links'}`}</output></div>
      <button type="button" className="workflow-graph-agent-card" onClick={onOpenAgentCard}>Agent card</button>
    </div>
    <div className="workflow-graph-body">
    <div ref={canvasRef} className="workflow-graph-canvas" role="application" tabIndex={0} aria-label="UI/UX graph. Drag to pan. Press plus to add a node, zero to reset view, or Delete on a focused node or link to remove it." data-panning={panning} data-drag-over={dragOver} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === '+' || event.key === '=' || event.key.toLowerCase() === 'n') { event.preventDefault(); if (nodes.length < 100) addNode({ x: Math.max(8, event.currentTarget.clientWidth / 2 - pan.x - nodeWidth / 2), y: Math.max(8, event.currentTarget.clientHeight / 2 - pan.y - nodeWidth / 2) }); } else if (event.key === '0') { event.preventDefault(); setPan({ x: 0, y: 0 }); } }}
      onDragOver={event => { if (event.dataTransfer.types.includes('application/x-toolhub-graph-node')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragOver(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
      onDrop={event => { setDragOver(false); if (event.dataTransfer.getData('application/x-toolhub-graph-node') !== 'workflow') return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); addNode({ x: event.clientX - box.left - pan.x - nodeWidth / 2, y: event.clientY - box.top - pan.y - nodeWidth / 2 }); }}>
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight, minWidth: stageWidth, transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><Workflow size={26}/><strong>Start with a node</strong><span>Click or drag Workflow node from the sidebar, or press +.</span></div>}
        <svg className="workflow-graph-links" aria-label="Workflow links">
          <defs><marker id="workflow-link-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#96958e" strokeWidth="1.5"/></marker></defs>
          {links.map(link => {
            const source = nodes.find(node => node.id === link.source);
            const target = nodes.find(node => node.id === link.target);
            if (!source || !target) return null;
            const d = linkPath(source, target);
            return <g key={link.id} className={selectedLink === link.id ? 'workflow-graph-link is-selected' : 'workflow-graph-link'}>
              <path d={d} className="connection-hit" role="button" tabIndex={0} aria-label={`Connection from Node ${source.number} to Node ${target.number}. Press Delete to remove.`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.currentTarget.focus(); setSelectedLink(link.id); }} onKeyDown={event => { if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { setLinks(current => current.filter(item => item.id !== link.id)); setSelectedLink(null); } } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLink(link.id); } }}/>
              <path d={d} className="connection-line" markerEnd="url(#workflow-link-arrow)"/>
              <path d={d} className="connection-motion"/>
            </g>;
          })}
          {draft && (() => { const source = nodes.find(node => node.id === draft.source); const target = draft.target ? nodes.find(node => node.id === draft.target) : null; return source ? <path className={`connection-preview${target ? ' is-ready' : ''}`} d={curve({ x: source.x + nodeWidth, y: source.y + nodeWidth / 2 }, target ? { x: target.x, y: target.y + nodeWidth / 2 } : draft.point)}/> : null; })()}
        </svg>
        {nodes.map(node => <ContextMenu key={node.id}><ContextMenuTrigger className="workflow-graph-node-group" style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}><button
          type="button" className="canvas-node workflow-graph-node"
          aria-label={`Node ${node.number}. Drag or use arrow keys to move. Press Delete to remove.`}
          onPointerDown={event => startDrag(event, node)}
          onPointerMove={event => moveDrag(event, node.id)}
          onPointerUp={event => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={event => {
            if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) removeNode(node.id); return; }
            const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key] as [number, number] | undefined;
            if (!delta) return;
            event.preventDefault();
            const step = event.shiftKey ? 40 : 10;
            setNodes(current => current.map(item => item.id === node.id ? {
              ...item,
              x: Math.max(8, item.x + delta[0] * step),
              y: Math.max(8, item.y + delta[1] * step),
            } : item));
          }}
        ><Workflow size={28} strokeWidth={1.6} aria-hidden="true"/></button><span className="workflow-graph-node-label node-name">Node {node.number}</span>
          <button type="button" className={`node-port workflow-graph-port workflow-graph-port-input${draft && draft.source !== node.id ? ' can-connect' : ''}${draft?.target === node.id ? ' is-target' : ''}${links.some(link => link.target === node.id) ? ' is-connected' : ''}`} data-workflow-input={node.id} aria-label={`Input of Node ${node.number}`} title="Input — drop a connection here" onPointerDown={event => event.stopPropagation()} onClick={() => { if (draft) connect(draft.source, node.id); }}/>
          <button type="button" className={`node-port workflow-graph-port workflow-graph-port-output${links.some(link => link.source === node.id) ? ' is-connected' : ''}`} aria-label={`Connect from Node ${node.number}`} title="Output — drag to another node's input" onPointerDown={event => startConnection(event, node)} onPointerMove={event => moveConnection(event, node.id)} onPointerUp={event => endConnection(event, node.id)} onPointerCancel={event => { event.stopPropagation(); portDragRef.current = null; setDraft(null); }} onLostPointerCapture={event => { event.stopPropagation(); if (portDragRef.current) { portDragRef.current = null; setDraft(null); } }} onClick={event => { if (event.detail === 0) setDraft({ source: node.id, point: { x: node.x + 130, y: node.y + nodeWidth / 2 }, target: null }); }}/>
        </ContextMenuTrigger><ContextMenuContent className="node-context-menu" finalFocus={false} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><ContextMenuItem variant="destructive" onClick={() => removeNode(node.id)}><Trash2/>Delete node<span className="node-delete-shortcut">⌫ / Del</span></ContextMenuItem></ContextMenuContent></ContextMenu>)}
      </div>
    </div>
    <aside className="workflow-graph-sidebar node-picker" aria-label="Add graph node">
      <header><h2>Add node</h2></header>
      <div className="node-picker-options workflow-graph-picker"><button type="button" draggable={loaded && nodes.length < 100} disabled={!loaded || nodes.length >= 100} onDragStart={event => { event.dataTransfer.setData('application/x-toolhub-graph-node', 'workflow'); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDragOver(false)} onClick={() => addNode()}><span><Workflow size={20}/></span>Workflow node</button></div>
    </aside>
    </div>
  </section>;
}
