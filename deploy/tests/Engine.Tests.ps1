$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$script:queries=New-Object 'System.Collections.Generic.List[string]'
$c=[pscustomobject]@{Site='ClinicaSerena';Pool='ClinicaSerena';Database='ClinicaDB';BackupPath='C:\ClinicaSerenaBackups';DataPath='C:\ClinicaSerenaData';SqlServer='localhost\SQLEXPRESS';Host='clinica.interna.example';Port=443}
$path=Join-Path (Split-Path $PSScriptRoot -Parent) 'engine\Deploy.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
if($errors.Count -gt 0){throw 'Motor no parseable.'}
# Load only two pure SQL-generation functions, never the engine's top-level execution.
foreach($name in @('ProvisionBackupVerifier','RuntimeSql','RuntimeConfig','SaveJson')){
    $function=$ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true) | Where-Object Name -eq $name
    Invoke-Expression $function.Extent.Text
}
function Sql([string]$text,[string]$database='master',$parameters=@{}){$script:queries.Add($text);return ,(New-Object Data.DataTable)}
function Assert([bool]$ok,[string]$label){if(-not $ok){throw $label};Write-Host "OK · $label"}
ProvisionBackupVerifier
$joined=$script:queries -join "`n"
Assert ($joined.Contains("RIGHT(@file,14)<>N'\ClinicaDB.bak'")) 'Verifier uses the correct literal Windows suffix'
Assert ($joined.Contains("LEFT(@file,LEN(N'C:\ClinicaSerenaBackups\work-'))")) 'Verifier is restricted to the clinical staging prefix'
Assert ($joined.Contains("CHARINDEX(N'..',@file)>0")) 'Verifier refuses path traversal'
Assert ($joined.Contains('ADD SIGNATURE') -and $joined.Contains('REMOVE PRIVATE KEY')) 'Only signed verifier keeps amplified SQL authority'
Assert (-not $joined.Contains('TO [NT AUTHORITY\SYSTEM]; GRANT CREATE')) 'SYSTEM is not granted arbitrary create-database authority'
$script:queries.Clear();RuntimeSql;$joined=$script:queries -join "`n"
Assert ($joined.Contains('DENY UPDATE,DELETE ON dbo.AuditLogs')) 'Runtime SQL cannot modify or delete audit rows'
Assert (-not $joined.Contains('db_owner') -and -not $joined.Contains('sysadmin') -and -not $joined.Contains('db_backupoperator')) 'Web identity receives no owner/admin/backup role'
Assert ($joined.Contains('IIS APPPOOL\ClinicaSerena')) 'Application virtual identity is isolated from technician identity'
Assert ($ast.Extent.Text.Contains('Start-Process -FilePath $tool -ArgumentList $quoted -Wait -PassThru')) 'GUI helper completion is explicitly awaited before proceeding'
$temp=Join-Path ([IO.Path]::GetTempPath()) ('serena-engine-tests-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try{
    $xml='<?xml version="1.0" encoding="utf-8"?><configuration><location path="." inheritInChildApplications="false"><system.webServer><handlers><add name="aspNetCore" path="*" verb="*" modules="AspNetCoreModuleV2" resourceType="Unspecified"/></handlers><aspNetCore processPath="dotnet" arguments=".\Clinica.Api.dll" stdoutLogEnabled="false" hostingModel="inprocess"/></system.webServer></location></configuration>'
    [IO.File]::WriteAllText((Join-Path $temp 'web.config'),$xml)
    RuntimeConfig $temp ('A'*40)
    $config=Get-Content -LiteralPath (Join-Path $temp 'appsettings.Local.json') -Raw | ConvertFrom-Json
    [xml]$web=Get-Content -LiteralPath (Join-Path $temp 'web.config')
    Assert ($config.Database.Provider -eq 'SqlServer' -and -not $config.Database.ApplyMigrations -and -not $config.Demo.Enabled) 'Published configuration disables migrations-on-start and demonstration'
    Assert ($config.ConnectionStrings.Clinic.Contains('Server=lpc:') -and $config.ConnectionStrings.Clinic.Contains('Integrated Security=True')) 'Runtime SQL is local shared memory with Windows identity'
    Assert ($web.configuration.location.'system.webServer'.aspNetCore.environmentVariables.environmentVariable.value -eq 'Production') 'IIS child process receives Production explicitly'
    Assert ($config.Backups.ManagedExternally -and $config.AllowedHosts -eq $c.Host) 'Technical backups and exact host are configured'
}finally{$full=[IO.Path]::GetFullPath($temp);$prefix=Join-Path ([IO.Path]::GetTempPath()) 'serena-engine-tests-';if(-not $full.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Ruta temporal insegura.'};Remove-Item -LiteralPath $full -Recurse -Force}
Write-Host 'PASS: 13 engine generation checks using SQL mocks and temporary config only. No commands executed on SQL, IIS or firewall.'
