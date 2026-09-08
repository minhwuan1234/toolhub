export type Viewport={x:number;y:number;zoom:number};
export const MIN_ZOOM=0.25;
export const MAX_ZOOM=2;
export const DEFAULT_VIEWPORT:Viewport={x:0,y:0,zoom:1};
export function zoomAt(view:Viewport,nextZoom:number,point:{x:number;y:number}):Viewport {
  const zoom=Math.max(MIN_ZOOM,Math.min(MAX_ZOOM,nextZoom));
  const ratio=zoom/view.zoom;
  return {zoom,x:point.x-(point.x-view.x)*ratio,y:point.y-(point.y-view.y)*ratio};
}
export function fitViewport(bounds:{x:number;y:number;width:number;height:number}|null,size:{width:number;height:number}):Viewport {
  if(!bounds)return {...DEFAULT_VIEWPORT};
  const zoom=Math.max(MIN_ZOOM,Math.min(1.5,(size.width-96)/Math.max(1,bounds.width),(size.height-144)/Math.max(1,bounds.height)));
  return {zoom,x:size.width/2-(bounds.x+bounds.width/2)*zoom,y:size.height/2-(bounds.y+bounds.height/2)*zoom};
}
