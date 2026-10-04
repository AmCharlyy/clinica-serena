using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

namespace ClinicaDeploy;

public sealed record PackageManifest(int Schema, string Product, string Version, string Runtime, Dictionary<string, string> Files);
public static class SafePackage
{
    public const long MaxBytes = 4L * 1024 * 1024 * 1024;
    public static string Hash(string path) { using var stream = File.OpenRead(path); return Convert.ToHexString(SHA256.HashData(stream)); }
    public static bool SafeEntry(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Contains('\\') || name.StartsWith('/') || name.Contains(':')) return false;
        var parts = name.Split('/');
        return parts.All(p => p.Length > 0 && p != "." && p != ".." && !p.EndsWith('.') && !p.EndsWith(' ') && !p.Any(c => c < 32 || "<>|?*".Contains(c)) && !System.Text.RegularExpressions.Regex.IsMatch(p, @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }
    public static PackageManifest Extract(string zip, string destination, string expectedHash, bool publication = true)
    {
        if (!Hash(zip).Equals(expectedHash, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("El SHA-256 del ZIP no coincide. No se extraerá.");
        if (Directory.Exists(destination)) throw new IOException("El destino de extracción ya existe; nunca se sobrescribe.");
        using var archive = ZipFile.OpenRead(zip);
        if (archive.Entries.Count < 2 || archive.Entries.Count > (publication ? 20000 : 200000) || archive.Entries.Sum(e => e.Length) > (publication ? MaxBytes : 256L * 1024 * 1024 * 1024)) throw new InvalidDataException("Tamaño/cantidad de archivos no permitido.");
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in archive.Entries)
            if (!SafeEntry(entry.FullName) || !names.Add(entry.FullName) || (entry.ExternalAttributes >> 16 & 0xf000) == 0xa000)
                throw new InvalidDataException("El ZIP contiene rutas inseguras, enlaces o duplicados.");
        var manifestEntry = archive.GetEntry("manifest.json") ?? throw new InvalidDataException("Falta manifest.json.");
        if (manifestEntry.Length > (publication ? 4 : 32) * 1024 * 1024) throw new InvalidDataException("Manifiesto excesivo.");
        using var manifestStream = manifestEntry.Open();
        var manifest = JsonSerializer.Deserialize<PackageManifest>(manifestStream, DeploymentConfig.Json) ?? throw new InvalidDataException("Manifiesto inválido.");
        if (manifest.Schema != 1 || manifest.Files == null || !System.Text.RegularExpressions.Regex.IsMatch(manifest.Version, @"^[0-9A-Za-z.\-]{1,50}$")) throw new InvalidDataException("Versión del manifiesto inválida.");
        if (publication && (manifest.Product != "ClinicaSerena" || manifest.Runtime != "net10.0" || !manifest.Files.ContainsKey("Clinica.Api.dll") || !manifest.Files.ContainsKey("wwwroot/index.html") || !manifest.Files.ContainsKey("web.config"))) throw new InvalidDataException("No es una publicación completa de Clínica Serena.");
        if (publication && manifest.Files.Keys.Any(n => n.Contains("appsettings.Development", StringComparison.OrdinalIgnoreCase) || n.Contains("appsettings.Local", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".pfx", StringComparison.OrdinalIgnoreCase) || n.EndsWith(".bak", StringComparison.OrdinalIgnoreCase))) throw new InvalidDataException("El paquete incluye configuración local o datos no distribuibles.");
        if (names.Count != manifest.Files.Count + 1 || manifest.Files.Keys.Any(n => !SafeEntry(n) || !names.Contains(n))) throw new InvalidDataException("Archivos extra o ausentes respecto al manifiesto.");
        // Validate every byte before writing any content; hashes provide integrity, not publisher identity.
        foreach (var entry in archive.Entries.Where(e => e.FullName != "manifest.json"))
        {
            using var source = entry.Open(); var actual = Convert.ToHexString(SHA256.HashData(source));
            if (!actual.Equals(manifest.Files[entry.FullName], StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Integridad interna incorrecta: " + entry.FullName);
        }
        Directory.CreateDirectory(destination);
        foreach (var entry in archive.Entries)
        {
            var path = Path.GetFullPath(Path.Combine(destination, entry.FullName.Replace('/', Path.DirectorySeparatorChar)));
            if (!DeploymentConfig.Inside(path, destination)) throw new InvalidDataException("Ruta fuera del destino.");
            Directory.CreateDirectory(Path.GetDirectoryName(path)!); entry.ExtractToFile(path, false);
        }
        return manifest;
    }
    public static void Create(string source, string zip, string product, string version)
    {
        var files = Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories).Where(p => Path.GetFileName(p) != "manifest.json").Order().ToDictionary(p => Path.GetRelativePath(source, p).Replace('\\', '/'), Hash);
        if (files.Keys.Any(p => !SafeEntry(p))) throw new InvalidDataException("Nombre de archivo no distribuible.");
        var manifest = new PackageManifest(1, product, version, "net10.0", files);
        using var archive = ZipFile.Open(zip, ZipArchiveMode.Create);
        foreach (var name in files.Keys) archive.CreateEntryFromFile(Path.Combine(source, name), name, CompressionLevel.Optimal);
        using var output = archive.CreateEntry("manifest.json").Open(); JsonSerializer.Serialize(output, manifest, DeploymentConfig.Json);
    }
}
