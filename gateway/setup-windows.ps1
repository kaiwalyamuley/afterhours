# Sets up the YOUPI PG payment gateway for AfterHours on a Windows PC that stays on.
# Run in PowerShell (not as administrator) from the folder that holds this file:
#   powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1 -UpiId yourbrand@okaxis
# It is safe to run again; finished steps are skipped.
param(
  [string]$UpiId = "",
  [string]$Hostname = "pay.wearafterhours.store"
)
$ErrorActionPreference = "Stop"
$Repo = "https://github.com/youpi-pg/YouPI-PG.git"
$Commit = "405327c"   # The version AfterHours was tested against.
$Dir = Join-Path $env:USERPROFILE "youpi-pg"
$Tunnel = "afterhours-pay"
$Domain = ($Hostname -split "\.", 2)[1]
$ApiHost = ($Hostname -split "\.", 2)[0] + "-api." + $Domain
$GmailHost = ($Hostname -split "\.", 2)[0] + "-gmail." + $Domain

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not $UpiId) { $UpiId = Read-Host "Your UPI ID (for example yourbrand@okaxis)" }
if ($UpiId -notmatch '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$') { throw "That does not look like a UPI ID." }

Step "Checking Node.js 24.22.1+, Git and cloudflared"
$nodeOk = $false
if (Have node) { node -e "const [a,b,c]=process.versions.node.split('.').map(Number);process.exit(a>24||(a==24&&(b>22||(b==22&&c>=1)))?0:1)"; $nodeOk = ($LASTEXITCODE -eq 0) }
if (-not $nodeOk) { winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements; RefreshPath }
if (-not (Have git)) { winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements; RefreshPath }
if (-not (Have cloudflared)) { winget install -e --id Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements; RefreshPath }
node -v; git --version; cloudflared --version

Step "Downloading the gateway to $Dir"
if (-not (Test-Path (Join-Path $Dir ".git"))) { git clone $Repo $Dir }
Push-Location $Dir
git fetch --quiet origin
git -c advice.detachedHead=false checkout --quiet $Commit
npm ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

Step "Writing AfterHours settings into .env"
$Helper = Join-Path $PSScriptRoot "connect-afterhours.mjs"
if (-not (Test-Path $Helper)) { throw "connect-afterhours.mjs must be in the same folder as this script." }
Copy-Item $Helper (Join-Path $Dir "connect-afterhours.mjs") -Force
node connect-afterhours.mjs env --upi $UpiId --host $Hostname
if ($LASTEXITCODE -ne 0) { throw "Writing .env failed" }
New-Item -ItemType Directory -Force (Join-Path $Dir "logs") | Out-Null

Step "Creating the Cloudflare Tunnel for $Hostname"
$CfDir = Join-Path $env:USERPROFILE ".cloudflared"
if (-not (Test-Path (Join-Path $CfDir "cert.pem"))) {
  Write-Host "A browser window opens. Sign in to Cloudflare and pick $Domain." -ForegroundColor Yellow
  cloudflared tunnel login
}
$existing = cloudflared tunnel list --name $Tunnel --output json | ConvertFrom-Json
if (-not $existing) { cloudflared tunnel create $Tunnel; $existing = cloudflared tunnel list --name $Tunnel --output json | ConvertFrom-Json }
$TunnelId = @($existing)[0].id
foreach ($h in @($Hostname, $ApiHost, $GmailHost)) {
  cloudflared tunnel route dns $Tunnel $h
  if ($LASTEXITCODE -ne 0) { Write-Host "  (DNS for $h may already exist; check it points to this tunnel in Cloudflare.)" -ForegroundColor Yellow }
}
# Only the checkout portal, the API (for the Android observer) and Gmail sign-in are public.
# The admin panel (6001) and control center (8090) stay on this PC.
$Config = Join-Path $CfDir "$Tunnel.yml"
@"
tunnel: $TunnelId
credentials-file: $(Join-Path $CfDir "$TunnelId.json")
ingress:
  - hostname: $Hostname
    service: http://localhost:7000
  - hostname: $ApiHost
    service: http://localhost:6100
  - hostname: $GmailHost
    service: http://localhost:6003
  - service: http_status:404
"@ | Set-Content -Encoding ascii $Config

Step "Starting the gateway and tunnel now and at every sign-in"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$gatewayAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c npm start >> logs\gateway.log 2>&1" -WorkingDirectory $Dir
$tunnelAction = New-ScheduledTaskAction -Execute (Get-Command cloudflared).Source -Argument "tunnel --config `"$Config`" run $Tunnel"
Register-ScheduledTask -TaskName "AfterHours Payment Gateway" -Action $gatewayAction -Trigger $trigger -Settings $settings -Force | Out-Null
Register-ScheduledTask -TaskName "AfterHours Payment Tunnel" -Action $tunnelAction -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "AfterHours Payment Gateway"
Start-ScheduledTask -TaskName "AfterHours Payment Tunnel"

Write-Host "Waiting for the gateway to come up..."
$up = $false
for ($i = 0; $i -lt 90 -and -not $up; $i++) {
  try { $up = (Invoke-RestMethod -TimeoutSec 2 http://localhost:7000/health).status -eq "UP" } catch { $up = $false }
  if (-not $up) { Start-Sleep 1 }
}
if (-not $up) { throw "The gateway did not start. See $Dir\logs\gateway.log" }

Step "Connecting the gateway to AfterHours"
node connect-afterhours.mjs connect --upi $UpiId
if ($LASTEXITCODE -ne 0) { throw "Connecting failed" }
Pop-Location

Write-Host "`nDone. Next:" -ForegroundColor Green
Write-Host "  1. Copy the four values above into Supabase > Edge Functions > Secrets, then delete $Dir\afterhours-secrets.txt"
Write-Host "  2. Open http://localhost:6001 on this PC and pair the Android observer phone (or connect Gmail)."
Write-Host "  3. Check https://$Hostname/health shows UP, then tick 'Detect UPI payments automatically' in the AfterHours owner panel."
Write-Host "  Keep this PC on, signed in and set never to sleep."
