'use client';
import type {ConnectionPreview} from '@/lib/connection-preview';
function cell(value:unknown){if(value===null||value===undefined)return '—';if(typeof value==='string')return value;if(typeof value==='number'||typeof value==='boolean')return String(value);return JSON.stringify(value)??'—';}
export function ConnectionDataView({data,mode}:{data:ConnectionPreview;mode:'schema'|'table'|'json'}){
 if(mode==='json')return <pre className="connection-json">{JSON.stringify(data.rows,null,2)}</pre>;
 if(mode==='schema')return <><p className="inspector-muted">{data.schemaSource==='database'?'Schema from Supabase':data.schemaSource==='rows'?'Observed types from this page; database schema unavailable.':'Schema unavailable for this table.'}</p>{data.columns.length>0&&<table className="inspector-preview-table"><thead><tr><th>Field</th><th>Type</th><th>Nullable</th></tr></thead><tbody>{data.columns.map(column=><tr key={column.name}><td>{column.name}</td><td>{column.type}</td><td>{column.nullable===null?'Unknown':column.nullable?'Yes':'No'}</td></tr>)}</tbody></table>}</>;
 if(!data.rows.length)return <div className="inspector-empty"><strong>No visible rows</strong><p>The table may be empty, or RLS may hide rows for this key.</p></div>;
 const fields=[...new Set(data.rows.flatMap(row=>Object.keys(row)))];
 return <><table className="inspector-preview-table connection-rows"><thead><tr>{fields.map(field=><th key={field}>{field}</th>)}</tr></thead><tbody>{data.rows.map((row,index)=><tr key={index}>{fields.map(field=><td key={field}><span title={cell(row[field])}>{cell(row[field])}</span></td>)}</tr>)}</tbody></table>{!data.ordered&&<p className="inspector-muted">No stable ID order is available; rows may move between pages.</p>}</>;
}
