param([string]$Version='1.0.0',[switch]$SkipApplicationBuild)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$portable=Join-Path $root '.tools\dotnet\dotnet.exe'
$dotnet=if(Test-Path -LiteralPath $portable){$portable}else{(Get-Command dotnet -ErrorAction Stop).Source}
if($Version -notmatch '^[0-9A-Za-z.\-]{1,50}$'){throw 'Version no válida.'}
if(-not $SkipApplicationBuild){& (Join-Path $PSScriptRoot 'Build.ps1')}
& (Join-Path $PSScriptRoot 'Test-Deploy.ps1')
$out=Join-Path $root ('artifacts\deploy\'+$Version+'-'+(Get-Date).ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $out -Force | Out-Null
& $dotnet publish (Join-Path $root 'deploy\ClinicaDeploy\ClinicaDeploy.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o $out --nologo
if($LASTEXITCODE -ne 0){throw 'Falló la publicación del asistente.'}
$staging=Join-Path $out 'package-source';New-Item -ItemType Directory -Path $staging | Out-Null
Copy-Item -Path (Join-Path $root 'artifacts\clinica\*') -Destination $staging -Recurse
foreach($name in @('appsettings.Development.json','appsettings.Local.json')){$file=Join-Path $staging $name;if(Test-Path -LiteralPath $file){Remove-Item -LiteralPath $file -Force}}
$zip=Join-Path $out ('ClinicaSerena-'+$Version+'.zip')
$app=Join-Path $out 'ClinicaDeploy.exe'
$p=Start-Process -FilePath $app -ArgumentList @('--pack',('"'+$staging+'"'),('"'+$zip+'"'),'ClinicaSerena',$Version) -Wait -PassThru -WindowStyle Hidden
if($p.ExitCode -ne 0){throw 'Falló el empaquetado de la aplicación.'}
$sha=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
# Generated release metadata, not handwritten source; names are fixed and contain no secrets.
[IO.File]::WriteAllText(($zip+'.sha256'),$sha+'  '+[IO.Path]::GetFileName($zip)+[Environment]::NewLine)
Copy-Item -LiteralPath (Join-Path $root 'deploy\examples\clinica-config.example.json') -Destination (Join-Path $out 'clinica-config.example.json')
Copy-Item -LiteralPath (Join-Path $root 'docs\DEPLOY.md') -Destination (Join-Path $out 'LEEME.md')
$validated=[IO.Path]::GetFullPath($staging);if(-not $validated.StartsWith([IO.Path]::GetFullPath($out)+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Staging fuera del artefacto.'};Remove-Item -LiteralPath $validated -Recurse -Force
$sum=@(Get-ChildItem -LiteralPath $out -File | Where-Object Name -ne 'SHA256SUMS.txt' | ForEach-Object {(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash+'  '+$_.Name})
[IO.File]::WriteAllLines((Join-Path $out 'SHA256SUMS.txt'),$sum)
Write-Host "ClinicaDeploy publicado: $out"
Write-Host 'Entrega toda esta carpeta. La firma de código y validación en Windows Server requieren la etapa de aceptación del técnico.'
