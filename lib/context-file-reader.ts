const supportedTextExtensions = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'xml', 'yaml', 'yml', 'log', 'rtf']);

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function cleanHtml(source: string) {
  const document = new DOMParser().parseFromString(source, 'text/html');
  document.querySelectorAll('script,style,noscript').forEach(element => element.remove());
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function cleanRtf(source: string) {
  return source
    .replace(/\\'[0-9a-f]{2}/gi, '')
    .replace(/\\(?:par|line)\b ?/gi, '\n')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/\\\\/g, '\\')
    .trim();
}

async function readPdf(buffer: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const document = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => 'str' in item ? item.str : '').filter(Boolean).join(' '));
  }
  await loadingTask.destroy();
  return pages.join('\n\n');
}

async function readDocx(buffer: ArrayBuffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('This DOCX file does not contain a readable document.');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(document.getElementsByTagName('w:p')).map(paragraph => Array.from(paragraph.getElementsByTagName('w:t')).map(element => element.textContent || '').join('')).filter(Boolean).join('\n');
}

async function readSpreadsheet(buffer: ArrayBuffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationshipsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relationshipsXml) throw new Error('This XLSX file does not contain a readable workbook.');
  const workbook = new DOMParser().parseFromString(workbookXml, 'application/xml');
  const relationships = new DOMParser().parseFromString(relationshipsXml, 'application/xml');
  const relationshipTargets = new Map(Array.from(relationships.getElementsByTagName('Relationship')).map(item => [item.getAttribute('Id') || '', item.getAttribute('Target') || '']));
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const sharedStrings = sharedXml ? Array.from(new DOMParser().parseFromString(sharedXml, 'application/xml').getElementsByTagName('si')).map(item => Array.from(item.getElementsByTagName('t')).map(part => part.textContent || '').join('')) : [];
  const sheets: string[] = [];
  for (const sheet of Array.from(workbook.getElementsByTagName('sheet'))) {
    const name = sheet.getAttribute('name') || 'Sheet';
    const relationshipId = sheet.getAttribute('r:id') || '';
    const target = relationshipTargets.get(relationshipId);
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetXml = await zip.file(path)?.async('string');
    if (!sheetXml) continue;
    const xml = new DOMParser().parseFromString(sheetXml, 'application/xml');
    const rows = Array.from(xml.getElementsByTagName('row')).map(row => {
      const cells: string[] = [];
      for (const cell of Array.from(row.getElementsByTagName('c'))) {
        const reference = cell.getAttribute('r') || '';
        const column = reference.match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
        const columnIndex = Array.from(column).reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0) - 1;
        const valueNode = cell.getElementsByTagName('v')[0];
        const inlineNode = cell.getElementsByTagName('is')[0];
        const raw = valueNode?.textContent || (inlineNode ? Array.from(inlineNode.getElementsByTagName('t')).map(part => part.textContent || '').join('') : '');
        const value = cell.getAttribute('t') === 's' ? sharedStrings[Number(raw)] || '' : raw;
        cells[columnIndex] = value;
      }
      return cells.map(value => value ?? '').join('\t');
    });
    sheets.push(`## ${name}\n${rows.join('\n')}`);
  }
  if (!sheets.length) throw new Error('No readable sheets were found in this XLSX file.');
  return sheets.join('\n\n');
}

async function readPresentation(buffer: ArrayBuffer) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  const content: string[] = [];
  for (const name of slides) {
    const xml = await zip.file(name)?.async('string');
    if (!xml) continue;
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const text = Array.from(document.getElementsByTagName('a:t')).map(element => element.textContent || '').join(' ');
    if (text.trim()) content.push(`## ${name.match(/slide\d+/)?.[0]}\n${text.trim()}`);
  }
  return content.join('\n\n');
}

export async function readContextFile(file: File): Promise<string> {
  const extension = extensionOf(file.name);
  const buffer = await file.arrayBuffer();
  if (supportedTextExtensions.has(extension)) {
    const text = new TextDecoder().decode(buffer);
    return extension === 'html' || extension === 'htm' ? cleanHtml(text) : extension === 'rtf' ? cleanRtf(text) : text;
  }
  if (extension === 'pdf') return readPdf(buffer);
  if (extension === 'docx') return readDocx(buffer);
  if (extension === 'xlsx') return readSpreadsheet(buffer);
  if (extension === 'pptx') return readPresentation(buffer);
  throw new Error(`Unsupported file type: .${extension || 'unknown'}. Use TXT, MD, CSV, TSV, JSON, HTML, XML, YAML, RTF, PDF, DOCX, XLSX, or PPTX.`);
}

export const contextFileAccept = '.txt,.md,.markdown,.csv,.tsv,.json,.html,.htm,.xml,.yaml,.yml,.log,.rtf,.pdf,.docx,.xlsx,.pptx';
export const maxContextFileBytes = 20 * 1024 * 1024;
export const maxContextCharacters = 200_000;
