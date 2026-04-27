# MCP Benchmark EC2 Heavy

Tier-specific EC2 runtime for the heavy-tier MCP benchmark servers. This repo was split from `mcp-benchmark-EC2` so one EC2 host/repository maps to one evaluated tier.

## Heavy Tier Servers

1. `biomcp`
2. `dexpaprika-mcp`
3. `mcp-google-map`
4. `nasa-mcp`
5. `mcp-nixos`
6. `paper-search-mcp`
7. `scientific_computation_mcp`
8. `medcalc`
9. `arxiv-mcp-server`
10. `huggingface-mcp-server`

## Key Files

- `ec2/heavy-route-config.json` - route config for `/heavy/mcp` and `/heavy/health`.
- `ec2/install-heavy.sh` - clones and builds the 10 heavy-tier servers.
- `ec2/bootstrap-heavy-host.sh` - installs host dependencies, installs heavy servers, builds the runtime, and starts PM2.
- `ec2/ecosystem.heavy.config.cjs` - PM2 process definition using `ec2/heavy-route-config.json`.
- `ec2/runtime/` - Fastify streamable HTTP to stdio MCP bridge.
- `ec2/adapters/` - local stdio adapters needed by this tier.

## EC2 Setup

```bash
bash ec2/bootstrap-heavy-host.sh
```

After startup:

- MCP endpoint: `http://127.0.0.1:3000/heavy/mcp`
- Health endpoint: `http://127.0.0.1:3000/heavy/health`

The `servers/` directory is intentionally empty in Git. The bootstrap/install flow populates it on the EC2 host.
