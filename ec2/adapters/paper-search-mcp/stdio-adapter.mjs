const ARXIV_API = "https://export.arxiv.org/api/query";
const OPENALEX_API = "https://api.openalex.org/works";
const SEMANTIC_API = "https://api.semanticscholar.org/graph/v1/paper/search";
const PUBMED_SEARCH_API = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_SUMMARY_API = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const USER_AGENT = "mcp-benchmark-paper-search-adapter/1.0";

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function initializationResult() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: {
      name: "paper-search-mcp",
      version: "1.0.0",
    },
  };
}

function makeTool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
    },
  };
}

function makeTextResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function fetchJson(url, params = {}, headers = {}) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(target, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed with status ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.json();
}

async function fetchText(url, params = {}) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(target, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/atom+xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Request failed with status ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.text();
}

function decodeXml(text) {
  return String(text || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractXmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/\s+/g, " ").trim()) : "";
}

function parseArxivEntries(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  return entries.map((entry) => {
    const links = [...entry.matchAll(/<link[^>]*href="([^"]+)"[^>]*?(?:title="([^"]+)")?[^>]*\/?>/g)];
    const pdfLink = links.find(([, href]) => href.includes("/pdf/"))?.[1] || "";
    const pageLink = links.find(([, href]) => href.includes("/abs/"))?.[1] || "";
    const authors = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g)].map((match) =>
      decodeXml(match[1].trim()),
    );
    const rawId = extractXmlTag(entry, "id");
    const arxivId = rawId.split("/abs/")[1] || rawId;
    return {
      id: arxivId,
      paper_id: arxivId,
      title: extractXmlTag(entry, "title"),
      authors,
      abstract: extractXmlTag(entry, "summary"),
      published: extractXmlTag(entry, "published"),
      doi: extractXmlTag(entry, "arxiv:doi"),
      url: pageLink || rawId,
      pdf_url: pdfLink,
      source: "arxiv",
    };
  });
}

async function searchArxiv(query, maxResults = 10) {
  const xml = await fetchText(ARXIV_API, {
    search_query: `all:${query}`,
    start: 0,
    max_results: Math.min(Math.max(Number(maxResults) || 10, 1), 25),
  });
  return parseArxivEntries(xml);
}

async function searchOpenAlex(query, maxResults = 10) {
  const data = await fetchJson(OPENALEX_API, {
    search: query,
    "per-page": Math.min(Math.max(Number(maxResults) || 10, 1), 25),
  });
  return (data.results || []).map((item) => ({
    id: item.id || "",
    paper_id: item.id || "",
    title: item.title || "",
    authors: (item.authorships || []).map((author) => author.author?.display_name).filter(Boolean),
    abstract: item.abstract_inverted_index ? null : null,
    published: item.publication_date || "",
    doi: item.doi || "",
    url: item.primary_location?.landing_page_url || item.id || "",
    pdf_url: item.primary_location?.pdf_url || "",
    source: "openalex",
  }));
}

async function searchSemantic(query, maxResults = 10, year = null) {
  const data = await fetchJson(
    SEMANTIC_API,
    {
      query,
      limit: Math.min(Math.max(Number(maxResults) || 10, 1), 25),
      year: year || undefined,
      fields: "title,abstract,authors,year,url,externalIds,openAccessPdf,publicationDate",
    },
    process.env.PAPER_SEARCH_MCP_SEMANTIC_SCHOLAR_API_KEY
      ? { "x-api-key": process.env.PAPER_SEARCH_MCP_SEMANTIC_SCHOLAR_API_KEY }
      : {},
  );
  return (data.data || []).map((item) => ({
    id: item.paperId || "",
    paper_id: item.paperId || "",
    title: item.title || "",
    authors: (item.authors || []).map((author) => author.name).filter(Boolean),
    abstract: item.abstract || "",
    published: item.publicationDate || item.year || "",
    doi: item.externalIds?.DOI || "",
    url: item.url || "",
    pdf_url: item.openAccessPdf?.url || "",
    source: "semantic",
  }));
}

async function searchPubmed(query, maxResults = 10) {
  const search = await fetchJson(PUBMED_SEARCH_API, {
    db: "pubmed",
    retmode: "json",
    retmax: Math.min(Math.max(Number(maxResults) || 10, 1), 25),
    sort: "relevance",
    term: query,
  });
  const ids = search.esearchresult?.idlist || [];
  if (ids.length === 0) {
    return [];
  }
  const summary = await fetchJson(PUBMED_SUMMARY_API, {
    db: "pubmed",
    retmode: "json",
    id: ids.join(","),
  });
  return ids.map((id) => {
    const item = summary.result?.[id] || {};
    return {
      id,
      paper_id: id,
      title: item.title || "",
      authors: (item.authors || []).map((author) => author.name).filter(Boolean),
      abstract: "",
      published: item.pubdate || "",
      doi: "",
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      pdf_url: "",
      source: "pubmed",
    };
  });
}

function normaliseSourceList(sources) {
  const defaults = ["arxiv", "semantic", "openalex", "pubmed"];
  if (!sources || sources === "all") {
    return defaults;
  }
  return String(sources)
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .filter((source, index, items) => items.indexOf(source) === index);
}

function dedupePapers(papers) {
  const seen = new Set();
  const results = [];
  for (const paper of papers) {
    const key =
      String(paper.doi || "").trim().toLowerCase() ||
      String(paper.title || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(paper);
  }
  return results;
}

async function searchPapers(args) {
  if (!args.query) {
    throw new Error("query is required");
  }
  const sources = normaliseSourceList(args.sources);
  const maxResults = Number(args.max_results_per_source ?? 5);
  const year = args.year ? String(args.year) : null;

  const runners = {
    arxiv: () => searchArxiv(args.query, maxResults),
    semantic: () => searchSemantic(args.query, maxResults, year),
    openalex: () => searchOpenAlex(args.query, maxResults),
    pubmed: () => searchPubmed(args.query, maxResults),
  };

  const sourceResults = {};
  const errors = {};
  const merged = [];

  for (const source of sources) {
    const run = runners[source];
    if (!run) {
      errors[source] = "Source not supported by Lambda adapter";
      sourceResults[source] = 0;
      continue;
    }
    try {
      const papers = await run();
      sourceResults[source] = papers.length;
      merged.push(...papers);
    } catch (error) {
      errors[source] = error instanceof Error ? error.message : String(error);
      sourceResults[source] = 0;
    }
  }

  const deduped = dedupePapers(merged);
  return {
    query: args.query,
    sources_requested: args.sources ?? "all",
    sources_used: sources,
    source_results: sourceResults,
    errors,
    papers: deduped,
    total: deduped.length,
    raw_total: merged.length,
  };
}

async function downloadWithFallback(args) {
  if (!args.source || !args.paper_id) {
    throw new Error("source and paper_id are required");
  }

  if (String(args.source).toLowerCase() === "arxiv") {
    return {
      source: args.source,
      paper_id: args.paper_id,
      pdf_url: `https://arxiv.org/pdf/${args.paper_id}.pdf`,
      note: "Direct PDF URL returned. Lambda adapter does not persist files to disk.",
    };
  }

  return {
    source: args.source,
    paper_id: args.paper_id,
    note: "download_with_fallback is only implemented for arXiv in the Lambda adapter.",
  };
}

const TOOLS = [
  makeTool(
    "search_papers",
    "Unified paper search across the adapter-supported academic sources.",
    {
      query: { type: "string", description: "Paper search query." },
      max_results_per_source: { type: "integer", description: "Max results per source." },
      sources: {
        type: "string",
        description: "Comma-separated source list or all. Supported: arxiv,semantic,openalex,pubmed.",
      },
      year: { type: "string", description: "Optional year filter for Semantic Scholar." },
    },
    ["query"],
  ),
  makeTool(
    "search_arxiv",
    "Search academic papers from arXiv.",
    {
      query: { type: "string", description: "Paper search query." },
      max_results: { type: "integer", description: "Max number of papers." },
    },
    ["query"],
  ),
  makeTool(
    "search_semantic",
    "Search academic papers using Semantic Scholar.",
    {
      query: { type: "string", description: "Paper search query." },
      max_results: { type: "integer", description: "Max number of papers." },
      year: { type: "string", description: "Optional year filter." },
    },
    ["query"],
  ),
  makeTool(
    "search_openalex",
    "Search academic papers using OpenAlex.",
    {
      query: { type: "string", description: "Paper search query." },
      max_results: { type: "integer", description: "Max number of papers." },
    },
    ["query"],
  ),
  makeTool(
    "search_pubmed",
    "Search academic papers using PubMed metadata.",
    {
      query: { type: "string", description: "Paper search query." },
      max_results: { type: "integer", description: "Max number of papers." },
    },
    ["query"],
  ),
  makeTool(
    "download_with_fallback",
    "Return an open-access download hint for supported sources.",
    {
      source: { type: "string", description: "Paper source name." },
      paper_id: { type: "string", description: "Source-native paper identifier." },
      doi: { type: "string", description: "Optional DOI." },
      title: { type: "string", description: "Optional title." },
      save_path: { type: "string", description: "Unused in Lambda adapter; included for compatibility." },
    },
    ["source", "paper_id"],
  ),
];

async function handleToolCall(name, args) {
  if (name === "search_papers") {
    return makeTextResult(await searchPapers(args));
  }
  if (name === "search_arxiv") {
    if (!args.query) {
      throw new Error("query is required");
    }
    return makeTextResult(await searchArxiv(args.query, args.max_results ?? 10));
  }
  if (name === "search_semantic") {
    if (!args.query) {
      throw new Error("query is required");
    }
    return makeTextResult(await searchSemantic(args.query, args.max_results ?? 10, args.year ?? null));
  }
  if (name === "search_openalex") {
    if (!args.query) {
      throw new Error("query is required");
    }
    return makeTextResult(await searchOpenAlex(args.query, args.max_results ?? 10));
  }
  if (name === "search_pubmed") {
    if (!args.query) {
      throw new Error("query is required");
    }
    return makeTextResult(await searchPubmed(args.query, args.max_results ?? 10));
  }
  if (name === "download_with_fallback") {
    return makeTextResult(await downloadWithFallback(args));
  }
  throw new Error(`Unknown tool: ${name}`);
}

async function handleRequest(message) {
  const id = message.id ?? null;
  if (message.method === "initialize") {
    return jsonRpcResult(id, initializationResult());
  }
  if (message.method === "notifications/initialized") {
    return null;
  }
  if (message.method === "tools/list") {
    return jsonRpcResult(id, { tools: TOOLS });
  }
  if (message.method !== "tools/call") {
    return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
  }
  return jsonRpcResult(
    id,
    await handleToolCall(message.params?.name, message.params?.arguments ?? {}),
  );
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      continue;
    }

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      writeMessage(jsonRpcError(null, -32700, "Parse error"));
      continue;
    }

    try {
      const response = await handleRequest(message);
      if (response) {
        writeMessage(response);
      }
    } catch (error) {
      writeMessage(
        jsonRpcError(
          message.id ?? null,
          -32603,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
