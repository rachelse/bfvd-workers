// Binary search over a sorted `<db>.tar.index` held in S3, using HTTP range
// requests instead of downloading the whole file.
//
// The R2 version read the entire index into memory on every cache miss. With
// BFVD v2 (5.7M entries, ~170 MB index) that both exceeds the Worker's 128 MB
// memory limit and bills a full index download of S3 egress per request.
// Here a lookup costs ~log2(size/64KiB) ~= 12 range reads of 64 KiB.
//
// Reads are aligned to a fixed 64 KiB grid and cached in the Cloudflare Cache
// API, so the upper levels of the search tree (which every lookup shares, the
// first probe being the same block for all keys) are served from cache.

import { s3Get } from './s3.mjs';

const CHUNK = 1 << 16;            // 64 KiB
const MAX_LINE = 1 << 22;         // sanity cap when a line straddles blocks
const DEC = new TextDecoder();

// Per-isolate memo of index file sizes. Safe to be stale only within an
// isolate's lifetime; DATA_VERSION scopes the durable cache below.
const sizeMemo = new Map();

export async function indexSize(env, key) {
  const memoKey = `${env.DATA_VERSION}/${key}`;
  if (sizeMemo.has(memoKey)) return sizeMemo.get(memoKey);

  // A one-byte range probe rather than HEAD: content-range carries the total
  // size, and it does not depend on content-length surviving a HEAD subrequest.
  const res = await s3Get(env, key, { range: 'bytes=0-0' });
  if (res.status !== 206) {
    throw new Error(`index size probe for ${key}: expected 206, got ${res.status}`);
  }
  const cr = res.headers.get('content-range');
  await res.arrayBuffer();                       // drain the 1-byte body
  const m = cr && cr.match(/\/(\d+)\s*$/);
  if (!m) throw new Error(`index size probe for ${key}: bad content-range ${JSON.stringify(cr)}`);
  const size = Number(m[1]);
  if (!Number.isFinite(size) || size <= 0) throw new Error(`index size probe for ${key}: size ${size}`);
  sizeMemo.set(memoKey, size);
  return size;
}

// One CHUNK-aligned block, via the Cache API. Cache keys carry DATA_VERSION so
// publishing a new release invalidates every cached block without a purge.
async function block(env, key, size, i, ctx) {
  const start = i * CHUNK;
  if (start >= size) return new Uint8Array(0);
  const len = Math.min(CHUNK, size - start);

  const cacheKey = new Request(
    `https://index.bfvd.internal/${env.DATA_VERSION}/${encodeURIComponent(key)}/${i}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return new Uint8Array(await hit.arrayBuffer());

  const res = await s3Get(env, key, { range: `bytes=${start}-${start + len - 1}` });
  if (res.status !== 206 && res.status !== 200) {
    throw new Error(`index range read failed for ${key}: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  // 206 responses cannot be stored by the Cache API; re-wrap as a plain 200.
  ctx.waitUntil(caches.default.put(cacheKey, new Response(buf, {
    status: 200,
    headers: { 'cache-control': 'public, max-age=31536000, immutable' },
  })));
  return new Uint8Array(buf);
}

// A reader is { size, block(i) } over a CHUNK-aligned grid. The S3-backed one
// is built by s3Reader(); tests supply an in-memory one.
export function s3Reader(env, key, size, ctx) {
  return { size, block: (i) => block(env, key, size, i, ctx) };
}

async function readSpan(reader, pos, want) {
  const size = reader.size;
  const parts = [];
  let got = 0;
  let i = Math.floor(pos / CHUNK);
  let skip = pos - i * CHUNK;
  while (got < want && i * CHUNK < size) {
    const b = await reader.block(i);
    if (b.length === 0) break;
    const slice = b.subarray(skip, Math.min(b.length, skip + (want - got)));
    parts.push(slice);
    got += slice.length;
    skip = 0;
    i++;
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// Byte scanning avoids decoding a whole 64 KiB window per probe; only the one
// line that is actually compared gets decoded.
function nlIndex(bytes, from) {
  for (let i = from; i < bytes.length; i++) if (bytes[i] === 10) return i;
  return -1;
}

// The first complete line starting at or after `pos`.
// `atLineStart` asserts pos is itself a line boundary (no partial line to skip).
// Returns { start, next, line } or null when pos falls inside the final line.
async function lineAt(reader, pos, atLineStart) {
  const size = reader.size;
  // Ask only for the remainder of the block `pos` falls in. A full CHUNK from an
  // unaligned pos always straddles two blocks and doubles the request count;
  // index lines are ~28 bytes, so one block almost always suffices.
  let want = CHUNK - (pos % CHUNK);
  for (;;) {
    const bytes = await readSpan(reader, pos, want);
    const eof = pos + bytes.length >= size;

    let s = 0;
    if (pos > 0 && !atLineStart) {
      const nl = nlIndex(bytes, 0);
      if (nl === -1) {
        if (eof) return null;
        want *= 4;
        if (want >= MAX_LINE) throw new Error('index line too long');
        continue;
      }
      s = nl + 1;
    }

    const e = nlIndex(bytes, s);
    if (e === -1) {
      if (eof) {
        return bytes.length > s
          ? { start: pos + s, next: size, line: DEC.decode(bytes.subarray(s)) }
          : null;
      }
      want *= 4;
      if (want >= MAX_LINE) throw new Error('index line too long');
      continue;
    }
    return { start: pos + s, next: pos + e + 1, line: DEC.decode(bytes.subarray(s, e)) };
  }
}

function parseLine(line, key) {
  const [id, offStr, lenStr] = line.split('\t');
  if (!id || offStr === undefined || lenStr === undefined) {
    throw new Error(`malformed line in index ${key}: ${JSON.stringify(line.slice(0, 80))}`);
  }
  const fileContentOffset = parseInt(offStr, 10);
  const contentLength = parseInt(lenStr, 10);
  if (!Number.isFinite(fileContentOffset) || !Number.isFinite(contentLength)) {
    throw new Error(`invalid offset/length for ${id} in ${key}`);
  }
  return { id, fileContentOffset, contentLength };
}

// Linear scan forward from `lo`, which must be a line start. The caller's
// invariant guarantees every line before `lo` sorts below `target`, so the
// first line with id >= target decides hit or miss.
async function scanFrom(reader, lo, target, key) {
  const size = reader.size;
  let want = Math.min(size - lo, CHUNK + 4096);
  for (;;) {
    const bytes = await readSpan(reader, lo, want);
    const eof = lo + bytes.length >= size;
    let s = 0;
    while (s < bytes.length) {
      let e = nlIndex(bytes, s);
      if (e === -1) {
        if (!eof) break;             // partial line: refetch a larger window
        e = bytes.length;
      }
      const line = DEC.decode(bytes.subarray(s, e));
      const id = line.split('\t')[0];
      if (id === target) return parseLine(line, key);
      if (id > target) return null;
      s = e + 1;
    }
    if (eof) return null;
    want *= 4;
    if (want >= MAX_LINE) throw new Error(`index ${key} appears unsorted near byte ${lo}`);
  }
}

// Byte-offset binary search, narrowing to a window of one block and then
// scanning it. `lo` is always a line start (0, or the end of a line that
// sorted below the target), which is what makes the final scan correct.
// Iterations are logarithmic in blocks, not bytes: ~12 probes for a 170 MB index.
export async function searchIndex(reader, target, key = 'index') {
  const size = reader.size;
  let lo = 0, hi = size;

  while (hi - lo > CHUNK) {
    const mid = Math.floor((lo + hi) / 2);
    const rec = await lineAt(reader, mid, mid === 0);
    if (!rec) { hi = mid; continue; }          // mid fell inside the final line
    const id = rec.line.split('\t')[0];
    if (id === target) return parseLine(rec.line, key);
    if (id < target) lo = rec.next; else hi = mid;
  }

  return lo < size ? scanFrom(reader, lo, target, key) : null;
}

export async function lookup(env, key, target, ctx) {
  const size = await indexSize(env, key);
  return searchIndex(s3Reader(env, key, size, ctx), target, key);
}

export const _CHUNK = CHUNK;
