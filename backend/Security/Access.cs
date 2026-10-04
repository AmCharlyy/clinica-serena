using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public static class Access
{
    public static readonly string[] Permissions = ["patients.read", "patients.write", "staff.read", "staff.write", "infrastructure.read", "infrastructure.write", "appointments.read", "appointments.write", "appointments.confirm", "appointments.checkin", "appointments.notes.read", "appointments.notes.write", "records.read", "records.write", "documents.read", "documents.write", "documents.publish", "services.read", "services.write", "catalog.read", "payments.read", "payments.write", "companies.read", "companies.write", "users.read", "users.write", "roles.read", "roles.write", "reports.read", "reports.export", "audit.read", "settings.read", "settings.write", "system.read", "backups.read", "backups.write", "backups.download", "sessions.read", "sessions.revoke", "security.manage"];
    public static readonly string[] Audiences = ["internal", "doctor", "patient", "company"];
    public static string DefaultAudience(string name) => name switch { "Paciente" => "patient", "Empresa" => "company", "Médico" => "doctor", _ => "internal" };
    public static bool AllowedForAudience(string audience, string permission) => audience switch
    {
        "internal" => true,
        "patient" => new[] { "patients.read", "appointments.read", "appointments.write", "documents.read", "catalog.read" }.Contains(permission),
        "company" => new[] { "patients.read", "appointments.read", "payments.read", "companies.read", "reports.read", "reports.export", "documents.read" }.Contains(permission),
        "doctor" => new[] { "patients.read", "appointments.read", "appointments.write", "appointments.notes.read", "appointments.notes.write", "records.read", "records.write", "documents.read", "documents.write", "documents.publish", "catalog.read", "services.read", "staff.read", "infrastructure.read" }.Contains(permission),
        _ => false
    };
    public static int UserId(this ClaimsPrincipal u) => int.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static int? Scope(this ClaimsPrincipal u, string kind) => int.TryParse(u.FindFirstValue(kind), out var id) ? id : null;
    public static bool Can(this ClaimsPrincipal u, string permission) => u.HasClaim("permission", permission);
    public static string Audience(this ClaimsPrincipal u) => u.FindFirstValue("audience") ?? "blocked";
    public static bool PatientPortal(this ClaimsPrincipal u) => u.Audience() == "patient";
    public static bool CompanyPortal(this ClaimsPrincipal u) => u.Audience() == "company";
    public static bool DoctorPortal(this ClaimsPrincipal u) => u.Audience() == "doctor";
    public static bool Internal(this ClaimsPrincipal u) => u.Audience() == "internal";
    public static async Task<ClaimsPrincipal> Principal(User user, ClinicDb db)
    {
        var names = user.Roles.Split(',', StringSplitOptions.RemoveEmptyEntries);
        var roles = await db.Roles.Where(r => names.Contains(r.Name)).ToListAsync();
        var audiences = roles.Select(r => r.Audience).Distinct().ToArray();
        var audience = roles.Count == names.Distinct().Count() && audiences.Length == 1 ? audiences[0] : "blocked";
        if (audience != "internal" && names.Length != 1) audience = "blocked";
        if ((audience == "patient" && (user.PatientId == null || user.DoctorId != null || user.CompanyId != null)) ||
            (audience == "doctor" && (user.DoctorId == null || user.PatientId != null || user.CompanyId != null)) ||
            (audience == "company" && (user.CompanyId == null || user.PatientId != null || user.DoctorId != null)) ||
            (audience == "internal" && (user.PatientId != null || user.DoctorId != null || user.CompanyId != null))) audience = "blocked";
        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, user.Id.ToString()), new(ClaimTypes.Name, user.Name), new("username", user.Username), new("stamp", user.SecurityStamp.ToString()), new("changePassword", user.MustChangePassword.ToString()) };
        claims.AddRange(names.Select(n => new Claim(ClaimTypes.Role, n)));
        claims.Add(new("audience", audience));
        claims.Add(new("sharedWorkstation", user.SharedWorkstation.ToString()));
        claims.AddRange(roles.SelectMany(r => r.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries)).Distinct().Where(p => AllowedForAudience(audience, p)).Select(p => new Claim("permission", p)));
        if (user.PatientId != null) claims.Add(new("patient", user.PatientId.ToString()!));
        if (user.DoctorId != null) claims.Add(new("doctor", user.DoctorId.ToString()!));
        if (user.CompanyId != null) claims.Add(new("company", user.CompanyId.ToString()!));
        return new(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }
    public static IQueryable<Patient> PatientsFor(this ClinicDb db, ClaimsPrincipal u)
    {
        var q = db.Patients.AsQueryable();
        if (u.PatientPortal()) return q.Where(p => p.Id == u.Scope("patient"));
        if (u.CompanyPortal()) return q.Where(p => p.CompanyId == u.Scope("company"));
        if (u.DoctorPortal()) return q.Where(p => db.Appointments.Any(a => a.PatientId == p.Id && a.DoctorId == u.Scope("doctor") && a.Status != "Cancelada" && a.Status != "Rechazada"));
        return u.Internal() ? q : q.Where(p => false);
    }
    public static IQueryable<Appointment> AppointmentsFor(this ClinicDb db, ClaimsPrincipal u)
    {
        var q = db.Appointments.AsQueryable();
        if (u.PatientPortal()) return q.Where(a => a.PatientId == u.Scope("patient"));
        if (u.CompanyPortal()) return q.Where(a => a.CompanyId == u.Scope("company"));
        if (u.DoctorPortal()) return q.Where(a => a.DoctorId == u.Scope("doctor"));
        return u.Internal() ? q : q.Where(a => false);
    }
    public static IQueryable<Payment> PaymentsFor(this ClinicDb db, ClaimsPrincipal u)
    {
        if (u.CompanyPortal()) return db.Payments.Where(p => p.CompanyId == u.Scope("company"));
        var patients = db.PatientsFor(u).Select(p => p.Id);
        return db.Payments.Where(p => patients.Contains(p.PatientId));
    }
    public static bool FullPatient(this ClaimsPrincipal u) => u.PatientPortal() || u.DoctorPortal() || u.Can("patients.write") || u.Can("records.read");
    public static async Task<bool> SeesPatient(ClinicDb db, ClaimsPrincipal u, int id) => await db.PatientsFor(u).AnyAsync(p => p.Id == id);
    public static IResult? Validate(object entity)
    {
        var errors = new List<ValidationResult>();
        if (Validator.TryValidateObject(entity, new ValidationContext(entity), errors, true)) return null;
        return Results.BadRequest(new { message = string.Join(" ", errors.Select(e => e.ErrorMessage)) });
    }
    public static void Audit(this ClinicDb db, HttpContext ctx, string action, string entity, string id = "", string detail = "", string result = "Correcto") => db.AuditLogs.Add(new() { UserId = ctx.User.Identity?.IsAuthenticated == true ? ctx.User.UserId() : null, Username = ctx.User.FindFirstValue("username") ?? "anónimo", Action = action, Entity = entity, RecordId = id, Detail = detail, Result = result, Ip = ctx.Connection.RemoteIpAddress?.ToString() ?? "" });
    public static object PublicUser(User u, bool manageable = true) => new { u.Id, u.Name, u.Username, u.Email, u.Roles, u.Active, u.PatientId, u.DoctorId, u.CompanyId, u.LastAccess, u.MustChangePassword, u.Version, u.MfaEnabled, u.AccessExpiresAt, u.AccessReviewedAt, u.SharedWorkstation, manageable, reviewDue = u.AccessReviewedAt == null || u.AccessReviewedAt < DateTime.UtcNow.AddDays(-90) };
    public static object Session(ClaimsPrincipal u) => new { id = u.UserId(), name = u.Identity!.Name, username = u.FindFirstValue("username"), audience = u.Audience(), roles = u.FindAll(ClaimTypes.Role).Select(c => c.Value), permissions = u.FindAll("permission").Select(c => c.Value), patientId = u.Scope("patient"), doctorId = u.Scope("doctor"), companyId = u.Scope("company"), mustChangePassword = u.FindFirstValue("changePassword") == "True" };
    public static DateTime LocalNow() => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City"));
    public static async Task NotifyPatient(ClinicDb db, int patientId, string title, string message)
    {
        foreach (var user in await db.Users.Where(u => u.Active && u.PatientId == patientId).ToListAsync()) db.Notifications.Add(new() { UserId = user.Id, Title = title, Message = message });
    }
}
