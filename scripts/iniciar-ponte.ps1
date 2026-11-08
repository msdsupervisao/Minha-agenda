param([string]$EnvironmentFile = '.env.local')

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path -LiteralPath $EnvironmentFile)) {
  Write-Host 'O arquivo informado precisa conter a URL e a chave pública do Supabase.'
  exit 1
}

$bridgeValues = @{}
foreach ($bridgeLine in Get-Content -LiteralPath $EnvironmentFile -Encoding UTF8) {
  if ($bridgeLine -match '^\s*(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)\s*=\s*(.*?)\s*$') {
    $bridgeValues[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
  }
}
if (-not $bridgeValues['NEXT_PUBLIC_SUPABASE_URL'] -or -not $bridgeValues['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  Write-Host 'O arquivo informado não contém a URL e a chave pública do projeto.'
  exit 1
}

$bridgeEmail = Read-Host 'E-mail da conta Minha Agenda'
$bridgeSecurePassword = Read-Host 'Senha da conta Minha Agenda' -AsSecureString
$bridgeBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($bridgeSecurePassword)
try {
  $env:BRIDGE_EMAIL = $bridgeEmail
  $env:BRIDGE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bridgeBstr)
  $env:NEXT_PUBLIC_SUPABASE_URL = $bridgeValues['NEXT_PUBLIC_SUPABASE_URL']
  $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $bridgeValues['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']
  node --import tsx scripts/bridge-worker.ts
} finally {
  Remove-Item Env:BRIDGE_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:BRIDGE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bridgeBstr)
}
