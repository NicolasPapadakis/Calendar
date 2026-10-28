# Build a locally installable copy of the Store package.
# The Store signs real uploads itself; this signs with a self-signed test
# certificate (subject = the appx publisher) so Windows will install it here.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$publisher = (Get-Content "$root\package.json" -Raw | ConvertFrom-Json).build.appx.publisher
$certDir = Join-Path $root ".cert"
$pfx = Join-Path $certDir "store-test.pfx"
$cer = Join-Path $certDir "store-test.cer"
$password = "store-test"

# Reuse the certificate unless the publisher changed since it was made.
$valid = $false
if (Test-Path $pfx) {
  $existing = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfx, $password)
  $valid = $existing.Subject -eq $publisher
}

if (-not $valid) {
  New-Item -ItemType Directory -Force $certDir | Out-Null
  $cert = New-SelfSignedCertificate -Type Custom -Subject $publisher `
    -KeyUsage DigitalSignature -FriendlyName "Calendar Widget store test" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  $secure = ConvertTo-SecureString $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null
  Export-Certificate -Cert $cert -FilePath $cer | Out-Null

  # Windows only installs packages signed by a certificate in the machine's
  # Trusted People store, which needs admin (one-time UAC prompt).
  Write-Host "Trusting the test certificate (approve the admin prompt)..."
  Start-Process "$PSHOME\powershell.exe" -Verb RunAs -Wait -ArgumentList `
    "-NoProfile -Command Import-Certificate -FilePath '$cer' -CertStoreLocation Cert:\LocalMachine\TrustedPeople"
}

$env:WIN_CSC_LINK = $pfx
$env:WIN_CSC_KEY_PASSWORD = $password
npx electron-builder --win appx -c.directories.output=dist/store-test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Double-click the .appx in dist\store-test\ to install it."
Write-Host "Upload the one from 'npm run store' (dist\) to the Store, not this one."
