param([ValidateSet('win-x64', 'win-arm64')][string]$Runtime = 'win-x64')
$ErrorActionPreference = 'Stop'
$sdkVersion = '10.0.401'
$toolDir = Join-Path $PSScriptRoot '.tools'
$sdkDir = Join-Path $toolDir "dotnet-$sdkVersion"
$dotnetExe = Join-Path $sdkDir 'dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnetExe)) {
    New-Item -ItemType Directory -Path $sdkDir -Force | Out-Null
    $metadata = Invoke-RestMethod 'https://builds.dotnet.microsoft.com/dotnet/release-metadata/10.0/releases.json'
    $sdkFile = $metadata.releases | ForEach-Object { $_.sdks } |
        Where-Object version -eq $sdkVersion | ForEach-Object { $_.files } |
        Where-Object { $_.rid -eq 'win-x64' -and $_.url.EndsWith('.zip') } | Select-Object -First 1
    if (-not $sdkFile) { throw "Missing official SDK $sdkVersion" }
    $archive = Join-Path $toolDir "dotnet-sdk-$sdkVersion.zip"
    Invoke-WebRequest $sdkFile.url -OutFile $archive
    # Windows PowerShell on some hosted runners does not expose Get-FileHash.
    # Stream through .NET so the official SDK checksum is still enforced.
    $stream = [System.IO.File]::OpenRead($archive)
    $hasher = [System.Security.Cryptography.SHA512]::Create()
    try { $digest = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') }
    finally { $hasher.Dispose(); $stream.Dispose() }
    if ($digest -ne $sdkFile.hash) {
        throw 'SDK archive checksum mismatch'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $sdkDir -Force
}
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
$env:DOTNET_CLI_HOME = $toolDir
$env:NUGET_PACKAGES = Join-Path $toolDir 'nuget'
& $dotnetExe publish (Join-Path $PSScriptRoot 'Spd.InputHelper/Spd.InputHelper.csproj') -c Release -r $Runtime --self-contained true -o (Join-Path $PSScriptRoot "bin/$Runtime")
if ($LASTEXITCODE -ne 0) { throw "Native helper publish failed ($LASTEXITCODE)" }
& (Join-Path $PSScriptRoot 'build-targets.ps1') -Runtime $Runtime
