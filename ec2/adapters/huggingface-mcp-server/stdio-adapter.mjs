const HF_API_BASE = "https://huggingface.co/api";
const HF_TOKEN = process.env.HF_TOKEN || "";
const USER_AGENT = "mcp-benchmark-huggingface-adapter/1.0";

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
      name: "huggingface-mcp-server",
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

async function fetchJson(endpoint, params = {}) {
  const url = new URL(`${HF_API_BASE}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
  };
  if (HF_TOKEN) {
    headers.Authorization = `Bearer ${HF_TOKEN}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Hugging Face request failed with status ${response.status}: ${body.slice(0, 240)}`);
  }
  return response.json();
}

function summariseCard(card, fieldName) {
  if (!card || typeof card !== "object") {
    return `No ${fieldName} available`;
  }
  return card?.data?.text || `No ${fieldName} available`;
}

async function searchModels(args) {
  const data = await fetchJson("models", {
    search: args.query,
    author: args.author,
    filter: args.tags,
    limit: args.limit ?? 10,
  });
  return data.map((model) => ({
    id: model.id || "",
    name: model.modelId || "",
    author: model.author || "",
    tags: model.tags || [],
    downloads: model.downloads || 0,
    likes: model.likes || 0,
    lastModified: model.lastModified || "",
  }));
}

async function getModelInfo(args) {
  if (!args.model_id) {
    throw new Error("model_id is required");
  }
  const data = await fetchJson(`models/${encodeURIComponent(args.model_id)}`);
  return {
    id: data.id || "",
    name: data.modelId || "",
    author: data.author || "",
    tags: data.tags || [],
    pipeline_tag: data.pipeline_tag || "",
    downloads: data.downloads || 0,
    likes: data.likes || 0,
    lastModified: data.lastModified || "",
    description: data.description || "No description available",
    model_card: summariseCard(data.card, "model card"),
  };
}

async function searchDatasets(args) {
  const data = await fetchJson("datasets", {
    search: args.query,
    author: args.author,
    filter: args.tags,
    limit: args.limit ?? 10,
  });
  return data.map((dataset) => ({
    id: dataset.id || "",
    name: dataset.datasetId || "",
    author: dataset.author || "",
    tags: dataset.tags || [],
    downloads: dataset.downloads || 0,
    likes: dataset.likes || 0,
    lastModified: dataset.lastModified || "",
  }));
}

async function getDatasetInfo(args) {
  if (!args.dataset_id) {
    throw new Error("dataset_id is required");
  }
  const data = await fetchJson(`datasets/${encodeURIComponent(args.dataset_id)}`);
  return {
    id: data.id || "",
    name: data.datasetId || "",
    author: data.author || "",
    tags: data.tags || [],
    downloads: data.downloads || 0,
    likes: data.likes || 0,
    lastModified: data.lastModified || "",
    description: data.description || "No description available",
    dataset_card: summariseCard(data.card, "dataset card"),
  };
}

async function searchSpaces(args) {
  let filterValue = args.tags || "";
  if (args.sdk) {
    filterValue = `${filterValue}${filterValue ? " " : ""}sdk:${args.sdk}`;
  }

  const data = await fetchJson("spaces", {
    search: args.query,
    author: args.author,
    filter: filterValue,
    limit: args.limit ?? 10,
  });
  return data.map((space) => ({
    id: space.id || "",
    name: space.spaceId || "",
    author: space.author || "",
    sdk: space.sdk || "",
    tags: space.tags || [],
    likes: space.likes || 0,
    lastModified: space.lastModified || "",
  }));
}

async function getSpaceInfo(args) {
  if (!args.space_id) {
    throw new Error("space_id is required");
  }
  const data = await fetchJson(`spaces/${encodeURIComponent(args.space_id)}`);
  return {
    id: data.id || "",
    name: data.spaceId || "",
    author: data.author || "",
    sdk: data.sdk || "",
    tags: data.tags || [],
    likes: data.likes || 0,
    lastModified: data.lastModified || "",
    description: data.description || "No description available",
    url: `https://huggingface.co/spaces/${args.space_id}`,
  };
}

async function getPaperInfo(args) {
  if (!args.arxiv_id) {
    throw new Error("arxiv_id is required");
  }
  const arxivId = String(args.arxiv_id).trim();
  const data = await fetchJson(`papers/${encodeURIComponent(arxivId)}`);
  let implementations = [];
  try {
    implementations = await fetchJson(`arxiv/${encodeURIComponent(arxivId)}/repos`);
  } catch {
    implementations = [];
  }
  return {
    arxiv_id: data.arxivId || arxivId,
    title: data.title || "",
    authors: data.authors || [],
    summary: data.summary || "No summary available",
    url: `https://huggingface.co/papers/${arxivId}`,
    implementations,
  };
}

async function getDailyPapers() {
  const data = await fetchJson("daily_papers");
  return data.map((item) => {
    const paper = item.paper || {};
    const summary = String(paper.summary || "");
    return {
      arxiv_id: paper.arxivId || "",
      title: paper.title || "",
      authors: paper.authors || [],
      summary: summary.length > 200 ? `${summary.slice(0, 200)}...` : summary,
    };
  });
}

async function searchCollections(args) {
  const data = await fetchJson("collections", {
    owner: args.owner,
    item: args.item,
    q: args.query,
    limit: args.limit ?? 10,
  });
  return data.map((collection) => ({
    id: collection.id || "",
    title: collection.title || "",
    owner: collection.owner?.name || "",
    description: collection.description || "No description available",
    items_count: collection.itemsCount || 0,
    upvotes: collection.upvotes || 0,
    last_modified: collection.lastModified || "",
  }));
}

async function getCollectionInfo(args) {
  if (!args.namespace || !args.collection_id) {
    throw new Error("namespace and collection_id are required");
  }
  const collectionId = String(args.collection_id);
  const slug = collectionId.includes("-") ? collectionId.split("-")[0] : collectionId;
  const endpoint = `collections/${encodeURIComponent(args.namespace)}/${encodeURIComponent(`${slug}-${collectionId}`)}`;
  const data = await fetchJson(endpoint);
  return {
    id: data.id || "",
    title: data.title || "",
    owner: data.owner?.name || "",
    description: data.description || "No description available",
    upvotes: data.upvotes || 0,
    last_modified: data.lastModified || "",
    items: (data.items || []).map((item) => ({
      type: item.item?.type || "",
      id: item.item?.id || "",
      note: item.note || "",
    })),
  };
}

const CANONICAL_TOOLS = [
  makeTool(
    "search-models",
    "Search for models on Hugging Face Hub.",
    {
      query: { type: "string", description: "Search term such as bert or gpt." },
      author: { type: "string", description: "Filter by author or organization." },
      tags: { type: "string", description: "Filter by model tags." },
      limit: { type: "integer", description: "Maximum number of results to return." },
    },
  ),
  makeTool(
    "get-model-info",
    "Get detailed information about a specific Hugging Face model.",
    {
      model_id: { type: "string", description: "Model id such as google/bert-base-uncased." },
    },
    ["model_id"],
  ),
  makeTool(
    "search-datasets",
    "Search for datasets on Hugging Face Hub.",
    {
      query: { type: "string", description: "Search term." },
      author: { type: "string", description: "Filter by author or organization." },
      tags: { type: "string", description: "Filter by dataset tags." },
      limit: { type: "integer", description: "Maximum number of results to return." },
    },
  ),
  makeTool(
    "get-dataset-info",
    "Get detailed information about a specific Hugging Face dataset.",
    {
      dataset_id: { type: "string", description: "Dataset id such as squad." },
    },
    ["dataset_id"],
  ),
  makeTool(
    "search-spaces",
    "Search for Spaces on Hugging Face Hub.",
    {
      query: { type: "string", description: "Search term." },
      author: { type: "string", description: "Filter by author or organization." },
      tags: { type: "string", description: "Filter by tags." },
      sdk: { type: "string", description: "Filter by SDK such as gradio or docker." },
      limit: { type: "integer", description: "Maximum number of results to return." },
    },
  ),
  makeTool(
    "get-space-info",
    "Get detailed information about a specific Hugging Face Space.",
    {
      space_id: { type: "string", description: "Space id such as huggingface/diffusers-demo." },
    },
    ["space_id"],
  ),
  makeTool(
    "get-paper-info",
    "Get information about a Hugging Face paper by arXiv id.",
    {
      arxiv_id: { type: "string", description: "arXiv id such as 1810.04805." },
    },
    ["arxiv_id"],
  ),
  makeTool("get-daily-papers", "Get the current list of daily papers curated by Hugging Face.", {}),
  makeTool(
    "search-collections",
    "Search Hugging Face collections.",
    {
      owner: { type: "string", description: "Filter by owner." },
      item: { type: "string", description: "Filter by item id." },
      query: { type: "string", description: "Search titles and descriptions." },
      limit: { type: "integer", description: "Maximum number of results to return." },
    },
  ),
  makeTool(
    "get-collection-info",
    "Get detailed information about a specific Hugging Face collection.",
    {
      namespace: { type: "string", description: "User or organization namespace." },
      collection_id: { type: "string", description: "Collection id." },
    },
    ["namespace", "collection_id"],
  ),
];

const ALIAS_MAP = {
  search_models: "search-models",
  get_model_info: "get-model-info",
  search_datasets: "search-datasets",
  get_dataset_info: "get-dataset-info",
  search_spaces: "search-spaces",
  get_space_info: "get-space-info",
  get_paper_info: "get-paper-info",
  get_daily_papers: "get-daily-papers",
  search_collections: "search-collections",
  get_collection_info: "get-collection-info",
};

const TOOLS = [
  ...CANONICAL_TOOLS,
  ...CANONICAL_TOOLS
    .filter((tool) => Object.values(ALIAS_MAP).includes(tool.name))
    .map((tool) => {
      const aliasName = Object.entries(ALIAS_MAP).find(([, target]) => target === tool.name)?.[0];
      return { ...tool, name: aliasName };
    }),
];

const HANDLERS = {
  "search-models": searchModels,
  "get-model-info": getModelInfo,
  "search-datasets": searchDatasets,
  "get-dataset-info": getDatasetInfo,
  "search-spaces": searchSpaces,
  "get-space-info": getSpaceInfo,
  "get-paper-info": getPaperInfo,
  "get-daily-papers": getDailyPapers,
  "search-collections": searchCollections,
  "get-collection-info": getCollectionInfo,
};

function resolveToolName(name) {
  return ALIAS_MAP[name] || name;
}

async function handleToolCall(name, args) {
  const resolvedName = resolveToolName(name);
  const handler = HANDLERS[resolvedName];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return makeTextResult(await handler(args));
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
