param([switch]$OpenBrowser)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$portable=Join-Path $projectRoot '.tools\dotnet\dotnet.exe'
$dotnet=if(Test-Path -LiteralPath $portable){$portable}else{(Get-Command dotnet -ErrorAction Stop).Source}
$node=(Get-Command node -ErrorAction Stop).Source
$logRoot=Join-Path $projectRoot 'data\logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$apiReady=$false
try{$apiReady=(Invoke-RestMethod 'http://127.0.0.1:5080/api/health').application -eq 'ClinicaSerena'}catch{}
if(-not $apiReady){
    & $dotnet build (Join-Path $projectRoot 'backend\Clinica.Api.csproj') --nologo
    if($LASTEXITCODE -ne 0){throw 'No se pudo compilar la API.'}
    $env:ASPNETCORE_ENVIRONMENT='Development'
    $apiDll=Join-Path $projectRoot 'backend\bin\Debug\net10.0\Clinica.Api.dll'
    Start-Process -FilePath $dotnet -ArgumentList @("`"$apiDll`"",'--urls','http://127.0.0.1:5080') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "api-$stamp.log") -RedirectStandardError (Join-Path $logRoot "api-$stamp.error.log") | Out-Null
}
$frontendRoot=Join-Path $projectRoot 'frontend'
$vite=Join-Path $frontendRoot 'node_modules\vite\bin\vite.js'
if(-not(Test-Path -LiteralPath $vite)){Push-Location $frontendRoot;try{npm ci;if($LASTEXITCODE -ne 0){throw 'No se instalaron las dependencias del frontend.'}}finally{Pop-Location}}
$webReady=$false
try{$webReady=(Invoke-WebRequest 'http://127.0.0.1:5175' -UseBasicParsing).Content -match 'content="ClinicaSerena"'}catch{}
if(-not $webReady){Start-Process -FilePath $node -ArgumentList @("`"$vite`"",'--host','127.0.0.1','--port','5175','--strictPort') -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot "web-$stamp.log") -RedirectStandardError (Join-Path $logRoot "web-$stamp.error.log") | Out-Null}
for($attempt=0;$attempt -lt 40;$attempt++){
    try{if((Invoke-RestMethod 'http://127.0.0.1:5080/api/health').application -eq 'ClinicaSerena'){$apiReady=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(-not $apiReady){throw "La API no inició. Revisa $logRoot"}
for($attempt=0;$attempt -lt 40;$attempt++){
    try{if((Invoke-WebRequest 'http://127.0.0.1:5175' -UseBasicParsing).Content -match 'content="ClinicaSerena"'){$webReady=$true;break}}catch{}
    Start-Sleep -Milliseconds 500
}
if(-not $webReady){throw "La interfaz no inició. Revisa $logRoot"}
Write-Host 'Clínica Serena: http://127.0.0.1:5175'
Write-Host 'Cuenta demo: admin | Contraseña demo: SerenaDemo!2026'
Write-Host 'Cuentas no pacientes: configura tu autenticador TOTP en el primer acceso; guarda los códigos de recuperación.'
Write-Host "Logs de desarrollo: $logRoot"
if($OpenBrowser){Start-Process 'http://127.0.0.1:5175'}
