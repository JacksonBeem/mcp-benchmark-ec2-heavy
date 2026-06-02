#!/usr/bin/env node
// Banner-safe launcher for ip-geolocation (mcp-ip-geolocator, staged in
// servers/_cand_npm). build/index.js auto-runs main() on import and logs
// "Starting IP Geolocation MCP Server..." via console.log -> stdout before
// connecting the stdio transport, which corrupts the JSON-RPC stream. Redirect
// console.log to stderr before import; the SDK transport uses process.stdout.write
// and is left untouched.
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

console.log = console.error;

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(
  here,
  "..",
  "_cand_npm",
  "node_modules",
  "mcp-ip-geolocator",
  "build",
  "index.js",
);
await import(pathToFileURL(entry).href);
