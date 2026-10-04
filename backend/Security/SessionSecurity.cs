using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using OtpNet;
namespace Clinica;

public sealed class SessionSecurity(ClinicDb db, IDataProtectionProvider protection)
{
    private readonly IDataProtector secrets = protection.CreateProtector("Clinica.Totp.v1");
    public static DateTime Utc(DateTime date) => DateTime.SpecifyKind(date, DateTimeKind.Utc);
    public static bool RequiresMfa(ClaimsPrincipal user) => user.Audience() != "patient";
    public static int IdleMinutes(ClaimsPrincipal user) => user.FindFirstValue("sharedWorkstation") == "True" || user.Can("users.write") || user.Can("roles.write") || user.Can("settings.write") || user.Can("appointments.checkin") ? 5 : 15;
    public static bool Fresh(AuthSession session) => session.ReauthenticatedAt is {} at && Utc(at).AddMinutes(3) > DateTime.UtcNow;
    public async Task<AuthSession?> Current(HttpContext context) => Guid.TryParse(context.User.FindFirstValue("sid"), out var id) ? await db.AuthSessions.SingleOrDefaultAsync(x => x.SessionId == id && x.UserId == context.User.UserId()) : null;
    public async Task<ClaimsPrincipal> Principal(User user, AuthSession session)
    {
        var full = await Access.Principal(user, db);
        var claims = session.Stage == "full" ? full.Claims.ToList() : full.Claims.Where(c => c.Type != "permission" && c.Type != ClaimTypes.Role).ToList();
        claims.Add(new("sid", session.SessionId.ToString())); claims.Add(new("stage", session.Stage));
        return new(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }
    public async Task<object> View(User user, AuthSession session)
    {
        var principal = await Principal(user, session);
        return new { user.Id, user.Name, user.Username, audience = principal.Audience(), roles = principal.FindAll(ClaimTypes.Role).Select(c => c.Value), permissions = principal.FindAll("permission").Select(c => c.Value), user.PatientId, user.DoctorId, user.CompanyId, user.MustChangePassword, authStage = session.Stage, user.MfaEnabled, mfaRequired = RequiresMfa(principal), sessionId = session.SessionId, serverNow = DateTime.UtcNow, idleExpiresAt = Utc(session.LastActivityAt).AddMinutes(session.Stage == "full" ? IdleMinutes(principal) : 10), absoluteExpiresAt = Utc(session.AbsoluteExpiresAt) };
    }
    public async Task<AuthSession> Begin(User user, HttpContext context)
    {
        var principal = await Access.Principal(user, db);
        var session = new AuthSession { UserId = user.Id, Stage = user.MfaEnabled ? "mfa" : user.MustChangePassword ? "password" : RequiresMfa(principal) ? "enrollment" : "full", AbsoluteExpiresAt = DateTime.UtcNow.AddMinutes(10), Ip = context.Connection.RemoteIpAddress?.ToString() ?? "", UserAgent = context.Request.Headers.UserAgent.ToString()[..Math.Min(300, context.Request.Headers.UserAgent.ToString().Length)] };
        if (session.Stage == "full") { session.AbsoluteExpiresAt = DateTime.UtcNow.AddHours(8); user.LastAccess = DateTime.UtcNow; }
        db.AuthSessions.Add(session); await db.SaveChangesAsync(); await SignIn(context, user, session); return session;
    }
    public async Task SignIn(HttpContext context, User user, AuthSession session) => await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, await Principal(user, session), new AuthenticationProperties { IsPersistent = false, ExpiresUtc = Utc(session.AbsoluteExpiresAt) });
    public async Task Validate(CookieValidatePrincipalContext context)
    {
        if (!int.TryParse(context.Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var uid) || !Guid.TryParse(context.Principal?.FindFirstValue("sid"), out var sid)) { context.RejectPrincipal(); return; }
        var user = await db.Users.FindAsync(uid); var session = await db.AuthSessions.SingleOrDefaultAsync(x => x.SessionId == sid && x.UserId == uid);
        if (user == null || session == null || !user.Active || user.AccessExpiresAt <= DateTime.UtcNow || session.RevokedAt != null || user.SecurityStamp.ToString() != context.Principal!.FindFirstValue("stamp")) { context.RejectPrincipal(); return; }
        var principal = await Access.Principal(user, db);
        if (principal.Audience() == "blocked" || session.AbsoluteExpiresAt <= DateTime.UtcNow || Utc(session.LastActivityAt).AddMinutes(session.Stage == "full" ? IdleMinutes(principal) : 10) <= DateTime.UtcNow || (session.Stage == "full" && (user.MustChangePassword || (RequiresMfa(principal) && !user.MfaEnabled))))
        {
            context.RejectPrincipal();
            var now = DateTime.UtcNow; var idleCutoff = now.AddMinutes(-(session.Stage == "full" ? IdleMinutes(principal) : 10));
            var invalidRequirements = principal.Audience() == "blocked" || (session.Stage == "full" && (user.MustChangePassword || (RequiresMfa(principal) && !user.MfaEnabled)));
            // Multiple requests may notice expiry together. Revoke atomically and audit only the winner.
            await using var transaction = await db.Database.BeginTransactionAsync();
            var revoked = await db.AuthSessions.Where(x => x.SessionId == sid && x.UserId == uid && x.RevokedAt == null && (x.AbsoluteExpiresAt <= now || x.LastActivityAt <= idleCutoff || invalidRequirements))
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.UpdatedAt, now).SetProperty(x => x.Version, Guid.NewGuid()));
            if (revoked == 1)
            {
                db.AuditLogs.Add(new() { UserId = uid, Username = user.Username, Action = "Sesión finalizada", Entity = "Sesión", RecordId = sid.ToString(), Detail = "Límite de sesión o requisitos de acceso" });
                await db.SaveChangesAsync();
            }
            await transaction.CommitAsync(); return;
        }
        context.ReplacePrincipal(await Principal(user, session));
    }
    public async Task Complete(User user, AuthSession session, HttpContext context)
    {
        session.Stage = user.MustChangePassword ? "password" : "full"; session.LastActivityAt = DateTime.UtcNow;
        session.EnrollmentSecret = ""; session.AbsoluteExpiresAt = DateTime.UtcNow.AddMinutes(session.Stage == "full" ? 480 : 10);
        if (session.Stage == "full") user.LastAccess = DateTime.UtcNow;
        db.Audit(context, "Autenticación completada", "Sesión", session.SessionId.ToString()); await db.SaveChangesAsync(); await SignIn(context, user, session);
    }
    public string Protect(string secret) => secrets.Protect(secret);
    public string Unprotect(string encrypted) => secrets.Unprotect(encrypted);
    public static string CodeHash(int userId, string code) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{userId}:{code.Replace("-", "").Replace(" ", "").ToUpperInvariant()}")));
    public async Task<bool> Consume(User user, string? code, HttpContext context, string? enrollment = null)
    {
        if (user.LockedUntil > DateTime.UtcNow || string.IsNullOrWhiteSpace(code) || code.Length > 80) return false;
        var valid = false;
        if (code.Length == 6 && code.All(char.IsAsciiDigit))
        {
            try
            {
                var secret = Unprotect(enrollment ?? user.MfaSecret);
                var totp = new Totp(Base32Encoding.ToBytes(secret));
                if (totp.VerifyTotp(DateTime.UtcNow, code, out var step, VerificationWindow.RfcSpecifiedNetworkDelay))
                {
                    // Atomic replay protection across concurrent requests and application instances.
                    valid = await db.Users.Where(x => x.Id == user.Id && x.SecurityStamp == user.SecurityStamp && x.LastTotpStep < step && x.MfaSecret == user.MfaSecret && x.MfaEnabled == user.MfaEnabled).ExecuteUpdateAsync(s => s.SetProperty(x => x.LastTotpStep, step)) == 1;
                    if (valid) { user.LastTotpStep = step; db.Entry(user).Property(x => x.LastTotpStep).OriginalValue = step; }
                }
            }
            catch (CryptographicException) { valid = false; }
        }
        else if (enrollment == null && user.MfaEnabled)
        {
            var hash = CodeHash(user.Id, code);
            valid = await db.RecoveryCodes.Where(x => x.UserId == user.Id && x.Hash == hash && x.UsedAt == null).ExecuteUpdateAsync(s => s.SetProperty(x => x.UsedAt, DateTime.UtcNow)) == 1;
        }
        if (valid) { user.MfaFailures = 0; user.LockedUntil = null; }
        else { user.MfaFailures++; if (user.MfaFailures >= 5) { user.LockedUntil = DateTime.UtcNow.AddMinutes(15); user.MfaFailures = 0; } }
        db.Audit(context, enrollment == null ? "Verificar segundo factor" : "Confirmar autenticador", "Usuario", user.Id.ToString(), result: valid ? "Correcto" : "Denegado");
        await db.SaveChangesAsync(); return valid;
    }
    public async Task<string[]> NewRecoveryCodes(User user)
    {
        await db.RecoveryCodes.Where(x => x.UserId == user.Id).ExecuteDeleteAsync();
        var codes = Enumerable.Range(0, 10).Select(_ => Convert.ToHexString(RandomNumberGenerator.GetBytes(16))).Select(x => string.Join('-', Enumerable.Range(0, 4).Select(i => x.Substring(i * 8, 8)))).ToArray();
        db.RecoveryCodes.AddRange(codes.Select(code => new RecoveryCode { UserId = user.Id, Hash = CodeHash(user.Id, code) })); await db.SaveChangesAsync(); return codes;
    }
    public static bool Sensitive(HttpContext context)
    {
        var path = (context.Request.Path.Value ?? "").TrimEnd('/').ToLowerInvariant(); var write = context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE";
        return (write && (path.StartsWith("/api/users") || path.StartsWith("/api/roles") || path.StartsWith("/api/exports/") || path == "/api/settings" || path == "/api/backups" || path.StartsWith("/api/security") || path.StartsWith("/api/auth/mfa/")))
            || (context.Request.Method is "GET" or "HEAD" && ((path.StartsWith("/api/backups/") && path.EndsWith("/download")) || (path == "/api/reports" && bool.TryParse(context.Request.Query["export"], out var exporting) && exporting)))
            || (write && path == "/api/auth/password");
    }
}
