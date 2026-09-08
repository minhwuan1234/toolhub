'use client';
import {useEffect,useRef,useState} from 'react';
import {Scan,ZoomIn,ZoomOut} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {departments,type Department} from '@/lib/departments';
import {DEFAULT_VIEWPORT,MIN_ZOOM,MAX_ZOOM,zoomAt,fitViewport} from '@/lib/canvas-viewport';

function CanvasZone({department}:{department:Department}) {
  const [view,setView]=useState(DEFAULT_VIEWPORT);
  const [dragging,setDragging]=useState(false);
  const viewport=useRef<HTMLDivElement>(null);
  const scene=useRef<HTMLDivElement>(null);
  const drag=useRef<{id:number;x:number;y:number}|null>(null);
  function zoom(direction:number) {
    const box=viewport.current?.getBoundingClientRect();if(!box)return;
    setView(previous=>zoomAt(previous,previous.zoom*(direction>0?1.2:1/1.2),{x:box.width/2,y:box.height/2}));
  }
  function fit() {
    const box=viewport.current?.getBoundingClientRect();if(!box)return;
    // Future node elements live in this transformed layer, with canvas-local positions.
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
  return <div className="canvas-zone-frame">
    <div ref={viewport} className={`toolhub-canvas canvas-viewport ${dragging?'is-dragging':''}`} role="application" tabIndex={0} aria-label={`${department} canvas. Drag to pan. Control or Command plus scroll to zoom. Use plus, minus, or zero keys to zoom or fit.`}
      style={{backgroundSize:`${24*view.zoom}px ${24*view.zoom}px`,backgroundPosition:`${view.x+12*view.zoom}px ${view.y+12*view.zoom}px`}}
      onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setDragging(true);}}
      onPointerMove={event=>{const previous=drag.current;if(!previous||previous.id!==event.pointerId)return;const x=event.clientX-previous.x,y=event.clientY-previous.y;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY};setView(current=>({...current,x:current.x+x,y:current.y+y}));}}
      onPointerUp={event=>{if(drag.current?.id!==event.pointerId)return;drag.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current=null;setDragging(false);}}
      onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
      onKeyDown={event=>{if(event.target!==event.currentTarget)return;const directions:Record<string,[number,number]>={ArrowLeft:[40,0],ArrowRight:[-40,0],ArrowUp:[0,40],ArrowDown:[0,-40]};if(directions[event.key]){event.preventDefault();const [x,y]=directions[event.key];setView(current=>({...current,x:current.x+x,y:current.y+y}));}else if(['+','=','-','0','f','F'].includes(event.key)){event.preventDefault();if(['0','f','F'].includes(event.key))fit();else zoom(event.key==='-'?-1:1);}}}>
      <div ref={scene} className="canvas-scene" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}/>
    </div>
    <fieldset className="canvas-controls"><legend className="sr-only">Canvas view controls</legend>
      <Button className="canvas-control" variant="outline" aria-label="Fit screen" title="Fit screen (0)" onClick={fit}><Scan size={19}/></Button>
      <Button className="canvas-control" variant="outline" aria-label="Zoom in" title="Zoom in (+)" disabled={view.zoom>=MAX_ZOOM} onClick={()=>zoom(1)}><ZoomIn size={19}/></Button>
      <Button className="canvas-control" variant="outline" aria-label="Zoom out" title="Zoom out (−)" disabled={view.zoom<=MIN_ZOOM} onClick={()=>zoom(-1)}><ZoomOut size={19}/></Button>
      <output className="canvas-zoom-value" aria-label="Zoom level">{Math.round(view.zoom*100)}%</output>
    </fieldset>
  </div>;
}
export function DepartmentBoard({department,onDepartmentChange}:{department:Department;onDepartmentChange:(department:Department)=>void}) {
  return <Tabs className="department-board" value={department} onValueChange={value=>{if(departments.includes(value as Department))onDepartmentChange(value as Department);}}>
    <div className="department-tabs-bar"><TabsList className="department-tabs" aria-label="Department zones">
      {departments.map(item=><TabsTrigger key={item} value={item}>{item}</TabsTrigger>)}
    </TabsList></div>
    {departments.map(item=><TabsContent keepMounted key={item} value={item} className="department-zone" aria-label={`${item} node workspace`} data-department={item}><CanvasZone department={item}/></TabsContent>)}
  </Tabs>;
}
