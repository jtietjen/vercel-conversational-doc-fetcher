# Usage: .\scripts\poll-status.ps1 -TrackingNumber TRK-001 [-IntervalSeconds 10]
# Polls until status is COMPLETED or FAILED.

param(
    [Parameter(Mandatory)][string]$TrackingNumber,
    [int]$IntervalSeconds = 10
)

$BaseUrl = "https://vercel-conversational-doc-fetcher.vercel.app"
$Proxy   = "http://zscaler.proxy.int.kn:80"

Write-Host "Polling status for $TrackingNumber every ${IntervalSeconds}s..."
Write-Host ""

while ($true) {
    $Response = Invoke-RestMethod -Uri "$BaseUrl/api/status/$TrackingNumber" `
        -Method GET `
        -Proxy $Proxy `
        -ProxyUseDefaultCredentials

    $Status    = $Response.status
    $Timestamp = Get-Date -Format "HH:mm:ss"

    Write-Host "[$Timestamp] status: $Status"

    if ($Status -eq "COMPLETED" -or $Status -eq "FAILED") {
        Write-Host ""
        $Response | ConvertTo-Json -Depth 10
        break
    }

    Start-Sleep -Seconds $IntervalSeconds
}
