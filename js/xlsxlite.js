/**
 * A minimal, dependency-free .xlsx reader/writer.
 *
 * Why hand-rolled: this app has no build step and no package manager access at
 * deploy time (it's a plain set of static files served from GitHub Pages), so there
 * is no reliable way to vendor a third-party library like SheetJS. This file covers
 * exactly what the Bulk Upload feature needs - a single-sheet grid of text/number
 * cells - using only standard browser APIs:
 *   - Blob/ArrayBuffer for building and reading the .xlsx zip container
 *   - DecompressionStream('deflate-raw') to inflate the compressed entries Excel
 *     writes when it saves a file you've edited (Chrome/Edge 80+, Firefox 113+)
 *   - DOMParser to read the worksheet XML
 * It does not attempt to be a general xlsx library - no formulas, styles, multiple
 * sheets, merged cells, dates, etc. - only what's needed to round-trip a simple table.
 */

// ---------- WRITING ----------

/**
 * Builds a single-sheet .xlsx as a Blob from a header row + data rows.
 * @param {string[]} headers
 * @param {Array<Array<string|number>>} rows
 * @returns {Blob}
 */
export function writeSimpleXlsx(headers, rows) {
  const allRows = [headers, ...rows];
  const sheetXml = buildSheetXml(allRows);

  const files = [
    { name: '[Content_Types].xml', data: strToBytes(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: strToBytes(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: strToBytes(WORKBOOK_XML) },
    { name: 'xl/_rels/workbook.xml.rels', data: strToBytes(WORKBOOK_RELS_XML) },
    { name: 'xl/styles.xml', data: strToBytes(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: strToBytes(sheetXml) }
  ];

  return buildZipBlob(files);
}

function buildSheetXml(allRows) {
  const rowsXml = allRows.map((row, ri) => {
    const cells = row.map((val, ci) => {
      const ref = colLetter(ci) + (ri + 1);
      if (val === '' || val === null || val === undefined) return '';
      if (typeof val === 'number' && isFinite(val)) {
        return `<c r="${ref}"><v>${val}</v></c>`;
      }
      const num = Number(val);
      if (val !== '' && !isNaN(num) && String(val).trim() !== '') {
        return `<c r="${ref}"><v>${num}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(val))}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowsXml}</sheetData></worksheet>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

function colLetter(index) {
  let n = index + 1, s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function strToBytes(s) {
  return new TextEncoder().encode(s);
}

// ---------- ZIP CONTAINER (write: stored/uncompressed - no compression code needed) ----------

function buildZipBlob(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((f) => {
    const nameBytes = strToBytes(f.name);
    const crc = crc32(f.data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length),
      u16(nameBytes.length), u16(0), nameBytes, f.data
    ]);
    chunks.push(local);

    central.push({
      nameBytes, crc, size: f.data.length, offset
    });
    offset += local.length;
  });

  const centralStart = offset;
  central.forEach((c) => {
    const rec = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.size), u32(c.size),
      u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0),
      u32(c.offset), c.nameBytes
    ]);
    chunks.push(rec);
    offset += rec.length;
  });
  const centralSize = offset - centralStart;

  const eocd = concatBytes([
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(centralSize), u32(centralStart), u16(0)
  ]);
  chunks.push(eocd);

  return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; }
function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); return b; }
function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------- READING ----------

/**
 * Reads the first worksheet of a .xlsx File/Blob back into a table.
 * @param {File|Blob} file
 * @returns {Promise<{headers: string[], rows: Array<Object>}>} rows are objects keyed
 *   by the header text found in row 1 (matching header text to source column position,
 *   the same approach used elsewhere in this project for reading irregular spreadsheets).
 */
export async function readSimpleXlsx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = parseZipCentralDirectory(buf);

  const sheetEntry = entries.find((e) => /^xl\/worksheets\/sheet\d*\.xml$/i.test(e.name));
  if (!sheetEntry) throw new Error('This does not look like a valid .xlsx file (no worksheet found inside it).');

  const sharedStringsEntry = entries.find((e) => e.name.toLowerCase() === 'xl/sharedstrings.xml');
  const sharedStrings = sharedStringsEntry ? parseSharedStrings(await extractEntry(buf, sharedStringsEntry)) : [];

  const sheetXml = new TextDecoder('utf-8').decode(await extractEntry(buf, sheetEntry));
  const grid = parseSheetXml(sheetXml, sharedStrings);

  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => (h === undefined || h === null ? '' : String(h).trim()));
  const rows = grid.slice(1)
    .filter((r) => r.some((v) => v !== undefined && v !== null && String(v).trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] === undefined ? '' : r[i]; });
      return obj;
    });
  return { headers, rows };
}

// ---- ZIP reading ----

function parseZipCentralDirectory(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Find End Of Central Directory (search back from the end; comment is normally empty)
  let eocdOffset = -1;
  const maxBack = Math.min(buf.length, 66000);
  for (let i = buf.length - 22; i >= buf.length - maxBack && i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset === -1) throw new Error('This does not look like a valid .xlsx file (zip end marker not found).');

  const totalEntries = dv.getUint16(eocdOffset + 10, true);
  const centralOffset = dv.getUint32(eocdOffset + 16, true);

  const entries = [];
  let p = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder('utf-8').decode(buf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function extractEntry(buf, entry) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const lp = entry.localOffset;
  if (dv.getUint32(lp, true) !== 0x04034b50) throw new Error('Corrupt .xlsx file (bad local file header).');
  const nameLen = dv.getUint16(lp + 26, true);
  const extraLen = dv.getUint16(lp + 28, true);
  const dataStart = lp + 30 + nameLen + extraLen;
  const compData = buf.subarray(dataStart, dataStart + entry.compSize);

  if (entry.method === 0) return compData;
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read compressed Excel files (needs a recent Chrome or Edge). Try re-saving the file, or use a Chromium-based browser.');
    }
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([compData]).stream().pipeThrough(ds);
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  }
  throw new Error('Unsupported compression method in .xlsx file (' + entry.method + ').');
}

// ---- XML reading ----

function parseSharedStrings(bytes) {
  const xml = new TextDecoder('utf-8').decode(bytes);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName('si')).map((si) => {
    const parts = Array.from(si.getElementsByTagName('t')).map((t) => t.textContent || '');
    return parts.join('');
  });
}

function parseSheetXml(xml, sharedStrings) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const rowsEl = Array.from(doc.getElementsByTagName('row'));
  const grid = [];

  rowsEl.forEach((rowEl) => {
    const rowNum = parseInt(rowEl.getAttribute('r'), 10) - 1;
    const rowArr = grid[rowNum] || (grid[rowNum] = []);
    Array.from(rowEl.getElementsByTagName('c')).forEach((cellEl) => {
      const ref = cellEl.getAttribute('r') || '';
      const m = /^([A-Z]+)(\d+)$/.exec(ref);
      const colIdx = m ? colIndex(m[1]) : rowArr.length;
      const type = cellEl.getAttribute('t');
      let value;
      if (type === 'inlineStr') {
        const isEl = cellEl.getElementsByTagName('is')[0];
        value = isEl ? (isEl.textContent || '') : '';
      } else if (type === 's') {
        const vEl = cellEl.getElementsByTagName('v')[0];
        const idx = vEl ? parseInt(vEl.textContent, 10) : -1;
        value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
      } else if (type === 'str' || type === 'b') {
        const vEl = cellEl.getElementsByTagName('v')[0];
        value = vEl ? vEl.textContent : '';
      } else {
        const vEl = cellEl.getElementsByTagName('v')[0];
        value = vEl ? Number(vEl.textContent) : '';
      }
      rowArr[colIdx] = value;
    });
  });

  return grid.map((r) => r || []);
}

function colIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
