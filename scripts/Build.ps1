param([switch]$CleanDependencies)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$portable=Join-Path $projectRoot '.tools\dotnet\dotnet.exe'
$dotnet=if(Test-Path -LiteralPath $portable){$portable}else{(Get-Command dotnet -ErrorAction Stop).Source}
Push-Location (Join-Path $projectRoot 'frontend')
try{
    if($CleanDependencies -or -not(Test-Path -LiteralPath '.\node_modules\vite\bin\vite.js')){
        npm ci
        if($LASTEXITCODE -ne 0){throw 'Fallo la instalacion de dependencias del frontend.'}
    }
    npm run build
    if($LASTEXITCODE -ne 0){throw 'Falló la compilación del frontend.'}
}finally{Pop-Location}
$destination=Join-Path $projectRoot 'artifacts\clinica'
& $dotnet publish (Join-Path $projectRoot 'backend\Clinica.Api.csproj') -c Release -o $destination --self-contained false --nologo
if($LASTEXITCODE -ne 0){throw 'Falló la publicación del backend.'}
$webRoot=Join-Path $destination 'wwwroot'
New-Item -ItemType Directory -Force -Path $webRoot | Out-Null
Copy-Item -Path (Join-Path $projectRoot 'frontend\dist\*') -Destination $webRoot -Recurse -Force
Write-Host "Aplicación publicada: $destination"
Write-Host 'Configura SQL Server y HTTPS en el servidor antes de utilizar este artefacto.'
