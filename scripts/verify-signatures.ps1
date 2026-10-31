param(
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$InstallerName,
  [Parameter(Mandatory = $true)][string]$PublisherName
)
$ErrorActionPreference = 'Stop'
$spdFiles = @(
  (Join-Path $OutputDirectory $InstallerName),
  (Join-Path $OutputDirectory 'win-unpacked\SPD.exe'),
  (Join-Path $OutputDirectory 'win-unpacked\resources\native\Spd.InputHelper.exe'),
  (Join-Path $OutputDirectory 'win-unpacked\resources\native\Spd.TargetHelper.exe')
)
foreach ($spdFile in $spdFiles) {
  $spdSignature = Get-AuthenticodeSignature -LiteralPath $spdFile
  if ($spdSignature.Status -ne 'Valid' -or $null -eq $spdSignature.SignerCertificate) {
    throw "Invalid Authenticode signature: $spdFile ($($spdSignature.Status))"
  }
  $spdSubject = $spdSignature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($spdSubject -cne $PublisherName) { throw "Signer publisher mismatch: $spdFile" }
}
Write-Output 'Installer, application and input helper signatures match the expected publisher.'
