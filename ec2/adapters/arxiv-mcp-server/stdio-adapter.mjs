const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const DEFAULT_STORAGE_ROOT = process.env.ARXIV_STORAGE_PATH || "/tmp/arxiv-mcp-server/papers";
const DEFAULT_MAX_RESULTS = 10;

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function stripXml(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").trim();
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(stripXml(match[1])) : null;
}

function extractAuthors(block) {
  return [...block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/gi)].map((match) =>
    decodeXml(stripXml(match[1]))
  );
}

function extractCategories(block) {
  return [...block.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((match) => match[1]);
}

function extractPdfUrl(block, paperId) {
  const match = block.match(/<link[^>]*title="pdf"[^>]*href="([^"]+)"/i);
  return match ? match[1] : `https://arxiv.org/pdf/${paperId}.pdf`;
}

function parsePaperId(entryId) {
  if (!entryId) return null;
  const trimmed = entryId.trim();
  const slash = trimmed.lastIndexOf("/");
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
}

function parseEntries(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
  return entries.map((match) => {
    const block = match[1];
    const entryId = extractTag(block, "id");
    const paperId = parsePaperId(entryId);
    return {
      paper_id: paperId,
      title: extractTag(block, "title"),
      summary: extractTag(block, "summary"),
      published: extractTag(block, "published"),
      updated: extractTag(block, "updated"),
      authors: extractAuthors(block),
      categories: extractCategories(block),
      url: extractPdfUrl(block, paperId),
      resource_uri: paperId ? `arxiv://${paperId}` : null,
    };
  });
}

function normalizeDate(value, isEnd = false) {
  if (!value) return null;
  const digits = String(value).replace(/-/g, "");
  if (!/^\d{8}$/.test(digits)) {
    throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD.`);
  }
  return `${digits}${isEnd ? "235959" : "000000"}`;
}

function buildSearchQuery(args) {
  const parts = [];
  const query = String(args.query ?? "").trim();
  const categories = Array.isArray(args.categories)
    ? args.categories.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (query) {
    parts.push(`all:${query}`);
  }
  if (categories.length) {
    parts.push(categories.map((category) => `cat:${category}`).join(" OR "));
  }

  const start = normalizeDate(args.date_from, false);
  const end = normalizeDate(args.date_to, true);
  if (start || end) {
    parts.push(`submittedDate:[${start ?? "*"} TO ${end ?? "*"}]`);
  }

  if (!parts.length) {
    throw new Error("No search criteria provided");
  }

  return parts.join(" AND ");
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "mcp-benchmark-arxiv-adapter/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchJsonLikePaperById(paperId) {
  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("id_list", paperId);
  const xml = await fetchText(url.toString());
  const [paper] = parseEntries(xml);
  if (!paper) {
    throw new Error(`Paper not found: ${paperId}`);
  }
  return paper;
}

async function ensureStorage() {
  await mkdir(DEFAULT_STORAGE_ROOT, { recursive: true });
}

function metadataPath(paperId) {
  return join(DEFAULT_STORAGE_ROOT, `${paperId}.json`);
}

function pdfPath(paperId) {
  return join(DEFAULT_STORAGE_ROOT, `${paperId}.pdf`);
}

async function savePaperMetadata(paper, pdfDownloaded = false) {
  await ensureStorage();
  const payload = {
    ...paper,
    pdf_downloaded: pdfDownloaded,
    stored_at: new Date().toISOString(),
  };
  await writeFile(metadataPath(paper.paper_id), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

async function downloadPdfIfPossible(paper) {
  try {
    const response = await fetch(paper.url, {
      headers: {
        "User-Agent": "mcp-benchmark-arxiv-adapter/1.0",
      },
    });
    if (!response.ok) {
      return false;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(pdfPath(paper.paper_id), bytes);
    return true;
  } catch {
    return false;
  }
}

async function searchPapers(args) {
  const searchQuery = buildSearchQuery(args);
  const maxResults = Math.min(Math.max(Number(args.max_results ?? DEFAULT_MAX_RESULTS), 1), 50);
  const sortBy = String(args.sort_by ?? "relevance").toLowerCase() === "date" ? "submittedDate" : "relevance";

  const url = new URL(ARXIV_API_URL);
  url.searchParams.set("search_query", searchQuery);
  url.searchParams.set("start", "0");
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sortBy", sortBy);
  url.searchParams.set("sortOrder", "descending");

  const xml = await fetchText(url.toString());
  return parseEntries(xml);
}

async function downloadPaper(args) {
  const paperId = String(args.paper_id ?? "").trim();
  if (!paperId) {
    throw new Error("Missing required argument: paper_id");
  }
  const paper = await fetchJsonLikePaperById(paperId);
  const pdfDownloaded = await downloadPdfIfPossible(paper);
  const saved = await savePaperMetadata(paper, pdfDownloaded);
  return {
    status: "downloaded",
    paper_id: paperId,
    title: saved.title,
    pdf_downloaded: pdfDownloaded,
    pdf_path: pdfDownloaded ? pdfPath(paperId) : null,
    metadata_path: metadataPath(paperId),
  };
}

async function listPapers() {
  await ensureStorage();
  const entries = await readdir(DEFAULT_STORAGE_ROOT, { withFileTypes: true });
  const papers = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    try {
      const fullPath = join(DEFAULT_STORAGE_ROOT, entry.name);
      const raw = await readFile(fullPath, "utf8");
      papers.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  return papers.sort((a, b) => String(b.stored_at ?? "").localeCompare(String(a.stored_at ?? "")));
}

async function readPaper(args) {
  const paperId = String(args.paper_id ?? "").trim();
  if (!paperId) {
    throw new Error("Missing required argument: paper_id");
  }

  try {
    const raw = await readFile(metadataPath(paperId), "utf8");
    return JSON.parse(raw);
  } catch {
    const paper = await fetchJsonLikePaperById(paperId);
    const saved = await savePaperMetadata(paper, false);
    return saved;
  }
}

const TOOL_DEFINITIONS = [
  {
    name: "search_papers",
    description: "Search arXiv papers with optional date range and category filters.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "integer" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
        sort_by: { type: "string", enum: ["relevance", "date"] },
      },
    },
  },
  {
    name: "download_paper",
    description: "Download paper metadata and PDF for an arXiv paper ID into local storage.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string" },
      },
      required: ["paper_id"],
    },
  },
  {
    name: "list_papers",
    description: "List downloaded arXiv papers stored locally by the server.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "read_paper",
    description: "Read locally stored metadata and abstract for a downloaded arXiv paper.",
    inputSchema: {
      type: "object",
      properties: {
        paper_id: { type: "string" },
      },
      required: ["paper_id"],
    },
  },
];

function initializationResult() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    serverInfo: {
      name: "arxiv-mcp-server",
      version: "1.0.0",
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

async function handleToolCall(name, args) {
  if (name === "search_papers") {
    return makeTextResult(await searchPapers(args));
  }
  if (name === "download_paper") {
    return makeTextResult(await downloadPaper(args));
  }
  if (name === "list_papers") {
    return makeTextResult(await listPapers());
  }
  if (name === "read_paper") {
    return makeTextResult(await readPaper(args));
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
    return jsonRpcResult(id, { tools: TOOL_DEFINITIONS });
  }
  if (message.method !== "tools/call") {
    return jsonRpcError(id, -32601, `Method not found: ${message.method}`);
  }

  return jsonRpcResult(id, await handleToolCall(message.params?.name, message.params?.arguments ?? {}));
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
      const text = error instanceof Error ? error.message : String(error);
      writeMessage(jsonRpcError(message.id ?? null, -32603, text));
    }
  }
});
