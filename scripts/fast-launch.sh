#!/usr/bin/env bash
# =============================================================================
#  fast-launch.sh
#  One-command cold-start for the Lone Ranger Unity GPU workstation.
#
#  What it does:
#    1. Prints billing warning and starts the GCP VM.
#    2. Waits for the instance to reach RUNNING state and obtain a public IP.
#    3. Loop-probes TCP port 3389 every 5 seconds until Windows RDP is alive.
#    4. Fires mstsc.exe (WSL) or xfreerdp (native Linux) the moment it responds.
#
#  Usage:
#    ./scripts/fast-launch.sh
#    dev-box-launch              (after running: gcp-workstation.sh aliases)
# =============================================================================

set -euo pipefail

# ── Configuration (mirrors gcp-workstation.sh) ────────────────────────────────

readonly PROJECT="mightdoit"
readonly ZONE="us-central1-a"
readonly INSTANCE="lone-ranger-unity-desktop"
readonly WINDOWS_USER="builder"
readonly RDP_PORT=3389

readonly COST_RUNNING="0.32"
readonly COST_STOPPED="0.05"

readonly POLL_INTERVAL=5    # seconds between TCP probes
readonly MAX_WAIT=300        # abort after 5 minutes if RDP never answers

# ── Colour helpers ────────────────────────────────────────────────────────────

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

info()    { echo -e "${CYAN}${BOLD}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}${BOLD}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}${BOLD}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}${BOLD}[ERR]${RESET}   $*" >&2; }
dim()     { echo -e "${DIM}$*${RESET}"; }

# ── Helpers ───────────────────────────────────────────────────────────────────

# Pure-bash TCP probe — no nc/nmap dependency required.
tcp_probe() {
    local host="$1" port="$2"
    (echo >/dev/tcp/"$host"/"$port") 2>/dev/null
}

# Retrieve the current external IP from GCP metadata.
get_external_ip() {
    gcloud compute instances describe "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE" \
        --format="value(networkInterfaces[0].accessConfigs[0].natIP)" 2>/dev/null
}

# Detect the best available RDP client and launch it.
launch_rdp() {
    local ip="$1"

    # ── Option 1: WSL — call the native Windows mstsc.exe ─────────────────
    local wsl_mstsc="/mnt/c/Windows/System32/mstsc.exe"
    if [[ -f "$wsl_mstsc" ]]; then
        success "WSL detected — launching mstsc.exe..."
        "$wsl_mstsc" /v:"${ip}:${RDP_PORT}" &
        return 0
    fi

    # ── Option 2: xfreerdp (most common Linux RDP client) ─────────────────
    if command -v xfreerdp &>/dev/null; then
        success "Launching xfreerdp..."
        xfreerdp /v:"$ip" /port:"$RDP_PORT" /u:"$WINDOWS_USER" /dynamic-resolution &
        return 0
    fi

    # ── Option 3: rdesktop (legacy Linux RDP client) ──────────────────────
    if command -v rdesktop &>/dev/null; then
        success "Launching rdesktop..."
        rdesktop "${ip}:${RDP_PORT}" -u "$WINDOWS_USER" &
        return 0
    fi

    # ── Fallback: print connection string and let the user connect manually ─
    warn "No RDP client found (mstsc / xfreerdp / rdesktop)."
    echo ""
    echo -e "  Connect manually with:"
    echo -e "  ${BOLD}mstsc /v:${ip}:${RDP_PORT}${RESET}   ${DIM}(Windows)${RESET}"
    echo -e "  ${BOLD}xfreerdp /v:${ip} /port:${RDP_PORT} /u:${WINDOWS_USER}${RESET}   ${DIM}(Linux)${RESET}"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        LONE RANGER — FAST LAUNCH                        ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Billing warning ───────────────────────────────────────────────────────────
echo -e "${YELLOW}${BOLD}┌─────────────────────────────────────────────────────────┐${RESET}"
echo -e "${YELLOW}${BOLD}│  ⚠  BILLING REMINDER                                    │${RESET}"
echo -e "${YELLOW}${BOLD}│  Running cost:  ~\$${COST_RUNNING}/hr (n1-standard-4 + Windows)    │${RESET}"
echo -e "${YELLOW}${BOLD}│  When done, run:  dev-box-stop                          │${RESET}"
echo -e "${YELLOW}${BOLD}│  Stopped disk cost: ~\$${COST_STOPPED}/hr (storage only)        │${RESET}"
echo -e "${YELLOW}${BOLD}└─────────────────────────────────────────────────────────┘${RESET}"
echo ""

# ── Step 1: Start the VM ──────────────────────────────────────────────────────
info "Starting $INSTANCE..."
gcloud compute instances start "$INSTANCE" \
    --project="$PROJECT" \
    --zone="$ZONE" \
    --quiet
success "Start command issued."
echo ""

# ── Step 2: Wait for public IP ────────────────────────────────────────────────
info "Waiting for public IP..."
external_ip=""
ip_wait=0
while [[ -z "$external_ip" ]]; do
    external_ip=$(get_external_ip)
    if [[ -z "$external_ip" ]]; then
        sleep 3
        ip_wait=$((ip_wait + 3))
        if (( ip_wait > 60 )); then
            error "Timed out waiting for public IP after 60s. Run 'gcp-workstation.sh status' to check."
            exit 1
        fi
    fi
done
success "Public IP: ${BOLD}${GREEN}${external_ip}${RESET}"
echo ""

# ── Step 3: Poll TCP 3389 until Windows RDP is alive ─────────────────────────
info "Waiting for RDP (TCP ${RDP_PORT}) to become available..."
dim  "  This typically takes 60–120 seconds while Windows finishes booting."
echo ""

elapsed=0
while ! tcp_probe "$external_ip" "$RDP_PORT"; do
    printf "\r${DIM}  [%3ds elapsed] Probing ${external_ip}:${RDP_PORT}...${RESET}" "$elapsed"
    sleep "$POLL_INTERVAL"
    elapsed=$((elapsed + POLL_INTERVAL))
    if (( elapsed >= MAX_WAIT )); then
        echo ""
        error "RDP did not respond within ${MAX_WAIT}s."
        error "The VM may still be booting. Connect manually: mstsc /v:${external_ip}:${RDP_PORT}"
        exit 1
    fi
done

echo ""
echo ""
success "RDP is live! (${elapsed}s elapsed)"
echo ""

# ── Step 4: Launch RDP client ─────────────────────────────────────────────────
info "Connecting to ${external_ip}:${RDP_PORT} as '${WINDOWS_USER}'..."
launch_rdp "$external_ip"

echo ""
dim  "  Remember to run 'dev-box-stop' when your session ends."
dim  "  Idle cost: ~\$${COST_RUNNING}/hr while the machine stays on."
echo ""
