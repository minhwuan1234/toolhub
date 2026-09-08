export const resourceRates = [
  {id:'MEMORY_USAGE_GB',label:'Memory',unit:'GB-min',rate:10/43200},
  {id:'CPU_USAGE',label:'CPU',unit:'vCPU-min',rate:20/43200},
  {id:'NETWORK_TX_GB',label:'Egress',unit:'GB',rate:0.05},
  {id:'DISK_USAGE_GB',label:'Volume storage',unit:'GB-min',rate:0.15/43200},
  {id:'BACKUP_USAGE_GB',label:'Volume backups',unit:'GB-min',rate:0.15/43200},
] as const;
export const externalCategories=['AI APIs','Email & SMS','Third-party APIs','External hosting & storage','Monitoring','Domains','Other fees'] as const;
export type UsageSnapshot = {status:'connected'|'not_connected'|'unavailable';updatedAt:string|null;workspace:string|null;period:{start:string;end:string}|null;current:number|null;forecast:number|null;softLimit:number|null;hardLimit:number|null;resources:{id:string;label:string;unit:string;quantity:number;cost:number}[];message?:string;agent?:{used:number;hardLimit:number|null}|null};
export type UsageSettings={budget:number;external:Record<string,number>};
export type UsageData={railway:UsageSnapshot;settings:UsageSettings;periodKey:string};
export function costRows(values:{measurement:string;value:number}[]) {
  return resourceRates.map(rate=>{const quantity=values.filter(v=>v.measurement===rate.id).reduce((sum,v)=>sum+v.value,0);return {...rate,quantity,cost:quantity*rate.rate};});
}
export function usagePercent(amount:number|null,limit:number|null) {return amount===null || limit===null || limit<=0?null:Math.min(100,Math.max(0,amount/limit*100));}
