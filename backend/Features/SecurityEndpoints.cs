using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OtpNet;
using QRCoder;
namespace Clinica;

public static class SecurityEndpoints
{
    public record FactorRequest(string Code);
    public record ReauthRequest(string Password, string? Code);
    public record AdministrativeAction(string Reason, bool IdentityVerified = false);
    public record ExportRequest(string Dataset);
    public record LifecycleRequest(DateTime? AccessExpiresAt, bool Active, Guid Version, string Reason, bool SharedWorkstation = false);
    public static void MapSecurity(this WebApplication app)
    {
        app.MapPost("/api/exports/authorize", async (ExportRequest input, ClinicDb db, HttpContext c) =>
        {
            var permission = input.Dataset switch { "audit" => "audit.read", "patients" => "patients.read", "staff" => "staff.read", "facilities" => "infrastructure.read", "services" => "services.read", "payments" => "payments.read", "companies" => "companies.read", "users" => "users.read", _ => "" };
            if (!c.User.Can("reports.export") || permission == "" || !c.User.Can(permission)) return Results.Forbid();
            db.Audit(c, "Autorizar exportación", "Exportación", detail: input.Dataset); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("reports.export");
        app.MapPost("/api/auth/mfa/enroll", async (ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            var user = (await db.Users.FindAsync(c.User.UserId()))!; var session = (await security.Current(c))!;
            if (user.MfaEnabled || (session.Stage != "enrollment" && session.Stage != "full")) return Results.Forbid();
            if (session.EnrollmentSecret == "" || session.EnrollmentExpiresAt <= DateTime.UtcNow) { session.EnrollmentSecret = security.Protect(Base32Encoding.ToString(RandomNumberGenerator.GetBytes(20))); session.EnrollmentExpiresAt = DateTime.UtcNow.AddMinutes(10); await db.SaveChangesAsync(); }
            var secret = security.Unprotect(session.EnrollmentSecret);
            var uri = $"otpauth://totp/{Uri.EscapeDataString("Clínica Serena:" + user.Username)}?secret={secret}&issuer={Uri.EscapeDataString("Clínica Serena")}&algorithm=SHA1&digits=6&period=30";
            using var qr = QRCodeGenerator.GenerateQrCode(uri, QRCodeGenerator.ECCLevel.Q); using var png = new PngByteQRCode(qr);
            return Results.Ok(new { manualKey = secret, qr = "data:image/png;base64," + Convert.ToBase64String(png.GetGraphic(6)), expiresAt = SessionSecurity.Utc(session.EnrollmentExpiresAt!.Value) });
        }).RequireAuthorization().RequireRateLimiting("factor");
        app.MapPost("/api/auth/mfa/confirm", async (FactorRequest input, ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var user = (await db.Users.FindAsync(c.User.UserId()))!; var session = (await security.Current(c))!;
            if (user.MfaEnabled || session.EnrollmentSecret == "" || session.EnrollmentExpiresAt <= DateTime.UtcNow || (session.Stage != "enrollment" && session.Stage != "full")) return Results.Forbid();
            if (!await security.Consume(user, input.Code, c, session.EnrollmentSecret)) { await tx.CommitAsync(); return BadFactor(); }
            user.MfaSecret = session.EnrollmentSecret; user.MfaEnabled = true; user.SecurityStamp = Guid.NewGuid();
            var codes = await security.NewRecoveryCodes(user); await security.Complete(user, session, c); await tx.CommitAsync();
            return Results.Ok(new { session = await security.View(user, session), recoveryCodes = codes });
        }).RequireAuthorization().RequireRateLimiting("factor");
        app.MapPost("/api/auth/mfa/verify", async (FactorRequest input, ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var user = (await db.Users.FindAsync(c.User.UserId()))!; var session = (await security.Current(c))!;
            if (session.Stage != "mfa" || !user.MfaEnabled) return Results.Forbid();
            if (!await security.Consume(user, input.Code, c)) { await tx.CommitAsync(); return BadFactor(); }
            await security.Complete(user, session, c); await tx.CommitAsync(); return Results.Ok(await security.View(user, session));
        }).RequireAuthorization().RequireRateLimiting("factor");
        app.MapPost("/api/auth/reauth", async (ReauthRequest input, ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            var user = (await db.Users.FindAsync(c.User.UserId()))!; var session = (await security.Current(c))!;
            if (session.Stage != "full" || user.LockedUntil > DateTime.UtcNow) return Results.Forbid();
            if (string.IsNullOrEmpty(input.Password) || input.Password.Length > 128 || new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed)
            {
                user.FailedAttempts++; if (user.FailedAttempts >= 5) { user.LockedUntil = DateTime.UtcNow.AddMinutes(15); user.FailedAttempts = 0; }
                db.Audit(c, "Confirmar identidad", "Usuario", user.Id.ToString(), result: "Denegado"); await db.SaveChangesAsync(); await tx.CommitAsync(); return BadFactor();
            }
            if (user.MfaEnabled && !await security.Consume(user, input.Code, c)) { await tx.CommitAsync(); return BadFactor(); }
            user.FailedAttempts = 0; session.ReauthenticatedAt = DateTime.UtcNow; db.Audit(c, "Confirmar identidad", "Sesión", session.SessionId.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync();
            return Results.Ok(new { expiresAt = DateTime.UtcNow.AddMinutes(3) });
        }).RequireAuthorization().RequireRateLimiting("factor");
        app.MapPost("/api/auth/activity", async (SessionSecurity security, ClinicDb db, HttpContext c) =>
        {
            var session = (await security.Current(c))!; var now = DateTime.UtcNow; var idleThreshold = now.AddMinutes(-SessionSecurity.IdleMinutes(c.User)); var stamp = Guid.Parse(c.User.FindFirstValue("stamp")!);
            // Heartbeats must not invalidate a concurrent reauthentication through Version changes.
            var changed = await db.AuthSessions.Where(x => x.Id == session.Id && x.Stage == "full" && x.RevokedAt == null && x.AbsoluteExpiresAt > now && x.LastActivityAt > idleThreshold && db.Users.Any(u => u.Id == x.UserId && u.Active && u.SecurityStamp == stamp && !u.MustChangePassword && (u.AccessExpiresAt == null || u.AccessExpiresAt > now))).ExecuteUpdateAsync(s => s.SetProperty(x => x.LastActivityAt, now));
            if (changed != 1) return Results.Unauthorized(); await db.Entry(session).ReloadAsync();
            return Results.Ok(await security.View((await db.Users.FindAsync(c.User.UserId()))!, session));
        }).RequireAuthorization();
        app.MapGet("/api/auth/security", async (ClinicDb db, HttpContext c) =>
        {
            var user = (await db.Users.FindAsync(c.User.UserId()))!;
            return Results.Ok(new { user.MfaEnabled, remainingRecoveryCodes = await db.RecoveryCodes.CountAsync(x => x.UserId == user.Id && x.UsedAt == null), user.AccessExpiresAt, user.AccessReviewedAt });
        }).RequireAuthorization();
        app.MapPost("/api/auth/mfa/recovery-codes", async (ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            var user = (await db.Users.FindAsync(c.User.UserId()))!; if (!user.MfaEnabled) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync(); var codes = await security.NewRecoveryCodes(user);
            db.Audit(c, "Regenerar códigos de recuperación", "Usuario", user.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new { recoveryCodes = codes });
        }).RequireAuthorization();
        app.MapPost("/api/auth/mfa/replace", async (ClinicDb db, SessionSecurity security, HttpContext c) =>
        {
            var user = (await db.Users.FindAsync(c.User.UserId()))!; var session = (await security.Current(c))!;
            if (!user.MfaEnabled) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync(); user.MfaEnabled = false; user.MfaSecret = ""; user.LastTotpStep = -1; user.SecurityStamp = Guid.NewGuid();
            await db.RecoveryCodes.Where(x => x.UserId == user.Id).ExecuteDeleteAsync();
            session.Stage = "enrollment"; session.EnrollmentSecret = ""; session.ReauthenticatedAt = null; session.AbsoluteExpiresAt = DateTime.UtcNow.AddMinutes(10);
            db.Audit(c, "Sustituir autenticador", "Usuario", user.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); await security.SignIn(c, user, session); return Results.Ok(await security.View(user, session));
        }).RequireAuthorization();
        app.MapGet("/api/security/sessions", async (ClinicDb db, HttpContext c) =>
        {
            var now = DateTime.UtcNow;
            var currentId = Guid.Parse(c.User.FindFirstValue("sid")!);
            return Results.Ok(await (from session in db.AuthSessions.AsNoTracking() join user in db.Users on session.UserId equals user.Id where session.RevokedAt == null && session.AbsoluteExpiresAt > now orderby session.LastActivityAt descending select new { session.Id, session.SessionId, session.UserId, user.Username, user.Name, session.Stage, session.CreatedAt, session.LastActivityAt, session.AbsoluteExpiresAt, session.Ip, session.UserAgent, current = session.SessionId == currentId }).Take(200).ToListAsync());
        }).RequireAuthorization("sessions.read");
        app.MapPost("/api/security/sessions/{id:int}/revoke", async (int id, AdministrativeAction input, ClinicDb db, HttpContext c) =>
        {
            if (!Reason(input.Reason)) return ReasonError(); var session = await db.AuthSessions.FindAsync(id); if (session == null) return Results.NotFound();
            var user = (await db.Users.FindAsync(session.UserId))!; if (!await AuthEndpoints.CanManageUser(user, db, c)) return Results.Forbid();
            session.RevokedAt = DateTime.UtcNow; db.Audit(c, "Revocar sesión", "Sesión", session.SessionId.ToString(), input.Reason); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("sessions.revoke");
        app.MapPost("/api/security/users/{id:int}/revoke-all", async (int id, AdministrativeAction input, ClinicDb db, HttpContext c) =>
        {
            if (!Reason(input.Reason)) return ReasonError(); var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound(); if (!await AuthEndpoints.CanManageUser(user, db, c)) return Results.Forbid();
            await using var tx = await db.Database.BeginTransactionAsync();
            await db.AuthSessions.Where(x => x.UserId == id && x.RevokedAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, DateTime.UtcNow));
            user.SecurityStamp = Guid.NewGuid(); db.Audit(c, "Revocar todas las sesiones", "Usuario", id.ToString(), input.Reason); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok();
        }).RequireAuthorization("sessions.revoke");
        app.MapPost("/api/security/users/{id:int}/reset-mfa", async (int id, AdministrativeAction input, ClinicDb db, HttpContext c) =>
        {
            if (!Reason(input.Reason) || !input.IdentityVerified) return Results.BadRequest(new { message = "Documenta la verificación presencial de identidad y el motivo (sin datos clínicos)." });
            if (id == c.User.UserId()) return Results.BadRequest(new { message = "Usa tus códigos de recuperación o solicita la intervención de otro superadministrador." });
            var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound();
            await using var tx = await db.Database.BeginTransactionAsync();
            user.MfaEnabled = false; user.MfaSecret = ""; user.LastTotpStep = -1; user.MfaFailures = 0; user.LockedUntil = null; user.SecurityStamp = Guid.NewGuid();
            await db.RecoveryCodes.Where(x => x.UserId == id).ExecuteDeleteAsync();
            db.Audit(c, "Restablecer MFA con identidad verificada", "Usuario", id.ToString(), input.Reason); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok();
        }).RequireAuthorization("security.manage");
        app.MapPost("/api/security/users/{id:int}/review", async (int id, AdministrativeAction input, ClinicDb db, HttpContext c) =>
        {
            if (!Reason(input.Reason)) return ReasonError(); var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound(); if (!await AuthEndpoints.CanManageUser(user, db, c)) return Results.Forbid();
            user.AccessReviewedAt = DateTime.UtcNow; db.Audit(c, "Revisar acceso", "Usuario", id.ToString(), input.Reason); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("users.write");
        app.MapPost("/api/security/users/{id:int}/lifecycle", async (int id, LifecycleRequest input, ClinicDb db, HttpContext c) =>
        {
            if (!Reason(input.Reason)) return ReasonError(); var user = await db.Users.FindAsync(id); if (user == null) return Results.NotFound(); if (!await AuthEndpoints.CanManageUser(user, db, c)) return Results.Forbid();
            if (user.Version != input.Version) return Results.Conflict();
            if (id == c.User.UserId()) return Results.BadRequest(new { message = "No puedes cambiar tu propia vigencia ni dar de baja tu cuenta." });
            if (user.Roles.Split(',').Contains("Superadministrador") && (!input.Active || input.AccessExpiresAt != null) && (await db.Users.Where(x => x.Active && x.AccessExpiresAt == null).Select(x => x.Roles).ToListAsync()).Count(x => x.Split(',').Contains("Superadministrador")) <= 1) return Results.BadRequest(new { message = "Conserva al menos un superadministrador activo sin caducidad." });
            user.Active = input.Active; user.SharedWorkstation = input.SharedWorkstation; user.AccessExpiresAt = input.AccessExpiresAt?.ToUniversalTime(); user.SecurityStamp = Guid.NewGuid();
            db.Audit(c, "Actualizar vigencia laboral", "Usuario", id.ToString(), input.Reason); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("users.write");
        MapDrafts(app);
    }
    private static IResult BadFactor() => Results.Json(new { message = "Código o credenciales inválidos. Un código ya utilizado no se acepta nuevamente; espera al siguiente o usa un código de recuperación." }, statusCode: 400);
    private static bool Reason(string? value) => value != null && value.Trim().Length is >= 8 and <= 300 && !value.Any(char.IsControl);
    private static IResult ReasonError() => Results.BadRequest(new { message = "Indica un motivo de 8 a 300 caracteres, sin contraseñas ni información clínica." });
    private static string Fingerprint(ClaimsPrincipal user) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('|', user.Claims.Where(x => x.Type is "permission" or "audience" or "patient" or "doctor" or "company" or ClaimTypes.Role).OrderBy(x => x.Type).ThenBy(x => x.Value).Select(x => x.Type + ":" + x.Value)))));
    private static async Task<bool> DraftAllowed(string key, ClinicDb db, HttpContext c)
    {
        var parts = key.Split(':'); if (key.Length > 200 || parts.Length != 2) return false;
        var permission = parts[0] switch { "patients" => "patients.write", "appointments" => "appointments.write", "records" => "records.write", "payments" => "payments.write", _ => "" };
        if (!c.User.Can(permission)) return false;
        if (parts[1] == "new") return c.User.Internal() || (c.User.DoctorPortal() && parts[0] is "records" or "appointments");
        if (!int.TryParse(parts[1], out var id)) return false;
        return parts[0] switch { "patients" or "records" => await db.PatientsFor(c.User).AnyAsync(x => x.Id == id), "appointments" => await db.AppointmentsFor(c.User).AnyAsync(x => x.Id == id), "payments" => await db.PaymentsFor(c.User).AnyAsync(x => x.Id == id), _ => false };
    }
    private static void MapDrafts(WebApplication app)
    {
        app.MapGet("/api/auth/drafts/{key}", async (string key, ClinicDb db, IDataProtectionProvider protection, HttpContext c) =>
        {
            if (!await DraftAllowed(key, db, c)) return Results.Forbid();
            var draft = await db.SecureDrafts.SingleOrDefaultAsync(x => x.UserId == c.User.UserId() && x.DraftKey == key && x.AccessFingerprint == Fingerprint(c.User) && x.ExpiresAt > DateTime.UtcNow);
            if (draft == null) return Results.Ok(new { data = (object?)null });
            try {
                var data = JsonSerializer.Deserialize<JsonElement>(protection.CreateProtector("Clinica.Drafts.v1", c.User.UserId().ToString()).Unprotect(draft.Ciphertext));
                if (data.TryGetProperty("patientId", out var patient) && patient.ValueKind == JsonValueKind.Number && !await db.PatientsFor(c.User).AnyAsync(x => x.Id == patient.GetInt32())) return Results.Forbid();
                return Results.Ok(new { data, savedAt = SessionSecurity.Utc(draft.UpdatedAt) });
            }
            catch (CryptographicException) { return Results.Conflict(new { message = "El borrador no se puede descifrar. No se ha modificado el expediente." }); }
        }).RequireAuthorization();
        app.MapPut("/api/auth/drafts/{key}", async (string key, JsonElement input, ClinicDb db, IDataProtectionProvider protection, HttpContext c) =>
        {
            if (!await DraftAllowed(key, db, c)) return Results.Forbid(); var json = input.GetRawText();
            if (json.Length > 32000 || input.ValueKind != JsonValueKind.Object || input.EnumerateObject().Any(x => x.Name.Contains("password", StringComparison.OrdinalIgnoreCase) || x.Name.Contains("secret", StringComparison.OrdinalIgnoreCase) || x.Name.Contains("token", StringComparison.OrdinalIgnoreCase))) return Results.BadRequest();
            if (c.User.DoctorPortal() && (!input.TryGetProperty("patientId", out var patient) || patient.ValueKind != JsonValueKind.Number || !await db.PatientsFor(c.User).AnyAsync(x => x.Id == patient.GetInt32()))) return Results.Forbid();
            var draft = await db.SecureDrafts.SingleOrDefaultAsync(x => x.UserId == c.User.UserId() && x.DraftKey == key);
            if (draft == null) { draft = new() { UserId = c.User.UserId(), DraftKey = key }; db.SecureDrafts.Add(draft); }
            draft.Ciphertext = protection.CreateProtector("Clinica.Drafts.v1", c.User.UserId().ToString()).Protect(json); draft.AccessFingerprint = Fingerprint(c.User); draft.ExpiresAt = DateTime.UtcNow.AddHours(24); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization();
        app.MapDelete("/api/auth/drafts/{key}", async (string key, ClinicDb db, HttpContext c) => { if (!await DraftAllowed(key, db, c)) return Results.Forbid(); await db.SecureDrafts.Where(x => x.UserId == c.User.UserId() && x.DraftKey == key).ExecuteDeleteAsync(); return Results.Ok(); }).RequireAuthorization();
    }
}
