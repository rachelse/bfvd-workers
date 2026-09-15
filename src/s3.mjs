// S3 access for the BFVD worker, replacing the R2 binding (env.MY_BUCKET).
//
// Mirrors the already-migrated Foldseek worker: the `steineggerlab` bucket is
// publicly readable and listable, so there is no SigV4 signing and no
// credentials. PREFIX scopes BFVD inside the bucket that Foldseek shares.

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

export function decodeXml(s) {
  return s.replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g, (m, dec, hex) => {
    if (dec) return String.fromCodePoint(parseInt(dec, 10));
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return XML_ENTITIES[m];
  });
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function s3Host(env) {
  if (env.S3_HOST) return env.S3_HOST;
  // Without this the URL becomes https://undefined.s3.amazonaws.com/, which AWS
  // answers with a bare 403 AccessDenied -- easy to misread as a bucket policy
  // problem rather than missing config.
  if (!env.S3_BUCKET) {
    throw new Error('S3_BUCKET is not set: add a [vars] block to wrangler.toml');
  }
  return `https://${env.S3_BUCKET}.s3.amazonaws.com`;
}

export function s3Prefix(env) {
  const p = env.S3_PREFIX ?? 'bfvd/';
  return p && !p.endsWith('/') ? p + '/' : p;
}

// key is bucket-relative to PREFIX, e.g. "latest/msa.tar".
export function s3Url(env, key) {
  const path = key.split('/').map(encodeURIComponent).join('/');
  return `${s3Host(env)}/${s3Prefix(env)}${path}`;
}

export function s3Get(env, key, { range, conditional, cf } = {}) {
  const headers = new Headers();
  if (range) headers.set('Range', range);
  if (conditional) {
    for (const h of ['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since']) {
      const v = conditional.get(h);
      if (v) headers.set(h, v);
    }
  }
  return fetch(s3Url(env, key), cf ? { method: 'GET', headers, cf } : { method: 'GET', headers });
}

export function s3Head(env, key) {
  return fetch(s3Url(env, key), { method: 'HEAD' });
}

// --- ListObjectsV2 -----------------------------------------------------------
// Workers have no DOMParser, so the fields are pulled out of the XML by hand.

function parseContents(xml, prefix) {
  const objects = [];
  const contents = /<Contents>([\s\S]*?)<\/Contents>/g;
  let m;
  while ((m = contents.exec(xml)) !== null) {
    const chunk = m[1];
    const key = chunk.match(/<Key>([\s\S]*?)<\/Key>/);
    const size = chunk.match(/<Size>(\d+)<\/Size>/);
    const modified = chunk.match(/<LastModified>([^<]*)<\/LastModified>/);
    if (!key || !size || !modified) continue;
    const full = decodeXml(key[1]);
    if (full.endsWith('/')) continue;                 // zero-byte folder placeholder
    objects.push({
      key: full.slice(prefix.length),
      size: Number(size[1]),
      uploaded: new Date(modified[1]),
    });
  }
  return objects;
}

function parsePrefixes(xml, prefix) {
  const out = [];
  const re = /<CommonPrefixes>[\s\S]*?<Prefix>([\s\S]*?)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXml(m[1]).slice(prefix.length));
  }
  return out;
}

function nextContinuationToken(xml) {
  if (!/<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml)) return null;
  const token = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
  return token ? decodeXml(token[1]) : null;
}

// `sub` is appended to PREFIX, e.g. sub="latest/" lists bfvd/latest/*.
// delimiter:"/" makes S3 return folder names in CommonPrefixes instead of
// every key underneath, which is what the archive listing needs.
export async function s3List(env, { sub = '', delimiter = '', cacheTtl = 300 } = {}) {
  const prefix = s3Prefix(env) + sub;
  const objects = [];
  const prefixes = [];
  let token = null;

  for (let page = 0; page < 50; page++) {
    const url = new URL(s3Host(env));
    url.searchParams.set('list-type', '2');
    url.searchParams.set('prefix', prefix);
    if (delimiter) url.searchParams.set('delimiter', delimiter);
    url.searchParams.set('max-keys', '1000');
    if (token) url.searchParams.set('continuation-token', token);

    const response = await fetch(url.toString(), { cf: { cacheTtl, cacheEverything: true } });
    if (!response.ok) {
      // Include the URL and S3's own <Code>/<Message>: a bare status is not
      // enough to tell a wrong bucket from a wrong prefix from a real denial.
      const body = await response.text().catch(() => '');
      const code = body.match(/<Code>([^<]*)<\/Code>/)?.[1] ?? '';
      const msg = body.match(/<Message>([^<]*)<\/Message>/)?.[1] ?? body.slice(0, 200);
      throw new Error(`S3 list failed: ${response.status} ${code} ${msg} [${url.toString()}]`);
    }
    const xml = await response.text();

    objects.push(...parseContents(xml, prefix));
    prefixes.push(...parsePrefixes(xml, prefix));
    token = nextContinuationToken(xml);
    if (!token) break;
  }

  objects.sort((a, b) => a.key.localeCompare(b.key));
  prefixes.sort((a, b) => a.localeCompare(b));
  return { objects, prefixes };
}
