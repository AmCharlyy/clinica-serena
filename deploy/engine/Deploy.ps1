param([Parameter(Mandatory=$true)][string]$ConfigPath,[Parameter(Mandatory=$true)][string]$ResultPath)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$c=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$checks=New-Object 'System.Collections.Generic.List[object]'
$mutex=$null; $locked=$false; $migrationStarted=$false; $siteStopped=$false; $state=$null
$tool=Join-Path $PSScriptRoot 'ClinicaDeploy.exe'
function Say([string]$text){Write-Host $text}
function Check([string]$name,[string]$status,[string]$detail){$checks.Add([pscustomobject]@{Name=$name;Status=$status;Detail=$detail}); Say "$status · $name · $detail"}
function IsAdmin { $id=[Security.Principal.WindowsIdentity]::GetCurrent(); (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
function Under([string]$path,[string]$parent){$full=[IO.Path]::GetFullPath($path); $base=[IO.Path]::GetFullPath($parent).TrimEnd('\'); $full.StartsWith($base+'\',[StringComparison]::OrdinalIgnoreCase)}
function NoLinks([string]$path){$p=[IO.Path]::GetFullPath($path); while($p){if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "La ruta contiene un enlace/reparse point: $p"}}; $parent=Split-Path $p -Parent;if($parent -eq $p){break};$p=$parent}}
function SecureDir([string]$path,[string]$identity='', [string]$rights='Modify'){
    NoLinks $path; New-Item -ItemType Directory -Path $path -Force | Out-Null
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    foreach($sid in @('S-1-5-18','S-1-5-32-544')){$rule=New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule)}
    if($identity){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,$rights,'ContainerInherit,ObjectInherit','None','Allow')))}
    Set-Acl -LiteralPath $path -AclObject $acl
}
function GrantDir([string]$path,[string]$identity,[string]$rights){$acl=Get-Acl -LiteralPath $path;$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,$rights,'ContainerInherit,ObjectInherit','None','Allow')));Set-Acl -LiteralPath $path -AclObject $acl}
function SaveJson($value,[string]$path){$value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $path -Encoding UTF8}
function SqlConnection([string]$database='master'){
    # Local shared memory only: no SQL port needs opening, no SQL password on disk.
    $b=New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $b.DataSource='lpc:'+$c.SqlServer;$b.InitialCatalog=$database;$b.IntegratedSecurity=$true;$b.Encrypt=$false;$b.ConnectTimeout=15
    $conn=New-Object System.Data.SqlClient.SqlConnection($b.ConnectionString);$conn.Open();return $conn
}
function Sql([string]$text,[string]$database='master',$parameters=@{}){
    $conn=SqlConnection $database;try{$cmd=$conn.CreateCommand();$cmd.CommandText=$text;$cmd.CommandTimeout=900;foreach($key in $parameters.Keys){[void]$cmd.Parameters.AddWithValue($key,$parameters[$key])};$table=New-Object Data.DataTable;$adapter=New-Object Data.SqlClient.SqlDataAdapter($cmd);[void]$adapter.Fill($table);return ,$table}finally{$conn.Dispose()}
}
function DbExists([string]$name){$t=Sql 'SELECT name FROM sys.databases WHERE name=@name' 'master' @{'@name'=$name};$t.Rows.Count -gt 0}
function Tool([string[]]$arguments){
    # A GUI-subsystem executable is asynchronous with '&' in Windows PowerShell.
    # Wait explicitly; none of these arguments contain secrets or shell commands.
    $quoted=@($arguments | ForEach-Object {'"'+$_.TrimEnd('\')+'"'})
    $process=Start-Process -FilePath $tool -ArgumentList $quoted -Wait -PassThru -WindowStyle Hidden
    if($process.ExitCode -ne 0){throw 'El motor de integridad/cifrado rechazó la operación.'}
}
function OwnState {
    $path=Join-Path $c.Root 'state\deployment.json';if(-not(Test-Path -LiteralPath $path)){throw 'No hay un despliegue administrado por ClinicaDeploy en esa carpeta.'}
    $s=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if($s.Product -ne 'ClinicaSerena' -or $s.Schema -ne 1){throw 'Marcador de propiedad no compatible.'}
    foreach($key in @('Root','DataPath','BackupPath','SqlServer','Database','Site','Pool','Host','Port')){if([string]$s.Config.$key -ne [string]$c.$key){throw "Configuración inmutable distinta: $key. Importa state\config.json del despliegue."}}
    if(-not(Under $s.Release (Join-Path $c.Root 'releases'))){throw 'Versión activa fuera del directorio administrado.'}
    NoLinks $s.Release
    if(-not(Test-Path "IIS:\Sites\$($c.Site)")){throw 'El sitio administrado no existe.'}
    if((Get-Item "IIS:\Sites\$($c.Site)").physicalPath -ne $s.Release){throw 'IIS no apunta a la versión registrada. Requiere diagnóstico técnico.'}
    if(@(Get-Website | Where-Object {$_.applicationPool -eq $c.Pool -and $_.name -ne $c.Site}).Count -gt 0){throw 'El pool está compartido con otro sitio. No se detendrá una aplicación ajena.'}
    $bindings=@(Get-WebBinding -Name $c.Site)
    if($bindings.Count -ne 1 -or $bindings[0].protocol -ne 'https' -or $bindings[0].bindingInformation -ne "*:$($c.Port):$($c.Host)"){throw 'Los bindings del sitio cambiaron. Se requiere diagnóstico; no se apropiará de bindings ajenos.'}
    return $s
}
function KeyAccess($cert,[string]$identity){
    $rsa=[Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
    try{if($rsa -is [Security.Cryptography.RSACng]){$key=Join-Path "$env:ProgramData\Microsoft\Crypto\Keys" $rsa.Key.UniqueName}else{$key=Join-Path "$env:ProgramData\Microsoft\Crypto\RSA\MachineKeys" $rsa.CspKeyContainerInfo.UniqueKeyContainerName}
        $acl=Get-Acl -LiteralPath $key;$acl.SetAccessRuleProtection($true,$false)
        foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)),'FullControl','Allow')))}
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'Read','Allow')));Set-Acl -LiteralPath $key -AclObject $acl
    }finally{$rsa.Dispose()}
}
function Prerequisites {
    $os=Get-CimInstance Win32_OperatingSystem
    if([Environment]::Is64BitOperatingSystem -and [int]$os.BuildNumber -ge 17763){Check 'Windows x64' 'OK' $os.Caption}else{Check 'Windows x64' 'ERROR' 'Se requiere Windows Server 2019+ x64.'}
    if($os.ProductType -eq 1){Check 'Equipo de destino' 'AVISO' 'Windows de escritorio: solo laboratorio; validar en Windows Server antes de producción.'}
    if(IsAdmin){Check 'Permisos del técnico' 'OK' 'Administrador de Windows.'}else{Check 'Permisos del técnico' 'ERROR' 'Abre ClinicaDeploy como administrador.'}
    $iis=Test-Path "$env:windir\System32\inetsrv\config\applicationHost.config"
    if($iis){Import-Module WebAdministration;Check 'IIS' 'OK' 'Componentes de administración disponibles.'}else{Check 'IIS' 'ERROR' 'Usa Preparar IIS o instálalo con el administrador del servidor.'}
    if(Test-Path "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"){Check 'ASP.NET Core Module' 'OK' 'ANCM V2 presente.'}else{Check 'ASP.NET Core Module' 'ERROR' 'Falta Hosting Bundle; instalar después de IIS.'}
    $runtime=Join-Path $env:ProgramFiles 'dotnet\shared\Microsoft.AspNetCore.App'
    if((Test-Path $runtime) -and @(Get-ChildItem -LiteralPath $runtime -Directory | Where-Object Name -match '^10\.0\.').Count -gt 0){Check '.NET 10 x64' 'OK' 'Runtime ASP.NET Core disponible.'}else{Check '.NET 10 x64' 'ERROR' 'Falta runtime de producción .NET 10.'}
    foreach($path in @($c.Root,$c.DataPath,$c.BackupPath,$c.RecoveryPath)){NoLinks $path;$drive=New-Object IO.DriveInfo([IO.Path]::GetPathRoot($path));if($drive.AvailableFreeSpace -lt 5GB){Check 'Disco' 'ERROR' "Menos de 5 GB libres en $($drive.Name)."}}
    Check 'Capacidad' 'AVISO' '5 GB es un mínimo de instalación, no el dimensionamiento clínico; reserva espacio para BAK + ZIP + cifrado.'
    try{$t=Sql "SELECT SERVERPROPERTY('ProductVersion') AS Version, IS_SRVROLEMEMBER('sysadmin') AS IsAdmin";if([int]([string]$t.Rows[0].Version).Split('.')[0] -lt 13){Check 'Versión SQL' 'ERROR' 'Se requiere SQL Server 2016 o posterior y compatibilidad 130+.'};if($t.Rows[0].IsAdmin -ne 1){Check 'SQL administrativo' 'ERROR' 'La identidad del técnico debe ser sysadmin para provisionar login, base y backups.'}else{Check 'SQL local' 'OK' ("Versión "+$t.Rows[0].Version+' · Windows/Shared Memory.')}
        $svc=Sql 'SELECT service_account FROM sys.dm_server_services WHERE servicename LIKE ''SQL Server (%''';if($svc.Rows.Count -ne 1){Check 'Cuenta SQL' 'ERROR' 'No se pudo identificar la cuenta del motor.'}else{Check 'Cuenta SQL' 'OK' $svc.Rows[0].service_account}
    }catch{Check 'SQL local' 'ERROR' 'No hay conexión local con autenticación Windows. Verifica instancia y Shared Memory en SQL Configuration Manager.'}
    if($c.Operation -in @('Install','Update','Repair','Check','Diagnostics')){
        $thumb=$c.TlsThumbprint.Replace(' ','');$cert=Get-Item "Cert:\LocalMachine\My\$thumb" -ErrorAction SilentlyContinue
        if($null -eq $cert -or -not $cert.HasPrivateKey -or $cert.NotAfter -le (Get-Date).AddDays(7) -or $cert.NotBefore -gt (Get-Date)){Check 'HTTPS' 'ERROR' 'Selecciona un certificado con clave privada y vigencia mayor a 7 días.'}
        else{
            $eku=@($cert.EnhancedKeyUsageList | ForEach-Object {$_.ObjectId.Value})
            $dns=@($cert.DnsNameList | ForEach-Object {$_.Unicode})
            $chain=New-Object Security.Cryptography.X509Certificates.X509Chain
            $chain.ChainPolicy.RevocationMode=[Security.Cryptography.X509Certificates.X509RevocationMode]::Offline
            try{$trusted=$chain.Build($cert)}finally{$chain.Dispose()}
            if($eku -notcontains '1.3.6.1.5.5.7.3.1' -or $dns -notcontains $c.Host -or -not $trusted){Check 'HTTPS' 'ERROR' 'Certificado no confiable, nombre SAN exacto distinto o EKU de servidor ausente. No se desactiva TLS para avanzar.'}else{Check 'HTTPS' 'OK' ("Certificado válido hasta "+$cert.NotAfter.ToString('yyyy-MM-dd'))}
        }
        try{$addresses=[Net.Dns]::GetHostAddresses($c.Host);$local=@(Get-NetIPAddress | ForEach-Object {$_.IPAddress});if(@($addresses | Where-Object {$local -contains $_.IPAddressToString}).Count -eq 0){Check 'DNS' 'ERROR' 'El nombre no resuelve a una IP de este servidor.'}else{Check 'DNS' 'OK' $c.Host}}catch{Check 'DNS' 'ERROR' 'Configura el registro DNS de la red; el instalador no modifica el router ni DNS automáticamente.'}
    }
    if($iis -and $c.Operation -eq 'Install'){
        if(Test-Path "IIS:\Sites\$($c.Site)"){Check 'Nombre de sitio' 'ERROR' 'Ya existe; no se toma control de sitios ajenos.'}
        if(Test-Path "IIS:\AppPools\$($c.Pool)"){Check 'Nombre de pool' 'ERROR' 'Ya existe; elige otro nombre.'}
        foreach($binding in Get-WebBinding){if($binding.protocol -eq 'https' -and $binding.bindingInformation -like "*:$($c.Port):$($c.Host)"){Check 'Binding' 'ERROR' 'El binding HTTPS ya está ocupado.'}}
        if(DbExists $c.Database){Check 'Base nueva' 'ERROR' 'ClinicaDB ya existe. Instalación inicial nunca reutiliza una base existente.'}
        foreach($path in @($c.Root,$c.DataPath,$c.BackupPath)){if((Test-Path -LiteralPath $path) -and @(Get-ChildItem -LiteralPath $path -Force).Count -gt 0){Check 'Carpeta nueva' 'ERROR' "$path no está vacía; no se apropiará de archivos existentes."}}
        if(Get-ScheduledTask -TaskName ('ClinicaSerena-Backup-'+$c.Site) -ErrorAction SilentlyContinue){Check 'Tarea propia' 'ERROR' 'Ese nombre de tarea ya existe; no se sobrescribe una tarea ajena.'}
        if(Get-NetFirewallRule -Name ('ClinicaSerena-'+$c.Site) -ErrorAction SilentlyContinue){Check 'Regla propia' 'ERROR' 'Ese nombre de regla firewall ya existe; no se sobrescribe una regla ajena.'}
    }
    Check 'RDP / antivirus / licencias' 'AVISO' 'No se modifican. Revisar parches, NLA, accesos administrativos, licencias y copia externa con el técnico.'
    Check 'Alcance efectivo de red' 'AVISO' 'Una regla HTTPS acotada no anula reglas allow más amplias ya existentes. Revisar firewall efectivo, VLAN y exposición con el técnico.'
}
function StopOwnSite {
    if((Get-Website -Name $c.Site).State -eq 'Started'){Stop-Website -Name $c.Site;$script:siteStopped=$true}
    if((Get-WebAppPoolState -Name $c.Pool).Value -eq 'Started'){Stop-WebAppPool -Name $c.Pool}
    $pattern='-ap\s+"?'+[regex]::Escape($c.Pool)+'"?(\s|$)'
    for($i=0;$i -lt 120;$i++){
        $workers=@(Get-CimInstance Win32_Process -Filter "Name='w3wp.exe'" | Where-Object {$_.CommandLine -match $pattern})
        if((Get-WebAppPoolState -Name $c.Pool).Value -eq 'Stopped' -and $workers.Count -eq 0){return}
        if($i % 10 -eq 0){Say 'Esperando cierre del proceso propio antes de copiar datos…'};Start-Sleep -Seconds 1
    }
    throw 'El proceso IIS no terminó en dos minutos; no se tomará una instantánea inconsistente.'
}
function StartOwnSite {Start-WebAppPool -Name $c.Pool;Start-Website -Name $c.Site;$script:siteStopped=$false}
function Backup($s){
    $stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
    $work=Join-Path $c.BackupPath ('work-'+$stamp);SecureDir $work
    $sqlAccount=$s.SqlAccount
    GrantDir $work $sqlAccount 'Modify'
    $bak=Join-Path $work 'ClinicaDB.bak'
    [void](Sql "BACKUP DATABASE [$($c.Database)] TO DISK=@file WITH COPY_ONLY,CHECKSUM;" 'master' @{'@file'=$bak})
    [void](Sql "EXEC master.dbo.[ClinicaVerify_$($c.Site)] @file" 'master' @{'@file'=$bak})
    foreach($folder in @('documents','keys')){
        $source=Join-Path $c.DataPath $folder;NoLinks $source
        if(@(Get-ChildItem -LiteralPath $source -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -gt 0){throw 'Los datos contienen enlaces de archivos; no se seguirán al respaldar.'}
        Copy-Item -LiteralPath $source -Destination (Join-Path $work $folder) -Recurse
    }
    Copy-Item -LiteralPath (Join-Path $c.Root 'state\deployment.json') -Destination (Join-Path $work 'deployment.json')
    Copy-Item -LiteralPath (Join-Path $s.Release 'appsettings.Local.json') -Destination (Join-Path $work 'appsettings.Local.json')
    $zip=Join-Path $c.BackupPath ($stamp+'.zip');$encrypted=Join-Path $c.BackupPath ($stamp+'.serena')
    Tool @('--pack',$work,$zip,'ClinicaSerenaBackup',$s.Version)
    Tool @('--encrypt',$zip,$encrypted,$s.KeyThumbprint)
    # Verify envelope + internal hashes via a full round-trip before declaring backup successful.
    $verifyZip=Join-Path $c.BackupPath ($stamp+'.verify.zip');$verifyDir=Join-Path $c.BackupPath ('verify-'+$stamp)
    Tool @('--decrypt',$encrypted,$verifyZip,$s.KeyThumbprint)
    Tool @('--extract-backup',$verifyZip,$verifyDir,(Get-FileHash -LiteralPath $verifyZip -Algorithm SHA256).Hash)
    foreach($p in @($work,$verifyDir)){if(-not(Under $p $c.BackupPath)){throw 'Limpieza fuera del directorio de respaldos.'};Remove-Item -LiteralPath $p -Recurse -Force}
    Remove-Item -LiteralPath $zip,$verifyZip -Force
    SaveJson @{CompletedAt=(Get-Date).ToUniversalTime().ToString('o')} (Join-Path $c.DataPath 'backups\technical-status.json')
    Say 'Respaldo cifrado y verificado. Conserva una copia externa y la clave PFX separada.';return $encrypted
}
function RuntimeConfig([string]$release,[string]$key){
    $connection="Server=lpc:$($c.SqlServer);Database=$($c.Database);Integrated Security=True;Encrypt=False;Application Name=ClinicaSerena;"
    SaveJson @{Database=@{Provider='SqlServer';ApplyMigrations=$false};ConnectionStrings=@{Clinic=$connection};Storage=@{Root=$c.DataPath};DataProtection=@{CertificateThumbprint=$key};Backups=@{ManagedExternally=$true};Demo=@{Enabled=$false};AllowedHosts=$c.Host;HttpsRedirection=@{HttpsPort=$c.Port}} (Join-Path $release 'appsettings.Local.json')
    [xml]$web=Get-Content -LiteralPath (Join-Path $release 'web.config')
    $asp=$web.configuration.location.'system.webServer'.aspNetCore
    $asp.SetAttribute('stdoutLogEnabled','false')
    $existing=$asp.SelectSingleNode('environmentVariables');if($existing){[void]$asp.RemoveChild($existing)}
    $vars=$web.CreateElement('environmentVariables');$envNode=$web.CreateElement('environmentVariable');$envNode.SetAttribute('name','ASPNETCORE_ENVIRONMENT');$envNode.SetAttribute('value','Production');[void]$vars.AppendChild($envNode);[void]$asp.AppendChild($vars)
    $web.Save((Join-Path $release 'web.config'))
}
function Initialize([string]$release){
    $exe=Join-Path $env:ProgramFiles 'dotnet\dotnet.exe'
    $env:ASPNETCORE_ENVIRONMENT='Production';$env:Database__ApplyMigrations='true'
    $env:Bootstrap__Password=$env:SERENA_BOOTSTRAP;$env:Bootstrap__Username=$c.AdminUsername;$env:Bootstrap__Name=$c.AdminName;$env:Bootstrap__Email=$c.AdminEmail
    $env:Bootstrap__ClinicName=$c.ClinicName;$env:Bootstrap__ClinicAddress=$c.ClinicAddress;$env:Bootstrap__ClinicPhone=$c.ClinicPhone;$env:Bootstrap__ClinicEmail=$c.ClinicEmail
    Push-Location $release
    try{& $exe (Join-Path $release 'Clinica.Api.dll') --deploy-initialize;if($LASTEXITCODE -ne 0){throw 'Migración/inicialización fallida. El sitio permanece detenido para diagnóstico.'}}
    finally{Pop-Location;foreach($variable in @('ASPNETCORE_ENVIRONMENT','Database__ApplyMigrations','Bootstrap__Password','Bootstrap__Username','Bootstrap__Name','Bootstrap__Email','Bootstrap__ClinicName','Bootstrap__ClinicAddress','Bootstrap__ClinicPhone','Bootstrap__ClinicEmail','SERENA_BOOTSTRAP')){[Environment]::SetEnvironmentVariable($variable,$null,'Process')}}
}
function RuntimeSql {
    $identity='IIS APPPOOL\'+$c.Pool
    [void](Sql "IF SUSER_ID(@user) IS NULL CREATE LOGIN [$identity] FROM WINDOWS;" 'master' @{'@user'=$identity})
    [void](Sql "IF USER_ID(@user) IS NULL CREATE USER [$identity] FOR LOGIN [$identity]; GRANT SELECT,INSERT,UPDATE,DELETE ON SCHEMA::dbo TO [$identity]; DENY UPDATE,DELETE ON dbo.AuditLogs TO [$identity];" $c.Database @{'@user'=$identity})
    # No db_owner, DDL or backup permission for the web process. Backups belong to the technical tool.
}
function ProvisionBackupVerifier {
    # SQL VERIFYONLY requires CREATE DATABASE. Give that permission only to a certificate
    # signing this fixed, path-restricted procedure; never directly to the web or SYSTEM.
    $name='ClinicaVerify_'+$c.Site
    $password=[Guid]::NewGuid().ToString('N')+[Guid]::NewGuid().ToString('N')
    $prefix=($c.BackupPath.TrimEnd('\')+'\work-').Replace("'","''")
    [void](Sql "CREATE CERTIFICATE [$name] ENCRYPTION BY PASSWORD='$password' WITH SUBJECT='ClinicaDeploy backup verification',EXPIRY_DATE='20991231'; CREATE LOGIN [$name] FROM CERTIFICATE [$name]; GRANT CREATE ANY DATABASE TO [$name];")
    [void](Sql "CREATE PROCEDURE dbo.[$name] @file nvarchar(4000) AS BEGIN SET NOCOUNT ON; IF LEFT(@file,LEN(N'$prefix'))<>N'$prefix' OR RIGHT(@file,14)<>N'\ClinicaDB.bak' OR CHARINDEX(N'..',@file)>0 THROW 50001,'Invalid backup path',1; RESTORE VERIFYONLY FROM DISK=@file WITH CHECKSUM; END;")
    [void](Sql "ADD SIGNATURE TO OBJECT::dbo.[$name] BY CERTIFICATE [$name] WITH PASSWORD='$password'; ALTER CERTIFICATE [$name] REMOVE PRIVATE KEY; IF USER_ID(N'NT AUTHORITY\SYSTEM') IS NULL CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM]; GRANT EXECUTE ON dbo.[$name] TO [NT AUTHORITY\SYSTEM];")
}
function Health {
    $url="https://$($c.Host):$($c.Port)/api/health/ready"
    for($i=0;$i -lt 12;$i++){try{$response=Invoke-RestMethod -Uri $url -TimeoutSec 10;if($response.status -eq 'ready'){Say 'HTTPS y SQL listos.';return}}catch{};Start-Sleep -Seconds 2}
    throw 'La comprobación HTTPS + SQL no respondió. No se omiten errores de certificado.'
}
try{
    Tool @('--validate',$ConfigPath)
    foreach($path in @($c.Root,$c.DataPath,$c.BackupPath,$c.RecoveryPath)){NoLinks $path}
    if($c.Operation -notin @('Check','Diagnostics') -and -not(IsAdmin)){throw 'Esta acción requiere Administrador de Windows; ser superadministrador de la web no basta.'}
    $mutex=New-Object Threading.Mutex($false,'Global\ClinicaSerena-Deploy')
    try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true}
    if(-not $locked){throw 'Hay otra operación técnica en curso.'}
    if($c.Operation -in @('Check','Diagnostics','Install','Update','Repair')){Prerequisites}
    if($c.Operation -in @('Install','Update','Repair') -and @($checks | Where-Object Status -eq 'ERROR').Count -gt 0){throw 'Hay requisitos bloqueantes. Corrígelos antes de instalar.'}
    if($c.Operation -in @('Update','Repair','Backup','ExportKey')){Import-Module WebAdministration;$state=OwnState}
    if($c.Operation -eq 'Restore'){
        if(Test-Path -LiteralPath (Join-Path $c.Root 'state\deployment.json')){Import-Module WebAdministration;$state=OwnState}
        else{if(-not $c.RecoveryThumbprint){throw 'En un servidor nuevo, importa el PFX e indica su huella de recuperación.'};$sqlAccount=(Sql 'SELECT service_account FROM sys.dm_server_services WHERE servicename LIKE ''SQL Server (%''').Rows[0].service_account;$state=[pscustomobject]@{KeyThumbprint=$c.RecoveryThumbprint;SqlAccount=$sqlAccount}}
    }
    switch($c.Operation){
        {$_ -in @('Check','Diagnostics')} { }
        'EnableIis' {
            $os=Get-CimInstance Win32_OperatingSystem
            if($os.ProductType -ne 1){Import-Module ServerManager;$r=Install-WindowsFeature Web-Server,Web-Static-Content,Web-Default-Doc,Web-Http-Errors,Web-Http-Logging,Web-Request-Monitor,Web-Filtering,Web-Mgmt-Tools -IncludeManagementTools;if(-not $r.Success){throw 'IIS no pudo habilitarse.'};Check 'Preparación IIS' 'OK' ("Reinicio requerido: "+$r.RestartNeeded)}
            else{$r=Enable-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole,IIS-WebServer,IIS-CommonHttpFeatures,IIS-StaticContent,IIS-DefaultDocument,IIS-HttpErrors,IIS-HttpLogging,IIS-RequestFiltering,IIS-ManagementConsole,IIS-ManagementScriptingTools -All -NoRestart;Check 'IIS laboratorio' 'OK' ("Reinicio requerido: "+$r.RestartNeeded)}
        }
        'Hosting' {
            $sig=Get-AuthenticodeSignature -LiteralPath $c.HostingBundle
            if($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation'){throw 'Hosting Bundle sin firma Microsoft válida.'}
            $p=Start-Process -FilePath $c.HostingBundle -ArgumentList '/install','/quiet','/norestart' -Wait -PassThru -WindowStyle Hidden
            if($p.ExitCode -notin @(0,3010)){throw "Hosting Bundle terminó con código $($p.ExitCode)."};Check 'Hosting Bundle' 'OK' ("Código "+$p.ExitCode+'. Si requiere reinicio, programarlo; no se reinicia IIS globalmente.')
        }
        {$_ -in @('Install','Update','Repair')} {
            $fresh=$c.Operation -eq 'Install';$id=[Guid]::NewGuid().ToString('N')
            if($fresh){foreach($path in @($c.Root,$c.DataPath,$c.BackupPath)){SecureDir $path};SecureDir (Join-Path $c.Root 'state');SecureDir (Join-Path $c.Root 'releases');SecureDir (Join-Path $c.Root 'tool');SecureDir (Join-Path $c.Root 'reports')}
            $release=Join-Path $c.Root ('releases\'+$id);NoLinks $release
            Tool @('--extract',$c.Package,$release,$c.ExpectedPackageSha256)
            $manifest=Get-Content -LiteralPath (Join-Path $release 'manifest.json') -Raw | ConvertFrom-Json
            if(-not $fresh){
                $oldVersion=$null;$newVersion=$null
                if(-not [Version]::TryParse($state.Version,[ref]$oldVersion) -or -not [Version]::TryParse($manifest.Version,[ref]$newVersion)){throw 'Las versiones de actualización deben ser numéricas (ej. 1.1.0).'}
                if($newVersion -lt $oldVersion -or ($c.Operation -eq 'Update' -and $newVersion -eq $oldVersion)){throw 'Se rechazó downgrade/actualización sin versión nueva. Para la misma versión usa Reparar.'}
            }
            if(-not $fresh){StopOwnSite;$backup=Backup $state;Say ('Respaldo anterior: '+$backup);$key=$state.KeyThumbprint}
            else{
                New-WebAppPool -Name $c.Pool | Out-Null
                Set-ItemProperty "IIS:\AppPools\$($c.Pool)" -Name managedRuntimeVersion -Value ''
                Set-ItemProperty "IIS:\AppPools\$($c.Pool)" -Name processModel.identityType -Value 4
                Set-ItemProperty "IIS:\AppPools\$($c.Pool)" -Name processModel.loadUserProfile -Value $true
                Set-ItemProperty "IIS:\AppPools\$($c.Pool)" -Name enable32BitAppOnWin64 -Value $false
                $cert=New-SelfSignedCertificate -Subject ('CN=ClinicaSerena-Recovery-'+$id) -CertStoreLocation Cert:\LocalMachine\My -KeyAlgorithm RSA -KeyLength 3072 -KeyExportPolicy Exportable -KeyUsage KeyEncipherment,DataEncipherment -NotAfter (Get-Date).AddYears(10) -Type Custom
                $key=$cert.Thumbprint
                KeyAccess $cert ('IIS APPPOOL\'+$c.Pool)
                [void](Sql "CREATE DATABASE [$($c.Database)]")
                # SYSTEM scheduled backups receive backup/read permissions, not SQL sysadmin.
                [void](Sql "IF SUSER_ID(N'NT AUTHORITY\SYSTEM') IS NULL CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;")
                [void](Sql "IF USER_ID(N'NT AUTHORITY\SYSTEM') IS NULL CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM]; ALTER ROLE db_backupoperator ADD MEMBER [NT AUTHORITY\SYSTEM];" $c.Database)
                ProvisionBackupVerifier
                # SQL service identity is persisted for scheduled backups (SYSTEM need not query privileged DMVs).
            }
            RuntimeConfig $release $key
            $migrationStarted=$true;Initialize $release
            RuntimeSql
            $identity='IIS APPPOOL\'+$c.Pool
            SecureDir $release $identity 'ReadAndExecute'
            # Root traversal only; state, reports and tooling remain admin/SYSTEM-only.
            GrantDir $c.Root $identity 'ReadAndExecute';SecureDir (Join-Path $c.Root 'state');SecureDir (Join-Path $c.Root 'tool');SecureDir (Join-Path $c.Root 'reports')
            SecureDir (Join-Path $c.Root 'releases') $identity 'ReadAndExecute'
            SecureDir $c.DataPath $identity 'Modify';SecureDir (Join-Path $c.DataPath 'backups') $identity 'ReadAndExecute'
            SecureDir $c.BackupPath
            if($fresh){New-Website -Name $c.Site -ApplicationPool $c.Pool -PhysicalPath $release -Port $c.Port -HostHeader $c.Host -Ssl | Out-Null}
            else{Set-ItemProperty "IIS:\Sites\$($c.Site)" -Name physicalPath -Value $release}
            Set-WebBinding -Name $c.Site -BindingInformation "*:$($c.Port):$($c.Host)" -PropertyName sslFlags -Value 1
            $binding=Get-WebBinding -Name $c.Site -Protocol https;$binding.AddSslCertificate($c.TlsThumbprint.Replace(' ',''),'My')
            Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $c.Site -Filter 'system.webServer/security/authentication/anonymousAuthentication' -Name userName -Value ''
            Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $c.Site -Filter 'system.webServer/directoryBrowse' -Name enabled -Value $false
            Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $c.Site -Filter 'system.webServer/security/requestFiltering/requestLimits' -Name maxAllowedContentLength -Value 11534336
            $rule='ClinicaSerena-'+$c.Site
            if($c.EnableFirewall){if(Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue){Set-NetFirewallRule -Name $rule -Enabled True -RemoteAddress $c.FirewallScope.Split(',') -LocalPort $c.Port -Protocol TCP -Profile Domain,Private}else{New-NetFirewallRule -Name $rule -DisplayName ('Clínica Serena HTTPS · '+$c.Site) -Direction Inbound -Action Allow -Protocol TCP -LocalPort $c.Port -RemoteAddress $c.FirewallScope.Split(',') -Profile Domain,Private | Out-Null}}
            elseif(-not $fresh -and $state.Config.EnableFirewall){Disable-NetFirewallRule -Name $rule -ErrorAction Stop | Out-Null}
            $sqlAccount=if($fresh){(Sql 'SELECT service_account FROM sys.dm_server_services WHERE servicename LIKE ''SQL Server (%''').Rows[0].service_account}else{$state.SqlAccount}
            $newState=@{Schema=1;Product='ClinicaSerena';Version=$manifest.Version;Release=$release;PreviousRelease=if($fresh){''}else{$state.Release};KeyThumbprint=$key;SqlAccount=$sqlAccount;InstalledAt=(Get-Date).ToUniversalTime().ToString('o');Config=$c;Status='AwaitingHealth'}
            SaveJson $newState (Join-Path $c.Root 'state\deployment.json');SaveJson $c (Join-Path $c.Root 'state\config.json')
            $installedTool=Join-Path $c.Root 'tool\ClinicaDeploy.exe';$installedScript=Join-Path $c.Root 'tool\Deploy.ps1'
            if([IO.Path]::GetFullPath($tool) -ne [IO.Path]::GetFullPath($installedTool)){Copy-Item -LiteralPath $tool -Destination $installedTool -Force}
            if([IO.Path]::GetFullPath($PSCommandPath) -ne [IO.Path]::GetFullPath($installedScript)){Copy-Item -LiteralPath $PSCommandPath -Destination $installedScript -Force}
            if($c.ScheduleBackup){
                $args='--run "'+(Join-Path $c.Root 'state\config.json')+'" --operation Backup'
                $action=New-ScheduledTaskAction -Execute (Join-Path $c.Root 'tool\ClinicaDeploy.exe') -Argument $args
                $trigger=New-ScheduledTaskTrigger -Daily -At ([datetime]::Today.Add([TimeSpan]::Parse($c.BackupTime)))
                $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
                Register-ScheduledTask -TaskName ('ClinicaSerena-Backup-'+$c.Site) -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
            }
            elseif(-not $fresh -and $state.Config.ScheduleBackup){Disable-ScheduledTask -TaskName ('ClinicaSerena-Backup-'+$c.Site) -ErrorAction Stop | Out-Null}
            StartOwnSite;Health
            $newState.Status='Ready';SaveJson $newState (Join-Path $c.Root 'state\deployment.json')
            Check 'Publicación' 'OK' ('Versión '+$manifest.Version+' · Production · sin demo. Exporta ahora el certificado de recuperación.')
        }
        'Backup' {
            if($state.Status -ne 'Ready'){throw 'El despliegue está en mantenimiento/incompleto. La tarea no lo reabrirá.'}
            if((Get-Website -Name $c.Site).State -ne 'Started'){throw 'El sitio ya estaba detenido. La tarea no altera una ventana de mantenimiento ajena.'}
            StopOwnSite;$backup=Backup $state;if($siteStopped){StartOwnSite};Check 'Respaldo' 'OK' $backup
        }
        'ExportKey' {
            if(-not $env:SERENA_PFX_PASSWORD -or $env:SERENA_PFX_PASSWORD.Length -lt 15){throw 'Contraseña de exportación PFX: al menos 15 caracteres.'}
            $file=Join-Path $c.BackupPath ('RECOVERY-KEY-'+(Get-Date).ToString('yyyyMMdd-HHmmss')+'.pfx')
            $password=ConvertTo-SecureString $env:SERENA_PFX_PASSWORD -AsPlainText -Force
            Export-PfxCertificate -Cert "Cert:\LocalMachine\My\$($state.KeyThumbprint)" -FilePath $file -Password $password -CryptoAlgorithmOption AES256_SHA256 | Out-Null
            Check 'Clave exportada' 'OK' ($file+' · mueve esta clave fuera del servidor, separada de los respaldos.')
        }
        'Restore' {
            if(DbExists $c.RecoveryDatabase){throw 'La base de recuperación ya existe; no se sobrescribe.'}
            if(Test-Path -LiteralPath $c.RecoveryPath){throw 'La carpeta de recuperación ya existe; elige una nueva.'}
            SecureDir $c.RecoveryPath
            $zip=Join-Path $c.RecoveryPath 'snapshot.zip';$dest=Join-Path $c.RecoveryPath 'snapshot'
            $thumb=if($c.RecoveryThumbprint){$c.RecoveryThumbprint}else{$state.KeyThumbprint}
            Tool @('--decrypt',$c.BackupFile,$zip,$thumb)
            Tool @('--extract-backup',$zip,$dest,(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash)
            $bak=Join-Path $dest 'ClinicaDB.bak';GrantDir $c.RecoveryPath $state.SqlAccount 'ReadAndExecute'
            $files=Sql 'RESTORE FILELISTONLY FROM DISK=@file' 'master' @{'@file'=$bak}
            $moves=New-Object 'System.Collections.Generic.List[string]';$n=0
            foreach($row in $files.Rows){$n++;$logical=([string]$row.LogicalName).Replace("'","''");$ext=if($row.Type -eq 'L'){'.ldf'}else{'.mdf'};$path=(Join-Path $c.RecoveryPath ($c.RecoveryDatabase+'-'+$n+$ext)).Replace("'","''");$moves.Add("MOVE N'$logical' TO N'$path'")}
            GrantDir $c.RecoveryPath $state.SqlAccount 'Modify'
            [void](Sql ("RESTORE DATABASE [$($c.RecoveryDatabase)] FROM DISK=@file WITH CHECKSUM,RECOVERY,"+($moves -join ',')) 'master' @{'@file'=$bak})
            Remove-Item -LiteralPath $zip -Force
            Check 'Recuperación aislada' 'OK' ($c.RecoveryDatabase+' · '+$dest+' · la clínica activa no fue modificada. Validar y promover según DEPLOY.md.')
        }
    }
    $hasErrors=@($checks | Where-Object Status -eq 'ERROR').Count -gt 0
    SaveJson @{Success=(-not $hasErrors);Message=if($hasErrors){'Diagnóstico completado con requisitos pendientes.'}else{'Operación completada. Consulta comprobaciones y advertencias.'};Checks=@($checks.ToArray())} $ResultPath
    if($hasErrors){exit 3}else{exit 0}
}catch{
    # Do not revert an IIS path after migrations without knowing schema compatibility.
    if($migrationStarted){try{StopOwnSite}catch{};Say 'Migraciones iniciadas: mantener mantenimiento y usar diagnóstico/recuperación; no rollback automático de datos.'}
    elseif($siteStopped){try{StartOwnSite}catch{Say 'No fue posible reabrir el sitio; requiere intervención técnica.'}}
    SaveJson @{Success=$false;Message='No se completó la operación: '+$_.Exception.Message;Checks=@($checks.ToArray());Recovery=if($migrationStarted){'El sitio quedó detenido. Revisar SQL e informe antes de reintentar.'}else{''}} $ResultPath
    Write-Output 'Operación fallida. Consulta el informe; no se han alterado RDP ni otros sitios.';exit 4
}finally{foreach($name in @('SERENA_BOOTSTRAP','SERENA_PFX_PASSWORD')){[Environment]::SetEnvironmentVariable($name,$null,'Process')};if($locked){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
