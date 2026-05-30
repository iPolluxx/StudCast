# =============================================================================
#  setup-workstation.ps1
#  Headless provisioner for the Lone Ranger Unity GPU workstation.
#  Run this ONCE on the GCP Windows Server 2022 VM after first RDP login.
#
#  What it installs (silently, no user interaction required):
#    1. Git for Windows  — for pulling the repo onto the VM
#    2. Unity Hub        — the Unity installation manager
#    3. Unity Editor 2021.3.44f1 + WebGL build module
#
#  Usage (run as Administrator in PowerShell):
#    Set-ExecutionPolicy Bypass -Scope Process -Force
#    .\setup-workstation.ps1
#
#  Runtime:  ~15–25 minutes depending on download speed.
#  Disk use: ~12 GB (Unity Editor + WebGL module).
# =============================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Configuration ─────────────────────────────────────────────────────────────

# Unity Editor version to install
$UNITY_VERSION   = "2021.3.44f1"

# Changeset hash for 2021.3.44f1 — verify at:
# https://unity.com/releases/editor/archive  (click the release, copy hash from download URL)
# Example URL pattern: unityhub://2021.3.44f1/<CHANGESET>
$UNITY_CHANGESET = "94d194ca434d"

# Unity Hub CDN installer
$UNITY_HUB_URL   = "https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe"

# Git for Windows installer (update version as needed — see github.com/git-for-windows/git/releases)
$GIT_VERSION     = "2.46.0"
$GIT_URL         = "https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.exe"

# Install paths
$UNITY_HUB_EXE   = "${env:ProgramFiles}\Unity Hub\Unity Hub.exe"
$TEMP_DIR        = "$env:TEMP\lone-ranger-setup"

# ── Colour helpers ────────────────────────────────────────────────────────────

function Write-Step  { param($msg) Write-Host "`n[STEP]  $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "[ERR]   $msg" -ForegroundColor Red }

# ── Utility: Download with progress ──────────────────────────────────────────

function Download-File {
    param(
        [string]$Url,
        [string]$Destination,
        [string]$Label
    )
    Write-Host "  Downloading $Label..." -ForegroundColor DarkGray
    # Use BITS for large files (resumable, progress-aware) with WebRequest fallback
    try {
        Import-Module BitsTransfer -ErrorAction Stop
        Start-BitsTransfer -Source $Url -Destination $Destination -DisplayName $Label
    } catch {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    Write-Ok "$Label downloaded → $Destination"
}

# ── Main ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host "  Lone Ranger — Unity Workstation Silent Provisioner        " -ForegroundColor Magenta
Write-Host "  Target: Unity $UNITY_VERSION + WebGL on Windows Server 2022" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Magenta
Write-Host ""

# Create temp working directory
if (-not (Test-Path $TEMP_DIR)) { New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null }

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Git for Windows
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "Installing Git for Windows $GIT_VERSION (silent)..."

if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Ok "Git already installed — skipping."
} else {
    $gitInstaller = "$TEMP_DIR\GitInstaller.exe"
    Download-File -Url $GIT_URL -Destination $gitInstaller -Label "Git $GIT_VERSION"

    Write-Host "  Running silent installer..." -ForegroundColor DarkGray
    $gitArgs = @(
        "/VERYSILENT",
        "/NORESTART",
        "/NOCANCEL",
        "/SP-",
        "/CLOSEAPPLICATIONS",
        "/COMPONENTS=icons,ext\reg\shellhere,assoc,assoc_sh",
        "/LOG=$TEMP_DIR\git-install.log"
    )
    Start-Process -FilePath $gitInstaller -ArgumentList $gitArgs -Wait -NoNewWindow
    Write-Ok "Git installed successfully."

    # Refresh PATH so git is immediately available in this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("PATH", "User")
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Unity Hub
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "Installing Unity Hub (silent)..."

if (Test-Path $UNITY_HUB_EXE) {
    Write-Ok "Unity Hub already installed — skipping."
} else {
    $hubInstaller = "$TEMP_DIR\UnityHubSetup.exe"
    Download-File -Url $UNITY_HUB_URL -Destination $hubInstaller -Label "Unity Hub"

    Write-Host "  Running silent installer..." -ForegroundColor DarkGray
    # /S = NSIS silent install flag for Unity Hub
    Start-Process -FilePath $hubInstaller -ArgumentList "/S" -Wait -NoNewWindow

    if (-not (Test-Path $UNITY_HUB_EXE)) {
        Write-Fail "Unity Hub installer finished but executable not found at expected path."
        Write-Fail "Expected: $UNITY_HUB_EXE"
        Write-Fail "Check $TEMP_DIR for logs and re-run."
        exit 1
    }
    Write-Ok "Unity Hub installed at: $UNITY_HUB_EXE"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Unity Editor 2021.3.44f1 + WebGL module
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "Installing Unity $UNITY_VERSION with WebGL module via Unity Hub CLI..."
Write-Host "  This step downloads ~8 GB. Estimated time: 10–20 minutes." -ForegroundColor DarkGray
Write-Host ""

if ($UNITY_CHANGESET -eq "YOUR_CHANGESET_HERE") {
    Write-Warn "UNITY_CHANGESET is not set."
    Write-Warn "1. Go to: https://unity.com/releases/editor/archive"
    Write-Warn "2. Find Unity $UNITY_VERSION and click the 'Unity Hub' button."
    Write-Warn "3. Copy the hash from the URL: unityhub://$UNITY_VERSION/<HASH>"
    Write-Warn "4. Edit this script and set: `$UNITY_CHANGESET = '<HASH>'"
    Write-Warn "Then re-run this script."
    exit 1
}

# Unity Hub 3.x headless install syntax:
#   "Unity Hub.exe" -- --headless install --version <ver> --changeset <hash> --module <id>
#
# Module IDs: webgl | windows | android | ios | linux-mono
# Multiple modules: --module webgl --module windows-il2cpp
$hubArgs = "-- --headless install --version `"$UNITY_VERSION`" --changeset `"$UNITY_CHANGESET`" --module webgl"

Write-Host "  Command: `"$UNITY_HUB_EXE`" $hubArgs" -ForegroundColor DarkGray
Write-Host ""

$proc = Start-Process -FilePath $UNITY_HUB_EXE -ArgumentList $hubArgs -Wait -NoNewWindow -PassThru

if ($proc.ExitCode -ne 0) {
    Write-Fail "Unity Hub returned exit code $($proc.ExitCode)."
    Write-Fail "Check Unity Hub logs at: $env:APPDATA\UnityHub\logs"
    exit 1
}

Write-Ok "Unity $UNITY_VERSION + WebGL module installed."

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Clone the repository
# ─────────────────────────────────────────────────────────────────────────────

Write-Step "Cloning Lone Ranger repository..."

$repoUrl    = "https://github.com/iPolluxx/Voice-To-Estimate.git"
$repoTarget = "C:\Projects\Voice-To-Estimate"

if (Test-Path "$repoTarget\.git") {
    Write-Ok "Repository already cloned at $repoTarget — pulling latest..."
    & git -C $repoTarget pull origin main
} else {
    New-Item -ItemType Directory -Path (Split-Path $repoTarget) -Force | Out-Null
    & git clone $repoUrl $repoTarget
    Write-Ok "Repository cloned to $repoTarget"
}

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Git:        $(git --version 2>$null)" -ForegroundColor White
Write-Host "  Unity Hub:  $UNITY_HUB_EXE" -ForegroundColor White
Write-Host "  Unity:      $UNITY_VERSION (WebGL module)" -ForegroundColor White
Write-Host "  Repo:       $repoTarget" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open Unity Hub and sign in to your Unity account." -ForegroundColor White
Write-Host "  2. Click 'Open' and navigate to: $repoTarget\unity" -ForegroundColor White
Write-Host "  3. Open the project with Unity $UNITY_VERSION." -ForegroundColor White
Write-Host "  4. In the Unity Editor: Window > Package Manager — verify packages load." -ForegroundColor White
Write-Host "  5. Open ConstructionManager scene and assign prefabs in the Inspector." -ForegroundColor White
Write-Host "  6. File > Build Settings > WebGL > Build And Run." -ForegroundColor White
Write-Host ""
Write-Host "  Remember to run 'dev-box-stop' from your local machine when done!" -ForegroundColor Yellow
Write-Host ""
