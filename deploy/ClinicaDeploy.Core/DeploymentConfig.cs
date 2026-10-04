using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace ClinicaDeploy;

public sealed record DeploymentConfig
{
    public int Schema { get; init; } = 1;
    public string Operation { get; init; } = "Install";
    public string Package { get; init; } = "";
    public string ExpectedPackageSha256 { get; init; } = "";
    public string ClinicName { get; init; } = "Clínica Serena";
    public string ClinicAddress { get; init; } = "";
    public string ClinicPhone { get; init; } = "";
    public string ClinicEmail { get; init; } = "";
    public string Root { get; init; } = @"C:\ClinicaSerena";
    public string DataPath { get; init; } = @"C:\ClinicaSerenaData";
    public string BackupPath { get; init; } = @"C:\ClinicaSerenaBackups";
    public string Host { get; init; } = "clinica.interna.example";
    public int Port { get; init; } = 443;
    public string Site { get; init; } = "ClinicaSerena";
    public string Pool { get; init; } = "ClinicaSerena";
    public string SqlServer { get; init; } = @"localhost\SQLEXPRESS";
    public string Database { get; init; } = "ClinicaDB";
    public string TlsThumbprint { get; init; } = "";
    public string AdminUsername { get; init; } = "admin";
    public string AdminName { get; init; } = "";
    public string AdminEmail { get; init; } = "";
    public bool EnableFirewall { get; init; } = true;
    public string FirewallScope { get; init; } = "LocalSubnet";
    public bool ScheduleBackup { get; init; } = true;
    public string BackupTime { get; init; } = "02:00";
    public string BackupFile { get; init; } = "";
    public string RecoveryDatabase { get; init; } = "ClinicaDB_Recuperacion";
    public string RecoveryPath { get; init; } = @"C:\ClinicaSerenaRecovery";
    public string RecoveryThumbprint { get; init; } = "";
    public string HostingBundle { get; init; } = "";
    public bool AcceptMaintenance { get; init; }
    public bool AcceptRecoveryKeyCustody { get; init; }

    public static readonly JsonSerializerOptions Json = new() { WriteIndented = true, PropertyNameCaseInsensitive = true };
    public static DeploymentConfig Read(string file) => JsonSerializer.Deserialize<DeploymentConfig>(File.ReadAllText(file), Json) ?? throw new InvalidDataException("Configuración vacía.");
    public void Write(string file) => File.WriteAllText(file, JsonSerializer.Serialize(this, Json));
    public IReadOnlyList<string> Validate(bool executing = false)
    {
        var errors = new List<string>();
        if (Schema != 1) errors.Add("Versión de configuración no compatible.");
        if (!new[] { "Install", "Update", "Repair", "Backup", "Restore", "Diagnostics", "Check", "EnableIis", "Hosting", "ExportKey" }.Contains(Operation)) errors.Add("Operación no reconocida.");
        foreach (var (label, value) in new[] { ("sitio", Site), ("pool", Pool), ("base", Database), ("base de recuperación", RecoveryDatabase) })
            if (!Regex.IsMatch(value, @"^[A-Za-z][A-Za-z0-9_\-]{2,63}$")) errors.Add($"Nombre de {label} inválido (3–64 caracteres). ");
        if (Uri.CheckHostName(Host) != UriHostNameType.Dns || Host.Contains('*') || Host.Contains('_')) errors.Add("Usa un nombre DNS válido, sin protocolo ni comodines.");
        if (Port < 1024 && Port != 443 || Port > 65535 || Port < 1) errors.Add("Puerto HTTPS: 443 o entre 1024 y 65535.");
        if (!Regex.IsMatch(SqlServer, @"^[A-Za-z0-9.\-]+(\\[A-Za-z0-9_\-]+)?(,\d{1,5})?$")) errors.Add("Instancia SQL inválida.");
        var server = SqlServer.Split('\\', ',')[0];
        if (!new[] { ".", "localhost", "127.0.0.1", Environment.MachineName }.Contains(server, StringComparer.OrdinalIgnoreCase)) errors.Add("Esta versión instala sobre SQL local con identidad Windows. SQL remoto requiere configuración técnica separada.");
        foreach (var (label, path) in new[] { ("instalación", Root), ("datos", DataPath), ("respaldos", BackupPath), ("recuperación", RecoveryPath) })
            if (!SafePath(path)) errors.Add($"Ruta de {label}: elige una carpeta local dedicada, fuera de Windows, Program Files y perfiles.");
        var paths = new[] { Root, DataPath, BackupPath, RecoveryPath };
        if (paths.All(SafePath)) for (var i = 0; i < paths.Length; i++) for (var j = i + 1; j < paths.Length; j++)
            if (Inside(paths[i], paths[j]) || Inside(paths[j], paths[i])) errors.Add("Las cuatro carpetas deben estar separadas; ninguna puede contener otra.");
        if (EnableFirewall && !ValidScope(FirewallScope)) errors.Add("Alcance firewall: LocalSubnet o lista de IPv4/CIDR; no se admite Any.");
        if (!Regex.IsMatch(BackupTime, @"^(?:[01]\d|2[0-3]):[0-5]\d$")) errors.Add("Hora de respaldo inválida (HH:mm).");
        if (ClinicName.Length < 3 || ClinicName.Length > 150) errors.Add("Nombre de clínica: 3–150 caracteres.");
        if (ClinicAddress.Length > 300 || ClinicPhone.Length > 30 || ClinicEmail.Length > 180 || AdminName.Length > 180 || AdminEmail.Length > 180) errors.Add("Hay datos administrativos que exceden el tamaño permitido.");
        foreach (var email in new[] { ClinicEmail, AdminEmail }.Where(v => !string.IsNullOrWhiteSpace(v)))
            if (!System.Net.Mail.MailAddress.TryCreate(email, out var parsed) || parsed.Address != email) errors.Add("Correo administrativo inválido.");
        if (executing && Operation is "Install" or "Update" or "Repair")
        {
            if (!File.Exists(Package)) errors.Add("Selecciona el ZIP de publicación.");
            if (!Regex.IsMatch(ExpectedPackageSha256, "^[A-Fa-f0-9]{64}$")) errors.Add("Pega el SHA-256 del paquete obtenido de la distribución de confianza.");
            if (!Regex.IsMatch(TlsThumbprint.Replace(" ", ""), "^[A-Fa-f0-9]{40}$")) errors.Add("Selecciona un certificado TLS de LocalMachine/My.");
            if (!AcceptRecoveryKeyCustody) errors.Add("Confirma que custodiarás la clave de recuperación fuera del servidor.");
        }
        if (executing && Operation == "Install" && (AdminName.Length < 3 || !Regex.IsMatch(AdminUsername, @"^[a-zA-Z0-9._\-]{3,64}$"))) errors.Add("Indica nombre y usuario válidos del administrador inicial.");
        if (executing && Operation is "Update" or "Repair" or "Backup" && !AcceptMaintenance) errors.Add("Confirma la ventana de mantenimiento (el sitio se detendrá temporalmente).");
        if (executing && Operation == "Restore")
        {
            if (!File.Exists(BackupFile)) errors.Add("Selecciona un respaldo .serena.");
            if (RecoveryDatabase.Equals(Database, StringComparison.OrdinalIgnoreCase)) errors.Add("La recuperación nunca puede sobrescribir la base activa.");
        }
        if (Operation == "Hosting" && !File.Exists(HostingBundle)) errors.Add("Selecciona un Hosting Bundle oficial firmado por Microsoft.");
        return errors.Distinct().ToList();
    }
    public static bool StrongPassword(string value) => value.Length is >= 15 and <= 128 && value.Any(char.IsUpper) && value.Any(char.IsLower) && value.Any(char.IsDigit);
    public static bool Inside(string child, string parent) => Path.GetFullPath(child).TrimEnd('\\', '/').Equals(Path.GetFullPath(parent).TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase) || Path.GetFullPath(child).StartsWith(Path.GetFullPath(parent).TrimEnd('\\', '/') + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    public static bool SafePath(string value)
    {
        if (!Regex.IsMatch(value, @"^[A-Za-z]:\\[^<>|?*\r\n]+$") || value.Contains('"') || value.Any(c => c < 32) || value.Contains("..") || value.IndexOf(':', 2) >= 0) return false;
        var path = Path.GetFullPath(value).TrimEnd('\\');
        var prohibited = new[] { Environment.GetFolderPath(Environment.SpecialFolder.Windows), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Path.Combine(Path.GetPathRoot(path)!, "Users"), Path.Combine(Path.GetPathRoot(path)!, "ProgramData") }.Where(p => p.Length > 0);
        return path.Length > 4 && !prohibited.Any(p => Inside(path, p));
    }
    public static bool ValidScope(string scope) => scope == "LocalSubnet" || scope.Split(',').All(part =>
    {
        var pieces = part.Trim().Split('/');
        return pieces.Length <= 2 && IPAddress.TryParse(pieces[0], out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && (pieces.Length == 1 || int.TryParse(pieces[1], out var prefix) && prefix is >= 8 and <= 32);
    });
    public IReadOnlyList<string> Plan() => Operation switch
    {
        "Install" => ["Verificar Windows, IIS, Hosting Bundle, SQL, disco, DNS y certificado.", "Validar SHA-256 y cada archivo; extraer a una nueva versión aislada.", "Crear ClinicaDB vacía, migrar con la identidad del técnico y crear solo el administrador inicial.", "Crear identidad IIS con permisos mínimos y certificado separado para claves y respaldos.", "Publicar solo HTTPS, aplicar ACL y firewall al alcance elegido.", "Registrar respaldos, comprobar API/SQL por HTTPS y guardar informe."],
        "Update" or "Repair" => ["Comprobar propiedad y configuración inmutable del despliegue.", "Detener exclusivamente el sitio de la clínica y crear respaldo consistente cifrado.", "Publicar en una versión nueva, ejecutar migraciones y sustituir ruta de IIS.", "Verificar HTTPS + SQL; si falla tras migrar, mantener el sitio detenido (sin rollback inseguro de datos)."],
        "Backup" => ["Detener el sitio propio durante la instantánea.", "BACKUP COPY_ONLY + CHECKSUM + VERIFYONLY; copiar documentos, claves y configuración.", "Cifrar y autenticar el archivo con clave aleatoria y certificado de recuperación; reiniciar el sitio.", "Sin purgar respaldos automáticamente; conservar una copia fuera del servidor."],
        "Restore" => ["Autenticar y descifrar el respaldo con la clave privada de recuperación.", "Verificar hashes y restaurar con CHECKSUM en una base NUEVA.", "Extraer documentos y claves a una carpeta NUEVA; no tocar la clínica activa.", "Entregar informe y procedimiento para validar y promover la copia en mantenimiento."],
        "EnableIis" => ["Habilitar únicamente los componentes IIS necesarios (puede requerir reinicio)."],
        "Hosting" => ["Verificar firma Microsoft y ejecutar Hosting Bundle seleccionado; informar si requiere reinicio.", "No reiniciar IIS globalmente. Programar ese reinicio con el técnico si es necesario."],
        "ExportKey" => ["Exportar la clave privada de recuperación a PFX con contraseña; custodiarla fuera del servidor."],
        _ => ["Inspección de solo lectura: no modificar servicios, firewall, SQL ni archivos clínicos."]
    };
}
