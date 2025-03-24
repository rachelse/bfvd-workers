// src/index.js
//var ALLOW_LIST = ["alphafold_swissprot.tar.gz", "alphafolddb.tar.gz", "pdb100.tar.gz", "pdb100.version"];

function parseRange(encoded) {
  if (encoded === null) {
    return
  }

  const parts = encoded.split("bytes=")[1]?.split("-") ?? []
  if (parts.length !== 2) {
    throw new Error('Not supported to skip specifying the beginning/ending byte at this time')
  }

  return {
    offset: Number(parts[0]),
    end:    Number(parts[1]),
    length: Number(parts[1]) + 1 - Number(parts[0]),
  }
}

function authorizeRequest(request, env, key) {
  switch (request.method) {
    case "HEAD":
    case "GET":
      //return ALLOW_LIST.includes(key);
      return true;
    default:
      return false;
  }
}

function humanFileSize(bytes, si=false, dp=1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  let u = -1;
  const r = 10**dp;

  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


  return bytes.toFixed(dp) + ' ' + units[u];
}

function autoIndex(objects) {
  let html = `
<html>
  <head>
    <title>BFVD</title>
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
  
  const foldersSet = new Set();
  for (let i in objects) {
    let obj = objects[i];

    if (obj.key.startsWith("latest/")) {
      const displayName = obj.key.replace(/^latest\//, "");
      html += `
      <tr>
        <td><a href="https://bfvd.steineggerlab.workers.dev/${obj.key}" download>${displayName}</a></td>
        <td>${obj.uploaded.toUTCString()}</td>
        <td>${humanFileSize(obj.size)}</td>
      </tr>`;
    } else {
      const parts = obj.key.split("/");
      if (parts.length > 1) {
        foldersSet.add(parts[0]);
      }
    }
  }

  const folders = Array.from(foldersSet).sort();

  folders.forEach(folder => {html += `
    <tr>
      <td><a href="https://bfvd.steineggerlab.workers.dev/${encodeURIComponent(folder)}" download>${folder}</a></td>
      <td></td>
      <td></td>
    </tr>`;});

  // objects.forEach(folder => {html += `<li><a href="/?version=${encodeURIComponent(folder)}">${folder}</a></li>`;});
  html += `
    </tbody>
  </table>
  </div>
  <div class="col-xs-12">
    <h3>Readme</h3>
    <p>
    The Big Fantastic Virus Database (BFVD) is a repository of 351,242 protein structures predicted by applying ColabFold to the viral sequence representatives of the UniRef30 clusters. 
    BFVD holds a unique repertoire of protein structures, spanning major viral clades.
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
                  For these, we augmented the alignments using Logan’s large-scale assemblies, reinforcing nearly half of all BFVD entries.</li>
      <li><strong>2025-03-17 (2023_02_v2):</strong> 205,681 Base-MSA & 37,296 Base+Logan-MSA & 108,265 Base+Logan-MSA + 12-recycles</br>
                  Of the 351,242 BFVD entries, 175,788 lacked identifiable homologs in their base MSAs. The remaining entries, which had sufficient homologs, were left unchanged.
                  For those insufficient homologs, we augmented the alignments using Logan-based data and performed 12-cycle predictions. 
                  This process generated three versions for each affected entry: (1) Base-MSA, (2) Base+Logan-MSA, and (3) Base+Logan-MSA & 12-recycles.
                  Finally, we kept the best-scoring model (based on pLDDT) for each entry.</li>
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
    <b>1-bfvd.tar.gz</b>: 351,242 predicted structures of BFVD.</br>
    <b>2-bfvd.version</b>: version file.</br>
    <b>3-bfvd_foldcompdb.tar.gz</b>: Compressed version of Foldseek database using Foldcomp.</br>
        Only 347,481 structures, none of which are discontinuous, were included.</br>
    <b>4-bfvd_foldseekdb.tar.gz</b>: Foldseek databse of 351,242 predicted structures of BFVD.</br>
    <b>5-bfvd_metadata.tsv</b>: General information of each model.</br>
      <ol>
        <li><strong>UniRef100</strong>: UniRef100 identifier of the sequence</li>
        <li><strong>model</strong>: File name of the predicted protein structure</li>
        <li><strong>avg_pLDDT</strong>: Average pLDDT score of the predicted protein structure</li>
        <li><strong>pTM</strong>: pTM score of the predicted protein structure</li>
        <li><strong>splitted</strong>: Whether the protein sequence of UniRef100 entry was splitted into multiple models<br> We splitted the protein sequences if their length are above 1500. (0 = not splitted, 1 = splitted)</li>
        <li><strong>version</strong>: Specifies the MSA/refinement pipeline used to produce the final BFVD structure. (BASE, BASE+LOGAN, or BASE+LOGAN+12CY)</li>
      </ol>
    <b>6-msa.tar</b>: MSAs for each BFVD entries</br>
    <b>7-bfvd_taxid.tsv</b>: BFVD entry and their taxonomic identifier.</br>
      <ol>
        <li><strong>model</strong>: File name of the BFVD.</li>
        <li><strong>taxId</strong>: Taxonomy identifier of the protein.</br>The protein ID, the portion before the first underscore in model, was used to retrieve the taxonomy ID.</li>
      </ol>
    <b>8-bfvd_taxID_rank_scientificname_lineage.tsv</b>: BFVD entry and their taxonomic information.</br>
      <ol>
        <li><strong>model</strong>: File name of the BFVD.</li>
        <li><strong>taxId</strong>: Taxonomy identifier of the protein.</br>The protein ID, the portion before the first underscore in model, was used to retrieve the taxonomy ID.</li>
        <li><strong>rank</strong>: rank of the taxonomy.</li>
        <li><strong>scientific name</strong>: scientific name of the corresponding taxonomy identifier.</li>
        <li><strong>lineage</strong>: lineage of the taxonomy.</li>
      </ol>
    <b>9-uniref30_2302_virus-rep_mem.tsv</b>: UniRef30 virus clusters.</br>
      <ol>
        <li><strong>repId</strong>: Cluster representatives used for structure prediction</li>
        <li><strong>memId</strong>: Member corresponding to the representative</li>
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

async function handleDbRequest(request, env, ctx, type, id_part) {
  // names of the index file and tar file in R2
  const dbs = {
    'a3m': {
      'tar': 'latest/msa.tar',
      'index': 'latest/msa.tar.index',
      'mime': 'text/plain'
    },
    'pdb': {
      'tar': 'latest/bfvd_indexed.tar',
      'index': 'latest/bfvd_indexed.tar.index',
      'mime': 'chemical/x-pdb'
    },
    'cif': {
      'tar': 'latest/cif.tar',
      'index': 'latest/cif.tar.index',
      'mime': 'chemical/x-cif'
    },
    'json': {
      'tar': 'latest/3dbeacon.tar',
      'index': 'latest/3dbeacon.tar.index',
      'mime': 'application/json'
    },
  };
  const db = dbs[type];

  // Handle OPTIONS preflight request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Check if response is cached
  let cacheKey = new Request(request.url, request);
  let response = await caches.default.match(cacheKey);
  if (response) {
    // Add CORS headers to cached response
    response = new Response(response.body, {
      ...response,
      encodeBody: "manual"
    });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Content-Type', db.mime);
    response.headers.set('Content-Encoding', 'gzip');
    return response;
  }

  // Fetch the index file from R2
  const indexObject = await env.MY_BUCKET.get(db.index);
  if (!indexObject) {
    throw new Error('Index file not found in R2');
  }
  const indexText = await indexObject.text();
  // Split the index file into lines
  const lines = indexText.split('\n').filter((line) => line.trim() !== '');

  let indexEntry = null;
  try {
    // Perform binary search on the index file
    indexEntry = await binarySearchIndex(lines, id_part);
    if (!indexEntry) {
      indexEntry = await binarySearchIndex(lines, id_part + "_1");
      if (!indexEntry) {
        return new Response('File not found', {
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    const { fileContentOffset, contentLength } = indexEntry;

    // Fetch the compressed file content from the tar file in R2
    const compressedContent = await fetchFileContent(
      env.MY_BUCKET,
      db.tar,
      fileContentOffset,
      contentLength
    );

    // Return the compressed content to the requester
    response = new Response(compressedContent, {
      status: 200,
      headers: {
        'Content-Type': db.mime,
        'Content-Encoding': 'gzip',
        'Content-Length': contentLength.toString(),
        'Access-Control-Allow-Origin': '*', // Allow CORS for all origins
      },
      encodeBody: 'manual',
    });

    // Cache the response
    ctx.waitUntil(caches.default.put(cacheKey, response.clone()));

    return response;
  } catch (error) {
    console.error(error);
    return new Response('Internal Server Error', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*', // Allow CORS for error responses as well
      },
    });
  }
}

async function binarySearchIndex(index, targetId) {
  // Perform binary search over the lines
  let low = 0;
  let high = index.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const line = index[mid];
    const [idPart, fileOffsetStr, contentLengthStr] = line.split('\t');

    if (!idPart || !fileOffsetStr || !contentLengthStr) {
      // Malformed line, throw an error
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

    if (idPart < targetId) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Not found
  return null;
}

async function fetchFileContent(bucket, tarFileName, fileContentOffset, contentLength) {
  // Fetch the file content using a range request
  const object = await bucket.get(tarFileName, {
    range: {
      offset: fileContentOffset,
      length: contentLength,
    },
  });

  if (!object) {
    throw new Error('Failed to fetch file content from tar file in R2');
  }

  const arrayBuffer = await object.arrayBuffer();

  return arrayBuffer;
}

var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle requests to databases
    const match = url.pathname.match(/^\/(pdb|a3m|cif|json)\//);
    const type = match ? match[1] : null;
    if (type) {
      const keyWithExtension = url.pathname.slice(`/${type}/`.length);
      const id_part = keyWithExtension.replace(`.${type}`, '');
      return await handleDbRequest(request, env, ctx, type, id_part);
    }

    let key = url.pathname.slice(1);
    if (key === "bfvd.tar.gz" || key === "bfvd.version" || key === "bfvd_foldseekdb.tar.gz") {
      key = "latest/" + key;
    }
    if (!authorizeRequest(request, env, key)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (key == "" && request.method == "GET") {
      let response = await caches.default.match(request);
      if (!response) {
        const list = await env.MY_BUCKET.list({ limit: 100 });
        const headers = new Headers()
        headers.set("content-type", "text/html;charset=UTF-8")
        response = new Response(autoIndex(list.objects), { headers, status: 200 });
        // const latestObjects = list.objects.filter(obj => obj.key.startsWith("latest/"));
        // response = new Response(autoIndex(latestObjects), { headers, status: 200 });
        // const foldersSet = new Set();
        // list.objects.forEach(obj => {
        //   const parts = obj.key.split("/");
        //   if (parts.length > 1) {
        //     foldersSet.add(parts[0]);
        //   }
        // });
        // const folders = Array.from(foldersSet).sort();
        // response = new Response(autoIndex(folders), { headers, status: 200 });
        ctx.waitUntil(caches.default.put(request, response.clone()));
      }
      return response;
    }
    if (request.method == "HEAD") {
      const object = await env.MY_BUCKET.head(key);
      if (object === null) {
        return new Response("Object Not Found", { status: 404 });
      }
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set("content-length", object.size)
      return new Response(null, {
        headers,
      })
    } else {
      let range = parseRange(request.headers.get('range'));
      if (range && range.end == 0) {
        const object = await env.MY_BUCKET.head(key);
        range.end = object.size - 1;
        range.length = range.end + 1 - range.offset;
      }
      const object = await env.MY_BUCKET.get(key,{
        range,
        onlyIf: request.headers,
      });
      if (object === null) {
        return new Response(`Object Not Found: ${key}`, { status: 404 });
        // return new Response("Object Not Found", { status: 404 });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      if (range) {
        headers.set("content-range", `bytes ${range.offset}-${range.end}/${object.size}`)
      }
      const status = object.body ? (range ? 206 : 200) : 304
      return new Response(object.body, {
        headers,
        status
      });
    }
  }
};
export {
  src_default as default
};
//# sourceMappingURL=index.js.map
