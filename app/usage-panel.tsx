'use client';
import {useEffect,useState,useCallback} from 'react';
import {Gauge,RefreshCw,ExternalLink} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {externalCategories,usagePercent,type UsageData} from '@/lib/usage';
export const money=(value:number|null|undefined)=>value===null||value===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value);
export function useUsage(enabled:boolean) {
  const [data,setData]=useState<UsageData|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();
    async function load(){
      setLoading(true);
      try{const r=await fetch('/api/admin/usage',{cache:'no-store',signal:controller.signal});const result=await r.json() as UsageData & {message?:string};if(!r.ok)throw new Error(result.message||'Unable to load usage.');setData(result);setError('');}
      catch(e){if(!controller.signal.aborted){setData(null);setError(e instanceof Error?e.message:'Unable to load usage.');}}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},300000);
    return()=>{controller.abort();clearInterval(timer);};
  },[enabled,revision]);
  return {data:enabled?data:null,error,loading,refresh};
}
export function UsageMeter({data}:{data:UsageData|null}) {
  const external=Object.values(data?.settings.external??{}).reduce((sum,v)=>sum+v,0);
  const current=data?.railway.current;const tracked=current===null||current===undefined?null:current+external;
  const percent=usagePercent(tracked,data?.settings.budget??5);
  return <><div className="usage-meter-label"><span>This period</span><strong>{money(tracked)} / {money(data?.settings.budget??5)}</strong></div><progress className={`usage-meter ${percent===null?'usage-unknown':percent>=100?'usage-over':''}`} aria-label="Tracked spending against budget" max={100} value={percent??undefined} aria-valuetext={percent===null?'Usage unavailable':`${money(tracked)} of ${money(data?.settings.budget)} budget`}/><span className="usage-meter-note">{!data?'Usage unavailable':data.railway.status==='not_connected'?'Connect Railway':data.railway.status==='unavailable'?'Connection unavailable':percent!==null&&percent>=100?'Budget reached':'Spending alert · not a hard cap'}</span></>;
}
export function UsagePanel({data,error,loading,onRefresh}:{data:UsageData|null;error:string;loading:boolean;onRefresh:()=>void}) {
  const [budget,setBudget]=useState<string|null>(null),[costs,setCosts]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
  const railway=data?.railway;
  const period=railway?.period;
  const external=Object.values(data?.settings.external??{}).reduce((sum,v)=>sum+v,0);
  const observed=railway?.current===null||railway?.current===undefined?null:railway.current;
  async function save(){
    if(!data)return;setNotice('');
    const newBudget=Number(budget??data.settings.budget);
    const entries={...data.settings.external};
    for(const [key,value] of Object.entries(costs)){if(value.trim()==='')delete entries[key];else entries[key]=Number(value);}
    if(!Number.isFinite(newBudget)||newBudget<=0||Object.values(entries).some(v=>!Number.isFinite(v)||v<0)){setNotice('Enter valid non-negative amounts and a budget above zero.');return;}
    setSaving(true);
    try{const r=await fetch('/api/admin/usage',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({periodKey:data.periodKey,budget:newBudget,external:entries})});if(!r.ok){const result=await r.json() as {message:string};throw new Error(result.message);}setBudget(null);setCosts({});setNotice('Saved.');onRefresh();}
    catch(e){setNotice(e instanceof Error?e.message:'Unable to save.');}finally{setSaving(false);}
  }
  return <section className="accounts-content usage-content" aria-labelledby="usage-heading">
    <div className="accounts-heading"><div className="page-icon"><Gauge size={28} strokeWidth={1.5}/></div><div className="usage-title"><h1 id="usage-heading">Usage & limits</h1><Button variant="outline" className="usage-refresh" disabled={loading} onClick={onRefresh}><RefreshCw size={14}/>Refresh</Button></div><p>{period?`${new Date(period.start).toLocaleDateString('en-GB')} – ${new Date(period.end).toLocaleDateString('en-GB')} · ${railway?.workspace}`:'Connect your Railway workspace to track billing usage.'}</p></div>
    {error && <p className="error" role="alert">{error}</p>}
    {railway?.status!=='connected' && <div className="usage-connect"><strong>{loading?'Loading usage…':railway?.status==='unavailable'?'Connection unavailable':'Railway is not connected'}</strong><p>{railway?.message||'Usage is shown only after a successful connection.'}</p><p>In Railway, add RAILWAY_API_TOKEN (an account or workspace API token) and RAILWAY_USAGE_WORKSPACE_ID to the Toolhub service variables, then deploy. Never enter the token here.</p><a href="https://railway.com/account/tokens" target="_blank" rel="noreferrer">Railway API tokens <ExternalLink size={13}/></a></div>}
    <div className="usage-summary"><article><span>Railway usage</span><strong>{money(observed)}</strong><small>All projects in the connected workspace</small></article><article><span>Resource forecast</span><strong>{money(railway?.forecast)}</strong><small>Estimated period-end usage; not an invoice</small></article><article><span>Recorded external costs</span><strong>{Object.keys(data?.settings.external??{}).length?money(external):'—'}</strong><small>Only amounts entered below</small></article></div>
    <div className="usage-budget"><div><h2>Spending budget</h2><p>Hobby includes $5 of usage. This budget alerts here; it does not stop services.</p><UsageMeter data={data}/></div><label htmlFor="usage-budget">Budget · USD<Input id="usage-budget" type="number" min="0.01" max="500000" step="0.01" value={budget??String(data?.settings.budget??5)} onChange={e=>setBudget(e.target.value)} disabled={!data||saving}/></label></div>
    <h2 className="usage-section-title">Railway resources</h2><div className="usage-resource-table"><div className="usage-resource-row usage-resource-head"><span>Resource</span><span>Metered usage</span><span>Cost estimate</span></div>{['Memory','CPU','Egress','Volume storage','Volume backups'].map(label=>{const item=railway?.resources.find(r=>r.label===label);return <div className="usage-resource-row" key={label}><span>{label}</span><span>{item?`${item.quantity.toLocaleString('en-US',{maximumFractionDigits:2})} ${item.unit}`:'—'}</span><strong>{money(item?.cost)}</strong></div>;})}</div>
    <p className="usage-footnote">CPU, memory and disk figures are accumulated usage, not live capacity. Rates: $20/vCPU-month, $10/GB-month RAM, $0.05/GB egress, $0.15/GB-month volume and backup. Estimates may differ from billing adjustments.</p>
    <div className="usage-limit-grid"><div><span>Railway email alert</span><strong>{railway?.status==='connected'?(railway.softLimit?money(railway.softLimit):'Not set'):'—'}</strong></div><div><span>Railway hard limit</span><strong>{railway?.status==='connected'?(railway.hardLimit===null?'Not set':money(railway.hardLimit)):'—'}</strong></div><a href="https://railway.com/workspace/billing" target="_blank" rel="noreferrer">Manage in Railway <ExternalLink size={13}/></a></div>
    <div className="usage-limit-grid"><div><span>Railway Agent usage</span><strong>{money(railway?.agent?.used)}</strong></div><div><span>Agent hard limit</span><strong>{railway?.agent?railway.agent.hardLimit===null?'Not set':money(railway.agent.hardLimit):'—'}</strong></div><span className="usage-footnote">Shown separately; not added to the reported total again.</span></div><div className="usage-coverage"><h2>Additional Railway charges</h2><p>Bucket storage and other provider charges are not individually available in this breakdown. They may contribute to Railway’s reported total. Check Railway billing for the complete invoice; do not enter them again as external costs.</p><p>Point-in-time recovery uses storage and egress. Workers, replicas and preview environments use the resource categories above.</p></div>
    <h2 className="usage-section-title">External costs</h2><p className="usage-footnote">Enter accrued costs for this {period?'Railway billing period':'calendar month (until Railway is connected)'}. Blank means not tracked; enter 0 only when confirmed. Amounts are saved per period and do not carry forward. Connecting Railway switches to its billing period.</p>
    <div className="external-costs">{externalCategories.map(category=><label key={category} htmlFor={`cost-${category.replaceAll(' ','-')}`}><span>{category}</span><Input id={`cost-${category.replaceAll(' ','-')}`} type="number" aria-label={`${category} cost in USD`} min="0" max="10000000" step="0.01" placeholder="Not tracked" value={costs[category]??(data?.settings.external[category]===undefined?'':String(data.settings.external[category]))} onChange={e=>setCosts(v=>({...v,[category]:e.target.value}))} disabled={!data||saving}/></label>)}</div>
    <div className="usage-save"><Button disabled={!data||saving||loading||railway?.status==='unavailable'} onClick={save}>{saving?'Saving…':'Save budget & costs'}</Button><output>{notice}</output></div>
    <p className="usage-footnote">{railway?.updatedAt?`Last synced ${new Date(railway.updatedAt).toLocaleString('en-GB')}. Refreshes every 5 minutes while open.`:'No successful sync yet.'} Values are in USD. This tracker is not a final invoice.</p>
  </section>;
}
