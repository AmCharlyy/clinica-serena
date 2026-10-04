using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
namespace Clinica;

public record LoginRequest(string Username, string Password);
public record PasswordRequest(string CurrentPassword, string NewPassword);
public record UserRequest(string Username, string Name, string Email, string Roles, bool Active, int? PatientId, int? DoctorId, int? CompanyId, string? Password, Guid? Version);
public record RoleRequest(string Name, string Description, string[] Permissions, Guid? Version, string? Audience = null);
public static class AuthEndpoints
{
    private static readonly string DummyPasswordHash = new PasswordHasher<User>().HashPassword(new(), Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
    public static void MapAuth(this WebApplication app)
    {
        app.MapGet("/api/auth/csrf", (HttpContext ctx, IAntiforgery csrf) => Results.Ok(new { token = csrf.GetAndStoreTokens(ctx).RequestToken }));
        app.MapGet("/api/auth/me", async (HttpContext ctx, ClinicDb db, SessionSecurity security) => Results.Ok(await security.View((await db.Users.FindAsync(ctx.User.UserId()))!, (await security.Current(ctx))!))).RequireAuthorization();
        app.MapPost("/api/auth/login", async (LoginRequest input, ClinicDb db, SessionSecurity security, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(input.Username) || input.Username.Length > 80 || string.IsNullOrEmpty(input.Password) || input.Password.Length > 128) return Results.BadRequest(new { message = "Verifica usuario y contraseña." });
            var username = input.Username.Trim().ToLowerInvariant();
            var user = await db.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null || !user.Active || user.AccessExpiresAt <= DateTime.UtcNow || user.LockedUntil > DateTime.UtcNow) { _ = new PasswordHasher<User>().VerifyHashedPassword(new(), DummyPasswordHash, input.Password); db.Audit(ctx, "Login", "Usuario", detail: username[..Math.Min(80, username.Length)], result: "Denegado"); await db.SaveChangesAsync(); return Results.Json(new { message = "No fue posible iniciar sesión. Verifica tus datos o espera unos minutos." }, statusCode: 401); }
            var hasher = new PasswordHasher<User>();
            if (hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.Failed) { user.FailedAttempts++; if (user.FailedAttempts >= 5) { user.LockedUntil = DateTime.UtcNow.AddMinutes(15); user.FailedAttempts = 0; } db.Audit(ctx, "Login", "Usuario", user.Id.ToString(), result: "Denegado"); await db.SaveChangesAsync(); return Results.Json(new { message = "No fue posible iniciar sesión. Verifica tus datos o espera unos minutos." }, statusCode: 401); }
            if ((await Access.Principal(user, db)).Audience() == "blocked") return Results.Forbid();
            user.FailedAttempts = 0; user.LockedUntil = null;
            if (hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, input.Password);
            var session = await security.Begin(user, ctx);
            db.AuditLogs.Add(new() { UserId = user.Id, Username = user.Username, Action = session.Stage == "full" ? "Login" : "Primer factor verificado", Entity = "Usuario", RecordId = user.Id.ToString(), Ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "" }); await db.SaveChangesAsync(); return Results.Ok(await security.View(user, session));
        }).RequireRateLimiting("login");
        app.MapPost("/api/auth/logout", async (HttpContext ctx, ClinicDb db, SessionSecurity security) => { var session = await security.Current(ctx); if (session != null) session.RevokedAt = DateTime.UtcNow; db.Audit(ctx, "Logout", "Usuario"); await db.SaveChangesAsync(); await ctx.SignOutAsync(); return Results.Ok(); }).RequireAuthorization();
        app.MapPost("/api/auth/password", async (PasswordRequest input, ClinicDb db, HttpContext ctx) =>
        {
            if (string.IsNullOrEmpty(input.CurrentPassword) || input.CurrentPassword.Length > 128) return Results.BadRequest(new { message = "Verifica la contraseña actual." });
            var user = await db.Users.FindAsync(ctx.User.UserId()); var hasher = new PasswordHasher<User>();
            if (user == null || hasher.VerifyHashedPassword(user, user.PasswordHash, input.CurrentPassword) == PasswordVerificationResult.Failed) return Results.BadRequest(new { message = "La contraseña actual no coincide." });
            if (!Strong(input.NewPassword) || input.CurrentPassword == input.NewPassword) return Results.BadRequest(new { message = "Usa una contraseña diferente, de 15 a 128 caracteres con mayúscula, minúscula y número." });
            user.PasswordHash = hasher.HashPassword(user, input.NewPassword); user.MustChangePassword = false; user.SecurityStamp = Guid.NewGuid(); db.Audit(ctx, "Cambiar contraseña", "Usuario", user.Id.ToString()); await db.SaveChangesAsync(); await ctx.SignOutAsync(); return Results.Ok(new { message = "Contraseña cambiada. Vuelve a iniciar sesión." });
        }).RequireAuthorization();
        app.MapGet("/api/users", async (ClinicDb db, HttpContext ctx) =>
        {
            var result = new List<object>(); foreach (var user in await db.Users.OrderBy(x => x.Name).ToListAsync()) result.Add(Access.PublicUser(user, await CanManageUser(user, db, ctx))); return Results.Ok(result);
        }).RequireAuthorization("users.read");
        app.MapPost("/api/users", async (UserRequest input, ClinicDb db, HttpContext ctx) =>
        {
            var error = await ValidateUser(input, db, ctx); if (error != null) return error;
            if (!Strong(input.Password ?? "")) return Results.BadRequest(new { message = "Contraseña inicial: 15 a 128 caracteres, mayúscula, minúscula y número." });
            if (await db.Users.AnyAsync(u => u.Username == input.Username.Trim().ToLower())) return Results.Conflict(new { message = "El nombre de usuario ya existe." });
            await using var tx = await db.Database.BeginTransactionAsync();
            var user = new User(); CopyUser(input, user); user.MustChangePassword = true; user.PasswordHash = new PasswordHasher<User>().HashPassword(user, input.Password!); db.Users.Add(user); await db.SaveChangesAsync(); db.Audit(ctx, "Crear", "Usuario", user.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(Access.PublicUser(user));
        }).RequireAuthorization("users.write");
        app.MapPut("/api/users/{id:int}", async (int id, UserRequest input, ClinicDb db, HttpContext ctx) =>
        {
            var u = await db.Users.FindAsync(id); if (u == null) return Results.NotFound(); if (input.Version != u.Version) return Results.Conflict(new { message = "El usuario cambió. Recarga antes de guardar." });
            if (!await CanManageUser(u, db, ctx)) return Results.Forbid();
            if (id == ctx.User.UserId() && !ctx.User.IsInRole("Superadministrador") && (u.Roles != input.Roles || u.PatientId != input.PatientId || u.DoctorId != input.DoctorId || u.CompanyId != input.CompanyId)) return Results.BadRequest(new { message = "No puedes modificar tus propios roles ni alcances." });
            var error = await ValidateUser(input, db, ctx); if (error != null) return error;
            if (u.Roles.Split(',').Contains("Superadministrador") && (!input.Active || !input.Roles.Split(',').Contains("Superadministrador")) && (await db.Users.Where(x => x.Active && x.AccessExpiresAt == null).Select(x => x.Roles).ToListAsync()).Count(r => r.Split(',').Contains("Superadministrador")) <= 1) return Results.BadRequest(new { message = "Debe permanecer al menos un superadministrador activo sin vencimiento." });
            if (id == ctx.User.UserId() && !input.Active) return Results.BadRequest(new { message = "No puedes desactivar tu propia cuenta." });
            if (await db.Users.AnyAsync(x => x.Id != id && x.Username == input.Username.Trim().ToLower())) return Results.Conflict(new { message = "El usuario ya existe." });
            CopyUser(input, u); u.SecurityStamp = Guid.NewGuid(); db.Audit(ctx, "Editar", "Usuario", id.ToString()); await db.SaveChangesAsync(); return Results.Ok(Access.PublicUser(u));
        }).RequireAuthorization("users.write");
        app.MapPost("/api/users/{id:int}/reset-password", async (int id, ResetPassword input, ClinicDb db, HttpContext ctx) =>
        {
            var u = await db.Users.FindAsync(id); if (u == null) return Results.NotFound();
            if (!await CanManageUser(u, db, ctx)) return Results.Forbid();
            if (!Strong(input.Password)) return Results.BadRequest(new { message = "La contraseña temporal no cumple los requisitos." });
            u.PasswordHash = new PasswordHasher<User>().HashPassword(u, input.Password); u.MustChangePassword = true; u.SecurityStamp = Guid.NewGuid(); u.LockedUntil = null; u.FailedAttempts = 0; db.Audit(ctx, "Restablecer contraseña", "Usuario", id.ToString()); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("users.write");
        app.MapGet("/api/roles", async (ClinicDb db) => Results.Ok(await db.Roles.OrderBy(x => x.Name).ToListAsync())).RequireAuthorization("roles.read");
        app.MapGet("/api/permissions", () => Results.Ok(Access.Permissions)).RequireAuthorization("roles.read");
        app.MapGet("/api/role-audiences", () => Results.Ok(Access.Audiences.ToDictionary(a => a, a => Access.Permissions.Where(p => Access.AllowedForAudience(a, p)).ToArray()))).RequireAuthorization("roles.read");
        app.MapPost("/api/roles", async (RoleRequest input, ClinicDb db, HttpContext ctx) =>
        {
            if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Length > 80) return Results.BadRequest(new { message = "El rol necesita un nombre de hasta 80 caracteres." });
            if (input.Permissions == null || input.Permissions.Except(Access.Permissions).Any() || !CanDelegate(input.Permissions, ctx)) return Results.Forbid();
            var audience = input.Audience ?? Access.DefaultAudience(input.Name);
            if (!Access.Audiences.Contains(audience) || input.Permissions.Any(p => !Access.AllowedForAudience(audience, p))) return Results.BadRequest(new { message = "Elige un tipo de acceso y permisos compatibles con su alcance." });
            if (await db.Roles.AnyAsync(r => r.Name == input.Name)) return Results.Conflict(new { message = "El nombre del rol ya existe." });
            await using var tx = await db.Database.BeginTransactionAsync();
            var r = new Role { Name = input.Name, Description = input.Description, Audience = audience, Permissions = string.Join(',', input.Permissions.Distinct()) }; db.Roles.Add(r); await db.SaveChangesAsync(); db.Audit(ctx, "Crear rol", "Rol", r.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(r);
        }).RequireAuthorization("roles.write");
        app.MapPut("/api/roles/{id:int}", async (int id, RoleRequest input, ClinicDb db, HttpContext ctx) =>
        {
            var role = await db.Roles.FindAsync(id); if (role == null) return Results.NotFound(); if (role.Name == "Superadministrador") return Results.BadRequest(new { message = "Los permisos del rol raíz se conservan completos." });
            if (input.Version != role.Version) return Results.Conflict(new { message = "El rol cambió. Recarga la página." });
            if (input.Permissions == null || input.Permissions.Except(Access.Permissions).Any() || !CanDelegate(role.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries), ctx) || !CanDelegate(input.Permissions, ctx)) return Results.Forbid();
            if ((input.Audience != null && input.Audience != role.Audience) || input.Permissions.Any(p => !Access.AllowedForAudience(role.Audience, p))) return Results.BadRequest(new { message = "El alcance del rol no se cambia. Crea otro rol si necesitas un tipo de acceso diferente." });
            role.Permissions = string.Join(',', input.Permissions.Distinct()); role.Description = input.Description; db.Audit(ctx, "Editar permisos", "Rol", id.ToString()); await db.SaveChangesAsync(); return Results.Ok(role);
        }).RequireAuthorization("roles.write");
    }
    public record ResetPassword(string Password);
    private static bool Strong(string? p) => p != null && p.Length >= 15 && p.Length <= 128 && p.Any(char.IsUpper) && p.Any(char.IsLower) && p.Any(char.IsDigit);
    // No account can grant permissions outside its own effective permission ceiling.
    private static bool CanDelegate(IEnumerable<string> permissions, HttpContext ctx)
    {
        var requested = permissions.Where(p => !string.IsNullOrEmpty(p)).Distinct().ToArray();
        return requested.All(ctx.User.Can);
    }
    public static async Task<bool> CanManageUser(User user, ClinicDb db, HttpContext ctx)
    {
        var names = user.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries);
        if (names.Contains("Superadministrador") && !ctx.User.IsInRole("Superadministrador")) return false;
        var roles = await db.Roles.Where(r => names.Contains(r.Name)).ToListAsync();
        return CanDelegate(roles.SelectMany(r => r.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries)), ctx);
    }
    private static void CopyUser(UserRequest i, User u) { u.Username = i.Username.Trim().ToLowerInvariant(); u.Name = i.Name.Trim(); u.Email = i.Email.Trim(); u.Roles = i.Roles; u.Active = i.Active; u.PatientId = i.PatientId; u.DoctorId = i.DoctorId; u.CompanyId = i.CompanyId; }
    private static async Task<IResult?> ValidateUser(UserRequest i, ClinicDb db, HttpContext ctx)
    {
        if (string.IsNullOrWhiteSpace(i.Username) || i.Username.Length < 3 || i.Username.Length > 80 || string.IsNullOrWhiteSpace(i.Name) || i.Name.Length < 2 || i.Name.Length > 180 || i.Email == null || i.Email.Length > 180 || string.IsNullOrWhiteSpace(i.Roles)) return Results.BadRequest(new { message = "Verifica usuario, nombre y correo." });
        var names = i.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries); var roles = await db.Roles.Where(r => names.Contains(r.Name)).ToListAsync();
        if (roles.Count != names.Length || roles.Count == 0) return Results.BadRequest(new { message = "Selecciona roles válidos." });
        if (names.Contains("Superadministrador") && !ctx.User.IsInRole("Superadministrador")) return Results.Forbid();
        if (!CanDelegate(roles.SelectMany(r => r.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries)), ctx)) return Results.Forbid();
        // Portal scopes cannot be combined with internal or other portal roles.
        var audiences = roles.Select(r => r.Audience).Distinct().ToArray();
        if (audiences.Length != 1 || (audiences[0] != "internal" && names.Length != 1)) return Results.BadRequest(new { message = "No mezcles tipos de acceso. Los roles de alcance propio se asignan individualmente." });
        var audience = audiences[0];
        if (audience == "patient" && (i.PatientId == null || !await db.Patients.AnyAsync(p => p.Id == i.PatientId && p.Active))) return Results.BadRequest(new { message = "Asocia la cuenta con un paciente activo." });
        if (audience == "doctor" && (i.DoctorId == null || !await db.Staff.AnyAsync(p => p.Id == i.DoctorId && p.Kind == "Médico" && p.Active))) return Results.BadRequest(new { message = "Asocia la cuenta con un médico activo." });
        if (audience == "company" && (i.CompanyId == null || !await db.Companies.AnyAsync(p => p.Id == i.CompanyId && p.Active))) return Results.BadRequest(new { message = "Asocia la cuenta con una empresa activa." });
        if ((audience != "patient" && i.PatientId != null) || (audience != "doctor" && i.DoctorId != null) || (audience != "company" && i.CompanyId != null)) return Results.BadRequest(new { message = "La asociación no corresponde al tipo de acceso del rol." });
        return null;
    }
}
