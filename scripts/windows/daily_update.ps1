<#
.SYNOPSIS
  每日台股資料更新：taiwan-data refresh all，結果寫入 var\logs。

.DESCRIPTION
  由 Windows 工作排程器呼叫（見 register_daily_task.ps1），也可手動執行。
  --lookback-days 讓行情／融資融券重抓最近幾天，暫時性失敗會在下次排程自動補回。
  exit code：0 全部成功；1 有資料集失敗（細節在 log 與 dataset_status）。
#>
param(
    [string]$Database = "",
    [int]$LookbackDays = 5
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$cli = Join-Path $repo ".venv\Scripts\taiwan-data.exe"
if (-not $Database) { $Database = Join-Path $repo "var\data\taiwan_stock.sqlite" }
$logDir = Join-Path $repo "var\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path $cli)) { throw "找不到 $cli，請先依 docs/data/README.md 建立 .venv" }
if (-not (Test-Path $Database)) { throw "找不到資料庫 $Database" }

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$out = Join-Path $logDir "daily_$stamp.log"
$err = Join-Path $logDir "daily_$stamp.err.log"
$env:PYTHONIOENCODING = "utf-8"
$env:TAIWAN_DATA_DB = $Database

$refresh = Start-Process -FilePath $cli -NoNewWindow -Wait -PassThru `
    -ArgumentList @("refresh", "all", "--lookback-days", "$LookbackDays") `
    -RedirectStandardOutput $out -RedirectStandardError $err
$statusFile = Join-Path $logDir "status_$stamp.json"
Start-Process -FilePath $cli -NoNewWindow -Wait `
    -ArgumentList @("status", "--json") -RedirectStandardOutput $statusFile | Out-Null

$summary = "{0} refresh all exit={1} log={2}" -f (Get-Date -Format "s"), $refresh.ExitCode, $out
Add-Content -Path (Join-Path $logDir "daily_summary.log") -Value $summary -Encoding UTF8
Write-Output $summary
exit $refresh.ExitCode
