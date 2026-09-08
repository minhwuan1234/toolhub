'use client';
import Image from 'next/image';
import {useRef,useState} from 'react';
import {Camera,Upload} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
export function AvatarEditor({name,image,onChanged}:{name:string;image?:string|null;onChanged:(image:string|null)=>void}){
  const [open,setOpen]=useState(false),[preview,setPreview]=useState<string|null>(null),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  const selection=useRef(0);
  function reset(){selection.current++;setPreview(null);setFile(null);setError('');}
  function choose(next:File|undefined){
    if(!next)return;const generation=++selection.current;setError('');setPreview(null);setFile(null);
    if(!['image/jpeg','image/png','image/webp'].includes(next.type)||next.size>5*1024*1024){setError('Choose a JPG, PNG or WebP image under 5 MB.');return;}
    const reader=new FileReader();reader.onload=()=>{if(selection.current===generation&&typeof reader.result==='string'){setPreview(reader.result);setFile(next);}};reader.onerror=()=>{if(selection.current===generation)setError('Unable to read this image.');};reader.readAsDataURL(next);
  }
  async function save(remove=false){
    if(!remove&&!file)return;setBusy(true);setError('');
    try{const response=await fetch('/api/avatar',remove?{method:'DELETE'}:{method:'PUT',headers:{'Content-Type':file!.type},body:file});const result=await response.json() as {image:string|null;message?:string};if(!response.ok)throw new Error(result.message||'Unable to update avatar.');onChanged(result.image);setOpen(false);reset();}
    catch(e){setError(e instanceof Error?e.message:'Unable to update avatar.');}finally{setBusy(false);}
  }
  const shown=preview||image;
  return <Dialog open={open} onOpenChange={value=>{if(busy)return;setOpen(value);reset();}}>
    <DialogTrigger className="sidebar-avatar avatar-trigger" aria-label="Change your avatar" title="Change avatar">{image?<Image src={image} unoptimized width={30} height={30} alt="Your avatar"/>:name.trim().slice(0,1).toUpperCase()}<Camera size={11} className="avatar-camera"/></DialogTrigger>
    <DialogContent className="avatar-dialog" showCloseButton={!busy}><DialogTitle>Profile photo</DialogTitle><DialogDescription>Choose a photo for your workspace profile.</DialogDescription>
      <div className="avatar-preview">{shown?<Image src={shown} unoptimized width={112} height={112} alt="Avatar preview"/>:<span>{name.trim().slice(0,1).toUpperCase()}</span>}</div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose avatar image" disabled={busy} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/>
      <Button className="avatar-upload" variant="outline" disabled={busy} onClick={()=>input.current?.click()}><Upload size={15}/>Choose image</Button>
      <p className="avatar-help">JPG, PNG or WebP · Up to 5 MB · Cropped to a square</p>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="avatar-actions">{image&&<Button variant="ghost" disabled={busy} onClick={()=>save(true)}>Remove photo</Button>}<Button className="avatar-save" disabled={busy||!file} onClick={()=>save()}>{busy?'Saving…':'Save photo'}</Button></div>
    </DialogContent>
  </Dialog>;
}
