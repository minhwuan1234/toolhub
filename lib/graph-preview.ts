export type GraphPreviewFiles = { html: string; css: string; js: string };

export function graphPreviewDocument(files: GraphPreviewFiles): string {
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'`;
  const head = `<meta http-equiv="Content-Security-Policy" content="${policy}"><style>${files.css.replace(/<\/style/gi, '<\\/style')}</style>`;
  const script = `<script>${files.js.replace(/<\/script/gi, '<\\/script')}</script>`;
  let html = files.html.replace(/<link\b[^>]*href\s*=\s*["'](?:\.\/)?styles\.css["'][^>]*>/gi, '');
  html = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, match => `${match}${head}`) : `<head>${head}</head>${html}`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, `${script}</body>`) : `${html}${script}`;
}
