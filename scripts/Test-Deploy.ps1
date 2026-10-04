$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$portable=Join-Path $root '.tools\dotnet\dotnet.exe'
$dotnet=if(Test-Path -LiteralPath $portable){$portable}else{(Get-Command dotnet -ErrorAction Stop).Source}
& $dotnet run --project (Join-Path $root 'deploy\ClinicaDeploy.Tests\ClinicaDeploy.Tests.csproj') -c Release
if($LASTEXITCODE -ne 0){throw 'Pruebas del núcleo fallidas.'}
& $dotnet run --project (Join-Path $root 'deploy\ClinicaDeploy.ApiTests\ClinicaDeploy.ApiTests.csproj') -c Release
if($LASTEXITCODE -ne 0){throw 'Pruebas de bootstrap/recuperación fallidas.'}
$tokens=$null;$errors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root 'deploy\engine\Deploy.ps1'),[ref]$tokens,[ref]$errors) | Out-Null
if($errors.Count -gt 0){throw ($errors | Out-String)}
Write-Host 'Motor PowerShell: sintaxis válida. No se ejecutaron operaciones de servidor.'
& (Join-Path $root 'deploy\tests\Engine.Tests.ps1')
