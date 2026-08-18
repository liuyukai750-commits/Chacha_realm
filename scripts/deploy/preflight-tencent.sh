#!/usr/bin/env bash
set -u

failures=0
warnings=0

ok() { printf 'OK   %s\n' "$*"; }
warn() { printf 'WARN %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL %s\n' "$*"; failures=$((failures + 1)); }
section() { printf '\n== %s ==\n' "$*"; }
has() { command -v "$1" >/dev/null 2>&1; }

section "Operating system (read-only)"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  printf 'OS: %s\n' "${PRETTY_NAME:-unknown}"
  case "${ID:-}" in
    ubuntu|debian) ok "supported Linux family" ;;
    *) warn "runbook is written for Ubuntu/Debian; detected ${ID:-unknown}" ;;
  esac
else
  fail "/etc/os-release is not readable"
fi
printf 'Kernel: %s\n' "$(uname -srmo 2>/dev/null || true)"

section "Capacity (read-only)"
if has nproc; then
  cpus="$(nproc)"
  printf 'CPU cores: %s\n' "$cpus"
  [ "$cpus" -ge 2 ] && ok "at least 2 CPU cores" || warn "fewer than 2 CPU cores"
fi
if has free; then
  free -h
  mem_mb="$(free -m | awk '/^Mem:/ {print $2}')"
  swap_mb="$(free -m | awk '/^Swap:/ {print $2}')"
  [ "${mem_mb:-0}" -ge 1800 ] && ok "about 2 GiB RAM available" || warn "less than 1.8 GiB RAM detected"
  [ "${swap_mb:-0}" -ge 1024 ] && ok "swap is configured" || warn "less than 1 GiB swap; configure 2 GiB before building on this host"
else
  warn "free command unavailable"
fi
df -h / /srv 2>/dev/null || df -h /

section "Runtime and services (read-only)"
if has node; then
  node_version="$(node -p 'process.versions.node')"
  printf 'Node.js: %s\n' "$node_version"
  node_major="${node_version%%.*}"
  if [ "$node_major" -ge 20 ]; then ok "Node.js major version is supported"; else fail "Node.js 20+ is required"; fi
else
  fail "node is not installed"
fi
if has nginx; then
  nginx -v 2>&1
  ok "nginx is installed"
else
  fail "nginx is not installed"
fi
if has systemctl; then
  systemctl --version | head -n 1
  ok "systemd is available"
else
  fail "systemctl is unavailable"
fi
if has openssl; then openssl version; else warn "openssl is unavailable"; fi
if has tar; then tar --version | head -n 1; else fail "tar is unavailable"; fi

section "Listening ports (read-only)"
if has ss; then
  ss -ltnp 2>/dev/null || ss -ltn
else
  warn "ss is unavailable; ports 80, 443 and 3000 were not inspected"
fi

section "Firewall status (read-only)"
if has ufw; then
  ufw status 2>/dev/null || warn "ufw status requires elevated read permission"
else
  warn "ufw is not installed; inspect the Tencent Cloud firewall separately"
fi

section "Existing application state (read-only)"
for path in /srv/chacha-street /etc/chacha-street /etc/systemd/system/chacha-street.service /etc/nginx/sites-enabled/chacha-street; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    printf 'EXISTS %s\n' "$path"
    ls -ld "$path" 2>/dev/null || true
  else
    printf 'MISSING %s\n' "$path"
  fi
done
if has systemctl; then systemctl status chacha-street --no-pager 2>/dev/null || true; fi

printf '\nSummary: %s failure(s), %s warning(s). No files or cloud resources were changed.\n' "$failures" "$warnings"
[ "$failures" -eq 0 ]
