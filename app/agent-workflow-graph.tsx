'use client';
// The graph canvas owns pointer panning and keyboard shortcuts; SVG links are keyboard-focusable controls.
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex, jsx-a11y/prefer-tag-over-role */

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowRightLeft, BookOpen, Bot, Check, ChevronDown, CircleCheck, FileText, Pencil, Play, Power, Shapes, Ticket, Trash2, Workflow, Wrench } from 'lucide-react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { iconOptions, type NodeIcon } from './node-picker';
import { contextFileAccept, maxContextCharacters, maxContextFileBytes, readContextFile } from '@/lib/context-file-reader';
import { buildConnectedTagRegistry, buildTagRegistry, resolveConnectedInput, resolveGraphAgentInput, resolveTag } from '@/lib/context-tags';
import { agentLinksChangedEvent, agentOutputsChangedEvent, readAgentLinks, readAgentOutputs, receiveHandoffContent, routesForAgent, saveAgentOutput, syncDesignerHandoffDeliveries, type AgentLink, type AgentOutputSnapshot } from '@/lib/agent-handoff';
import { defaultStructuredOutputSchema, validateStructuredOutput } from '@/lib/structured-output';
import { sampleSingleScreenBrief } from '@/lib/sample-screen-brief';
import { initialUiScreenContextHashes, uiScreenContextCatalog, uiScreenContextHash, type UiScreenContext } from '@/lib/ui-screen-context-catalog';
import { graphPreviewDocument } from '@/lib/graph-preview';
import { GraphRunOutputDialog, HumanApprovalNodeDialog } from './human-approval-dialog';

type ContextFile = { id: string; name: string; content: string };
type ContextTag = { id: string; name: string; kind: 'text' | 'file'; text: string; fileId: string | null };
type GraphNode = { id: string; number: number; x: number; y: number; kind: 'workflow' | 'context' | 'agent' | 'tool-calling' | 'human-approval' | 'skill' | 'agent-handoff'; name: string; icon: NodeIcon; active: boolean; contextText: string; contextFiles: ContextFile[]; contextTags: ContextTag[]; handoffMode: 'receive' | 'send'; testDocument: string; useTestDocument: boolean; taskText: string; instructionPrompt: string; explicitInput: string; structuredOutput: string; lastOutput: string };
type GraphLink = { id: string; source: string; target: string; command: 'input' | 'approve' | 'deny' | 'loop' };

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

function tagAt(text: string, caret: number) {
  for (const match of text.matchAll(/(^|\s)\/([^/*\n]{1,40})\//g)) {
    const start = match.index + match[1].length;
    const end = start + match[0].length - match[1].length;
    if (caret >= start && caret < end) return match[2].trim();
  }
  return null;
}

function isGraphNode(value: unknown): value is GraphNode {
  if (!value || typeof value !== 'object') return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === 'string' && typeof node.number === 'number' && Number.isInteger(node.number) && node.number > 0 && typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y);
}

function normalizeNode(node: GraphNode): GraphNode {
  const kind = node.kind === 'context' || node.kind === 'agent' || node.kind === 'tool-calling' || node.kind === 'human-approval' || node.kind === 'skill' || node.kind === 'agent-handoff' ? node.kind : 'workflow';
  const contextFiles = Array.isArray(node.contextFiles) ? node.contextFiles.filter((file): file is ContextFile => Boolean(file && typeof file === 'object' && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.content === 'string')).slice(0, 20) : [];
  const fileIds = new Set(contextFiles.map(file => file.id));
  const previousTags = Array.isArray(node.contextTags) ? node.contextTags.filter((tag): tag is ContextTag => Boolean(tag && typeof tag === 'object' && typeof tag.id === 'string' && typeof tag.name === 'string' && (tag.kind === 'text' && typeof tag.text === 'string' || tag.kind === 'file' && typeof tag.fileId === 'string' && fileIds.has(tag.fileId)))).slice(0, 30) : [];
  let contextText = typeof node.contextText === 'string' ? node.contextText : '';
  if (previousTags.length && !parseContextTags(contextText, contextFiles).length) {
    contextText += previousTags.map(tag => `\n\n/${tag.name}/ *${tag.kind === 'file' ? contextFiles.find(file => file.id === tag.fileId)?.name || '' : tag.text}*`).join('');
  }
  contextText = contextText.slice(0, maxContextCharacters);
  const contextTags = parseContextTags(contextText, contextFiles, previousTags);
  return { ...node, kind, name: typeof node.name === 'string' && node.name.trim() ? node.name.slice(0, 60) : kind === 'context' ? `Context ${node.number}` : kind === 'agent' ? `AI Agent ${node.number}` : kind === 'tool-calling' ? `Tool Calling ${node.number}` : kind === 'human-approval' ? `Human Approval ${node.number}` : kind === 'skill' ? `Skill ${node.number}` : kind === 'agent-handoff' ? `Agent Handoff ${node.number}` : `Node ${node.number}`, icon: iconOptions.some(option => option.type === node.icon) ? node.icon : kind === 'context' ? 'document' : kind === 'agent' ? 'agent' : kind === 'tool-calling' ? 'tool-calling' : kind === 'human-approval' ? 'human-approval' : kind === 'skill' ? 'skill' : kind === 'agent-handoff' ? 'agent-handoff' : 'workflow', active: kind === 'agent-handoff' && !node.handoffMode ? true : node.active !== false, contextText, contextFiles, contextTags, handoffMode: node.handoffMode === 'send' ? 'send' : 'receive', testDocument: typeof node.testDocument === 'string' ? node.testDocument.slice(0, 6000) : kind === 'agent-handoff' ? sampleSingleScreenBrief : '', useTestDocument: typeof node.useTestDocument === 'boolean' ? node.useTestDocument : kind === 'agent-handoff', taskText: typeof node.taskText === 'string' ? node.taskText.slice(0, 4000) : '', instructionPrompt: typeof node.instructionPrompt === 'string' ? node.instructionPrompt.slice(0, 4000) : '', explicitInput: typeof node.explicitInput === 'string' ? node.explicitInput.slice(0, 4000) : '', structuredOutput: typeof node.structuredOutput === 'string' ? node.structuredOutput.slice(0, 16000) : '', lastOutput: typeof node.lastOutput === 'string' ? node.lastOutput.slice(0, 200000) : '' };
}

function outputFiles(value: string): { html: string; css: string; js: string } | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const files = parsed as Record<string, unknown>;
      if (typeof files.html === 'string' && typeof files.css === 'string' && typeof files.js === 'string') {
        return { html: files.html, css: files.css, js: files.js };
      }
    }
  } catch { /* Keep non-file output readable as raw JSON. */ }
  return null;
}

function isGraphLink(value: unknown): value is GraphLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  return typeof link.id === 'string' && typeof link.source === 'string' && typeof link.target === 'string' && link.source !== link.target;
}

function normalizeGraphLink(link: GraphLink, nodes: GraphNode[]): GraphLink {
  const source = nodes.find(node => node.id === link.source);
  return { ...link, command: source?.kind === 'human-approval' ? link.command === 'loop' ? 'loop' : link.command === 'deny' ? 'deny' : 'approve' : 'input' };
}

function savedGraphDocument(nodes: GraphNode[], links: GraphLink[], screenContextsSeeded: boolean, screenContextVersion: number) {
  return { nodes: nodes.map(({ lastOutput: _lastOutput, ...node }) => node), links, screenContextsSeeded, screenContextVersion };
}

function outputPoint(source: GraphNode, command: GraphLink['command']) {
  return { x: source.x + nodeWidth, y: source.y + (source.kind === 'human-approval' ? command === 'deny' || command === 'loop' ? 45 : 19 : nodeWidth / 2) };
}

function linkPath(source: GraphNode, target: GraphNode, command: GraphLink['command']) {
  return curve(outputPoint(source, command), { x: target.x, y: target.y + nodeWidth / 2 });
}

function curve(start: { x: number; y: number }, end: { x: number; y: number }) {
  const bend = Math.max(60, Math.abs(end.x - start.x) * .45);
  return `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`;
}

export function AgentWorkflowGraph({ onOpenAgentCard }: { onOpenAgentCard: () => void }) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [screenContextsSeeded, setScreenContextsSeeded] = useState(false);
  const [screenContextVersion, setScreenContextVersion] = useState(0);
  const [screenContextError, setScreenContextError] = useState('');
  const [screenContextRetry, setScreenContextRetry] = useState(0);
  const [graphError, setGraphError] = useState('');
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ source: string; command: GraphLink['command']; point: { x: number; y: number }; target: string | null } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingWorkflow, setEditingWorkflow] = useState<string | null>(null);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [outputDraft, setOutputDraft] = useState('');
  const [instructionDraft, setInstructionDraft] = useState('');
  const [inputDraft, setInputDraft] = useState('');
  const [inputSelectionError, setInputSelectionError] = useState('');
  const [inputTagPicker, setInputTagPicker] = useState<{ start: number; query: string } | null>(null);
  const [inputTagIndex, setInputTagIndex] = useState(0);
  const [outputError, setOutputError] = useState('');
  const [outputView, setOutputView] = useState<'preview' | 'html' | 'css' | 'js' | 'json'>('preview');
  const [runningAgent, setRunningAgent] = useState(false);
  const [taskTagPicker, setTaskTagPicker] = useState<{ start: number; query: string } | null>(null);
  const [taskTagIndex, setTaskTagIndex] = useState(0);
  const [editingHandoff, setEditingHandoff] = useState<string | null>(null);
  const [inspectingApproval, setInspectingApproval] = useState<string | null>(null);
  const [execution, setExecution] = useState<{ nodeId: string; nodeName: string; running: boolean; output: string; error: string } | null>(null);
  const [agentLinks, setAgentLinks] = useState<AgentLink[]>([]);
  const [agentOutputs, setAgentOutputs] = useState<AgentOutputSnapshot[]>([]);
  const [fileError, setFileError] = useState('');
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [readingFiles, setReadingFiles] = useState(false);
  const [tagPicker, setTagPicker] = useState<{ start: number; query: string; x: number; y: number } | null>(null);
  const [tagPickerIndex, setTagPickerIndex] = useState(0);
  const [tagPreview, setTagPreview] = useState<{ name: string; x: number; y: number } | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const graphRevisionRef = useRef(0);
  const lastSavedGraphRef = useRef('');
  const pendingGraphRef = useRef<{ serialized: string; document: ReturnType<typeof savedGraphDocument> } | null>(null);
  const savingGraphRef = useRef(false);
  const graphServerReadyRef = useRef(false);
  const outputCursorRef = useRef('1970-01-01T00:00:00.000Z');
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const contextFileRef = useRef<HTMLInputElement>(null);
  const contextTextRef = useRef<HTMLTextAreaElement>(null);
  const contextEditorRef = useRef<HTMLDivElement>(null);
  const contextMirrorRef = useRef<HTMLDivElement>(null);
  const taskTextRef = useRef<HTMLTextAreaElement>(null);
  const taskMirrorRef = useRef<HTMLDivElement>(null);
  const explicitInputRef = useRef<HTMLTextAreaElement>(null);
  const explicitInputMirrorRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerX: number; pointerY: number; x: number; y: number } | null>(null);
  const suppressApprovalClickRef = useRef(false);
  const portDragRef = useRef<{ source: string; command: GraphLink['command']; pointerId: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadGraph() {
      let savedNodes: GraphNode[] = [];
      let savedLinks: GraphLink[] = [];
      let seeded = false;
      let version = 0;
      if (cancelled) return;
      try {
        const saved = localStorage.getItem(storageKey) || localStorage.getItem(previousStorageKey);
        if (saved) {
          const graph = JSON.parse(saved) as { nodes?: unknown; links?: unknown; pan?: { x?: unknown; y?: unknown }; screenContextsSeeded?: boolean; screenContextVersion?: number };
          savedNodes = Array.isArray(graph.nodes) ? graph.nodes.filter(isGraphNode).slice(0, 100).map(normalizeNode) : [];
          const nodeIds = new Set(savedNodes.map(node => node.id));
          savedLinks = Array.isArray(graph.links) ? graph.links.filter(isGraphLink).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target)).slice(0, 300).map(link => normalizeGraphLink(link, savedNodes)) : [];
          seeded = graph.screenContextsSeeded === true;
          version = graph.screenContextVersion === 2 ? 2 : seeded ? 1 : 0;
          if (Number.isFinite(graph.pan?.x) && Number.isFinite(graph.pan?.y)) setPan({ x: graph.pan!.x as number, y: graph.pan!.y as number });
        } else {
          const previous = JSON.parse(localStorage.getItem(legacyStorageKey) || '[]') as unknown;
          if (Array.isArray(previous)) savedNodes = previous.filter(isGraphNode).slice(0, 100).map(normalizeNode);
        }
      } catch { /* Start with an empty draft if local storage is unavailable. */ }
      try {
        const response = await fetch('/api/designer-graph', { cache: 'no-store' });
        if (!response.ok) throw new Error('Graph could not be loaded from the server.');
        const result = await response.json() as { document?: { nodes?: unknown; links?: unknown; screenContextsSeeded?: boolean; screenContextVersion?: number } | null; revision?: number; outputs?: Record<string, string> };
        if (cancelled) return;
        graphServerReadyRef.current = true;
        graphRevisionRef.current = Number(result.revision) || 0;
        if (result.document) {
          const document = result.document;
          const localOutputs = new Map(savedNodes.map(node => [node.id, node.lastOutput]));
          savedNodes = Array.isArray(document.nodes) ? document.nodes.filter(isGraphNode).slice(0, 100).map(normalizeNode).map(node => ({ ...node, lastOutput: result.outputs?.[node.id] || localOutputs.get(node.id) || '' })) : [];
          const nodeIds = new Set(savedNodes.map(node => node.id));
          savedLinks = Array.isArray(document.links) ? document.links.filter(isGraphLink).filter(link => nodeIds.has(link.source) && nodeIds.has(link.target)).slice(0, 300).map(link => normalizeGraphLink(link, savedNodes)) : [];
          seeded = document.screenContextsSeeded === true;
          version = document.screenContextVersion === 2 ? 2 : seeded ? 1 : 0;
          lastSavedGraphRef.current = JSON.stringify(savedGraphDocument(savedNodes, savedLinks, seeded, version));
        }
      } catch {
        if (cancelled) return;
        setGraphError('Graph is available locally, but server sync is unavailable.');
      }
      setNodes(savedNodes);
      setLinks(savedLinks);
      setScreenContextsSeeded(seeded);
      setScreenContextVersion(version);
      setLoaded(true);
    }
    void loadGraph();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ nodes, links, pan, screenContextsSeeded, screenContextVersion })); syncDesignerHandoffDeliveries(); }
      catch { /* The graph remains usable for this session. */ }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [nodes, links, pan, loaded, screenContextsSeeded, screenContextVersion]);

  const flushGraphSave = useCallback(async () => {
    if (savingGraphRef.current || !graphServerReadyRef.current) return;
    savingGraphRef.current = true;
    try {
      while (pendingGraphRef.current) {
        const pending = pendingGraphRef.current;
        pendingGraphRef.current = null;
        const response = await fetch('/api/designer-graph', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: pending.document, expectedRevision: graphRevisionRef.current }) });
        const result = await response.json() as { revision?: number; error?: string };
        if (!response.ok || typeof result.revision !== 'number') throw new Error(result.error || 'Unable to save graph.');
        graphRevisionRef.current = result.revision;
        lastSavedGraphRef.current = pending.serialized;
        setGraphError('');
      }
    } catch (error) {
      pendingGraphRef.current = null;
      setGraphError(error instanceof Error ? error.message : 'Unable to save graph.');
    } finally { savingGraphRef.current = false; }
  }, []);

  useEffect(() => {
    if (!loaded || !graphServerReadyRef.current) return;
    const document = savedGraphDocument(nodes, links, screenContextsSeeded, screenContextVersion);
    const serialized = JSON.stringify(document);
    if (serialized === lastSavedGraphRef.current) return;
    const timer = window.setTimeout(() => { pendingGraphRef.current = { document, serialized }; void flushGraphSave(); }, 800);
    return () => window.clearTimeout(timer);
  }, [nodes, links, loaded, screenContextsSeeded, screenContextVersion, flushGraphSave]);

  useEffect(() => {
    if (!loaded || !graphServerReadyRef.current) return;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const url = `/api/designer-graph/outputs?since=${encodeURIComponent(outputCursorRef.current)}`;
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as { outputs?: Record<string, string>; cursor?: string };
        if (!data.outputs) return;
        setNodes(current => current.map(node => data.outputs?.[node.id] && data.outputs[node.id] !== node.lastOutput ? { ...node, lastOutput: data.outputs[node.id] } : node));
        if (data.cursor) outputCursorRef.current = data.cursor;
      } catch { /* The saved output remains visible if refresh is unavailable. */ }
    };
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [loaded]);

  useEffect(() => {
    if (!loaded || screenContextVersion >= 2) return;
    let cancelled = false;
    async function addScreenContexts() {
      try {
        const response = await fetch('/api/ui-screen-contexts', { cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load UI screen contexts.');
        const payload = await response.json() as { contexts?: UiScreenContext[] };
        const contexts = payload.contexts;
        if (!Array.isArray(contexts) || contexts.length !== uiScreenContextCatalog.length || contexts.some(context =>
          !uiScreenContextCatalog.some(item => item.id === context.id) || typeof context.name !== 'string' || typeof context.content !== 'string' || !context.content.trim()
        )) throw new Error('UI screen contexts are incomplete.');
        if (cancelled) return;
        const currentNodes = nodesRef.current;
        const startX = currentNodes.length ? Math.max(...currentNodes.map(node => node.x)) + 250 : 96;
        const startY = 100;
        const firstNumber = Math.max(0, ...currentNodes.map(node => node.number)) + 1;
        const additions: GraphNode[] = contexts.map((context, index) => ({
          id: `ui-screen-context:${context.id}`, number: firstNumber + index,
          x: startX + index % 4 * 184, y: startY + Math.floor(index / 4) * 158,
          kind: 'context', name: context.name, icon: 'document', active: true,
          contextText: context.content.slice(0, maxContextCharacters), contextFiles: [],
          contextTags: parseContextTags(context.content.slice(0, maxContextCharacters), []),
          handoffMode: 'receive', testDocument: '', useTestDocument: false,
          taskText: '', instructionPrompt: '', explicitInput: '', structuredOutput: '', lastOutput: '',
        }));
        setNodes(current => screenContextsSeeded
          ? current.map(node => {
            const context = contexts.find(item => node.id === `ui-screen-context:${item.id}`);
            if (!context || uiScreenContextHash(node.contextText) !== initialUiScreenContextHashes[context.id]) return node;
            const contextText = context.content.slice(0, maxContextCharacters);
            return { ...node, contextText, contextTags: parseContextTags(contextText, node.contextFiles, node.contextTags) };
          })
          : [...current, ...additions.filter(node => !current.some(existing => existing.id === node.id))].slice(0, 100));
        if (!screenContextsSeeded) {
          const canvas = canvasRef.current;
          if (canvas) setPan({ x: canvas.clientWidth / 2 - (startX + 308), y: canvas.clientHeight / 2 - (startY + 249) });
        }
        setScreenContextsSeeded(true);
        setScreenContextVersion(2);
        setScreenContextError('');
      } catch (error) {
        if (!cancelled) setScreenContextError(error instanceof Error ? error.message : 'Could not load UI screen contexts.');
      }
    }
    void addScreenContexts();
    return () => { cancelled = true; };
  }, [loaded, screenContextsSeeded, screenContextVersion, screenContextRetry]);

  useEffect(() => {
    const sync = () => { setAgentLinks(readAgentLinks()); setAgentOutputs(readAgentOutputs()); };
    const onStorage = (event: StorageEvent) => { if (event.key === 'toolhub:agent-links:v1' || event.key === 'toolhub:agent-outputs:v1') sync(); };
    sync();
    window.addEventListener(agentLinksChangedEvent, sync);
    window.addEventListener(agentOutputsChangedEvent, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(agentLinksChangedEvent, sync); window.removeEventListener(agentOutputsChangedEvent, sync); window.removeEventListener('storage', onStorage); };
  }, []);

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
        id, number, kind, name: kind === 'context' ? `Context ${number}` : kind === 'agent' ? `AI Agent ${number}` : kind === 'tool-calling' ? `Tool Calling ${number}` : kind === 'human-approval' ? `Human Approval ${number}` : kind === 'skill' ? `Skill ${number}` : kind === 'agent-handoff' ? `Agent Handoff ${number}` : `Node ${number}`, icon: kind === 'context' ? 'document' : kind === 'agent' ? 'agent' : kind === 'tool-calling' ? 'tool-calling' : kind === 'human-approval' ? 'human-approval' : kind === 'skill' ? 'skill' : kind === 'agent-handoff' ? 'agent-handoff' : 'workflow', active: kind === 'workflow' || kind === 'context' || kind === 'agent-handoff' || kind === 'human-approval', contextText: '', contextFiles: [], contextTags: [], handoffMode: 'receive', testDocument: kind === 'agent-handoff' ? sampleSingleScreenBrief : '', useTestDocument: kind === 'agent-handoff', taskText: '', instructionPrompt: '', explicitInput: '', structuredOutput: '', lastOutput: '',
        x: Math.max(8, position?.x ?? (current.length === 0 ? 105 : 310 + column * 190) - pan.x),
        y: Math.max(8, position?.y ?? (current.length === 0 ? 206 : 55 + row * 112 + (column % 2) * 20) - pan.y),
      }];
    });
    if (kind === 'context') { setFileError(''); setEditingNode(id); }
    if (kind === 'agent') { setInstructionDraft(''); setInputDraft(''); setOutputDraft(defaultStructuredOutputSchema); setOutputError(''); setEditingAgent(id); }
  }

  function removeNode(id: string) {
    setNodes(current => current.filter(node => node.id !== id));
    setLinks(current => current.filter(link => link.source !== id && link.target !== id));
    setSelectedLink(null);
    if (editingNode === id) setEditingNode(null);
    if (editingWorkflow === id) setEditingWorkflow(null);
    if (editingAgent === id) setEditingAgent(null);
    if (inspectingApproval === id) setInspectingApproval(null);
    if (renamingNode === id) setRenamingNode(null);
    if (draft?.source === id || draft?.target === id) setDraft(null);
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function connect(source: string, target: string, command: GraphLink['command'] = 'input') {
    if (source !== target && nodes.some(node => node.id === source) && nodes.some(node => node.id === target)) {
      const branch = nodes.find(node => node.id === source)?.kind === 'human-approval' ? command === 'deny' && nodes.find(node => node.id === target)?.kind === 'agent' ? 'loop' : command === 'deny' ? 'deny' : 'approve' : 'input';
      setLinks(current => current.some(link => link.source === source && link.target === target && link.command === branch) ? current : [...current, { id: crypto.randomUUID(), source, target, command: branch }]);
    }
    portDragRef.current = null;
    setDraft(null);
  }

  function updateNode(id: string, patch: Partial<GraphNode>) {
    setNodes(current => current.map(node => node.id === id ? { ...node, ...patch } : node));
  }

  function openAgentOutput(node: GraphNode) {
    setInstructionDraft(node.instructionPrompt);
    setInputDraft(node.explicitInput);
    setInputSelectionError('');
    setOutputDraft(node.structuredOutput || defaultStructuredOutputSchema);
    setOutputError('');
    setOutputView('preview');
    setInputTagPicker(null);
    setEditingAgent(node.id);
  }

  async function runGraphAgent(node: GraphNode) {
    if (runningAgent || !node.active) return;
    const format = validateStructuredOutput(node.structuredOutput);
    if (!format.ok) { setOutputError(format.error); return; }
    const incomingAgents = routesForAgent(agentLinks, 'designer').incoming;
    const received = agentOutputs.filter(output => incomingAgents.includes(output.agentId)).map(output => `## ${output.agentId} handoff\n${output.content}`).join('\n\n');
    const handoffData = Object.fromEntries(nodes.filter(item => item.kind === 'agent-handoff' && item.handoffMode === 'receive').map(item => [item.id, receiveHandoffContent(received, item.testDocument, item.useTestDocument)]));
    const input = resolveGraphAgentInput(node.id, node.explicitInput, nodes, links, handoffData);
    if (!input.ok) { setOutputError(input.error); return; }
    setRunningAgent(true);
    setOutputError('');
    try {
      const response = await fetch('/api/graph-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId: node.id, message: input.content, instructions: node.instructionPrompt, outputSchema: format.schema }) });
      const data = await response.json() as { result?: { content: string }; error?: string };
      if (!response.ok || !data.result?.content) throw new Error(data.error || 'AI Agent returned no output.');
      const content = JSON.stringify(JSON.parse(data.result.content) as unknown, null, 2);
      updateNode(node.id, { lastOutput: content.slice(0, 200000) });
      saveAgentOutput({ agentId: 'designer', runId: crypto.randomUUID(), content, createdAt: new Date().toISOString() });
      window.dispatchEvent(new Event('toolhub:graph-output'));
      window.dispatchEvent(new Event('toolhub:agent-api-spend'));
    } catch (error) {
      setOutputError(error instanceof Error ? error.message : 'Unable to run the AI Agent.');
    } finally { setRunningAgent(false); }
  }

  async function playGraphNode(node: GraphNode) {
    if (execution?.running) return;
    setExecution({ nodeId: node.id, nodeName: node.name, running: true, output: '', error: '' });
    try {
      if (!graphServerReadyRef.current) throw new Error('The graph is still loading.');
      const graph = savedGraphDocument(nodes, links, screenContextsSeeded, screenContextVersion);
      const serialized = JSON.stringify(graph);
      if (serialized !== lastSavedGraphRef.current) {
        pendingGraphRef.current = { document: graph, serialized };
        for (let attempt = 0; attempt < 50 && lastSavedGraphRef.current !== serialized; attempt++) {
          await flushGraphSave();
          if (lastSavedGraphRef.current !== serialized) await new Promise(resolve => window.setTimeout(resolve, 100));
        }
        if (lastSavedGraphRef.current !== serialized) throw new Error('The graph could not be saved. Reload it before pressing Play.');
      }
      const sources = routesForAgent(agentLinks, 'designer').incoming;
      const received = agentOutputs.filter(output => sources.includes(output.agentId)).map(output => `## ${output.agentId} handoff\n${output.content}`).join('\n\n');
      const handoffData = Object.fromEntries(nodes.filter(item => item.kind === 'agent-handoff' && item.handoffMode === 'receive').slice(0, 20).map(item => [item.id, receiveHandoffContent(received, item.testDocument, item.useTestDocument).slice(0, 8000)]));
      const response = await fetch('/api/designer-graph/run-node', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nodeId: node.id, handoffData }) });
      const data = await response.json() as { result?: { node_id: string; kind: GraphNode['kind']; status: string; output: string }; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || 'Unable to run this node.');
      const result = data.result;
      if (result.kind === 'agent') {
        updateNode(node.id, { lastOutput: result.output.slice(0, 200000) });
        saveAgentOutput({ agentId: 'designer', runId: crypto.randomUUID(), content: result.output, createdAt: new Date().toISOString() });
      } else if (result.kind === 'agent-handoff' && node.handoffMode === 'send' && result.output) {
        saveAgentOutput({ agentId: 'designer', runId: crypto.randomUUID(), content: result.output, createdAt: new Date().toISOString() });
      }
      window.dispatchEvent(new Event('toolhub:graph-output'));
      window.dispatchEvent(new Event('toolhub:agent-api-spend'));
      setExecution(result.status === 'waiting_approval' ? null : { nodeId: node.id, nodeName: node.name, running: false, output: result.output, error: '' });
    } catch (error) {
      setExecution({ nodeId: node.id, nodeName: node.name, running: false, output: '', error: error instanceof Error ? error.message : 'Unable to run this node.' });
    }
  }

  function updateContextText(nodeId: string, value: string) {
    setNodes(current => current.map(node => node.id === nodeId ? { ...node, contextText: value, contextTags: parseContextTags(value, node.contextFiles, node.contextTags) } : node));
  }

  function selectTaskTag(node: GraphNode, name: string) {
    const input = taskTextRef.current;
    const picker = taskTagPicker;
    if (!input || !picker) return;
    const end = input.selectionStart;
    const reference = `/${name}/`;
    updateNode(node.id, { taskText: `${node.taskText.slice(0, picker.start)}${reference}${node.taskText.slice(end)}` });
    setTaskTagPicker(null);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(picker.start + reference.length, picker.start + reference.length); });
  }

  function selectInputTag(name: string) {
    const input = explicitInputRef.current;
    const picker = inputTagPicker;
    if (!input || !picker) return;
    const end = input.selectionStart;
    const reference = `/${name}/`;
    setInputDraft(current => `${current.slice(0, picker.start)}${reference}${current.slice(end)}`);
    setInputTagPicker(null);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(picker.start + reference.length, picker.start + reference.length); });
  }

  const tagNames = nodes.flatMap(node => node.kind === 'context' ? tagNamesIn(node.contextText) : []).filter((name, index, all) => all.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index);
  const tagRegistry = buildTagRegistry(nodes);
  const suggestedTags = tagPicker ? tagNames.filter(name => name.toLowerCase().includes(tagPicker.query.trim().toLowerCase())).slice(0, 8) : [];

  function menuPosition(text: string, caret: number) {
    const input = contextTextRef.current;
    const editor = contextEditorRef.current;
    if (!input || !editor) return null;
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
    return { x, y };
  }

  function syncTagPicker(text: string, caret: number) {
    const open = openTagAt(text, caret);
    if (!open || !tagNames.some(name => name.toLowerCase().includes(open.query.trim().toLowerCase()))) { setTagPicker(null); return; }
    const position = menuPosition(text, caret);
    if (!position) { setTagPicker(null); return; }
    setTagPicker({ ...open, ...position });
    setTagPickerIndex(0);
  }

  function syncTagPreview(text: string, caret: number) {
    const name = tagAt(text, caret);
    const position = name ? menuPosition(text, caret) : null;
    const editor = contextEditorRef.current;
    setTagPreview(name && position && editor ? { name, x: Math.min(position.x, Math.max(8, editor.clientWidth - 368)), y: position.y } : null);
  }

  function selectTagSuggestion(name: string, node: GraphNode) {
    const picker = tagPicker;
    const input = contextTextRef.current;
    if (!picker || !input) return;
    const end = input.selectionStart;
    const value = `${node.contextText.slice(0, picker.start)}/${name}/ ${node.contextText.slice(end)}`;
    updateContextText(node.id, value);
    setTagPicker(null);
    setTagPreview(null);
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

  function startConnection(event: PointerEvent<HTMLButtonElement>, node: GraphNode, command: GraphLink['command']) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    portDragRef.current = { source: node.id, command, pointerId: event.pointerId };
    setDraft({ source: node.id, command, point: outputPoint(node, command), target: null });
  }

  function moveConnection(event: PointerEvent<HTMLButtonElement>, source: string) {
    event.stopPropagation();
    if (portDragRef.current?.pointerId !== event.pointerId || portDragRef.current.source !== source) return;
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return;
    setDraft({ source, command: portDragRef.current.command, point: { x: event.clientX - box.left - pan.x, y: event.clientY - box.top - pan.y }, target: targetAt(event.clientX, event.clientY, source) });
  }

  function endConnection(event: PointerEvent<HTMLButtonElement>, source: string) {
    event.stopPropagation();
    if (portDragRef.current?.pointerId !== event.pointerId) return;
    const target = targetAt(event.clientX, event.clientY, source);
    if (target) connect(source, target, portDragRef.current.command);
    else { portDragRef.current = null; setDraft(null); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, node: GraphNode) {
    event.stopPropagation();
    if (event.button !== 0 || !event.isPrimary) return;
    event.currentTarget.focus();
    suppressApprovalClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: node.id, pointerX: event.clientX, pointerY: event.clientY, x: node.x, y: node.y };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || drag.id !== id || !stage) return;
    if (Math.hypot(event.clientX - drag.pointerX, event.clientY - drag.pointerY) > 4) suppressApprovalClickRef.current = true;
    const x = Math.max(8, drag.x + event.clientX - drag.pointerX);
    const y = Math.max(8, drag.y + event.clientY - drag.pointerY);
    setNodes(current => current.map(node => node.id === id ? { ...node, x, y } : node));
  }

  const stageHeight = Math.max(440, ...nodes.map(node => node.y + nodeHeight + 28));
  const stageWidth = Math.max(760, ...nodes.map(node => node.x + nodeWidth + 28));
  const inspectedApprovalUpstream = inspectingApproval ? nodes.find(node => node.kind === 'agent' && node.lastOutput && links.some(link => link.target === inspectingApproval && link.source === node.id && link.command === 'input')) : null;
  const handoffRoutes = routesForAgent(agentLinks, 'designer');
  const agentLabel = (id: string) => ({ ba: 'BA Agent', designer: 'UI/UX Agent', developer: 'Developer Agent' })[id as 'ba' | 'designer' | 'developer'] || id;

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
      onDrop={event => { setDragOver(false); const kind = event.dataTransfer.getData('application/x-toolhub-graph-node'); if (kind !== 'workflow' && kind !== 'context' && kind !== 'agent' && kind !== 'tool-calling' && kind !== 'human-approval' && kind !== 'skill' && kind !== 'agent-handoff') return; event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); addNode(kind, { x: event.clientX - box.left - pan.x - nodeWidth / 2, y: event.clientY - box.top - pan.y - nodeWidth / 2 }); }}>
      {(graphError || screenContextError) && <div className="workflow-graph-context-error" role="alert">{graphError || screenContextError}{screenContextError && <button type="button" onClick={() => setScreenContextRetry(value => value + 1)}>Retry</button>}</div>}
      <div ref={stageRef} className="workflow-graph-stage" style={{ minHeight: stageHeight, minWidth: stageWidth, transform: `translate3d(${pan.x}px, ${pan.y}px, 0)` }}>
        {loaded && nodes.length === 0 && <div className="workflow-graph-empty"><Workflow size={26}/><strong>Start with a node</strong><span>Click or drag a node from the sidebar, or press +.</span></div>}
        <svg className="workflow-graph-links" aria-label="Workflow links">
          <defs><marker id="workflow-link-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#96958e" strokeWidth="1.5"/></marker></defs>
          {links.map(link => {
            const source = nodes.find(node => node.id === link.source);
            const target = nodes.find(node => node.id === link.target);
            if (!source || !target) return null;
            const d = linkPath(source, target, link.command);
            const labelX = (source.x + nodeWidth + target.x) / 2;
            const labelY = (outputPoint(source, link.command).y + target.y + nodeWidth / 2) / 2;
            const label = source.kind === 'human-approval' ? link.command === 'loop' ? 'Loop' : link.command === 'deny' ? 'Deny' : 'Approve' : 'input';
            const labelWidth = label === 'Approve' ? 58 : 46;
            return <ContextMenu key={link.id}><ContextMenuTrigger render={<g/>} className={selectedLink === link.id ? 'workflow-graph-link is-selected' : 'workflow-graph-link'} onContextMenu={() => setSelectedLink(link.id)}>
              <path d={d} className="connection-hit" role="button" tabIndex={0} aria-label={`${label} connection from ${source.name} to ${target.name}. Press Delete to remove.`} onPointerDown={event => event.stopPropagation()} onClick={event => { event.currentTarget.focus(); setSelectedLink(link.id); }} onKeyDown={event => { if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) { setLinks(current => current.filter(item => item.id !== link.id)); setSelectedLink(null); } } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLink(link.id); } }}/>
              <path d={d} className="connection-line" markerEnd="url(#workflow-link-arrow)"/>
              <path d={d} className="connection-motion"/>
              <g className="workflow-edge-label" aria-hidden="true" transform={`translate(${labelX} ${labelY})`}><rect x={-labelWidth / 2} y="-10" width={labelWidth} height="20" rx="5"/><text textAnchor="middle" dominantBaseline="central">{label}</text></g>
            </ContextMenuTrigger><ContextMenuContent className="node-context-menu workflow-edge-menu" finalFocus={false} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{source.kind === 'human-approval' ? (target.kind === 'agent' ? ['approve', 'deny', 'loop'] as const : ['approve', 'deny'] as const).map(branch => <ContextMenuItem key={branch} onClick={() => setLinks(current => current.some(item => item.id !== link.id && item.source === link.source && item.target === link.target && item.command === branch) ? current : current.map(item => item.id === link.id ? { ...item, command: branch } : item))}><Check/>{branch === 'approve' ? 'Approve' : branch === 'deny' ? 'Deny' : 'Loop'}{link.command === branch && <span className="node-delete-shortcut">Selected</span>}</ContextMenuItem>) : <ContextMenuItem><Check/>Input<span className="node-delete-shortcut">Selected</span></ContextMenuItem>}</ContextMenuContent></ContextMenu>;
          })}
          {draft && (() => { const source = nodes.find(node => node.id === draft.source); const target = draft.target ? nodes.find(node => node.id === draft.target) : null; return source ? <path className={`connection-preview${target ? ' is-ready' : ''}`} d={curve(outputPoint(source, draft.command), target ? { x: target.x, y: target.y + nodeWidth / 2 } : draft.point)}/> : null; })()}
        </svg>
        {nodes.map(node => <ContextMenu key={node.id}><ContextMenuTrigger className="workflow-graph-node-group" style={{ left: node.x, top: node.y, zIndex: 4 + node.number % 3 }}><button
          type="button" className="canvas-node workflow-graph-node"
          aria-label={`${node.name}. ${node.active ? node.kind === 'agent-handoff' ? node.handoffMode === 'receive' ? 'Receive data' : 'Send handoff' : 'Active' : 'Inactive'}. Drag or use arrow keys to move. Press Delete to remove.`}
          onDoubleClick={() => { if (node.kind === 'context') { setFileError(''); setEditingNode(node.id); } else if (node.kind === 'workflow') setEditingWorkflow(node.id); else if (node.kind === 'agent') openAgentOutput(node); else if (node.kind === 'agent-handoff') setEditingHandoff(node.id); }}
          onClick={() => { if (node.kind === 'human-approval' && !suppressApprovalClickRef.current) setInspectingApproval(node.id); suppressApprovalClickRef.current = false; }}
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
        >{(() => { const Icon = iconOptions.find(option => option.type === node.icon)?.icon || Workflow; return <Icon size={28} strokeWidth={1.6} aria-hidden="true"/>; })()}</button><span className="workflow-graph-node-label node-name" title={node.name}>{node.name}</span><span className={`node-status${node.active ? ' is-active' : ''}`}><span aria-hidden="true"/>{!node.active ? 'Inactive' : node.kind === 'agent-handoff' ? node.handoffMode === 'receive' ? 'Receive' : 'Send' : 'Active'}</span>
          <button type="button" className={`node-port workflow-graph-port workflow-graph-port-input${draft && draft.source !== node.id ? ' can-connect' : ''}${draft?.target === node.id ? ' is-target' : ''}${links.some(link => link.target === node.id) ? ' is-connected' : ''}`} data-workflow-input={node.id} aria-label={`Input of ${node.name}`} title="Input — drop a connection here" onPointerDown={event => event.stopPropagation()} onClick={() => { if (draft) connect(draft.source, node.id, draft.command); }}/>
          {(node.kind === 'human-approval' ? ['approve', 'deny'] as const : ['input'] as const).map(command => <button key={command} type="button" className={`node-port workflow-graph-port workflow-graph-port-output${node.kind === 'human-approval' ? ` is-${command}` : ''}${links.some(link => link.source === node.id && (link.command === command || command === 'deny' && link.command === 'loop')) ? ' is-connected' : ''}`} aria-label={`${command === 'input' ? 'Connect' : command === 'approve' ? 'Approve' : 'Deny'} from ${node.name}`} title={`${command === 'input' ? 'Output' : command === 'approve' ? 'Approve' : 'Deny'} — drag to another node's input`} onPointerDown={event => startConnection(event, node, command)} onPointerMove={event => moveConnection(event, node.id)} onPointerUp={event => endConnection(event, node.id)} onPointerCancel={event => { event.stopPropagation(); portDragRef.current = null; setDraft(null); }} onLostPointerCapture={event => { event.stopPropagation(); if (portDragRef.current) { portDragRef.current = null; setDraft(null); } }} onClick={event => { if (event.detail === 0) { const point = outputPoint(node, command); setDraft({ source: node.id, command, point: { x: point.x + 66, y: point.y }, target: null }); } }}/>) }
        </ContextMenuTrigger><ContextMenuContent className="node-context-menu" finalFocus={false} onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <ContextMenuItem disabled={!node.active || execution?.running} onClick={() => void playGraphNode(node)}><Play/>Play</ContextMenuItem>
          {node.kind === 'context' && <ContextMenuItem onClick={() => { setFileError(''); setEditingNode(node.id); }}><FileText/>Edit context</ContextMenuItem>}
          {node.kind === 'workflow' && <ContextMenuItem onClick={() => setEditingWorkflow(node.id)}><Workflow/>Edit task</ContextMenuItem>}
          {node.kind === 'agent' && <ContextMenuItem onClick={() => openAgentOutput(node)}><Bot/>Structured output</ContextMenuItem>}
          {node.kind === 'human-approval' && <ContextMenuItem onClick={() => setInspectingApproval(node.id)}><CircleCheck/>View output</ContextMenuItem>}
          {node.kind === 'agent-handoff' && <ContextMenuItem onClick={() => setEditingHandoff(node.id)}><ArrowRightLeft/>Configure handoff</ContextMenuItem>}
          <ContextMenuItem onClick={() => { setNameDraft(node.name); setRenamingNode(node.id); }}><Pencil/>Rename</ContextMenuItem>
          <ContextMenuSub><ContextMenuSubTrigger><Shapes/>Change icon</ContextMenuSubTrigger><ContextMenuSubContent className="node-context-menu node-icon-grid" onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>{iconOptions.map(({ type, label, icon: Icon }) => <ContextMenuItem key={type} aria-label={label} title={label} data-selected={node.icon === type} onClick={() => updateNode(node.id, { icon: type })}><Icon/></ContextMenuItem>)}</ContextMenuSubContent></ContextMenuSub>
          <ContextMenuItem disabled={node.kind === 'agent' && !node.active && !validateStructuredOutput(node.structuredOutput).ok} onClick={() => updateNode(node.id, { active: !node.active })}><Power/>{node.active ? 'Set inactive' : 'Set active'}</ContextMenuItem>
          <ContextMenuItem disabled title="Coming soon"><Ticket/>Write ticket<span className="ticket-coming-soon">Soon</span></ContextMenuItem>
          <ContextMenuItem variant="destructive" onClick={() => removeNode(node.id)}><Trash2/>Delete node<span className="node-delete-shortcut">⌫ / Del</span></ContextMenuItem>
        </ContextMenuContent></ContextMenu>)}
      </div>
    </div>
    <aside className="workflow-graph-sidebar node-picker" aria-label="Add graph node">
      <header><h2>Add node</h2></header>
      <div className="node-picker-options workflow-graph-picker">{([{ kind: 'workflow', label: 'Workflow node', icon: Workflow }, { kind: 'context', label: 'Context Builder', icon: FileText }, { kind: 'agent', label: 'AI Agent', icon: Bot }, { kind: 'tool-calling', label: 'Tool Calling', icon: Wrench }, { kind: 'human-approval', label: 'Human Approval', icon: CircleCheck }, { kind: 'skill', label: 'Skill', icon: BookOpen }, { kind: 'agent-handoff', label: 'Agent Handoff', icon: ArrowRightLeft }] as const).map(({ kind, label, icon: Icon }) => <button type="button" key={kind} draggable={loaded && nodes.length < 100} disabled={!loaded || nodes.length >= 100} onDragStart={event => { event.dataTransfer.setData('application/x-toolhub-graph-node', kind); event.dataTransfer.effectAllowed = 'copy'; }} onDragEnd={() => setDragOver(false)} onClick={() => addNode(kind)}><span><Icon size={20}/></span>{label}</button>)}</div>
    </aside>
    </div>
    {inspectingApproval && <HumanApprovalNodeDialog key={inspectingApproval} nodeId={inspectingApproval} nodeName={nodes.find(node => node.id === inspectingApproval)?.name || 'Human Approval'} upstreamNodeId={inspectedApprovalUpstream?.id} upstreamOutput={inspectedApprovalUpstream?.lastOutput} upstreamName={inspectedApprovalUpstream?.name} onClose={() => setInspectingApproval(null)}/>}
    {execution && <GraphRunOutputDialog key={execution.nodeId} nodeName={execution.nodeName} output={execution.output} running={execution.running} error={execution.error} onClose={() => setExecution(null)}/>}
    <Dialog open={Boolean(renamingNode)} onOpenChange={open => { if (!open) setRenamingNode(null); }}><DialogContent className="workflow-rename-dialog"><DialogTitle>Rename node</DialogTitle><DialogDescription className="sr-only">Choose a name for this graph node.</DialogDescription><form onSubmit={event => { event.preventDefault(); if (renamingNode && nameDraft.trim()) updateNode(renamingNode, { name: nameDraft.trim().slice(0, 60) }); setRenamingNode(null); }}><label htmlFor="workflow-node-name">Node name</label><input id="workflow-node-name" maxLength={60} value={nameDraft} onChange={event => setNameDraft(event.target.value)}/><button type="submit" disabled={!nameDraft.trim()}>Save</button></form></DialogContent></Dialog>
    <Dialog open={Boolean(editingWorkflow)} onOpenChange={open => { if (!open) { setEditingWorkflow(null); setTaskTagPicker(null); } }}>
      <DialogContent className="workflow-task-dialog">
        <DialogTitle>Workflow task</DialogTitle>
        <DialogDescription className="sr-only">Select specific context tags for this workflow node.</DialogDescription>
        {(() => {
          const node = nodes.find(item => item.id === editingWorkflow);
          if (!node) return null;
          const registry = buildConnectedTagRegistry(node.id, nodes, links);
          const available = [...registry.definitions.values()];
          const resolved = resolveConnectedInput(node.id, node.taskText, nodes, links);
          const suggestions = taskTagPicker ? available.filter(tag => tag.name.toLowerCase().includes(taskTagPicker.query.trim().toLowerCase()) && !registry.conflicts.has(tag.name.toLocaleLowerCase('en-US'))).slice(0, 8) : [];
          return <div className="workflow-task-form">
            <label htmlFor="workflow-task-text">Task</label>
            <div className="workflow-task-editor"><div ref={taskMirrorRef} className="workflow-context-syntax-mirror" aria-hidden="true">{renderContextSyntax(node.taskText)}</div><textarea ref={taskTextRef} id="workflow-task-text" value={node.taskText} maxLength={4000} onChange={event => { updateNode(node.id, { taskText: event.target.value }); setTaskTagPicker(openTagAt(event.target.value, event.target.selectionStart)); setTaskTagIndex(0); }} onSelect={event => setTaskTagPicker(openTagAt(event.currentTarget.value, event.currentTarget.selectionStart))} onScroll={event => { if (taskMirrorRef.current) taskMirrorRef.current.scrollTop = event.currentTarget.scrollTop; }} onKeyDown={event => {
              if (!taskTagPicker || !suggestions.length) return;
              if (event.key === 'Escape') { event.preventDefault(); setTaskTagPicker(null); }
              if (event.key === 'ArrowDown') { event.preventDefault(); setTaskTagIndex(index => (index + 1) % suggestions.length); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setTaskTagIndex(index => (index + suggestions.length - 1) % suggestions.length); }
              if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectTaskTag(node, suggestions[taskTagIndex]?.name || suggestions[0].name); }
            }}/></div>
            {taskTagPicker && suggestions.length > 0 && <div className="workflow-task-suggestions" role="listbox" aria-label="Connected tags">{suggestions.map((tag, index) => <button type="button" role="option" aria-selected={index === taskTagIndex} key={tag.id} onMouseDown={event => event.preventDefault()} onClick={() => selectTaskTag(node, tag.name)}>{tag.name}</button>)}</div>}
            {available.length > 0 && <div className="workflow-task-tags" aria-label="Connected context tags">{available.map(tag => <button type="button" key={tag.id} disabled={registry.conflicts.has(tag.name.toLocaleLowerCase('en-US'))} onClick={() => {
              const input = taskTextRef.current;
              const start = input?.selectionStart ?? node.taskText.length;
              const end = input?.selectionEnd ?? start;
              const reference = `/${tag.name}/`;
              updateNode(node.id, { taskText: `${node.taskText.slice(0, start)}${reference}${node.taskText.slice(end)}` });
              requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + reference.length, start + reference.length); });
            }}>{tag.name}</button>)}</div>}
            {!resolved.ok && <small role="alert" className="workflow-task-error">{resolved.error}</small>}
          </div>;
        })()}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editingAgent)} onOpenChange={open => { if (!open && !runningAgent) { setEditingAgent(null); setOutputError(''); setInputTagPicker(null); } }}>
      <DialogContent className="node-inspector node-inspector-setup node-inspector-agent workflow-agent-dialog">
        <header className="inspector-heading"><span className="inspector-icon"><Bot size={21}/></span><DialogTitle>AI Agent</DialogTitle></header>
        <DialogDescription className="sr-only">Define this node&apos;s instruction prompt, explicit input, and structured JSON output.</DialogDescription>
        {(() => {
          const node = nodes.find(item => item.id === editingAgent);
          if (!node) return null;
          const validation = validateStructuredOutput(outputDraft);
          const registry = buildConnectedTagRegistry(node.id, nodes, links);
          const available = [...registry.definitions.values()];
          const selectedTags = new Set(Array.from(inputDraft.matchAll(/\/([^/*\n]{1,40})\//g), match => match[1].trim().toLocaleLowerCase('en-US')));
          const missingTags = available.filter(tag => !registry.conflicts.has(tag.name.toLocaleLowerCase('en-US')) && !selectedTags.has(tag.name.toLocaleLowerCase('en-US')));
          const suggestions = inputTagPicker ? available.filter(tag => tag.name.toLowerCase().includes(inputTagPicker.query.trim().toLowerCase()) && !registry.conflicts.has(tag.name.toLocaleLowerCase('en-US'))).slice(0, 8) : [];
          const inputCheck = resolveConnectedInput(node.id, inputDraft, nodes, links);
          const files = outputFiles(node.lastOutput);
          const selectedView = files ? outputView : 'json';
          const outputText = selectedView === 'json' ? node.lastOutput : selectedView === 'preview' ? '' : files?.[selectedView] || '';
          return <div className="workflow-agent-layout"><div className="agent-card-form workflow-agent-form">
            <div className="agent-card-field"><label htmlFor="workflow-agent-instruction">Instruction prompt</label><textarea id="workflow-agent-instruction" value={instructionDraft} maxLength={4000} onChange={event => { setInstructionDraft(event.target.value); setOutputError(''); }}/></div>
            <div className="agent-card-field"><div className="workflow-agent-input-heading"><label htmlFor="workflow-agent-input">Explicit input</label>{available.length > 0 && <button type="button" disabled={missingTags.length === 0} onClick={() => {
              const addition = missingTags.map(tag => `/${tag.name}/`).join(' ');
              const next = `${inputDraft.trimEnd()}${inputDraft.trim() ? '\n' : ''}${addition}`;
              if (next.length > 4000) { setInputSelectionError('All connected tags exceed the 4,000 character input limit.'); return; }
              setInputDraft(next);
              setInputTagPicker(null);
              setInputSelectionError('');
              setOutputError('');
            }}>Select all</button>}</div><div className="workflow-task-editor"><div ref={explicitInputMirrorRef} className="workflow-context-syntax-mirror" aria-hidden="true">{renderContextSyntax(inputDraft)}</div><textarea ref={explicitInputRef} id="workflow-agent-input" value={inputDraft} maxLength={4000} onChange={event => { setInputDraft(event.target.value); setInputSelectionError(''); setInputTagPicker(openTagAt(event.target.value, event.target.selectionStart)); setInputTagIndex(0); setOutputError(''); }} onSelect={event => setInputTagPicker(openTagAt(event.currentTarget.value, event.currentTarget.selectionStart))} onScroll={event => { if (explicitInputMirrorRef.current) explicitInputMirrorRef.current.scrollTop = event.currentTarget.scrollTop; }} onKeyDown={event => {
              if (!inputTagPicker || !suggestions.length) return;
              if (event.key === 'Escape') { event.preventDefault(); setInputTagPicker(null); }
              if (event.key === 'ArrowDown') { event.preventDefault(); setInputTagIndex(index => (index + 1) % suggestions.length); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setInputTagIndex(index => (index + suggestions.length - 1) % suggestions.length); }
              if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectInputTag(suggestions[inputTagIndex]?.name || suggestions[0].name); }
            }}/></div>{inputSelectionError && <small role="alert" className="workflow-task-error">{inputSelectionError}</small>}</div>
            {inputTagPicker && suggestions.length > 0 && <div className="workflow-task-suggestions" role="listbox" aria-label="Connected tags">{suggestions.map((tag, index) => <button type="button" role="option" aria-selected={index === inputTagIndex} key={tag.id} onMouseDown={event => event.preventDefault()} onClick={() => selectInputTag(tag.name)}>{tag.name}</button>)}</div>}
            {available.length > 0 && <details className="workflow-agent-tags"><summary>Connected tags <span>{available.length}</span></summary><div className="workflow-task-tags" aria-label="Connected context tags">{available.map(tag => <button type="button" key={tag.id} disabled={registry.conflicts.has(tag.name.toLocaleLowerCase('en-US'))} onClick={() => {
              const input = explicitInputRef.current;
              const start = input?.selectionStart ?? inputDraft.length;
              const end = input?.selectionEnd ?? start;
              const reference = `/${tag.name}/`;
              setInputDraft(current => `${current.slice(0, start)}${reference}${current.slice(end)}`);
              requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + reference.length, start + reference.length); });
            }}>{tag.name}</button>)}</div></details>}
            {!inputCheck.ok && <small role="alert" className="workflow-task-error">{inputCheck.error}</small>}
            <div className="agent-card-field"><label htmlFor="workflow-agent-output">Structured output · JSON</label><textarea className="workflow-agent-json" id="workflow-agent-output" value={outputDraft} maxLength={16000} spellCheck={false} onChange={event => { setOutputDraft(event.target.value); setOutputError(''); }}/></div>
            <div className="workflow-agent-actions"><button type="button" disabled={!validation.ok || runningAgent} onClick={() => {
              if (!validation.ok) return;
              updateNode(node.id, { instructionPrompt: instructionDraft, explicitInput: inputDraft, structuredOutput: validation.formatted, active: true });
              setOutputDraft(validation.formatted);
              setOutputError('');
            }}>Save</button><button type="button" disabled={runningAgent || !node.active || !validateStructuredOutput(node.structuredOutput).ok || outputDraft !== node.structuredOutput || instructionDraft !== node.instructionPrompt || inputDraft !== node.explicitInput || !inputCheck.ok} onClick={() => void runGraphAgent(node)}>{runningAgent ? 'Running…' : 'Run'}</button></div>
          </div><section className="workflow-agent-output-panel" aria-label="AI Agent output">
            <header className="workflow-agent-output-heading"><strong>Output</strong>{node.lastOutput && <span>Last successful run</span>}</header>
            {files && <div className="workflow-agent-output-tabs" role="group" aria-label="Output file">{(['preview', 'html', 'css', 'js', 'json'] as const).map(view => <button type="button" aria-pressed={selectedView === view} key={view} onClick={() => setOutputView(view)}>{view === 'preview' ? 'Preview' : view === 'json' ? 'JSON' : `${view === 'html' ? 'index' : view === 'css' ? 'styles' : 'script'}.${view}`}</button>)}</div>}
            <div className="workflow-agent-output-body">
              {outputError && <div role="alert" className="workflow-agent-output-error">{outputError}</div>}
              {runningAgent && <div role="status" className="workflow-agent-output-pending">Running agent…</div>}
              {node.lastOutput ? selectedView === 'preview' && files ? <iframe className="workflow-agent-output-preview" title="UI/UX screen preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={graphPreviewDocument(files)}/> : <pre key={selectedView} className="workflow-agent-output-code">{outputText}</pre> : !runningAgent && <div className="workflow-agent-output-empty">Run this node to see its output.</div>}
            </div>
          </section></div>;
        })()}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editingHandoff)} onOpenChange={open => { if (!open) setEditingHandoff(null); }}>
      <DialogContent className="node-inspector node-inspector-setup node-inspector-agent workflow-handoff-dialog">
        <header className="inspector-heading"><span className="inspector-icon"><ArrowRightLeft size={21}/></span><DialogTitle>Agent Handoff</DialogTitle></header>
        <DialogDescription className="sr-only">Choose whether this node receives or sends agent data.</DialogDescription>
        {(() => {
          const node = nodes.find(item => item.id === editingHandoff);
          if (!node) return null;
          const peers = node.handoffMode === 'receive' ? handoffRoutes.incoming : handoffRoutes.outgoing;
          const visibleOutputs = node.handoffMode === 'receive' ? agentOutputs.filter(output => peers.includes(output.agentId)) : agentOutputs.filter(output => output.agentId === 'designer');
          return <div className="agent-card-form workflow-handoff-form">
            <div className="agent-card-field"><span id="workflow-handoff-mode-label">Mode</span>
              <DropdownMenu><DropdownMenuTrigger className="workflow-handoff-select" aria-labelledby="workflow-handoff-mode-label"><span>{node.handoffMode === 'receive' ? 'Receive data' : 'Send handoff'}</span><ChevronDown size={16}/></DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="workflow-handoff-mode-menu">
                  <DropdownMenuItem onClick={() => updateNode(node.id, { handoffMode: 'receive', active: true })}><span>Receive data</span>{node.handoffMode === 'receive' && <Check size={15}/>}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateNode(node.id, { handoffMode: 'send', active: true })}><span>Send handoff</span>{node.handoffMode === 'send' && <Check size={15}/>}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="agent-card-field"><span>{node.handoffMode === 'receive' ? 'Sources from Toolhub' : 'Destinations from Toolhub'}</span><div className="workflow-handoff-route">{peers.length ? peers.map(agentLabel).join(', ') : 'No connected agent'}</div></div>
            <div className="agent-card-field"><span>{node.handoffMode === 'receive' ? 'Received data' : 'Available UI/UX data'}</span><div className="workflow-handoff-data">{visibleOutputs.length ? visibleOutputs.map(output => <article key={output.agentId}><strong>{agentLabel(output.agentId)}</strong><div>{output.content}</div></article>) : <span className="workflow-handoff-empty">No live agent output yet</span>}</div></div>
            {node.handoffMode === 'receive' && <div className="agent-card-field"><label htmlFor="workflow-handoff-test-document">Test document</label><textarea id="workflow-handoff-test-document" className="workflow-handoff-test-document" value={node.testDocument} maxLength={6000} onChange={event => updateNode(node.id, { testDocument: event.target.value })}/><label className="workflow-handoff-toggle"><input type="checkbox" checked={node.useTestDocument} onChange={event => updateNode(node.id, { useTestDocument: event.target.checked })}/><span>Use when no live agent output</span></label></div>}
          </div>;
        })()}
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(editingNode)} onOpenChange={open => { if (!open) { setEditingNode(null); setTagPicker(null); setTagPreview(null); } }}>
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
                  <textarea ref={contextTextRef} id="workflow-context-text" disabled={readingFiles} value={node.contextText} maxLength={Math.max(0, maxContextCharacters - usedCharacters)} onChange={event => { updateContextText(node.id, event.target.value); syncTagPicker(event.target.value, event.target.selectionStart); setTagPreview(null); }} onSelect={event => { syncTagPicker(event.currentTarget.value, event.currentTarget.selectionStart); syncTagPreview(event.currentTarget.value, event.currentTarget.selectionStart); }} onClick={event => syncTagPreview(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={event => {
                    if (!tagPicker || !suggestedTags.length) return;
                    if (event.key === 'Escape') { event.preventDefault(); setTagPicker(null); }
                    if (event.key === 'ArrowDown') { event.preventDefault(); setTagPickerIndex(index => (index + 1) % suggestedTags.length); }
                    if (event.key === 'ArrowUp') { event.preventDefault(); setTagPickerIndex(index => (index + suggestedTags.length - 1) % suggestedTags.length); }
                    if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); selectTagSuggestion(suggestedTags[tagPickerIndex] || suggestedTags[0], node); }
                  }} onScroll={event => { if (contextMirrorRef.current) contextMirrorRef.current.scrollTop = event.currentTarget.scrollTop; setTagPicker(null); setTagPreview(null); }} placeholder="Enter context or attach files..."/>
                  {tagPicker && suggestedTags.length > 0 && <div className="workflow-context-suggestions" role="listbox" aria-label="Existing tags" style={{ left: tagPicker.x, top: tagPicker.y }}>{suggestedTags.map((name, index) => <button type="button" role="option" aria-selected={index === tagPickerIndex} key={name} onMouseDown={event => event.preventDefault()} onClick={() => selectTagSuggestion(name, node)}>{name}</button>)}</div>}
                  {tagPreview && <div className="workflow-context-tag-preview" role="dialog" aria-label={`Content for ${tagPreview.name}`} style={{ left: tagPreview.x, top: tagPreview.y }}><div className="workflow-context-tag-preview-heading"><strong>{tagPreview.name}</strong><button type="button" aria-label="Close tag content" onClick={() => setTagPreview(null)}>×</button></div><div className="workflow-context-tag-preview-body">{(() => { const result = resolveTag(tagPreview.name, tagRegistry); return result.ok ? result.content : result.error; })()}</div></div>}
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
