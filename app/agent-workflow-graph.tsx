'use client';
// The graph canvas owns pointer panning and keyboard shortcuts; SVG links are keyboard-focusable controls.
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Check, FileText, Pencil, Power, Shapes, Ticket, Trash2, Workflow } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { iconOptions, type NodeIcon } from './node-picker';
import { contextFileAccept, maxContextCharacters, maxContextFileBytes, readContextFile } from '@/lib/context-file-reader';

type ContextFile = { id: string; name: string; content: string };
type ContextTag = { id: string; name: string; kind: 'text' | 'file'; text: string; fileId: string | null };
type GraphNode = { id: string; number: number; x: number; y: number; kind: 'workflow' | 'context'; name: string; icon: NodeIcon; active: boolean; contextText: string; contextFiles: ContextFile[]; contextTags: ContextTag[] };
type GraphLink = { id: string; source: string; target: string; command: 'input' };

const storageKey = 'toolhub:designer-graph:v3';
const previousStorageKey = 'toolhub:designer-graph:v2';
const legacyStorageKey = 'toolhub:designer-graph:v1';
const nodeWidth = 64;
const nodeHeight = 118;

function parseContextTags(text: string, files: ContextFile[], previous: ContextTag[] = []): ContextTag[] {
  const tags: ContextTag[] = [];
  const used = new Set<string>();
  const pattern = /(^|\s)\/([^/*\n]{1,40})\/\s*\*([\s\S]*?)\*/g;
  for (const match of text.matchAll(pattern)) {
    if (tags.length >= 30) break;
    const name = match[2].trim();
    if (!name) continue;
    const content = match[3];
    const file = files.find(item => item.name === content.trim());
    const old = previous.find(item => !used.has(item.id) && item.name === name && (file ? item.fileId === file.id : item.kind === 'text' && item.text === content))
      || previous.find(item => !used.has(item.id) && item.name === name);
    if (old) used.add(old.id);
    tags.push({ id: old?.id || crypto.randomUUID(), name, kind: file ? 'file' : 'text', text: file ? '' : content, fileId: file?.id || null });
  }
  return tags;
}

function renderContextSyntax(value: string) {
  const pieces = [];
  const pattern = /(^|\s)(\/[^/*\n]{0,40}\/?)/g;
  let position = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index + match[1].length;
    if (start > position) pieces.push(value.slice(position, start));
    pieces.push(<span className="workflow-context-inline-tag" key={start}><span className="workflow-context-delimiter">/</span>{match[2].slice(1, match[2].endsWith('/') && match[2].length > 1 ? -1 : undefined)}{match[2].endsWith('/') && match[2].length > 1 && <span className="workflow-context-delimiter">/</span>}</span>);
    position = start + match[2].length;
  }
  pieces.push(value.slice(position));
  return pieces;
}

function tagNamesIn(text: string) {
  return Array.from(text.matchAll(/(^|\s)\/([^/*\n]{1,40})\//g), match => match[2].trim()).filter(Boolean);
}

function openTagAt(text: string, caret: number) {
  const match = text.slice(0, caret).match(/(^|\s)\/([^/*\n]{0,40})$/);
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
}

function isGraphNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === 'string' && typeof node.number === 'number' && Number.isInteger(node.number) && node.number > 0 && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y);
}

function normalizeNode(node: GraphNode): GraphNode {
  const kind = node.kind === 'context' ? 'context' : 'workflow';
  const contextFiles = Array.isArray(node.contextFiles) ? node.contextFiles.filter((file): file is ContextFile => Boolean(file && typeof file === 'object' && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.content === 'string')).slice(0, 20) : [];
  const fileIds = new Set(contextFiles.map(file => file.id));
  const previousTags = Array.isArray(node.contextTags) ? node.contextTags.filter((tag): tag is ContextTag => Boolean(tag && typeof tag === 'object' && typeof tag.id === 'string' && typeof tag.name === 'string' && (tag.kind === 'text' && typeof tag.text === 'string' || tag.kind === 'file' && typeof tag.fileId === 'string' && fileIds.has(tag.fileId)))).slice(0, 30) : [];
  let contextText = typeof node.contextText === 'string' ? node.contextText : '';
  if (previousTags.length && !parseContextTags(contextText, contextFiles).length) {
    contextText += previousTags.map(tag => `\n\n/${tag.name}/ *${tag.kind === 'file' ? contextFiles.find(file => file.id === tag.fileId)?.name || '' : tag.text}*`).join('');
  }
  contextText = contextText.slice(0, maxContextCharacters);
  const contextTags = parseContextTags(contextText, contextFiles, previousTags);
  return { ...node, kind, name: typeof node.name === 'string' && node.name.trim() ? node.name.slice(0, 60) : kind === 'context' ? `Context ${node.number}` : `Node ${node.number}`, icon: iconOptions.some(option => option.type === node.icon) ? node.icon : kind === 'context' ? 'document' : 'workflow', active: node.active !== false, contextText, contextFiles, contextTags };
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
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [readingFiles, setReadingFiles] = useState(false);
  const [tagPicker, setTagPicker] = useState<{ start: number; query: string; x: number; y: number } | null>(null);
  const [tagPickerIndex, setTagPickerIndex] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contextFileRef = useRef<HTMLInputElement>(null);
  const contextTextRef = useRef<HTMLTextAreaElement>(null);
  const contextEditorRef = useRef<HTMLDivElement>(null);
  const contextMirrorRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const portDragRef = useRef<{ source: string; pointerId: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) || localStorage.getItem(previousStorageKey);
      if (saved) {
        const graph = JSON.parse(saved) as { nodes?: unknown; links?: unknown; pan?: { x?: unknown; y?: unknown } };
        const savedNodes = Array.isArray(graph.nodes) ? graph.nodes.filter(isGraphNode).slice(0, 100).map(normalizeNode) : [];
        const nodeIds = new Set(savedNodes.map(node => node.id));
        setNodes(savedNodes);
        setLinks(Array.isArray(graph.links) ? graph.links.filter(isGraphLink).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target)).slice(0, 300).map(link => ({ ...link, command: 'input' as const })) : []);
        if (Number.isFinite(graph.pan?.x) && Number.isFinite(graph.pan?.y)) setPan({ x: graph.pan!.x as number, y: graph.pan!.y as number });
      } else {
        const previous = JSON.parse(localStorage.getItem(legacyStorageKey) || '[]') as unknown;
        if (Array.isArray(previous)) setNodes(previous.filter(isGraphNode).slice(0, 100).map(normalizeNode));
      }
    } catch { /* Start with an empty draft if local storage is unavailable. */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ nodes, links, pan })); }
    catch { /* The graph remains usable for this session. */ }
  }, [nodes, links, pan, loaded]);

  function addNode(kind: GraphNode['kind'] = 'workflow', position?: { x: number; y: number }) {
    if (nodes.length >= 100) return;
    const id = crypto.randomUUID();
    setNodes(current => {
      const number = Math.max(0, ...current.map(node => node.number)) + 1;
      const branchIndex = current.length - 1;
      const column = Math.floor(branchIndex / 4);
      const row = branchIndex % 4;
      if (current.length >= 100) return current;
      return [...current, {
        id, number, kind, name: kind === 'context' ? `Context ${number}` : `Node ${number}`, icon: kind === 'context' ? 'document' : 'workflow', active: true, contextText: '', contextFiles: [], contextTags: [],
        x: Math.max(8, position?.x ?? (current.length === 0 ? 105 : 310 + column * 190) - pan.x),
        y: Math.max(8, position?.y ?? (current.length === 0 ? 206 : 55 + row * 112 + (column % 2) * 20) - pan.y),
      }];
    });
    if (kind === 'context') { setFileError(''); setEditingNode(id); }
  }

  function removeNode(id: string) {
    setNodes(current => current.filter(node => node.id !== id));
    setLinks(current => current.filter(link => link.source !== id && link.target !== id));
    setSelectedLink(null);
    if (editingNode === id) setEditingNode(null);
    if (renamingNode === id) setRenamingNode(null);
    if (draft?.source === id || draft?.target === id) setDraft(null);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function connect(source: string, target: string) {
    if (source !== target && nodes.some(node => node.id === source) && nodes.some(node => node.id === target)) {
      setLinks(current => current.some(link => link.source === source && link.target === target) ? current : [...current, { id: crypto.randomUUID(), source, target, command: 'input' }]);
    }
    portDragRef.current = null;
    setDraft(null);
  }

  function updateNode(id: string, patch: Partial<GraphNode>) {
    setNodes(current => current.map(node => node.id === id ? { ...node, ...patch } : node));
  }

  function updateContextText(nodeId: string, value: string) {
    setNodes(current => current.map(node => node.id === nodeId ? { ...node, contextText: value, contextTags: parseContextTags(value, node.contextFiles, node.contextTags) } : node));
  }

  const tagNames = nodes.flatMap(node => node.kind === 'context' ? tagNamesIn(node.contextText) : []).filter((name, index, all) => all.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index);
  const suggestedTags = tagPicker ? tagNames.filter(name => name.toLowerCase().includes(tagPicker.query.trim().toLowerCase())).slice(0, 8) : [];

  function syncTagPicker(text: string, caret: number) {
    const input = contextTextRef.current;
    const editor = contextEditorRef.current;
    const open = openTagAt(text, caret);
    if (!open || !input || !editor || !tagNames.some(name => name.toLowerCase().includes(open.query.trim().toLowerCase()))) { setTagPicker(null); return; }
    const measure = document.createElement('div');
    const style = getComputedStyle(input);
    Object.assign(measure.style, { position: 'absolute', top: '0', left: '0', visibility: 'hidden', width: `${input.clientWidth}px`, boxSizing: 'border-box', padding: style.padding, font: style.font, letterSpacing: style.letterSpacing, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', pointerEvents: 'none' });
    measure.textContent = text.slice(0, caret);
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    measure.appendChild(marker);
    editor.appendChild(measure);
    const markerRect = marker.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    measure.remove();
    const x = Math.max(8, Math.min(markerRect.left - editorRect.left, editor.clientWidth - 228));
    const below = markerRect.bottom - editorRect.top - input.scrollTop + 5;
    const y = below + 220 < editor.clientHeight ? below : Math.max(8, markerRect.top - editorRect.top - input.scrollTop - 220);
    setTagPicker({ ...open, x, y });
    setTagPickerIndex(0);
  }

  function selectTagSuggestion(name: string, node: GraphNode) {
    const picker = tagPicker;
    const input = contextTextRef.current;
    if (!picker || !input) return;
    const end = input.selectionStart;
    const value = `${node.contextText.slice(0, picker.start)}/${name}/ ${node.contextText.slice(end)}`;
    updateContextText(node.id, value);
    setTagPicker(null);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(picker.start + name.length + 3, picker.start + name.length + 3); });
  }

  async function attachContextFiles(nodeId: string, fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setFileError('');
    const node = nodes.find(item => item.id === nodeId);
    if (!node) return;
    if (node.contextFiles.length + files.length > 20) { setFileError('A context can include up to 20 files.'); return; }
    setReadingFiles(true);
    try {
      const additions: ContextFile[] = [];
      for (const file of files) {
        if (file.size > maxContextFileBytes) throw new Error(`${file.name} exceeds the 20 MB file limit.`);
        const content = await readContextFile(file);
        if (!content.trim()) throw new Error(`No readable text was found in ${file.name}.`);
        additions.push({ id: crypto.randomUUID(), name: file.name, content: content.trim() });
      }
      const addedCharacters = additions.reduce((total, file) => total + file.content.length, 0);
      const currentCharacters = node.contextText.length + node.contextFiles.reduce((total, file) => total + file.content.length, 0);
      if (currentCharacters + addedCharacters > maxContextCharacters) throw new Error('Combined context is over the 200,000 character limit.');
      const contextFiles = [...node.contextFiles, ...additions];
      updateNode(nodeId, { contextFiles, contextTags: parseContextTags(node.contextText, contextFiles, node.contextTags) });
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : 'Unable to read one of these files.');
    } finally {
      setReadingFiles(false);
      if (contextFileRef.current) contextFileRef.current.value = '';
    }
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
      <div><strong>UI/UX workflow</strong></div>
      <button type="button" className="workflow-graph-agent-card" onClick={onOpenAgentCard}>Agent card</button>
    </div>
    <div className="workflow-graph-body">
    <div ref={canvasRef} className="workflow-graph-canvas" style={{ backgroundPosition: `${pan.x + 12}px ${pan.y + 12}px` }} role="application" tabIndex={0} aria-label="UI/UX graph. Drag to pan. Press plus to add a node, zero to reset view, or Delete on a focused node or link to remove it." data-panning={panning} data-drag-over={dragOver} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === '+' || event.key === '=' || event.key.toLowerCase() === 'n') { event.preventDefault(); if (nodes.length < 100) addNode('workflow', { x: Math.max(8, event.currentTarget.clientWidth / 2 - pan.x - nodeWidth / 2), y: Math.max(8, event.currentTarget.clientHeight / 2 - pan.y - nodeWidth / 2) }); } else if (event.key === '0') { event.preventDefault(); setPan({ x: 0, y: 0 }); } }}
      onDragOver={event => { if (event.dataTransfer.types.includes('application/x-toolhub-graph-node')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDragOver(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
      onDrop={event => { setDragOver(false); const kind = event.dataTransfer.getData('application/x-toolhub-graph-node'); if (kind !== 'workflow' && kind !== 'context') return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); addNode(kind, { x: event.clientX - box.left - pan.x - nodeWidth / 2, y: event.clientY - box.top - pan.y - nodeWidth / 2 }); }}>
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight, minWidth: stageWidth, transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><Workflow size={26}/><strong>Start with a node</strong><span>Click or drag a node from the sidebar, or press +.</span></div>}
        <svg className="workflow-graph-links" aria-label="Workflow links">
          <defs><marker id="workflow-link-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#96958e" strokeWidth="1.5"/></marker></defs>
          {links.map(link => {
            const source = nodes.find(node => node.id === link.source);
            const target = nodes.find(node => node.id === link.target);
            if (!source || !target) return null;
            const d = linkPath(source, target);
            const labelX = (source.x + nodeWidth + target.x) / 2;
            const labelY = (source.y + target.y + nodeWidth) / 2;
            return <ContextMenu key={link.id}><ContextMenuTrigger render={<g/>} className={selectedLink === link.id ? 'workflow-graph-link is-selected' : 'workflow-graph-link'} onContextMenu={() => setSelectedLink(link.id)}>
              <path d={d} className="connection-hit" role="button" tabIndex={0} aria-label={`Connection from ${source.name} to ${target.name}. Press Delete to remove.`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.currentTarget.focus(); setSelectedLink(link.id); }} onKeyDown={event => { if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { setLinks(current => current.filter(item => item.id !== link.id)); setSelectedLink(null); } } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLink(link.id); } }}/>
              <path d={d} className="connection-line" markerEnd="url(#workflow-link-arrow)"/>
              <path d={d} className="connection-motion"/>
              <g className="workflow-edge-label" aria-hidden="true" transform={`translate(${labelX} ${labelY})`}><rect x="-23" y="-10" width="46" height="20" rx="5"/><text textAnchor="middle" dominantBaseline="central">{link.command}</text></g>
            </ContextMenuTrigger><ContextMenuContent className="node-context-menu workflow-edge-menu" finalFocus={false} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><ContextMenuItem onClick={() => setLinks(current => current.map(item => item.id === link.id ? { ...item, command: 'input' } : item))}><Check/>Input{link.command === 'input' && <span className="node-delete-shortcut">Selected</span>}</ContextMenuItem></ContextMenuContent></ContextMenu>;
          })}
          {draft && (() => { const source = nodes.find(node => node.id === draft.source); const target = draft.target ? nodes.find(node => node.id === draft.target) : null; return source ? <path className={`connection-preview${target ? ' is-ready' : ''}`} d={curve({ x: source.x + nodeWidth, y: source.y + nodeWidth / 2 }, target ? { x: target.x, y: target.y + nodeWidth / 2 } : draft.point)}/> : null; })()}
        </svg>
        {nodes.map(node => <ContextMenu key={node.id}><ContextMenuTrigger className="workflow-graph-node-group" style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}><button
          type="button" className="canvas-node workflow-graph-node"
          aria-label={`${node.name}. ${node.active ? 'Active' : 'Inactive'}. Drag or use arrow keys to move. Press Delete to remove.`}
          onDoubleClick={() => { if (node.kind === 'context') { setFileError(''); setEditingNode(node.id); } }}
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
        >{(() => { const Icon = iconOptions.find(option => option.type === node.icon)?.icon || Workflow; return <Icon size={28} strokeWidth={1.6} aria-hidden="true"/>; })()}</button><span className="workflow-graph-node-label node-name" title={node.name}>{node.name}</span><span className={`node-status${node.active ? ' is-active' : ''}`}><span aria-hidden="true"/>{node.active ? 'Active' : 'Inactive'}</span>
          <button type="button" className={`node-port workflow-graph-port workflow-graph-port-input${draft && draft.source !== node.id ? ' can-connect' : ''}${draft?.target === node.id ? ' is-target' : ''}${links.some(link => link.target === node.id) ? ' is-connected' : ''}`} data-workflow-input={node.id} aria-label={`Input of ${node.name}`} title="Input — drop a connection here" onPointerDown={event => event.stopPropagation()} onClick={() => { if (draft) connect(draft.source, node.id); }}/>
          <button type="button" className={`node-port workflow-graph-port workflow-graph-port-output${links.some(link => link.source === node.id) ? ' is-connected' : ''}`} aria-label={`Connect from ${node.name}`} title="Output — drag to another node's input" onPointerDown={event => startConnection(event, node)} onPointerMove={event => moveConnection(event, node.id)} onPointerUp={event => endConnection(event, node.id)} onPointerCancel={event => { event.stopPropagation(); portDragRef.current = null; setDraft(null); }} onLostPointerCapture={event => { event.stopPropagation(); if (portDragRef.current) { portDragRef.current = null; setDraft(null); } }} onClick={event => { if (event.detail === 0) setDraft({ source: node.id, point: { x: node.x + 130, y: node.y + nodeWidth / 2 }, target: null }); }}/>
        </ContextMenuTrigger><ContextMenuContent className="node-context-menu" finalFocus={false} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          {node.kind === 'context' && <ContextMenuItem onClick={() => { setFileError(''); setEditingNode(node.id); }}><FileText/>Edit context</ContextMenuItem>}
          <ContextMenuItem onClick={() => { setNameDraft(node.name); setRenamingNode(node.id); }}><Pencil/>Rename</ContextMenuItem>
          <ContextMenuSub><ContextMenuSubTrigger><Shapes/>Change icon</ContextMenuSubTrigger><ContextMenuSubContent className="node-context-menu node-icon-grid" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{iconOptions.map(({ type, label, icon: Icon }) => <ContextMenuItem key={type} aria-label={label} title={label} data-selected={node.icon === type} onClick={() => updateNode(node.id, { icon: type })}><Icon/></ContextMenuItem>)}</ContextMenuSubContent></ContextMenuSub>
          <ContextMenuItem onClick={() => updateNode(node.id, { active: !node.active })}><Power/>{node.active ? 'Set inactive' : 'Set active'}</ContextMenuItem>
          <ContextMenuItem disabled title="Coming soon"><Ticket/>Write ticket<span className="ticket-coming-soon">Soon</span></ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => removeNode(node.id)}><Trash2/>Delete node<span className="node-delete-shortcut">⌫ / Del</span></ContextMenuItem>
        </ContextMenuContent></ContextMenu>)}
      </div>
    </div>
    <aside className="workflow-graph-sidebar node-picker" aria-label="Add graph node">
      <header><h2>Add node</h2></header>
      <div className="node-picker-options workflow-graph-picker">{([{ kind: 'workflow', label: 'Workflow node', icon: Workflow }, { kind: 'context', label: 'Context Builder', icon: FileText }] as const).map(({ kind, label, icon: Icon }) => <button type="button" key={kind} draggable={loaded && nodes.length < 100} disabled={!loaded || nodes.length >= 100} onDragStart={event => { event.dataTransfer.setData('application/x-toolhub-graph-node', kind); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDragOver(false)} onClick={() => addNode(kind)}><span><Icon size={20}/></span>{label}</button>)}</div>
    </aside>
    </div>
    <Dialog open={Boolean(renamingNode)} onOpenChange={open => { if (!open) setRenamingNode(null); }}><DialogContent className="workflow-rename-dialog"><DialogTitle>Rename node</DialogTitle><DialogDescription className="sr-only">Choose a name for this graph node.</DialogDescription><form onSubmit={event => { event.preventDefault(); if (renamingNode && nameDraft.trim()) updateNode(renamingNode, { name: nameDraft.trim().slice(0, 60) }); setRenamingNode(null); }}><label htmlFor="workflow-node-name">Node name</label><input id="workflow-node-name" autoFocus maxLength={60} value={nameDraft} onChange={event => setNameDraft(event.target.value)}/><button type="submit" disabled={!nameDraft.trim()}>Save</button></form></DialogContent></Dialog>
    <Dialog open={Boolean(editingNode)} onOpenChange={open => { if (!open) { setEditingNode(null); setTagPicker(null); } }}>
      <DialogContent className="node-inspector node-inspector-setup node-inspector-agent workflow-context-dialog">
        <header className="inspector-heading"><span className="inspector-icon"><FileText size={21}/></span><DialogTitle>Context Builder</DialogTitle></header>
        <DialogDescription className="sr-only">Write context and tags in one field, and attach files for connected workflow nodes.</DialogDescription>
        {(() => {
          const node = nodes.find(item => item.id === editingNode);
          if (!node) return null;
          const usedCharacters = node.contextFiles.reduce((total, file) => total + file.content.length, 0);
          return <div className="agent-card-form workflow-context-form">
            <div className="agent-card-field">
              <label htmlFor="workflow-context-text">Context</label>
              <div className="workflow-context-composer">
                <div ref={contextEditorRef} className="workflow-context-editor">
                  <div ref={contextMirrorRef} className="workflow-context-syntax-mirror" aria-hidden="true">{renderContextSyntax(node.contextText)}</div>
                  <textarea ref={contextTextRef} id="workflow-context-text" disabled={readingFiles} value={node.contextText} maxLength={Math.max(0, maxContextCharacters - usedCharacters)} onChange={event => { updateContextText(node.id, event.target.value); syncTagPicker(event.target.value, event.target.selectionStart); }} onSelect={event => syncTagPicker(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={event => {
                    if (!tagPicker || !suggestedTags.length) return;
                    if (event.key === 'Escape') { event.preventDefault(); setTagPicker(null); }
                    if (event.key === 'ArrowDown') { event.preventDefault(); setTagPickerIndex(index => (index + 1) % suggestedTags.length); }
                    if (event.key === 'ArrowUp') { event.preventDefault(); setTagPickerIndex(index => (index + suggestedTags.length - 1) % suggestedTags.length); }
                    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectTagSuggestion(suggestedTags[tagPickerIndex] || suggestedTags[0], node); }
                  }} onScroll={event => { if (contextMirrorRef.current) contextMirrorRef.current.scrollTop = event.currentTarget.scrollTop; setTagPicker(null); }} placeholder="Enter context or attach files..."/>
                  {tagPicker && suggestedTags.length > 0 && <div className="workflow-context-suggestions" role="listbox" aria-label="Existing tags" style={{ left: tagPicker.x, top: tagPicker.y }}>{suggestedTags.map((name, index) => <button type="button" role="option" aria-selected={index === tagPickerIndex} key={name} onMouseDown={event => event.preventDefault()} onClick={() => selectTagSuggestion(name, node)}>{name}</button>)}</div>}
                </div>
                <div className="workflow-context-composer-footer"><div className="workflow-context-file-list">{node.contextFiles.map(file => <span key={file.id} className="workflow-context-file-chip" title={file.name}><FileText size={14}/>{file.name}<button type="button" aria-label={`Remove ${file.name}`} disabled={readingFiles} onClick={() => updateNode(node.id, { contextFiles: node.contextFiles.filter(item => item.id !== file.id), contextTags: node.contextTags.filter(tag => tag.fileId !== file.id) })}>×</button></span>)}</div><input ref={contextFileRef} id="workflow-context-file" type="file" accept={contextFileAccept} multiple hidden onChange={event => { void attachContextFiles(node.id, event.target.files); }}/><button type="button" className="workflow-context-attach" disabled={readingFiles} onClick={() => contextFileRef.current?.click()}><FileText size={16}/>{readingFiles ? 'Reading files…' : 'Attach files'}</button></div>
              </div>
            </div>
            {fileError && <small role="alert" className="workflow-context-error">{fileError}</small>}
          </div>;
        })()}
      </DialogContent>
    </Dialog>
  </section>;
}
