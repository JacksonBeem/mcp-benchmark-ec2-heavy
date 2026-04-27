const NASA_API_BASE = "https://api.nasa.gov";
const EPIC_API_BASE = "https://epic.gsfc.nasa.gov/api";
const EPIC_MIRROR_BASE = "https://api.nasa.gov/EPIC/api";
const API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";
const EXOPLANET_BASE =
  "https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI";

const ROVER_CAMERAS = {
  curiosity: ["FHAZ", "RHAZ", "MAST", "CHEMCAM", "MAHLI", "MARDI", "NAVCAM"],
  opportunity: ["FHAZ", "RHAZ", "NAVCAM", "PANCAM", "MINITES"],
  spirit: ["FHAZ", "RHAZ", "NAVCAM", "PANCAM", "MINITES"],
};

function tool(name, description, properties, required = []) {
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

const TOOLS = [
  tool("get_astronomy_picture_of_day", "Get NASA's astronomy picture of the day.", { date: { type: "string" }, count: { type: "integer" }, thumbs: { type: "boolean" } }),
  tool("get_asteroids_feed", "Get a list of asteroids by closest approach date.", { start_date: { type: "string" }, end_date: { type: "string" } }, ["start_date"]),
  tool("get_asteroid_lookup", "Look up a specific asteroid by NASA JPL ID.", { asteroid_id: { type: "string" } }, ["asteroid_id"]),
  tool("browse_asteroids", "Browse the asteroid dataset.", {}),
  tool("get_coronal_mass_ejection", "Get coronal mass ejection data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_geomagnetic_storm", "Get geomagnetic storm data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_solar_flare", "Get solar flare data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_solar_energetic_particle", "Get solar energetic particle data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_magnetopause_crossing", "Get magnetopause crossing data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_radiation_belt_enhancement", "Get radiation belt enhancement data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_hight_speed_stream", "Get high speed stream data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_wsa_enlil_simulation", "Get WSA+Enlil simulation data.", { start_date: { type: "string" }, end_date: { type: "string" } }),
  tool("get_notifications", "Get DONKI notifications.", { start_date: { type: "string" }, end_date: { type: "string" }, notification_type: { type: "string" } }),
  tool("get_earth_imagery", "Get Earth imagery from Landsat 8.", { lat: { type: "number" }, lon: { type: "number" }, date: { type: "string" }, dim: { type: "number" }, cloud_score: { type: "boolean" } }, ["lat", "lon"]),
  tool("get_earth_assets", "Get available Earth imagery assets.", { lat: { type: "number" }, lon: { type: "number" }, date: { type: "string" }, dim: { type: "number" } }, ["lat", "lon", "date"]),
  tool("get_epic_imagery", "Get latest EPIC imagery metadata.", { collection: { type: "string" } }),
  tool("get_epic_imagery_by_date", "Get EPIC imagery metadata for a date.", { date: { type: "string" }, collection: { type: "string" } }, ["date"]),
  tool("get_epic_dates", "Get available EPIC dates.", { collection: { type: "string" } }),
  tool("get_exoplanet_data", "Get data from NASA's Exoplanet Archive.", { query: { type: "string" }, table: { type: "string" }, format: { type: "string" } }),
  tool("get_mars_rover_photos", "Get photos from a Mars rover.", { rover_name: { type: "string" }, sol: { type: "integer" }, earth_date: { type: "string" }, camera: { type: "string" }, page: { type: "integer" } }, ["rover_name"]),
  tool("get_mars_rover_manifest", "Get the mission manifest for a Mars rover.", { rover_name: { type: "string" } }, ["rover_name"]),
];

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
    serverInfo: { name: "nasa-mcp", version: "1.0.0" },
  };
}

function makeTextResult(payload) {
  return { content: [{ type: "text", text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) }] };
}

function truncateText(text, max = 2000) {
  const stringified = typeof text === "string" ? text : JSON.stringify(text, null, 2);
  return stringified.length > max ? `${stringified.slice(0, max)}\n...truncated...` : stringified;
}

async function fetchJsonOrBinary(url, params = {}, includeApiKey = true) {
  const finalUrl = new URL(url);
  const merged = { ...params };
  if (includeApiKey && !("api_key" in merged)) merged.api_key = API_KEY;
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") finalUrl.searchParams.set(key, String(value));
  }

  const response = await fetch(finalUrl, { redirect: "follow" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) return await response.json();
  if (contentType.startsWith("image/")) return { binary_content: true, content_type: contentType, url: finalUrl.toString() };
  return await response.text();
}

async function fetchEpicJson(path) {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  const attempts = [
    { url: `${EPIC_API_BASE}/${normalized}`, params: {}, includeApiKey: false },
    { url: `${EPIC_MIRROR_BASE}/${normalized}`, params: { api_key: API_KEY }, includeApiKey: false },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      return await fetchJsonOrBinary(attempt.url, attempt.params, attempt.includeApiKey);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function summarizeList(title, items, limit = 10) {
  if (!Array.isArray(items) || items.length === 0) return `${title}: no results`;
  return `${title}: ${items.length}\n\n${truncateText(items.slice(0, limit), 5000)}`;
}

function formatDonki(title, idKey, items) {
  if (!Array.isArray(items) || items.length === 0) return `No ${title.toLowerCase()} data for the specified period.`;
  const simplified = items.slice(0, 10).map((item) => ({
    id: item[idKey] || item.activityID || item.gstID || item.rbeID || item.sepID || item.hssID || item.mpcID || null,
    startTime: item.startTime || item.beginTime || item.eventTime || null,
    peakTime: item.peakTime || null,
    endTime: item.endTime || null,
    sourceLocation: item.sourceLocation || null,
    classType: item.classType || null,
    note: item.note || null,
    link: item.link || null,
  }));
  return `${title} found: ${items.length}\n\n${truncateText(simplified, 5000)}`;
}

async function getApod(args) {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/planetary/apod`, { date: args.date, count: args.count, thumbs: args.thumbs ? "true" : undefined }), 5000);
}

async function getAsteroidsFeed(args) {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/neo/rest/v1/feed`, { start_date: args.start_date, end_date: args.end_date }), 5000);
}

async function getAsteroidLookup(args) {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/neo/rest/v1/neo/${encodeURIComponent(args.asteroid_id)}`), 5000);
}

async function browseAsteroids() {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/neo/rest/v1/neo/browse`), 5000);
}

async function getDonki(endpoint, title, idKey, args) {
  return formatDonki(title, idKey, await fetchJsonOrBinary(`${NASA_API_BASE}/DONKI/${endpoint}`, { startDate: args.start_date, endDate: args.end_date }));
}

async function getNotifications(args) {
  return summarizeList("DONKI notifications", await fetchJsonOrBinary(`${NASA_API_BASE}/DONKI/notifications`, { startDate: args.start_date, endDate: args.end_date, type: args.notification_type && args.notification_type !== "all" ? args.notification_type : undefined }), 10);
}

async function getEarthImagery(args) {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/planetary/earth/imagery`, { lat: args.lat, lon: args.lon, date: args.date, dim: args.dim ?? 0.025 }), 5000);
}

async function getEarthAssets(args) {
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/planetary/earth/assets`, { lat: args.lat, lon: args.lon, date: args.date, dim: args.dim ?? 0.025 }), 5000);
}

async function getEpicLatest(args) {
  const collection = ["natural", "enhanced"].includes(args.collection) ? args.collection : "natural";
  return summarizeList(`EPIC ${collection} images`, await fetchEpicJson(`${collection}`), 10);
}

async function getEpicByDate(args) {
  const collection = ["natural", "enhanced"].includes(args.collection) ? args.collection : "natural";
  return summarizeList(
    `EPIC ${collection} images for ${args.date}`,
    await fetchEpicJson(`${collection}/date/${encodeURIComponent(args.date)}`),
    10,
  );
}

async function getEpicDates(args) {
  const collection = ["natural", "enhanced"].includes(args.collection) ? args.collection : "natural";
  const data = await fetchEpicJson(`${collection}/all`);
  const dates = Array.isArray(data) ? [...new Set(data.map((item) => String(item.date || "").split(" ")[0]).filter(Boolean))] : [];
  return truncateText({ collection, count: dates.length, dates: dates.slice(0, 200) }, 5000);
}

async function getExoplanetData(args) {
  return truncateText(await fetchJsonOrBinary(EXOPLANET_BASE, { table: args.table || "exoplanets", format: args.format || "json", where: args.query || undefined }, false), 5000);
}

async function getMarsRoverPhotos(args) {
  const rover = String(args.rover_name || "").toLowerCase();
  if (!ROVER_CAMERAS[rover]) throw new Error(`Invalid rover name. Available rovers: ${Object.keys(ROVER_CAMERAS).join(", ")}`);
  if (args.sol != null && args.earth_date) throw new Error("Specify either sol or earth_date, but not both.");
  if (args.sol == null && !args.earth_date) throw new Error("Specify either sol or earth_date.");
  const camera = args.camera ? String(args.camera).toUpperCase() : undefined;
  if (camera && !ROVER_CAMERAS[rover].includes(camera)) throw new Error(`Invalid camera '${camera}' for rover '${rover}'. Available cameras: ${ROVER_CAMERAS[rover].join(", ")}`);
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/mars-photos/api/v1/rovers/${rover}/photos`, { sol: args.sol, earth_date: args.earth_date, camera, page: args.page ?? 1 }), 5000);
}

async function getMarsRoverManifest(args) {
  const rover = String(args.rover_name || "").toLowerCase();
  if (!ROVER_CAMERAS[rover]) throw new Error(`Invalid rover name. Available rovers: ${Object.keys(ROVER_CAMERAS).join(", ")}`);
  return truncateText(await fetchJsonOrBinary(`${NASA_API_BASE}/mars-photos/api/v1/manifests/${rover}`), 5000);
}

async function handleRequest(message) {
  const id = message.id ?? null;
  if (message.method === "initialize") return jsonRpcResult(id, initializationResult());
  if (message.method === "notifications/initialized") return null;
  if (message.method === "tools/list") return jsonRpcResult(id, { tools: TOOLS });
  if (message.method !== "tools/call") return jsonRpcError(id, -32601, `Method not found: ${message.method}`);

  const name = message.params?.name;
  const args = message.params?.arguments ?? {};

  switch (name) {
    case "get_astronomy_picture_of_day": return jsonRpcResult(id, makeTextResult(await getApod(args)));
    case "get_asteroids_feed": return jsonRpcResult(id, makeTextResult(await getAsteroidsFeed(args)));
    case "get_asteroid_lookup": return jsonRpcResult(id, makeTextResult(await getAsteroidLookup(args)));
    case "browse_asteroids": return jsonRpcResult(id, makeTextResult(await browseAsteroids()));
    case "get_coronal_mass_ejection": return jsonRpcResult(id, makeTextResult(await getDonki("CME", "Coronal Mass Ejections", "activityID", args)));
    case "get_geomagnetic_storm": return jsonRpcResult(id, makeTextResult(await getDonki("GST", "Geomagnetic Storms", "gstID", args)));
    case "get_solar_flare": return jsonRpcResult(id, makeTextResult(await getDonki("FLR", "Solar Flares", "flrID", args)));
    case "get_solar_energetic_particle": return jsonRpcResult(id, makeTextResult(await getDonki("SEP", "Solar Energetic Particle Events", "sepID", args)));
    case "get_magnetopause_crossing": return jsonRpcResult(id, makeTextResult(await getDonki("MPC", "Magnetopause Crossings", "mpcID", args)));
    case "get_radiation_belt_enhancement": return jsonRpcResult(id, makeTextResult(await getDonki("RBE", "Radiation Belt Enhancements", "rbeID", args)));
    case "get_hight_speed_stream": return jsonRpcResult(id, makeTextResult(await getDonki("HSS", "High Speed Streams", "hssID", args)));
    case "get_wsa_enlil_simulation": return jsonRpcResult(id, makeTextResult(await getDonki("WSAEnlilSimulations", "WSA+Enlil Simulations", "simulationID", args)));
    case "get_notifications": return jsonRpcResult(id, makeTextResult(await getNotifications(args)));
    case "get_earth_imagery": return jsonRpcResult(id, makeTextResult(await getEarthImagery(args)));
    case "get_earth_assets": return jsonRpcResult(id, makeTextResult(await getEarthAssets(args)));
    case "get_epic_imagery": return jsonRpcResult(id, makeTextResult(await getEpicLatest(args)));
    case "get_epic_imagery_by_date": return jsonRpcResult(id, makeTextResult(await getEpicByDate(args)));
    case "get_epic_dates": return jsonRpcResult(id, makeTextResult(await getEpicDates(args)));
    case "get_exoplanet_data": return jsonRpcResult(id, makeTextResult(await getExoplanetData(args)));
    case "get_mars_rover_photos": return jsonRpcResult(id, makeTextResult(await getMarsRoverPhotos(args)));
    case "get_mars_rover_manifest": return jsonRpcResult(id, makeTextResult(await getMarsRoverManifest(args)));
    default: return jsonRpcError(id, -32601, `Unknown tool: ${name}`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch {
      writeMessage(jsonRpcError(null, -32700, "Parse error"));
      continue;
    }
    try {
      const response = await handleRequest(message);
      if (response) writeMessage(response);
    } catch (error) {
      writeMessage(jsonRpcError(message.id ?? null, -32603, error instanceof Error ? error.message : String(error)));
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
