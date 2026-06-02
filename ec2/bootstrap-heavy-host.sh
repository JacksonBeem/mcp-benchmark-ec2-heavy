#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${REPO_ROOT}"

# The heavy tier needs node >= 22 (pdf-reader-mcp / pdfjs-dist). Some AMIs ship a
# preinstalled node 18 whose nodejs-full-i18n package blocks the nodesource 22 upgrade,
# so we remove any existing node first, then install with --allowerasing.
install_system_packages() {
  if command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y git python3 python3-pip
    dnf remove -y nodejs nodejs-full-i18n 2>/dev/null || true
    dnf install -y --allowerasing nodejs
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    yum install -y git python3 python3-pip
    yum remove -y nodejs nodejs-full-i18n 2>/dev/null || true
    yum install -y --allowerasing nodejs
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl git python3 python3-pip ca-certificates
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
    return
  fi

  echo "ERROR: unsupported package manager; install nodejs>=22, git, python3, and python3-pip manually"
  exit 1
}

install_system_packages

# pm2 = process manager; pnpm = required by metmuseum-mcp (prebuild) and context7 (workspace)
npm install -g pm2 pnpm

bash ec2/install-heavy.sh

(
  cd ec2/runtime
  npm install
  npm run build
)

pm2 start ec2/ecosystem.heavy.config.cjs
pm2 save
pm2 startup || true

echo "INFO: EC2 heavy-tier services started"
echo "INFO: runtime health: curl http://127.0.0.1:3000/heavy/health"
