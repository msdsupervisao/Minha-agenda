$ErrorActionPreference = 'Stop'
$bridgeProjectRoot = Split-Path -Parent $PSScriptRoot
$bridgeTokenDirectory = Join-Path $bridgeProjectRoot '.runtime\bridge-test'
$bridgeTokenPath = Join-Path $bridgeTokenDirectory 'management-token.dpapi'

if (Test-Path -LiteralPath $bridgeTokenPath) {
  Write-Host 'Já existe um token protegido para este teste. Nenhum token foi alterado.'
  exit 1
}

New-Item -ItemType Directory -Force -Path $bridgeTokenDirectory | Out-Null
$bridgeToken = Read-Host 'Cole o token de acesso do Supabase (não aparecerá na tela)' -AsSecureString
if ($bridgeToken.Length -eq 0) {
  Write-Host 'Nenhum token foi informado.'
  exit 1
}
$bridgeEncryptedToken = ConvertFrom-SecureString -SecureString $bridgeToken
Set-Content -LiteralPath $bridgeTokenPath -Value $bridgeEncryptedToken -Encoding ASCII -NoNewline
Write-Host 'Token protegido no computador. Volte à conversa e diga: pronto.'
