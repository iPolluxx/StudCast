#!/usr/bin/env bash
# =============================================================================
#  gcp-workstation.sh
#  CLI controller for the Lone Ranger Unity workstation on GCP.
#
#  Usage:
#    ./scripts/gcp-workstation.sh <command>
#
#  Commands:
#    provision      Create the VM (first-time setup only)
#    start          Wake the machine and show RDP connection info
#    stop           Shut the machine down and pause billing
#    status         Show current runtime state and public IP
#    password       Reset the Windows desktop password for user 'builder'
#    aliases        Print ready-to-paste shell alias setup instructions
#
#  Cost reference (us-central1, on-demand):
#    RUNNING  ~$0.32/hr  (n1-standard-4 + Windows Server license)
#    STOPPED  ~$0.05/hr  (100 GB pd-balanced disk storage only)
#  Note: GPU-free until GCP quota approved. Add GPU via 'gcloud compute
#        instances set-machine-type' after quota is granted.
# =============================================================================

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────

readonly PROJECT="mightdoit"
readonly ZONE="us-central1-a"
readonly REGION="us-central1"
readonly INSTANCE="lone-ranger-unity-desktop"
readonly MACHINE_TYPE="n1-standard-4"
readonly DISK_SIZE="100GB"
readonly DISK_TYPE="pd-balanced"
readonly WINDOWS_USER="builder"
readonly IMAGE_FAMILY="windows-2022"
readonly IMAGE_PROJECT="windows-cloud"

# Approximate billing rates (USD) — no GPU; update when GPU is added
readonly COST_RUNNING="0.32"
readonly COST_STOPPED="0.05"

# ── ANSI colour helpers ───────────────────────────────────────────────────────

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

# ── Guard: require gcloud ─────────────────────────────────────────────────────

require_gcloud() {
    if ! command -v gcloud &>/dev/null; then
        error "gcloud SDK not found. Install it from: https://cloud.google.com/sdk/docs/install"
        exit 1
    fi
}

# ── Commands ──────────────────────────────────────────────────────────────────

cmd_provision() {
    echo ""
    echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║        PROVISIONING UNITY GPU WORKSTATION                ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
    echo ""
    info "Project   : $PROJECT"
    info "Zone      : $ZONE"
    info "Instance  : $INSTANCE"
    info "Machine   : $MACHINE_TYPE  (4 vCPUs, 15 GB RAM)"
    info "GPU       : none (add after GCP quota approved)"
    info "Disk      : $DISK_SIZE $DISK_TYPE"
    info "OS        : Windows Server 2022 Datacenter"
    echo ""
    warn "This will CREATE a new billable VM. Disk charges (~\$${COST_STOPPED}/hr) begin immediately."
    echo ""
    read -r -p "$(echo -e "${YELLOW}${BOLD}Confirm provisioning? [y/N]:${RESET} ")" confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Aborted."; exit 0; }
    echo ""

    info "Running gcloud compute instances create..."
    gcloud compute instances create "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family="$IMAGE_FAMILY" \
        --image-project="$IMAGE_PROJECT" \
        --boot-disk-size="$DISK_SIZE" \
        --boot-disk-type="$DISK_TYPE" \
        --maintenance-policy=TERMINATE \
        --no-restart-on-failure

    echo ""
    success "VM provisioned successfully."
    echo ""
    dim  "  Next steps:"
    dim  "  1. Run: $(basename "$0") password   — to set your RDP login password"
    dim  "  2. Run: $(basename "$0") status     — to get the public IP address"
    dim  "  3. Open Remote Desktop (mstsc) and connect to the IP on port 3389"
    dim  "  4. Run unity/tools/setup-workstation.ps1 as Administrator"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────

cmd_start() {
    echo ""
    info "Starting $INSTANCE in $ZONE..."
    gcloud compute instances start "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE"

    echo ""
    # ── Fail-safe billing reminder ────────────────────────────────────────────
    echo -e "${YELLOW}${BOLD}┌─────────────────────────────────────────────────────────┐${RESET}"
    echo -e "${YELLOW}${BOLD}│  ⚠  BILLING REMINDER                                    │${RESET}"
    echo -e "${YELLOW}${BOLD}│                                                         │${RESET}"
    echo -e "${YELLOW}${BOLD}│  Running cost:  ~\$${COST_RUNNING}/hr                           │${RESET}"
    echo -e "${YELLOW}${BOLD}│  (n1-standard-4 + Windows license + NVIDIA T4)          │${RESET}"
    echo -e "${YELLOW}${BOLD}│                                                         │${RESET}"
    echo -e "${YELLOW}${BOLD}│  When your session is done, run:                        │${RESET}"
    echo -e "${YELLOW}${BOLD}│                                                         │${RESET}"
    echo -e "${YELLOW}${BOLD}│      ./scripts/gcp-workstation.sh stop                  │${RESET}"
    echo -e "${YELLOW}${BOLD}│      (or alias: dev-box-stop)                           │${RESET}"
    echo -e "${YELLOW}${BOLD}│                                                         │${RESET}"
    echo -e "${YELLOW}${BOLD}│  Stopped disk cost: ~\$${COST_STOPPED}/hr (storage only)        │${RESET}"
    echo -e "${YELLOW}${BOLD}└─────────────────────────────────────────────────────────┘${RESET}"
    echo ""

    cmd_status
}

# ─────────────────────────────────────────────────────────────────────────────

cmd_stop() {
    echo ""
    info "Stopping $INSTANCE..."
    gcloud compute instances stop "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE"

    echo ""
    success "Machine stopped. Billing paused (disk storage: ~\$${COST_STOPPED}/hr)."
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────

cmd_status() {
    echo ""
    info "Fetching status for $INSTANCE..."
    echo ""

    # Pull the fields we care about
    local status external_ip
    status=$(gcloud compute instances describe "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE" \
        --format="value(status)" 2>/dev/null) || {
        error "Instance '$INSTANCE' not found in project $PROJECT / zone $ZONE."
        error "Run 'provision' first if this is a fresh environment."
        exit 1
    }

    external_ip=$(gcloud compute instances describe "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE" \
        --format="value(networkInterfaces[0].accessConfigs[0].natIP)" 2>/dev/null)

    # Colour-coded status badge
    local status_badge
    case "$status" in
        RUNNING)    status_badge="${GREEN}${BOLD}● RUNNING${RESET}" ;;
        TERMINATED) status_badge="${DIM}○ STOPPED${RESET}" ;;
        STAGING)    status_badge="${YELLOW}◐ STARTING...${RESET}" ;;
        STOPPING)   status_badge="${YELLOW}◑ STOPPING...${RESET}" ;;
        *)          status_badge="${CYAN}? $status${RESET}" ;;
    esac

    echo -e "  Instance   : ${BOLD}$INSTANCE${RESET}"
    echo -e "  Status     : $status_badge"
    echo -e "  Zone       : $ZONE"

    if [[ "$status" == "RUNNING" && -n "$external_ip" ]]; then
        echo -e "  Public IP  : ${BOLD}${GREEN}$external_ip${RESET}"
        echo ""
        dim  "  RDP connect: mstsc /v:${external_ip}:3389"
        dim  "  Username   : $WINDOWS_USER"
        dim  "  Password   : run '$(basename "$0") password' if needed"
    elif [[ "$status" == "TERMINATED" ]]; then
        echo -e "  Public IP  : ${DIM}(none — machine is stopped)${RESET}"
        dim  "  Run '$(basename "$0") start' to wake it up."
    fi
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────

cmd_password() {
    echo ""
    info "Resetting Windows password for user '${WINDOWS_USER}' on $INSTANCE..."
    warn "This will generate a new password and display it once in plain text."
    warn "Save it immediately — it cannot be retrieved again."
    echo ""
    gcloud compute reset-windows-password "$INSTANCE" \
        --project="$PROJECT" \
        --zone="$ZONE" \
        --user="$WINDOWS_USER"
    echo ""
    dim  "  Use these credentials in Remote Desktop (mstsc) to connect."
    dim  "  Run '$(basename "$0") status' to get the public IP if needed."
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────

cmd_aliases() {
    local script_abs launch_abs
    script_abs="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    launch_abs="$(cd "$(dirname "$0")" && pwd)/fast-launch.sh"

    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo -e "${BOLD}  Shell Alias Setup — Single-Word Workstation Commands${RESET}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
    echo -e "${CYAN}Step 1${RESET} — Add these aliases to your shell profile."
    echo ""
    echo -e "  For ${BOLD}bash${RESET} users, open ${BOLD}~/.bashrc${RESET}:"
    echo -e "  ${DIM}nano ~/.bashrc${RESET}"
    echo ""
    echo -e "  For ${BOLD}zsh${RESET} users, open ${BOLD}~/.zshrc${RESET}:"
    echo -e "  ${DIM}nano ~/.zshrc${RESET}"
    echo ""
    echo -e "${CYAN}Step 2${RESET} — Paste this block at the bottom of the file:"
    echo ""
    echo -e "${GREEN}# ── Lone Ranger Unity Workstation (GCP) ──────────────────────${RESET}"
    echo -e "${GREEN}alias dev-box-launch=\"${launch_abs}\"${RESET}"
    echo -e "${GREEN}alias dev-box-start=\"${script_abs} start\"${RESET}"
    echo -e "${GREEN}alias dev-box-stop=\"${script_abs} stop\"${RESET}"
    echo -e "${GREEN}alias dev-box-status=\"${script_abs} status\"${RESET}"
    echo -e "${GREEN}alias dev-box-password=\"${script_abs} password\"${RESET}"
    echo -e "${GREEN}alias dev-box-provision=\"${script_abs} provision\"${RESET}"
    echo ""
    echo -e "${CYAN}Step 3${RESET} — Reload your shell to activate:"
    echo ""
    echo -e "  ${DIM}source ~/.bashrc${RESET}   ${DIM}# bash${RESET}"
    echo -e "  ${DIM}source ~/.zshrc${RESET}    ${DIM}# zsh${RESET}"
    echo ""
    echo -e "${CYAN}After setup, control the workstation with:${RESET}"
    echo ""
    echo -e "  ${BOLD}dev-box-launch${RESET}     — ${BOLD}Full auto-launch:${RESET} start → wait → RDP connect (one command)"
    echo -e "  ${BOLD}dev-box-start${RESET}      — Wake the machine, show billing warning + IP"
    echo -e "  ${BOLD}dev-box-stop${RESET}       — Shut it down instantly, pause billing"
    echo -e "  ${BOLD}dev-box-status${RESET}     — Check if it's running and get the public IP"
    echo -e "  ${BOLD}dev-box-password${RESET}   — Reset the RDP login password"
    echo -e "  ${BOLD}dev-box-provision${RESET}  — First-time VM creation (run once)"
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────────

usage() {
    echo ""
    echo -e "${BOLD}gcp-workstation.sh${RESET} — Lone Ranger Unity GPU Workstation Controller"
    echo ""
    echo -e "  ${BOLD}Usage:${RESET} $(basename "$0") <command>"
    echo ""
    echo -e "  ${CYAN}provision${RESET}   Create the VM (first-time setup only)"
    echo -e "  ${CYAN}start${RESET}       Wake the machine and show RDP connection info"
    echo -e "  ${CYAN}stop${RESET}        Shut the machine down and pause billing"
    echo -e "  ${CYAN}status${RESET}      Show current runtime state and public IP"
    echo -e "  ${CYAN}password${RESET}    Reset the Windows RDP password for user '${WINDOWS_USER}'"
    echo -e "  ${CYAN}aliases${RESET}     Print shell alias setup instructions"
    echo ""
    echo -e "  ${DIM}Running cost: ~\$${COST_RUNNING}/hr  |  Stopped (disk): ~\$${COST_STOPPED}/hr${RESET}"
    echo ""
}

# ── Main dispatcher ───────────────────────────────────────────────────────────

require_gcloud

case "${1:-}" in
    provision)  cmd_provision ;;
    start)      cmd_start ;;
    stop)       cmd_stop ;;
    status)     cmd_status ;;
    password)   cmd_password ;;
    aliases)    cmd_aliases ;;
    ""|--help|-h) usage ;;
    *)
        error "Unknown command: '${1}'"
        usage
        exit 1
        ;;
esac
