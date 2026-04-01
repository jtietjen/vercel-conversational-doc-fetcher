# Usage: .\scripts\trigger.ps1 [-Phone +49...] [-OrderId ORD-001] [-TrackingNumber TRK-001] [-CustomerName "Name"] [-Language en]
# Defaults are loaded from scripts\config.local.ps1 (not committed — copy from config.example.ps1).

param(
    [string]$Phone,
    [string]$OrderId,
    [string]$TrackingNumber,
    [string]$CustomerName,
    [string]$Language
)

$ConfigPath = "$PSScriptRoot\config.local.ps1"
if (Test-Path $ConfigPath) {
    . $ConfigPath
} else {
    Write-Error "config.local.ps1 not found. Copy scripts\config.example.ps1 to scripts\config.local.ps1 and fill in your values."
    exit 1
}

if (-not $Phone)          { $Phone          = $DefaultPhone }
if (-not $OrderId)        { $OrderId        = "ORD-$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
if (-not $TrackingNumber) { $TrackingNumber = "TRK-$(Get-Date -Format 'yyyyMMdd-HHmmss')" }
if (-not $CustomerName)   { $CustomerName   = $DefaultCustomerName }
if (-not $Language)       { $Language       = $DefaultLanguage }

$BaseUrl = "https://vercel-conversational-doc-fetcher.vercel.app"
$Proxy   = "http://zscaler.proxy.int.kn:80"

Write-Host "Triggering process..."
Write-Host "  phone:          $Phone"
Write-Host "  orderId:        $OrderId"
Write-Host "  trackingNumber: $TrackingNumber"
Write-Host "  customerName:   $CustomerName"
Write-Host "  language:       $Language"
Write-Host ""

$Body = @{
    phone          = $Phone
    orderId        = $OrderId
    trackingNumber = $TrackingNumber
    customerName   = $CustomerName
    language       = $Language
} | ConvertTo-Json

$Response = Invoke-RestMethod -Uri "$BaseUrl/api/trigger" `
    -Method POST `
    -ContentType "application/json" `
    -Body $Body `
    -Proxy $Proxy `
    -ProxyUseDefaultCredentials

$Response | ConvertTo-Json -Depth 5
