'use client';
// This application canvas intentionally accepts focus and keyboard/pointer panning.
/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
import {useEffect,useRef,useState} from 'react';
import {Scan,ZoomIn,ZoomOut,Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {departments,type Department} from '@/lib/departments';
import {DEFAULT_VIEWPORT,MIN_ZOOM,MAX_ZOOM,zoomAt,fitViewport} from '@/lib/canvas-viewport';

import {NodePicker,nodeOptions,type BoardNode,type NodeKind} from './node-picker';
import {NodeDetails} from './node-details';
import {useNodeConnections} from './node-connections';

function CanvasZone({department}:{department:Department}) {
  const [nodes,setNodes]=useState<BoardNode[]>([]);
  const [picker,setPicker]=useState(false);
  const addButton=useRef<HTMLButtonElement>(null);
  const nodeDrag=useRef<{id:string;pointer:number;x:number;y:number}|null>(null);
  function closePicker(){setPicker(false);addButton.current?.focus();}
  function addNode(type:NodeKind,position?:{x:number;y:number}){
    const box=viewport.current?.getBoundingClientRect();if(!box)return;
    const x=((position?.x??box.width/2)-view.x)/view.zoom-72,y=((position?.y??box.height/2)-view.y)/view.zoom-32;
    setNodes(current=>{let left=x,top=y;while(!position&&current.some(node=>Math.abs(node.x-left)<150&&Math.abs(node.y-top)<130)){left+=160;top+=32;}return [...current,{id:crypto.randomUUID(),type,name:`${nodeOptions.find(option=>option.type===type)!.label} ${current.filter(node=>node.type===type).length+1}`,active:false,x:left,y:top}];});
  }
  const [view,setView]=useState(DEFAULT_VIEWPORT);
  const [dragging,setDragging]=useState(false);
  const viewport=useRef<HTMLDivElement>(null);
  const scene=useRef<HTMLDivElement>(null);
  const connections=useNodeConnections(nodes,view,viewport);
  const drag=useRef<{id:number;x:number;y:number}|null>(null);
  function zoom(direction:number) {
    const box=viewport.current?.getBoundingClientRect();if(!box)return;
    setView(previous=>zoomAt(previous,previous.zoom*(direction>0?1.2:1/1.2),{x:box.width/2,y:box.height/2}));
  }
  function fit() {
    const box=viewport.current?.getBoundingClientRect();if(!box)return;
    // Fit includes every icon in this department.
    const nodes=Array.from(scene.current?.querySelectorAll<HTMLElement>('[data-canvas-node]')??[]);
    let bounds=null;
    if(nodes.length){const left=Math.min(...nodes.map(n=>n.offsetLeft)),top=Math.min(...nodes.map(n=>n.offsetTop));bounds={x:left,y:top,width:Math.max(...nodes.map(n=>n.offsetLeft+n.offsetWidth))-left,height:Math.max(...nodes.map(n=>n.offsetTop+n.offsetHeight))-top};}
    setView(fitViewport(bounds,{width:box.width,height:box.height}));
  }
  useEffect(()=>{
    const element=viewport.current;if(!element)return;
    function wheel(event:WheelEvent){
      event.preventDefault();
      const box=element!.getBoundingClientRect();
      const unit=event.deltaMode===1?16:event.deltaMode===2?box.height:1;
      if(event.ctrlKey||event.metaKey)setView(previous=>zoomAt(previous,previous.zoom*Math.exp(-event.deltaY*unit*0.008),{x:event.clientX-box.left,y:event.clientY-box.top}));
      else setView(previous=>({...previous,x:previous.x-event.deltaX*unit,y:previous.y-event.deltaY*unit}));
    }
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[]);
  return <fieldset className="canvas-zone-frame" aria-label={`${department} board`} onKeyDown={event=>{if(event.key==='Escape'){connections.cancel();if(picker){event.stopPropagation();closePicker();}}}}>
    <legend className="sr-only">{department} board</legend>
    <div className="canvas-stage">
    <div ref={viewport} className={`toolhub-canvas canvas-viewport ${dragging?'is-dragging':''}`} role="application" tabIndex={0} aria-label={`${department} canvas. Drag to pan. Control or Command plus scroll to zoom. Use plus, minus, or zero keys to zoom or fit.`}
      style={{backgroundSize:`${24*view.zoom}px ${24*view.zoom}px`,backgroundPosition:`${view.x+12*view.zoom}px ${view.y+12*view.zoom}px`}}
      onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-toolhub-node')){event.preventDefault();event.dataTransfer.dropEffect='copy';}}}
      onDrop={event=>{const type=event.dataTransfer.getData('application/x-toolhub-node');if(!nodeOptions.some(option=>option.type===type))return;event.preventDefault();const box=event.currentTarget.getBoundingClientRect();addNode(type as NodeKind,{x:event.clientX-box.left,y:event.clientY-box.top});}}
      onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setDragging(true);}}
      onPointerMove={event=>{const previous=drag.current;if(!previous||previous.id!==event.pointerId)return;const x=event.clientX-previous.x,y=event.clientY-previous.y;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setView(current=>({...current,x:current.x+x,y:current.y+y}));}}
      onPointerUp={event=>{if(drag.current?.id!==event.pointerId)return;drag.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current=null;setDragging(false);}}
      onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
      onKeyDown={event=>{if(event.target!==event.currentTarget)return;const directions:Record<string,[number,number]>={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(directions[event.key]){event.preventDefault();const [x,y]=directions[event.key];setView(current=>({...current,x:current.x+x,y:current.y+y}));}else if(['+','=','-','0','f','F'].includes(event.key)){event.preventDefault();if(['0','f','F'].includes(event.key))fit();else zoom(event.key==='-'?-1:1);}}}>
      <div ref={scene} className="canvas-scene" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>{connections.layer}{nodes.map(node=>{
        const option=nodeOptions.find(item=>item.type===node.type)!;const Icon=option.icon;
        return <NodeDetails type={node.type} onIconChange={type=>setNodes(current=>current.map(item=>item.id===node.id?{...item,type}:item))} name={node.name} active={node.active} onRename={name=>setNodes(current=>current.map(item=>item.id===node.id?{...item,name}:item))} onToggle={()=>setNodes(current=>current.map(item=>item.id===node.id?{...item,active:!item.active}:item))} key={node.id} x={node.x} y={node.y}><button type="button" className="canvas-node" aria-label={`${node.name}. Drag or use arrow keys to move.`} title={node.name}
          onPointerDown={event=>{event.stopPropagation();if(event.button!==0||!event.isPrimary)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);nodeDrag.current={id:node.id,pointer:event.pointerId,x:event.clientX,y:event.clientY};}}
          onPointerMove={event=>{event.stopPropagation();const previous=nodeDrag.current;if(!previous||previous.pointer!==event.pointerId||previous.id!==node.id)return;const dx=(event.clientX-previous.x)/view.zoom,dy=(event.clientY-previous.y)/view.zoom;nodeDrag.current={...previous,x:event.clientX,y:event.clientY};setNodes(current=>current.map(item=>item.id===node.id?{...item,x:item.x+dx,y:item.y+dy}:item));}}
          onPointerUp={event=>{event.stopPropagation();nodeDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
          onPointerCancel={event=>{event.stopPropagation();nodeDrag.current=null;}}
          onLostPointerCapture={event=>{event.stopPropagation();nodeDrag.current=null;}}
          onKeyDown={event=>{const delta:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!delta[event.key])return;event.preventDefault();event.stopPropagation();const [dx,dy]=delta[event.key],step=event.shiftKey?40:10;setNodes(current=>current.map(item=>item.id===node.id?{...item,x:item.x+dx*step,y:item.y+dy*step}:item));}}><Icon size={28} strokeWidth={1.6}/></button>{connections.ports(node)}</NodeDetails>;
      })}</div>
    </div>
    <Button ref={addButton} className="canvas-add" variant="outline" aria-label="Add node" aria-expanded={picker} title="Add node" onClick={()=>setPicker(current=>!current)}><Plus size={19}/></Button>
    <fieldset className="canvas-controls"><legend className="sr-only">Canvas view controls</legend>
      <Button className="canvas-control" variant="outline" aria-label="Fit screen" title="Fit screen (0)" onClick={fit}><Scan size={19}/></Button>
      <Button className="canvas-control" variant="outline" aria-label="Zoom in" title="Zoom in (+)" disabled={view.zoom>=MAX_ZOOM} onClick={()=>zoom(1)}><ZoomIn size={19}/></Button>
      <Button className="canvas-control" variant="outline" aria-label="Zoom out" title="Zoom out (−)" disabled={view.zoom<=MIN_ZOOM} onClick={()=>zoom(-1)}><ZoomOut size={19}/></Button>
      <output className="canvas-zoom-value" aria-label="Zoom level">{Math.round(view.zoom*100)}%</output>
    </fieldset>
    </div>
    <div className={`node-picker-drawer ${picker?'is-open':''}`} inert={!picker}>{picker&&<NodePicker onSelect={addNode} onClose={closePicker}/>}</div>
  </fieldset>;
}
export function DepartmentBoard({department,onDepartmentChange}:{department:Department;onDepartmentChange:(department:Department)=>void}) {
  return <Tabs className="department-board" value={department} onValueChange={value=>{if(departments.includes(value as Department))onDepartmentChange(value as Department);}}>
    <div className="department-tabs-bar"><TabsList className="department-tabs" aria-label="Department zones">
      {departments.map(item=><TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
    </TabsList></div>
    {departments.map(item=><TabsContent keepMounted key={item} value={item} className="department-zone" aria-label={`${item} node workspace`} data-department={item}><CanvasZone department={item}/></TabsContent>)}
  </Tabs>;
}
