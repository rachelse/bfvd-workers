import { s3Get, s3Head, s3List, escapeHtml } from './s3.mjs';

const PASS_THROUGH = [
  'content-type', 'content-length', 'content-encoding', 'content-range',
  'etag', 'last-modified', 'accept-ranges', 'cache-control',
];

function authorizeRequest(request) {
  switch (request.method) {
    case 'HEAD':
    case 'GET':
      return true;
    default:
      return false;
  }
}

// `latest/` may be a real folder of copies, or LATEST_PREFIX may point at the
// current version folder so nothing has to be duplicated in S3.
function resolveKey(env, key) {
  const latest = env.LATEST_PREFIX || 'latest';
  return latest === 'latest' ? key : key.replace(/^latest\//, latest.replace(/\/$/, '') + '/');
}

function humanFileSize(bytes, si = false, dp = 1) {
  const thresh = si ? 1e3 : 1024;
  if (Math.abs(bytes) < thresh) return bytes + ' B';
  const units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let u = -1;
  const r = 10 ** dp;
  do { bytes /= thresh; ++u; }
  while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
  return bytes.toFixed(dp) + ' ' + units[u];
}

function autoIndex(base, release, latestObjects, versionPrefixes) {
  let html = `
<html>
  <head>
    <title>BFVD ${escapeHtml(release)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://uniclust.mmseqs.com/css/uniclust.css?v=2" type="text/css">
  </head>
  <body>
  <nav class="navbar navbar-default navbar-fixed-top">
    <div class="container">
      <div class="navbar-header">
        <a class="navbar-brand" href="https://bfvd.foldseek.com/" style="width:200px">
          <span>BFVD</span>
        </a>
      </div>
        <div id="navbar">
            <ul class="nav navbar-nav">
                <li><a rel="external noopener" target="_blank" href="https://steineggerlab.com/en/">Steinegger Lab</a></li>
            </ul>
        </div>
    </div>
  </nav>
  <div class="container">
  <div class="row download">
  <div class="col-xs-12">
  <div class="table-responsive">
  <table id="indexlist">
    <thead>
      <tr id="indexhead">
        <th>Name</th>
        <th>Uploaded</th>
        <th>Size</th>
      </tr>
    </thead>
    <tbody>`;

  for (const obj of latestObjects) {
    const displayName = obj.key.replace(/^[^/]+\//, '');
    html += `
      <tr>
        <td><a href="${escapeHtml(base + obj.key.split('/').map(encodeURIComponent).join('/'))}" target="_blank">${escapeHtml(displayName)}</a></td>
        <td>${obj.uploaded.toUTCString()}</td>
        <td>${humanFileSize(obj.size)}</td>
      </tr>`;
  }

  for (const folder of versionPrefixes) {
    html += `
    <tr>
      <td><a href="${escapeHtml(base + '?versions=' + encodeURIComponent(folder))}"> archived/${escapeHtml(folder)}</a></td>
      <td></td>
      <td></td>
    </tr>`;
  }

  html += `
    </tbody>
  </table>
  </div>
  <div class="col-xs-12">
    <h3>Readme</h3>
    <p>
    The Big Fantastic Virus Database (BFVD) is a repository of 5,776,417 viral protein
    structures predicted with ColabFold-AlphaFold2. BFVD v3 covers 98.9% of the viral
    sequences in UniProt 2025_03, fully covers 72.6% of viral reference proteomes, and
    spans 72.7% of ICTV-recognized virus species, with 75.3% of entries predicted at
    high confidence (pLDDT &ge; 70).
    </p>
    <p>
    <a href="https://doi.org/10.1093/nar/gkae1119">Kim R, Levy Karin E, Steinegger M. BFVD - a large repository of predicted viral protein structures Nucleic Acids Research doi: doi.org/10.1093/nar/gkae1119 (2024)</a>
    <div style="text-align:center;">
    <img src="https://raw.githubusercontent.com/sokrypton/ColabFold/main/.github/ColabFold_Marv_Logo.png" alt="ColabFold Marv" style="max-width: 25%; height: auto;">
    </div>
    <h3>Updates</h3>
    <p>
      <ul>
      <li><strong>2024-09-04:</strong> First distribution of BFVD.</li>
      <li><strong>2024-11-01 (2023_02_v1):</strong> 175,454 Base-MSA & 175,788 Base+Logan-MSA</br>
                  Of the 351,242 BFVD entries initially predicted with a base multiple sequence alignment (base-MSA), 175,788 lacked detectable homologs.
                  For these, we augmented the alignments using Logan's large-scale assemblies, reinforcing nearly half of all BFVD entries.</li>
      <li><strong>2025-03-17 (2023_02_v2):</strong> 205,681 Base-MSA & 37,296 Base+Logan-MSA & 108,265 Base+Logan-MSA + 12-recycles</br>
                  Of the 351,242 BFVD entries, 175,788 lacked identifiable homologs in their base MSAs. The remaining entries, which had sufficient homologs, were left unchanged.
                  For those insufficient homologs, we augmented the alignments using Logan-based data and performed 12-cycle predictions. 
                  This process generated three versions for each affected entry: (1) Base-MSA, (2) Base+Logan-MSA, and (3) Base+Logan-MSA & 12-recycles.
                  Finally, we kept the best-scoring model (based on pLDDT) for each entry.</li>
      <li><strong>2026-09-15 (2025_03_v3):</strong> 5,776,417 structures, a 16.4-fold increase over v2.</br>
                  Predicted for individual UniProt 2025_03 viral sequences (&le;2,000 residues)
                  rather than for UniRef30 cluster representatives.
                  Every entry was predicted from a Base+Logan50-MSA.</li>
      </ul>
    </p>
    </p>
    <h3>Availability</h3>
    <p>
      <ul>
        <li>BFVD is browsable with UniProt accessions through <a href="https://bfvd.foldseek.com/">website</a></li>
        <li>BFVD is searchable through <a href="https://search.foldseek.com/search">Foldseek webserver</a></li>
        <li>Scripts for BFVD analyses are available at <a href=" https://doi.org/10.5281/zenodo.13992244">Zenodo</a></li>
        <li>PDB files of BFVD are also available at <a href=" https://doi.org/10.5281/zenodo.13993144">Zenodo</a></li>
      </ul>
    </p>
    </p>
    <h3>Data description</h3>  
    <p>
    Files below are those published for the current release (${escapeHtml(release)}).
    Earlier releases are under <i>archived/</i> and contain a different set of files.
    </p>
    <p>
    <b>1-bfvd_v3_pdbs.tar.zst</b>: 5,776,417 predicted structures of BFVD, as PDB files.</br>
    <b>2-bfvd.version</b>: version file.</br>
    <b>3-bfvd_foldseekdb.tar.gz</b>: Foldseek database of 5,776,417 predicted structures of BFVD.</br>
    <b>4-bfvd_v3_metadata.tsv.tar.gz</b>: General information of each entry.</br>
      <ol>
        <li><strong>accession</strong>: UniProt accession of the sequence</li>
        <li><strong>protein_name</strong>: Protein name from UniProt</li>
        <li><strong>length</strong>: Number of modelled residues</li>
        <li><strong>plddt</strong>: Average pLDDT score of the predicted protein structure</li>
        <li><strong>ptm</strong>: pTM score of the predicted protein structure (NA for ProteinTTT models)</li>
        <li><strong>model</strong>: Prediction method used for the released structure (ColabFold-AF2 or ProteinTTT)</li>
        <li><strong>basemsa</strong>: Number of sequences in the base MSA</li>
        <li><strong>loganmsa</strong>: Number of sequences in the MSA after adding Logan50 homologs</li>
        <li><strong>taxid</strong>: Taxonomy identifier of the protein</li>
        <li><strong>taxname</strong>: Scientific name of the taxonomy identifier</li>
        <li><strong>ictv_id</strong>: ICTV identifier mapped from the taxonomy identifier</li>
        <li><strong>uniprot_host</strong>: Host organism retrieved by UniProt</li>
        <li><strong>ictv_host_category</strong>: ICTV host category</li>
        <li><strong>proteome_id</strong>: UniProt proteome(s) the entry belongs to, separated by ';'</li>
      </ol>
      Absent values are given as NA.</br>
    <b>5-bfvd_v3_taxID_rank_scientificname_lineage.tsv.tar.gz</b>: BFVD entry and their taxonomic information.</br>
      <ol>
        <li><strong>model</strong>: File name of the BFVD.</li>
        <li><strong>taxId</strong>: Taxonomy identifier of the protein.</br>The protein ID, the portion before the first underscore in model, was used to retrieve the taxonomy ID.</li>
        <li><strong>rank</strong>: rank of the taxonomy.</li>
        <li><strong>scientific name</strong>: scientific name of the corresponding taxonomy identifier.</li>
        <li><strong>lineage</strong>: lineage of the taxonomy.</li>
      </ol>
    </p>
  </div>
  </div>
  <div class="col-xs-12">
        <h3>License</h3>
        <p>All files are available under a <a href="https://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.</p>
  </div>
  </div>
  </div>
  </body>
</html>`;
  return html;
}

function autoIndexVersions(base, version, fileObjects) {
  let html = `
<html>
  <head>
    <title>BFVD</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://uniclust.mmseqs.com/css/uniclust.css?v=2" type="text/css">
  </head>
  <body>
    <div class="container" style="margin-top: 50px;">
      <h1>BFVD ${escapeHtml(version)}</h1>
      <div class="table-responsive">
      <table id="indexlist" class="table table-striped table-bordered table-hover">
        <thead>
          <tr>
            <th>Name</th>
            <th>Uploaded</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>`;
  for (const obj of fileObjects) {
    html += `
    <tr>
      <td><a href="${escapeHtml(base + obj.key.split('/').map(encodeURIComponent).join('/'))}" download>${escapeHtml(obj.key)}</a></td>
      <td>${obj.uploaded.toUTCString()}</td>
      <td>${humanFileSize(obj.size)}</td>
    </tr>`;
  }
  html += `
        </tbody>
      </table>
      </div>
    </div>
  </body>
</html>`;
  return html;
}

const DBS = {
  pdb: { tar: 'latest/bfvd_indexed.tar', index: 'latest/bfvd_indexed.tar.index', mime: 'chemical/x-pdb' },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function loadIndex(env, indexKey) {
  const res = await s3Get(env, indexKey, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error(`index fetch failed for ${indexKey}: ${res.status}`);
  const text = await res.text();
  return text.split('\n').filter((line) => line.trim() !== '');
}

function binarySearchIndex(lines, targetId) {
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const [idPart, fileOffsetStr, contentLengthStr] = lines[mid].split('\t');
    if (!idPart || !fileOffsetStr || !contentLengthStr) {
      throw new Error(`Malformed line in index file at line ${mid + 1}`);
    }
    if (idPart === targetId) {
      const fileContentOffset = parseInt(fileOffsetStr, 10);
      const contentLength = parseInt(contentLengthStr, 10);
      if (isNaN(fileContentOffset) || isNaN(contentLength)) {
        throw new Error(`Invalid offset or length for id ${idPart} in index file`);
      }
      return { fileContentOffset, contentLength };
    }
    if (idPart < targetId) low = mid + 1;
    else high = mid - 1;
  }
  return null;
}

async function handleDbRequest(request, env, ctx, type, id_part) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const db = DBS[type];
  const tarKey = resolveKey(env, db.tar);
  const indexKey = resolveKey(env, db.index);

  // Version-scoped cache key: bumping DATA_VERSION invalidates the whole
  // cache on release, without a Cloudflare cache purge.
  const cacheKey = new Request(
    `https://db.bfvd.internal/${env.DATA_VERSION}/${type}/${encodeURIComponent(id_part)}`);

  let response = await caches.default.match(cacheKey);
  if (response) {
    response = new Response(response.body, { ...response, encodeBody: 'manual' });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Content-Type', db.mime);
    response.headers.set('Content-Encoding', 'gzip');
    return response;
  }

  try {
    const lines = await loadIndex(env, indexKey);
    const entry = binarySearchIndex(lines, id_part) || binarySearchIndex(lines, id_part + '_1');
    if (!entry) {
      return new Response('File not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const { fileContentOffset, contentLength } = entry;
    const res = await s3Get(env, tarKey, {
      range: `bytes=${fileContentOffset}-${fileContentOffset + contentLength - 1}`,
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`tar range read failed for ${tarKey}: ${res.status}`);
    }
    const body = await res.arrayBuffer();

    response = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': db.mime,
        'Content-Encoding': 'gzip',
        'Content-Length': contentLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
      encodeBody: 'manual',
    });
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error(error);
    return new Response('Internal Server Error', {
      status: 500, headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
}

function passThroughHeaders(upstream) {
  const headers = new Headers();
  for (const h of PASS_THROUGH) {
    const v = upstream.headers.get(h);
    if (v !== null) headers.set(h, v);
  }
  headers.set('Access-Control-Allow-Origin', '*');
  return headers;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const base = url.origin + '/';

    // Only /pdb/ is served per-entry. msa/cif/pae are bulk downloads; their
    // .index files are published but not used by the worker.
    const match = url.pathname.match(/^\/(pdb)\//);
    if (match) {
      const type = match[1];
      const id_part = url.pathname.slice(`/${type}/`.length).replace(`.${type}`, '');
      return await handleDbRequest(request, env, ctx, type, id_part);
    }

    if (url.searchParams.has('versions')) {
      const version = url.searchParams.get('versions').replace(/\/$/, '');
      const { objects } = await s3List(env, { sub: version + '/' });
      // Not stored in the Cache API: the page is cheap to render and the S3
      // listing beneath it is already edge-cached, whereas a cached page
      // survives a deploy and hides HTML changes.
      const headers = new Headers({
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'public, max-age=60',
      });
      return new Response(autoIndexVersions(base, version, objects), { headers, status: 200 });
    }

    let key = url.pathname.slice(1);
    if (key === 'bfvd.tar.gz' || key === 'bfvd.version' || key === 'bfvd_foldseekdb.tar.gz') {
      key = 'latest/' + key;
    }

    if (!authorizeRequest(request)) return new Response('Forbidden', { status: 403 });

    if (key === '' && request.method === 'GET') {
      // Two exact listings instead of filtering a capped 100-key page:
      // everything under the current version, and the top-level folders.
      const release = (env.LATEST_PREFIX || 'latest').replace(/\/$/, '');
      const latestPrefix = release + '/';
      const [latest, top] = await Promise.all([
        s3List(env, { sub: latestPrefix }),
        s3List(env, { delimiter: '/' }),
      ]);
      const folders = top.prefixes
        .map((p) => p.replace(/\/$/, ''))
        .filter((p) => p !== latestPrefix.replace(/\/$/, ''))
        .sort();
      const latestObjects = latest.objects.map((o) => ({ ...o, key: latestPrefix + o.key }));
      const headers = new Headers({
        'content-type': 'text/html;charset=UTF-8',
        'cache-control': 'public, max-age=60',
      });
      return new Response(autoIndex(base, release, latestObjects, folders), { headers, status: 200 });
    }

    const s3key = resolveKey(env, key);

    if (request.method === 'HEAD') {
      const res = await s3Head(env, s3key);
      if (!res.ok) return new Response('Object Not Found', { status: 404 });
      return new Response(null, { headers: passThroughHeaders(res) });
    }

    // Range and conditional headers are forwarded to S3 verbatim; S3 answers
    // with 206/304 itself, so the old hand-rolled parseRange is gone.
    const res = await s3Get(env, s3key, {
      range: request.headers.get('range') || undefined,
      conditional: request.headers,
    });

    if (res.status === 404) return new Response(`Object Not Found: ${key}`, { status: 404 });
    if (res.status === 304) return new Response(null, { status: 304, headers: passThroughHeaders(res) });
    if (!res.ok && res.status !== 206) {
      console.error(`S3 get failed for ${s3key}: ${res.status}`);
      return new Response('Internal Server Error', { status: 500 });
    }

    return new Response(res.body, { status: res.status, headers: passThroughHeaders(res) });
  },
};
