# ===========================================================================
#  setup-workstation.ps1
#  Headless provisioner for the StudCast Unity workstation.
#  Run ONCE on the GCP Windows Server 2022 VM after first RDP login.
#
#  Usage (run as Administrator in PowerShell):
#    Set-ExecutionPolicy Bypass -Scope Process -Force
#    .\setup-workstation.ps1
#
#  Runtime:  ~15-25 minutes depending on download speed.
#  Disk use: ~12 GB (Unity Editor + WebGL module).
# ===========================================================================

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

$UNITY_VERSION   = "2021.3.44f1"
$UNITY_CHANGESET = "94d194ca434d"
$UNITY_HUB_URL   = "https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe"
$GIT_VERSION     = "2.46.0"
$GIT_URL         = "https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.exe"
$UNITY_HUB_EXE   = "${env:ProgramFiles}\Unity Hub\Unity Hub.exe"
$TEMP_DIR        = "$env:TEMP\studcast-setup"
$REPO_URL        = "https://github.com/iPolluxx/StudCast.git"
$REPO_TARGET     = "C:\Projects\StudCast"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step { param($msg) Write-Host "" ; Write-Host "[STEP]  $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Fail { param($msg) Write-Host "[ERR]   $msg" -ForegroundColor Red }

function Download-File {
    param([string]$Url, [string]$Destination, [string]$Label)
    Write-Host "  Downloading $Label..." -ForegroundColor DarkGray
    try {
        Import-Module BitsTransfer -ErrorAction Stop
        Start-BitsTransfer -Source $Url -Destination $Destination -DisplayName $Label
    } catch {
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    }
    Write-Ok "$Label downloaded."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Magenta
Write-Host "  StudCast - Unity Workstation Provisioner                 " -ForegroundColor Magenta
Write-Host "  Unity $UNITY_VERSION + WebGL on Windows Server 2022     " -ForegroundColor DarkGray
Write-Host "===========================================================" -ForegroundColor Magenta
Write-Host ""

if (-not (Test-Path $TEMP_DIR)) { New-Item -ItemType Directory -Path $TEMP_DIR | Out-Null }

# ---------------------------------------------------------------------------
# Step 1: Git for Windows
# ---------------------------------------------------------------------------

Write-Step "Installing Git for Windows $GIT_VERSION..."

if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Ok "Git already installed - skipping."
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
    Write-Ok "Git installed."

    $machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $userPath    = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    $env:PATH    = $machinePath + ";" + $userPath
}

# ---------------------------------------------------------------------------
# Step 2: Unity Hub
# ---------------------------------------------------------------------------

Write-Step "Installing Unity Hub..."

if (Test-Path $UNITY_HUB_EXE) {
    Write-Ok "Unity Hub already installed - skipping."
} else {
    $hubInstaller = "$TEMP_DIR\UnityHubSetup.exe"
    Download-File -Url $UNITY_HUB_URL -Destination $hubInstaller -Label "Unity Hub"

    Write-Host "  Running silent installer..." -ForegroundColor DarkGray
    Start-Process -FilePath $hubInstaller -ArgumentList "/S" -Wait -NoNewWindow

    if (-not (Test-Path $UNITY_HUB_EXE)) {
        Write-Fail "Unity Hub not found after install. Check $TEMP_DIR for logs."
        exit 1
    }
    Write-Ok "Unity Hub installed."
}

# ---------------------------------------------------------------------------
# Step 3: Unity Editor 2021.3.44f1 + WebGL module
# ---------------------------------------------------------------------------

Write-Step "Installing Unity $UNITY_VERSION with WebGL module..."
Write-Host "  This downloads ~8 GB and takes 10-20 minutes." -ForegroundColor DarkGray
Write-Host ""

$hubArgs = "-- --headless install --version `"$UNITY_VERSION`" --changeset `"$UNITY_CHANGESET`" --module webgl"
Write-Host "  Running: $UNITY_HUB_EXE $hubArgs" -ForegroundColor DarkGray
Write-Host ""

$proc = Start-Process -FilePath $UNITY_HUB_EXE -ArgumentList $hubArgs -Wait -NoNewWindow -PassThru

if ($proc.ExitCode -ne 0) {
    Write-Fail "Unity Hub exited with code $($proc.ExitCode)."
    Write-Fail "Check logs at: $env:APPDATA\UnityHub\logs"
    exit 1
}

Write-Ok "Unity $UNITY_VERSION + WebGL module installed."

# ---------------------------------------------------------------------------
# Step 4: Clone the StudCast repository
# ---------------------------------------------------------------------------

Write-Step "Cloning StudCast repository..."

if (Test-Path "$REPO_TARGET\.git") {
    Write-Ok "Repo already cloned - pulling latest..."
    & git -C $REPO_TARGET pull origin main
} else {
    New-Item -ItemType Directory -Path (Split-Path $REPO_TARGET) -Force | Out-Null
    & git clone $REPO_URL $REPO_TARGET
    Write-Ok "Repository cloned to $REPO_TARGET"
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "  Setup complete!                                           " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Unity:  $UNITY_VERSION (WebGL)" -ForegroundColor White
Write-Host "  Repo:   $REPO_TARGET" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Cyan
Write-Host "  1. Open Unity Hub and sign in to your Unity account." -ForegroundColor White
Write-Host "  2. Open project at: $REPO_TARGET\unity" -ForegroundColor White
Write-Host "  3. Assign prefabs in the Inspector." -ForegroundColor White
Write-Host "  4. File > Build Settings > WebGL > Build And Run." -ForegroundColor White
Write-Host ""
Write-Host "  Run dev-box-stop from your local machine when done!" -ForegroundColor Yellow
Write-Host ""
