export type PreviewColumn={name:string;type:string;nullable:boolean|null};
export type ConnectionPreview={table:string;rows:Record<string,unknown>[];columns:PreviewColumn[];schemaSource:'database'|'rows'|'unavailable';page:number;hasNext:boolean;ordered:boolean};
