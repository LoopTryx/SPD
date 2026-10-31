param([ValidateSet('win-x64','win-arm64')][string]$Runtime = 'win-x64',[switch]$Test)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$framework = Join-Path $env:WINDIR 'Microsoft.NET/assembly/GAC_MSIL'
$references = @('UIAutomationClient','UIAutomationTypes','WindowsBase') | ForEach-Object {
    $assembly = Get-ChildItem -LiteralPath (Join-Path $framework $_) -Recurse -Filter "$_.dll" | Select-Object -First 1
    if (-not $assembly) { throw "Missing Windows framework assembly $_" }
    "/reference:$($assembly.FullName)"
}
$output = Join-Path $PSScriptRoot "bin/$Runtime"
New-Item -ItemType Directory -Path $output -Force | Out-Null
# CLR 4.x is supplied by supported Windows installations. This helper is separate
# from the self-contained input watchdog and performs no input injection.
$targetPlatform = if ($Runtime -eq 'win-x64') { 'x64' } else { 'anycpu' }
& $compiler /nologo /target:exe "/platform:$targetPlatform" /optimize+ @references "/out:$output/Spd.TargetHelper.exe" (Join-Path $PSScriptRoot 'Spd.TargetHelper/Program.cs') (Join-Path $PSScriptRoot 'Spd.TargetHelper/VisualButtons.cs')
if ($LASTEXITCODE -ne 0) { throw 'Target helper compilation failed' }
if ($Test) {
    $testOutput=Join-Path $PSScriptRoot 'bin/tests'
    New-Item -ItemType Directory -Path $testOutput -Force | Out-Null
    & $compiler /nologo /target:exe /platform:x64 /optimize+ "/out:$testOutput/VisualButtonTests.exe" (Join-Path $PSScriptRoot 'Spd.TargetHelper/VisualButtons.cs') (Join-Path $PSScriptRoot 'Spd.TargetHelper.Tests/Program.cs')
    if ($LASTEXITCODE -ne 0) { throw 'Visual detector tests did not compile' }
    & (Join-Path $testOutput 'VisualButtonTests.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Visual detector checks failed' }
    & $compiler /nologo /target:exe /platform:x64 "/out:$testOutput/WindowFixture.exe" (Join-Path $PSScriptRoot 'Spd.TargetHelper.Tests/WindowFixture.cs')
    if ($LASTEXITCODE -ne 0) { throw 'UIA window fixture did not compile' }
}
