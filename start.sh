#!/usr/bin/env bash
# =============================================================================
# Kuber Player — Linux / macOS startup script
# Usage:  bash start.sh
#         bash start.sh --stop
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
MEDIA_DIR="$SCRIPT_DIR/media"
PID_FILE="$SCRIPT_DIR/.kuber_pids"

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Colour

# ── Stop mode ────────────────────────────────────────────────────────────────
if [[ "$1" == "--stop" ]]; then
  if [[ -f "$PID_FILE" ]]; then
    echo -e "${YELLOW}Stopping Kuber Player servers...${NC}"
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null && echo -e "  ${GREEN}Killed PID $pid${NC}" || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
    echo -e "${GREEN}Done.${NC}"
  else
    echo -e "${YELLOW}No running Kuber Player processes found.${NC}"
  fi
  exit 0
fi

echo -e "${CYAN}"
echo "  ██╗  ██╗██╗   ██╗██████╗ ███████╗██████╗ "
echo "  ██║ ██╔╝██║   ██║██╔══██╗██╔════╝██╔══██╗"
echo "  █████╔╝ ██║   ██║██████╔╝█████╗  ██████╔╝"
echo "  ██╔═██╗ ██║   ██║██╔══██╗██╔══╝  ██╔══██╗"
echo "  ██║  ██╗╚██████╔╝██████╔╝███████╗██║  ██║"
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝"
echo -e "${NC}"
echo -e "${CYAN}  Kuber Player — Cross-Platform Video Streaming${NC}"
echo ""

# ── Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed.${NC}"
  echo "Install it from https://nodejs.org/ or via your package manager:"
  echo "  Ubuntu/Debian: sudo apt install nodejs npm"
  echo "  CentOS/RHEL:   sudo yum install nodejs npm"
  echo "  macOS:         brew install node"
  exit 1
fi
echo -e "  ${GREEN}Node.js $(node --version)${NC} detected"

# ── Install frontend dependencies if needed ────────────────────────────────
if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo -e "\n${YELLOW}Installing frontend dependencies...${NC}"
  (cd "$FRONTEND_DIR" && npm install)
fi

# ── Create media folder if it doesn't exist ───────────────────────────────
mkdir -p "$MEDIA_DIR"

# ── Detect local IP ──────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

# ── Kill any old processes on ports 3000 and 8080 ────────────────────────────
echo -e "\n${YELLOW}Checking for processes on ports 3000 and 8080...${NC}"
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true

# ── Clear Vite cache ────────────────────────────────────────────────────────
rm -rf "$FRONTEND_DIR/node_modules/.vite"

# ── Start backend ────────────────────────────────────────────────────────────
echo -e "\n${CYAN}Starting backend API server on port 8080...${NC}"
node "$BACKEND_DIR/mock_server.js" > "$BACKEND_DIR/server.log" 2>&1 &
BACKEND_PID=$!
echo -e "  ${GREEN}Backend started (PID $BACKEND_PID)${NC}"

sleep 1

# Verify backend started
if ! kill -0 $BACKEND_PID 2>/dev/null; then
  echo -e "${RED}Backend failed to start! Check $BACKEND_DIR/server.log${NC}"
  exit 1
fi

# ── Start frontend ────────────────────────────────────────────────────────────
echo -e "${CYAN}Starting frontend dev server on port 3000...${NC}"
(cd "$FRONTEND_DIR" && npm run dev) > "$FRONTEND_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo -e "  ${GREEN}Frontend started (PID $FRONTEND_PID)${NC}"

# ── Save PIDs ────────────────────────────────────────────────────────────────
echo "$BACKEND_PID" > "$PID_FILE"
echo "$FRONTEND_PID" >> "$PID_FILE"

sleep 2

# Verify frontend started
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
  echo -e "${RED}Frontend failed to start! Check $FRONTEND_DIR/frontend.log${NC}"
  cat "$FRONTEND_DIR/frontend.log"
  exit 1
fi

# ── Print access URLs ────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Kuber Player is running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}Frontend (Web UI) — the ONLY address you need to share${NC}"
echo -e "    Local:    ${GREEN}http://localhost:3000${NC}"
echo -e "    Network:  ${GREEN}http://${LOCAL_IP}:3000${NC}"
echo ""
echo -e "  ${CYAN}Backend API — private, stays on this machine only${NC}"
echo -e "    Local:    ${GREEN}http://localhost:8080${NC}  (not needed publicly)"
echo -e "    All /api/* calls are proxied through port 3000 automatically."
echo ""
echo -e "  ${CYAN}Cloudflare Tunnel (public internet access)${NC}"
echo -e "    Tunnel port 3000 ONLY — backend is handled automatically:"
echo -e "    ${YELLOW}cloudflared tunnel --url http://localhost:3000${NC}"
echo -e "    Or for a named tunnel (persistent URL):"
echo -e "    ${YELLOW}cloudflared tunnel run <tunnel-name>${NC}"
echo ""
echo -e "  ${CYAN}Media Folder${NC}"
echo -e "    Path:     ${GREEN}$MEDIA_DIR${NC}"
echo -e "    Drop video files here — they appear in the UI automatically."
echo ""
echo -e "  ${YELLOW}Logs${NC}"
echo -e "    Backend:  $BACKEND_DIR/server.log"
echo -e "    Frontend: $FRONTEND_DIR/frontend.log"
echo ""
echo -e "  ${YELLOW}To stop all servers:${NC}  bash start.sh --stop"
echo ""

# ── If VPS: print firewall hints ──────────────────────────────────────────────
if [[ "$LOCAL_IP" != "127.0.0.1" ]]; then
  echo -e "  ${YELLOW}VPS / Firewall:${NC} Only port 3000 needs to be open for public access."
  echo -e "  Port 8080 (backend) stays private — Vite proxies all API calls locally."
  echo -e "    UFW:          sudo ufw allow 3000/tcp"
  echo -e "    firewalld:    sudo firewall-cmd --add-port=3000/tcp --permanent && sudo firewall-cmd --reload"
  echo -e "    iptables:     sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT"
  echo ""
fi

echo -e "${CYAN}Press Ctrl+C to stop all servers...${NC}"

# ── Wait and clean up on Ctrl+C ───────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Stopping servers...${NC}"
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  rm -f "$PID_FILE"
  echo -e "${GREEN}Done. Goodbye!${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM
wait
