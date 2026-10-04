using System.IO.Compression;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public sealed record StoragePaths(string Root) { public string Documents => Path.Combine(Root, "documents"); public string Backups => Path.Combine(Root, "backups"); }
public static class StorageEndpoints
{
    static IQueryable<Document> Scoped(ClinicDb db, HttpContext c)
    {
        var patients = db.PatientsFor(c.User).Select(p => p.Id); var q = db.Documents.Where(d => patients.Contains(d.PatientId));
        if (c.User.CompanyPortal()) q = db.Documents.Where(d => d.CompanyId == c.User.Scope("company") && d.Category == "Comprobante" && d.Released);
        else if (c.User.PatientPortal()) q = q.Where(d => d.Released);
        else if (!c.User.Can("records.read")) q = q.Where(d => d.Category == "Administrativo" || d.Category == "Comprobante"); return q;
    }
    public static void MapStorage(this WebApplication app)
    {
        app.MapGet("/api/documents", async (int? patientId, ClinicDb db, HttpContext c) =>
        {
            var q = Scoped(db, c); if (patientId != null) q = q.Where(x => x.PatientId == patientId); return Results.Ok(await q.OrderByDescending(d => d.Id).Select(d => new { d.Id, d.PatientId, d.Name, d.Category, d.Size, d.Released, d.CreatedAt, d.Version, patientName = d.Patient.Name }).ToListAsync());
        }).RequireAuthorization("documents.read");
        app.MapPost("/api/documents", async (HttpContext c, ClinicDb db, StoragePaths paths) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal()) return Results.Forbid();
            if (!c.Request.HasFormContentType) return Results.BadRequest(new { message = "Selecciona un archivo." }); var form = await c.Request.ReadFormAsync(); var file = form.Files.GetFile("file");
            if (file == null || file.Length == 0 || file.Length > 10 * 1024 * 1024) return Results.BadRequest(new { message = "El archivo debe tener entre 1 byte y 10 MB." });
            if (!int.TryParse(form["patientId"], out var patientId) || !await Access.SeesPatient(db, c.User, patientId)) return Results.Forbid();
            string category = form["category"].ToString(); if (!new[] { "Administrativo", "Comprobante", "Estudio", "Receta", "Resultado" }.Contains(category)) return Results.BadRequest(new { message = "Categoría inválida." });
            int? companyId = int.TryParse(form["companyId"], out var companyScope) ? companyScope : null;
            if (companyId != null && (!c.User.Internal() || category != "Comprobante" || !await db.Patients.AnyAsync(p => p.Id == patientId && p.CompanyId == companyId) || !await db.Companies.AnyAsync(co => co.Id == companyId && co.Active))) return Results.BadRequest(new { message = "Solo un comprobante de un empleado asociado puede compartirse con esa empresa." });
            if (form["released"] == "true" && !c.User.Can("documents.publish")) return Results.Forbid();
            if ((category is "Estudio" or "Receta" or "Resultado") && !c.User.Can("records.write")) return Results.Forbid();
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant(); var types = new Dictionary<string, string> { { ".pdf", "application/pdf" }, { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" } };
            if (!types.TryGetValue(extension, out var type)) return Results.BadRequest(new { message = "Solo se admiten PDF, PNG y JPEG." });
            using var memory = new MemoryStream(); await file.CopyToAsync(memory); var bytes = memory.ToArray();
            var valid = extension == ".pdf" ? bytes.Length > 5 && System.Text.Encoding.ASCII.GetString(bytes, 0, 5) == "%PDF-" : extension == ".png" ? bytes.Length > 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) : bytes.Length > 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255;
            if (!valid) return Results.BadRequest(new { message = "El contenido no coincide con el tipo de archivo." });
            var stored = Guid.NewGuid().ToString("N") + extension; var fullPath = Path.Combine(paths.Documents, stored); await File.WriteAllBytesAsync(fullPath, bytes);
            var doc = new Document { PatientId = patientId, CompanyId = companyId, UploadedBy = c.User.UserId(), Name = Path.GetFileName(file.FileName)[..Math.Min(Path.GetFileName(file.FileName).Length, 180)], Category = category, StoredName = stored, ContentType = type, Size = file.Length, Hash = Convert.ToHexString(SHA256.HashData(bytes)), Released = form["released"] == "true" }; db.Documents.Add(doc); db.Audit(c, "Subir archivo", "Documento", patientId.ToString(), companyId == null ? "Privado respecto a empresas" : $"Cobertura empresarial {companyId}");
            try { if (doc.Released) await Access.NotifyPatient(db, patientId, "Documento disponible", $"Se publicó un documento: {category}."); await db.SaveChangesAsync(); } catch { File.Delete(fullPath); throw; }
            return Results.Ok(new { doc.Id });
        }).RequireAuthorization("documents.write").DisableAntiforgery();
        app.MapGet("/api/documents/{id:int}/download", async (int id, ClinicDb db, HttpContext c, StoragePaths paths) =>
        {
            var doc = await Scoped(db, c).FirstOrDefaultAsync(d => d.Id == id); if (doc == null) return Results.NotFound(); var path = Path.Combine(paths.Documents, doc.StoredName); if (!File.Exists(path)) return Results.NotFound(new { message = "El archivo no está disponible." }); db.Audit(c, "Descargar archivo", "Documento", id.ToString()); await db.SaveChangesAsync(); return Results.File(path, doc.ContentType, doc.Name, enableRangeProcessing: false);
        }).RequireAuthorization("documents.read");
        app.MapPost("/api/documents/{id:int}/release", async (int id, ReleaseRequest input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal()) return Results.Forbid();
            var doc = await Scoped(db, c).FirstOrDefaultAsync(d => d.Id == id); if (doc == null) return Results.NotFound(); if (doc.Version != input.Version) return Results.Conflict(new { message = "El documento cambió." }); doc.Released = input.Released; db.Audit(c, "Cambiar publicación", "Documento", id.ToString()); if (doc.Released) await Access.NotifyPatient(db, doc.PatientId, "Documento disponible", $"Se publicó un documento: {doc.Category}."); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("documents.publish");
        app.MapGet("/api/backups", async (ClinicDb db) => Results.Ok(await db.Backups.OrderByDescending(b => b.Id).ToListAsync())).RequireAuthorization("backups.read");
        app.MapGet("/api/backups/policy", (IConfiguration config, StoragePaths paths) =>
        {
            var managed = config.GetValue<bool>("Backups:ManagedExternally");
            string? completed = null;
            var file = Path.Combine(paths.Backups, "technical-status.json");
            if (managed && File.Exists(file))
            {
                try { using var json = System.Text.Json.JsonDocument.Parse(File.ReadAllText(file)); completed = json.RootElement.GetProperty("CompletedAt").GetString(); }
                catch (Exception error) when (error is IOException or System.Text.Json.JsonException or KeyNotFoundException) { }
            }
            return Results.Ok(new { managedExternally = managed, lastCompletedAt = completed });
        }).RequireAuthorization("backups.read");
        app.MapPost("/api/backups", async (ClinicDb db, StoragePaths paths, HttpContext c, IConfiguration config) =>
        {
            if (config.GetValue<bool>("Backups:ManagedExternally")) return Results.Conflict(new { message = "En este servidor, los respaldos consistentes y cifrados se crean desde ClinicaDeploy o su tarea programada. La web no posee permisos administrativos de SQL Server." });
            var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..6]; var name = $"clinica-{stamp}"; var staging = Path.Combine(paths.Backups, name); Directory.CreateDirectory(staging);
            var backup = new Backup { RequestedBy = c.User.UserId(), Name = name + ".zip", Provider = db.Database.IsSqlite() ? "Sqlite" : "SqlServer", Status = "En curso" }; db.Backups.Add(backup); await db.SaveChangesAsync();
            try
            {
                if (db.Database.IsSqlite())
                {
                    using var source = new SqliteConnection(db.Database.GetConnectionString()); using var target = new SqliteConnection($"Data Source={Path.Combine(staging, "ClinicaDB.db")};Pooling=False"); await source.OpenAsync(); await target.OpenAsync(); source.BackupDatabase(target);
                }
                else
                {
                    var conn = db.Database.GetDbConnection(); await db.Database.OpenConnectionAsync(); var dbName = conn.Database.Replace("]", "]]"); var bak = Path.Combine(staging, "ClinicaDB.bak"); using var cmd = conn.CreateCommand(); cmd.CommandTimeout = 300; cmd.CommandText = $"BACKUP DATABASE [{dbName}] TO DISK = @file WITH COPY_ONLY, CHECKSUM"; var p = cmd.CreateParameter(); p.ParameterName = "@file"; p.Value = bak; cmd.Parameters.Add(p); await cmd.ExecuteNonQueryAsync(); cmd.CommandText = $"RESTORE VERIFYONLY FROM DISK = @file WITH CHECKSUM"; await cmd.ExecuteNonQueryAsync();
                }
                var docs = Path.Combine(staging, "documents"); Directory.CreateDirectory(docs); var manifest = new List<object>();
                foreach (var path in Directory.EnumerateFiles(paths.Documents)) { var dest = Path.Combine(docs, Path.GetFileName(path)); File.Copy(path, dest); manifest.Add(new { name = Path.GetFileName(path), sha256 = Convert.ToHexString(SHA256.HashData(await File.ReadAllBytesAsync(path))) }); }
                await File.WriteAllTextAsync(Path.Combine(staging, "manifest.json"), System.Text.Json.JsonSerializer.Serialize(new { version = 1, provider = backup.Provider, createdAt = DateTime.UtcNow, documents = manifest }));
                var zip = Path.Combine(paths.Backups, backup.Name); ZipFile.CreateFromDirectory(staging, zip); backup.Size = new FileInfo(zip).Length; backup.Status = "Completado"; backup.Detail = "Base de datos y documentos; manifiesto de integridad incluido."; db.Audit(c, "Crear respaldo", "Backup", backup.Id.ToString()); await db.SaveChangesAsync(); return Results.Ok(new { backup.Id });
            }
            catch (Exception ex) { backup.Status = "Fallido"; backup.Detail = "Verifica ruta, espacio y permisos del servicio de base de datos."; db.Audit(c, "Crear respaldo", "Backup", backup.Id.ToString(), result: "Fallido"); await db.SaveChangesAsync(); app.Logger.LogError(ex, "Backup {Id} failed", backup.Id); return Results.Problem("No se completó el respaldo. Consulta el estado y los registros del servidor."); }
            finally { try { if (Directory.Exists(staging) && Path.GetFullPath(staging).StartsWith(Path.GetFullPath(paths.Backups) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) Directory.Delete(staging, true); } catch (IOException ex) { app.Logger.LogWarning(ex, "Backup staging cleanup incomplete"); } }
        }).RequireAuthorization("backups.write").RequireRateLimiting("backup");
        app.MapGet("/api/backups/{id:int}/download", async (int id, ClinicDb db, StoragePaths paths, HttpContext c) =>
        {
            var backup = await db.Backups.FindAsync(id); if (backup == null || backup.Status != "Completado") return Results.NotFound(); var path = Path.Combine(paths.Backups, backup.Name); if (!File.Exists(path)) return Results.NotFound(); db.Audit(c, "Descargar respaldo", "Backup", id.ToString()); await db.SaveChangesAsync(); return Results.File(path, "application/zip", backup.Name);
        }).RequireAuthorization("backups.download");
        app.MapGet("/api/system", async (ClinicDb db, StoragePaths paths, IWebHostEnvironment env) =>
        {
            var root = Path.GetPathRoot(paths.Root); var disk = root == null ? null : new DriveInfo(root); return Results.Ok(new { environment = env.EnvironmentName, database = db.Database.IsSqlite() ? "SQLite · desarrollo" : "SQL Server", connected = await db.Database.CanConnectAsync(), runtime = Environment.Version.ToString(), storageWritable = Directory.Exists(paths.Documents), freeSpaceGb = disk?.AvailableFreeSpace / (1024 * 1024 * 1024), uptimeMinutes = (DateTime.UtcNow - System.Diagnostics.Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalMinutes });
        }).RequireAuthorization("system.read");
    }
    public record ReleaseRequest(bool Released, Guid Version);
}
