using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
namespace Clinica;

public abstract class Entity
{
    public int Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public Guid Version { get; set; } = Guid.NewGuid();
}
public class User : Entity
{
    [MaxLength(80)] public string Username { get; set; } = "";
    [MaxLength(180)] public string Name { get; set; } = "";
    [MaxLength(180)] public string Email { get; set; } = "";
    [JsonIgnore] public string PasswordHash { get; set; } = "";
    public string Roles { get; set; } = "";
    public bool Active { get; set; } = true;
    public bool MustChangePassword { get; set; }
    public int FailedAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime? LastAccess { get; set; }
    public int? PatientId { get; set; }
    public int? DoctorId { get; set; }
    public int? CompanyId { get; set; }
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
    public bool MfaEnabled { get; set; }
    [JsonIgnore] public string MfaSecret { get; set; } = "";
    [JsonIgnore] public long LastTotpStep { get; set; } = -1;
    public int MfaFailures { get; set; }
    public DateTime? AccessExpiresAt { get; set; }
    public DateTime? AccessReviewedAt { get; set; }
    public bool SharedWorkstation { get; set; }
}
public class AuthSession : Entity
{
    public Guid SessionId { get; set; } = Guid.NewGuid();
    public int UserId { get; set; }
    [MaxLength(20)] public string Stage { get; set; } = "enrollment";
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    public DateTime AbsoluteExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime? ReauthenticatedAt { get; set; }
    [MaxLength(100)] public string Ip { get; set; } = "";
    [MaxLength(300)] public string UserAgent { get; set; } = "";
    [JsonIgnore] public string EnrollmentSecret { get; set; } = "";
    public DateTime? EnrollmentExpiresAt { get; set; }
}
public class RecoveryCode : Entity
{
    public int UserId { get; set; }
    [MaxLength(64), JsonIgnore] public string Hash { get; set; } = "";
    public DateTime? UsedAt { get; set; }
}
public class SecureDraft : Entity
{
    public int UserId { get; set; }
    [MaxLength(200)] public string DraftKey { get; set; } = "";
    [MaxLength(64)] public string AccessFingerprint { get; set; } = "";
    [JsonIgnore] public string Ciphertext { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
}
public class Role : Entity
{
    [MaxLength(80)] public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Permissions { get; set; } = "";
    [MaxLength(20)] public string Audience { get; set; } = "internal";
    public int PolicyVersion { get; set; } = 1;
}
public class Patient : Entity
{
    [Required, MaxLength(180)] public string Name { get; set; } = "";
    [Required, MaxLength(18), RegularExpression("^[A-Z0-9]{18}$")] public string Curp { get; set; } = "";
    public DateOnly BirthDate { get; set; }
    [MaxLength(30)] public string Sex { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(180)] public string Email { get; set; } = "";
    [MaxLength(300)] public string Address { get; set; } = "";
    [MaxLength(180)] public string EmergencyContact { get; set; } = "";
    public int? CompanyId { get; set; }
    public bool Active { get; set; } = true;
    public string Folio => $"PAC-{Id:00000}";
}
public class Staff : Entity
{
    [Required, MaxLength(180)] public string Name { get; set; } = "";
    [Required, MaxLength(30)] public string Kind { get; set; } = "Médico";
    [MaxLength(100)] public string Specialty { get; set; } = "Medicina general";
    [MaxLength(40)] public string License { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(180)] public string Email { get; set; } = "";
    public TimeOnly StartsAt { get; set; } = new(8, 0);
    public TimeOnly EndsAt { get; set; } = new(17, 0);
    [MaxLength(30)] public string WorkingDays { get; set; } = "1,2,3,4,5";
    public bool Active { get; set; } = true;
}
public class Facility : Entity
{
    [Required, MaxLength(100)] public string Name { get; set; } = "";
    [MaxLength(30)] public string Kind { get; set; } = "Consultorio";
    [MaxLength(80)] public string Location { get; set; } = "Planta baja";
    [MaxLength(30)] public string Status { get; set; } = "Disponible";
    public bool Active { get; set; } = true;
}
public class Service : Entity
{
    [Required, MaxLength(160)] public string Name { get; set; } = "";
    [MaxLength(80)] public string Specialty { get; set; } = "Medicina general";
    [Range(5, 480)] public int DurationMinutes { get; set; } = 30;
    [Range(0, 1000000)] public decimal Price { get; set; }
    public bool Active { get; set; } = true;
}
public class Company : Entity
{
    [Required, MaxLength(180)] public string Name { get; set; } = "";
    [MaxLength(13)] public string Rfc { get; set; } = "";
    [MaxLength(180)] public string Contact { get; set; } = "";
    [MaxLength(180)] public string Email { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    public DateOnly? ValidUntil { get; set; }
    [MaxLength(2000)] public string Agreement { get; set; } = "";
    public bool Active { get; set; } = true;
}
public class Appointment : Entity
{
    public int PatientId { get; set; }
    public int DoctorId { get; set; }
    public int FacilityId { get; set; }
    public int ServiceId { get; set; }
    public int? CompanyId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly Time { get; set; }
    public int DurationMinutes { get; set; }
    [MaxLength(30)] public string Status { get; set; } = "Pendiente";
    [MaxLength(1000)] public string Reason { get; set; } = "";
    [MaxLength(2000)] public string Notes { get; set; } = "";
    [MaxLength(2000)] public string Instructions { get; set; } = "";
    public DateTime? CheckedInAt { get; set; }
    public Patient Patient { get; set; } = null!;
    public Staff Doctor { get; set; } = null!;
    public Facility Facility { get; set; } = null!;
    public Service Service { get; set; } = null!;
}
public class AppointmentChange : Entity
{
    public int AppointmentId { get; set; }
    public int UserId { get; set; }
    public string Action { get; set; } = "";
    public string Detail { get; set; } = "";
}
public class ClinicalNote : Entity
{
    public int PatientId { get; set; }
    public int DoctorId { get; set; }
    public int? AppointmentId { get; set; }
    public int AuthorId { get; set; }
    [MaxLength(4000)] public string History { get; set; } = "";
    [MaxLength(2000)] public string Allergies { get; set; } = "";
    [Required, MaxLength(8000)] public string Content { get; set; } = "";
    [MaxLength(4000)] public string Diagnosis { get; set; } = "";
    [MaxLength(4000)] public string Treatment { get; set; } = "";
    public DateTime? SignedAt { get; set; }
    public Patient Patient { get; set; } = null!;
    public Staff Doctor { get; set; } = null!;
}
public class Document : Entity
{
    public int PatientId { get; set; }
    public int? CompanyId { get; set; }
    public int UploadedBy { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "Estudio";
    public string StoredName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string Hash { get; set; } = "";
    public long Size { get; set; }
    public bool Released { get; set; }
    public Patient Patient { get; set; } = null!;
}
public class Payment : Entity
{
    public int PatientId { get; set; }
    public int? CompanyId { get; set; }
    public int? AppointmentId { get; set; }
    public int RecordedBy { get; set; }
    [Required, MaxLength(240)] public string Concept { get; set; } = "";
    [Range(0.01, 1000000)] public decimal Amount { get; set; }
    [MaxLength(30)] public string Method { get; set; } = "Efectivo";
    [MaxLength(30)] public string Status { get; set; } = "Pagado";
    public Patient Patient { get; set; } = null!;
    public string Folio => $"PAG-{Id:00000}";
}
public class Invoice : Entity
{
    public int PaymentId { get; set; }
    public int IssuedBy { get; set; }
    public Payment Payment { get; set; } = null!;
    public string Folio => $"COMP-{Id:00000}";
}
public class Notification : Entity
{
    public int UserId { get; set; }
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public bool Read { get; set; }
}
public class AuditLog : Entity
{
    [JsonIgnore] public string Seal { get; set; } = "";
    public int? UserId { get; set; }
    public string Username { get; set; } = "";
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public string RecordId { get; set; } = "";
    public string Ip { get; set; } = "";
    public string Result { get; set; } = "Correcto";
    public string Detail { get; set; } = "";
}
public class ClinicSettings : Entity
{
    [Required, MaxLength(180)] public string Name { get; set; } = "Clínica Serena";
    [MaxLength(300)] public string Address { get; set; } = "";
    [MaxLength(30)] public string Phone { get; set; } = "";
    [MaxLength(180)] public string Email { get; set; } = "";
    public int CancellationHours { get; set; } = 24;
    public int OpeningHour { get; set; } = 8;
    public int ClosingHour { get; set; } = 19;
    public string TimeZone { get; set; } = "America/Mexico_City";
}
public class Backup : Entity
{
    public int RequestedBy { get; set; }
    public string Name { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Status { get; set; } = "";
    public long Size { get; set; }
    public string Detail { get; set; } = "";
}
