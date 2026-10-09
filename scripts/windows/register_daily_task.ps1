<#
.SYNOPSIS
  在目前使用者的 Windows 工作排程器註冊每日資料更新。

.DESCRIPTION
  週一至週五 21:30（台北時間）執行 daily_update.ps1。
  官方站台的融資融券約晚間才公布，21:30 可同時拿到行情、法人與信用交易。
  StartWhenAvailable：電腦在排程時間關機或睡眠，下次開機會補跑。
  只在使用者登入時執行，不需要儲存 Windows 密碼。

  移除：Unregister-ScheduledTask -TaskName TradingRadarDailyData -Confirm:$false
#>
param(
    [string]$TaskName = "TradingRadarDailyData",
    [string]$At = "21:30"
)

$ErrorActionPreference = "Stop"
$script = (Resolve-Path (Join-Path $PSScriptRoot "daily_update.ps1")).Path

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 1 `
    -DaysOfWeek Monday, Tuesday, Wednesday, Thursday, Friday -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description "trading_radar: taiwan-data refresh all (scripts/windows/daily_update.ps1)" -Force |
    Select-Object TaskName, State
