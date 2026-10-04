using System.Data;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public record AppointmentRequest(int PatientId, int DoctorId, int FacilityId, int ServiceId, DateOnly Date, TimeOnly Time, string Reason, string? Notes, Guid? Version, string? Instructions = null, int? CompanyId = null);
public record StatusRequest(string Status, string Reason, Guid Version);
public record NoteRequest(int PatientId, int DoctorId, int? AppointmentId, string History, string Allergies, string Content, string Diagnosis, string Treatment);
public static class ClinicalEndpoints
{
    public static readonly string[] Terminal = ["Finalizada", "Cancelada", "Rechazada"];
    public static object AppointmentView(Appointment a, ClaimsPrincipal u)
    {
        var result = new Dictionary<string, object?> { ["id"] = a.Id, ["patientId"] = a.PatientId, ["doctorId"] = a.DoctorId, ["serviceId"] = a.ServiceId, ["date"] = a.Date, ["time"] = a.Time, ["durationMinutes"] = a.DurationMinutes, ["status"] = a.Status, ["patientName"] = a.Patient.Name, ["doctorName"] = a.Doctor.Name, ["serviceName"] = a.Service.Name };
        if (!u.CompanyPortal()) { result["facilityId"] = a.FacilityId; result["facilityName"] = a.Facility.Name; result["reason"] = a.Reason; result["instructions"] = a.Instructions; result["version"] = a.Version; result["checkedInAt"] = a.CheckedInAt; }
        if (u.Can("appointments.notes.read")) result["notes"] = a.Notes;
        if (u.Internal()) result["companyId"] = a.CompanyId;
        return result;
    }
    public static object PatientView(Patient p, ClaimsPrincipal u) => u.FullPatient() ? p : new { p.Id, p.Name, p.Active, p.CompanyId, p.Folio };
    public static void MapClinical(this WebApplication app)
    {
        app.MapGet("/api/patients", async (ClinicDb db, HttpContext c) =>
        {
            db.Audit(c, "Consultar directorio", "Paciente"); await db.SaveChangesAsync();
            return Results.Ok((await db.PatientsFor(c.User).OrderBy(x => x.Name).ToListAsync()).Select(p => PatientView(p, c.User)));
        }).RequireAuthorization("patients.read");
        app.MapGet("/api/patients/{id:int}", async (int id, ClinicDb db, HttpContext c) =>
        {
            var p = await db.PatientsFor(c.User).FirstOrDefaultAsync(x => x.Id == id); if (p == null) return Results.NotFound(); db.Audit(c, "Consultar perfil", "Paciente", id.ToString()); await db.SaveChangesAsync(); return Results.Ok(PatientView(p, c.User));
        }).RequireAuthorization("patients.read");
        app.MapPost("/api/patients", async (Patient p, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal() || c.User.DoctorPortal()) return Results.Forbid();
            var error = await ValidatePatient(p, db); if (error != null) return error;
            await using var tx = await db.Database.BeginTransactionAsync();
            p.Id = 0; p.CreatedAt = DateTime.UtcNow; p.UpdatedAt = DateTime.UtcNow; p.Version = Guid.NewGuid(); db.Patients.Add(p); await db.SaveChangesAsync();
            db.Audit(c, "Crear", "Paciente", p.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(p);
        }).RequireAuthorization("patients.write");
        app.MapPut("/api/patients/{id:int}", async (int id, Patient input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal() || c.User.DoctorPortal()) return Results.Forbid();
            var p = await db.Patients.FindAsync(id); if (p == null) return Results.NotFound(); if (input.Version != p.Version) return Results.Conflict(new { message = "Este paciente fue actualizado. Recarga sus datos." });
            input.Id = id; var error = await ValidatePatient(input, db); if (error != null) return error;
            p.Name = input.Name; p.Curp = input.Curp; p.BirthDate = input.BirthDate; p.Sex = input.Sex; p.Phone = input.Phone; p.Email = input.Email; p.Address = input.Address; p.EmergencyContact = input.EmergencyContact; p.CompanyId = input.CompanyId; p.Active = input.Active;
            db.Audit(c, "Editar", "Paciente", id.ToString()); await db.SaveChangesAsync(); return Results.Ok(p);
        }).RequireAuthorization("patients.write");
        app.MapGet("/api/appointments", async (ClinicDb db, HttpContext c) => Results.Ok((await db.AppointmentsFor(c.User).Include(a => a.Patient).Include(a => a.Doctor).Include(a => a.Facility).Include(a => a.Service).OrderByDescending(a => a.Date).ThenBy(a => a.Time).ToListAsync()).Select(a => AppointmentView(a, c.User)))).RequireAuthorization("appointments.read");
        app.MapGet("/api/appointments/availability", async (int doctorId, int serviceId, DateOnly date, int? excludeId, ClinicDb db, HttpContext c) =>
        {
            if (!c.User.Can("appointments.write") || c.User.CompanyPortal()) return Results.Forbid();
            if (excludeId != null && !await db.AppointmentsFor(c.User).AnyAsync(a => a.Id == excludeId)) return Results.NotFound();
            if (c.User.DoctorPortal() && doctorId != c.User.Scope("doctor")) return Results.Forbid();
            var doctor = await db.Staff.FirstOrDefaultAsync(s => s.Id == doctorId && s.Active && s.Kind == "Médico"); var service = await db.Services.FirstOrDefaultAsync(s => s.Id == serviceId && s.Active); var settings = await db.Settings.FirstAsync();
            if (doctor == null || service == null || date < DateOnly.FromDateTime(Access.LocalNow()) || date > DateOnly.FromDateTime(Access.LocalNow()).AddDays(180)) return Results.BadRequest(new { message = "Selecciona un médico, servicio y fecha dentro de los próximos seis meses." });
            if (!doctor.WorkingDays.Split(',').Contains(((int)date.DayOfWeek).ToString())) return Results.Ok(Array.Empty<string>());
            var facilities = await db.Facilities.Where(f => f.Active && f.Kind == "Consultorio" && f.Status == "Disponible").Select(f => f.Id).ToListAsync();
            var appointments = await db.Appointments.Where(a => a.Date == date && a.Id != (excludeId ?? 0) && !Terminal.Contains(a.Status)).ToListAsync();
            var slots = new List<string>(); var first = Math.Max(settings.OpeningHour * 60, (int)doctor.StartsAt.ToTimeSpan().TotalMinutes); var last = Math.Min(settings.ClosingHour * 60, (int)doctor.EndsAt.ToTimeSpan().TotalMinutes);
            for (var minute = first; minute + service.DurationMinutes <= last; minute += 15)
            {
                var time = TimeOnly.FromTimeSpan(TimeSpan.FromMinutes(minute)); if (date.ToDateTime(time) <= Access.LocalNow()) continue;
                var collisions = appointments.Where(a => minute < a.Time.ToTimeSpan().TotalMinutes + a.DurationMinutes && minute + service.DurationMinutes > a.Time.ToTimeSpan().TotalMinutes).ToList();
                if (collisions.Any(a => a.DoctorId == doctorId || (c.User.PatientPortal() && a.PatientId == c.User.Scope("patient")))) continue;
                if (facilities.Any(f => collisions.All(a => a.FacilityId != f))) slots.Add(time.ToString("HH:mm:ss"));
            }
            return Results.Ok(slots);
        }).RequireAuthorization();
        app.MapPost("/api/appointments", async (AppointmentRequest input, ClinicDb db, HttpContext c) => await SaveAppointment(null, input, db, c)).RequireAuthorization("appointments.write");
        app.MapPut("/api/appointments/{id:int}", async (int id, AppointmentRequest input, ClinicDb db, HttpContext c) => await SaveAppointment(id, input, db, c)).RequireAuthorization("appointments.write");
        app.MapGet("/api/appointments/{id:int}/history", async (int id, ClinicDb db, HttpContext c) =>
        {
            if (!await db.AppointmentsFor(c.User).AnyAsync(a => a.Id == id)) return Results.NotFound();
            if (c.User.CompanyPortal() || c.User.PatientPortal()) return Results.Ok(await db.AppointmentChanges.Where(x => x.AppointmentId == id).OrderByDescending(x => x.CreatedAt).Select(x => new { x.Id, x.Action, x.CreatedAt }).ToListAsync());
            return Results.Ok(await db.AppointmentChanges.Where(x => x.AppointmentId == id).OrderByDescending(x => x.CreatedAt).ToListAsync());
        }).RequireAuthorization("appointments.read");
        app.MapPost("/api/appointments/{id:int}/status", async (int id, StatusRequest input, ClinicDb db, HttpContext c) =>
        {
            var a = await db.AppointmentsFor(c.User).FirstOrDefaultAsync(x => x.Id == id); if (a == null) return Results.NotFound(); if (a.Version != input.Version) return Results.Conflict(new { message = "La cita cambió. Recarga la agenda." });
            var transitions = new Dictionary<string, string[]> { { "Pendiente", ["Confirmada", "Cancelada", "Rechazada"] }, { "Confirmada", ["En curso", "Cancelada"] }, { "En curso", ["Finalizada"] } };
            if (!transitions.TryGetValue(a.Status, out var allowed) || !allowed.Contains(input.Status)) return Results.BadRequest(new { message = "Ese cambio de estado no está permitido." });
            if (c.User.PatientPortal() && (input.Status != "Cancelada" || !await WithinPortalRule(a, db))) return Results.BadRequest(new { message = "Solo puedes cancelar antes del plazo establecido por la clínica." });
            if (c.User.CompanyPortal()) return Results.Forbid();
            if (input.Status is "Confirmada" or "Rechazada" && !c.User.Can("appointments.confirm")) return Results.Forbid();
            if (input.Status is "En curso" or "Finalizada" && !c.User.Can("records.write")) return Results.Forbid();
            if (input.Status == "En curso" && (a.CheckedInAt == null || a.Date != DateOnly.FromDateTime(Access.LocalNow()))) return Results.BadRequest(new { message = "Registra primero la llegada del paciente en una cita para hoy." });
            if (input.Status is "Cancelada" or "Rechazada" && string.IsNullOrWhiteSpace(input.Reason)) return Results.BadRequest(new { message = "Indica el motivo de cancelación o rechazo." });
            var old = a.Status; a.Status = input.Status; db.AppointmentChanges.Add(new() { AppointmentId = id, UserId = c.User.UserId(), Action = "Estado", Detail = $"{old} → {input.Status}. {input.Reason}" });
            db.Audit(c, "Cambiar estado", "Cita", id.ToString(), $"{old} → {input.Status}"); await Access.NotifyPatient(db, a.PatientId, "Cita actualizada", $"Tu cita del {a.Date:dd/MM/yyyy} está {a.Status.ToLower()}."); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("appointments.write");
        app.MapPost("/api/appointments/{id:int}/check-in", async (int id, StatusRequest input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal()) return Results.Forbid(); var a = await db.AppointmentsFor(c.User).FirstOrDefaultAsync(x => x.Id == id); if (a == null) return Results.NotFound(); if (a.Version != input.Version) return Results.Conflict(new { message = "Recarga la cita." });
            if (a.Status != "Confirmada" || a.Date != DateOnly.FromDateTime(Access.LocalNow())) return Results.BadRequest(new { message = "El check-in requiere una cita confirmada para hoy." });
            if (a.CheckedInAt != null) return Results.BadRequest(new { message = "El paciente ya registró su llegada." }); a.CheckedInAt = DateTime.UtcNow; db.AppointmentChanges.Add(new() { AppointmentId = id, UserId = c.User.UserId(), Action = "Check-in", Detail = "Paciente en recepción" }); db.Audit(c, "Check-in", "Cita", id.ToString()); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("appointments.checkin");
        app.MapGet("/api/records", async (int? patientId, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal()) return Results.Forbid();
            var scoped = db.PatientsFor(c.User).Select(p => p.Id); var q = db.ClinicalNotes.Where(n => scoped.Contains(n.PatientId)); if (patientId != null) q = q.Where(n => n.PatientId == patientId);
            db.Audit(c, "Consultar expediente", "Expediente", patientId?.ToString() ?? ""); await db.SaveChangesAsync(); return Results.Ok(await q.Include(n => n.Patient).Include(n => n.Doctor).OrderByDescending(n => n.CreatedAt).Select(n => new { n.Id, n.PatientId, n.DoctorId, n.AppointmentId, n.History, n.Allergies, n.Content, n.Diagnosis, n.Treatment, n.AuthorId, n.SignedAt, n.CreatedAt, patientName = n.Patient.Name, doctorName = n.Doctor.Name }).ToListAsync());
        }).RequireAuthorization("records.read");
        app.MapPost("/api/records", async (NoteRequest i, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal() || !await Access.SeesPatient(db, c.User, i.PatientId)) return Results.Forbid();
            if (c.User.DoctorPortal() && i.DoctorId != c.User.Scope("doctor")) return Results.Forbid();
            if (!await db.Staff.AnyAsync(s => s.Id == i.DoctorId && s.Kind == "Médico" && s.Active)) return Results.BadRequest(new { message = "Selecciona un médico activo." });
            if (i.AppointmentId != null && !await db.Appointments.AnyAsync(a => a.Id == i.AppointmentId && a.PatientId == i.PatientId && a.DoctorId == i.DoctorId)) return Results.BadRequest(new { message = "La cita no corresponde al paciente y médico." });
            var n = new ClinicalNote { PatientId = i.PatientId, DoctorId = i.DoctorId, AppointmentId = i.AppointmentId, AuthorId = c.User.UserId(), History = i.History, Allergies = i.Allergies, Content = i.Content, Diagnosis = i.Diagnosis, Treatment = i.Treatment }; var error = Access.Validate(n); if (error != null) return error;
            db.ClinicalNotes.Add(n); db.Audit(c, "Crear nota", "Expediente", i.PatientId.ToString()); await db.SaveChangesAsync(); return Results.Ok(new { n.Id });
        }).RequireAuthorization("records.write");
        app.MapPut("/api/profile/contact", async (ContactRequest input, ClinicDb db, HttpContext c) =>
        {
            if (!c.User.PatientPortal()) return Results.Forbid(); var p = await db.Patients.FindAsync(c.User.Scope("patient")); if (p == null) return Results.NotFound();
            if (p.Version != input.Version) return Results.Conflict(new { message = "Tu perfil cambió. Recarga los datos." });
            if (input.Phone.Length > 30 || input.Email.Length > 180 || input.Address.Length > 300 || input.EmergencyContact.Length > 180) return Results.BadRequest(new { message = "Reduce la extensión de los datos de contacto." });
            p.Phone = input.Phone; p.Email = input.Email; p.Address = input.Address; p.EmergencyContact = input.EmergencyContact; db.Audit(c, "Actualizar contacto propio", "Paciente", p.Id.ToString()); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization();
        app.MapPost("/api/records/{id:int}/sign", async (int id, ClinicDb db, HttpContext c) =>
        {
            var n = await db.ClinicalNotes.FindAsync(id); if (n == null) return Results.NotFound(); if (n.AuthorId != c.User.UserId() || !await Access.SeesPatient(db, c.User, n.PatientId)) return Results.Forbid(); if (n.SignedAt != null) return Results.BadRequest(new { message = "La nota ya está cerrada." }); n.SignedAt = DateTime.UtcNow; db.Audit(c, "Cerrar nota", "Expediente", id.ToString()); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("records.write");
    }
    public record ContactRequest(string Phone, string Email, string Address, string EmergencyContact, Guid Version);
    static async Task<IResult?> ValidatePatient(Patient p, ClinicDb db)
    {
        p.Curp = p.Curp.Trim().ToUpperInvariant(); var error = Access.Validate(p); if (error != null) return error;
        if (p.BirthDate > DateOnly.FromDateTime(Access.LocalNow()) || p.BirthDate.Year < 1900) return Results.BadRequest(new { message = "La fecha de nacimiento no es válida." });
        if (await db.Patients.AnyAsync(x => x.Curp == p.Curp && x.Id != p.Id)) return Results.Conflict(new { message = "La CURP ya está registrada." });
        if (p.CompanyId != null && !await db.Companies.AnyAsync(x => x.Id == p.CompanyId && x.Active)) return Results.BadRequest(new { message = "Selecciona una empresa activa." }); return null;
    }
    static async Task<bool> WithinPortalRule(Appointment a, ClinicDb db) { var hours = (await db.Settings.FirstAsync()).CancellationHours; return a.Date.ToDateTime(a.Time) > Access.LocalNow().AddHours(hours); }
    static async Task<IResult> SaveAppointment(int? id, AppointmentRequest i, ClinicDb db, HttpContext c)
    {
        if (c.User.CompanyPortal()) return Results.Forbid();
        if (c.User.PatientPortal() && i.Date > DateOnly.FromDateTime(Access.LocalNow()).AddDays(180)) return Results.BadRequest(new { message = "Solicita una cita dentro de los próximos seis meses." });
        if (!c.User.Can("appointments.notes.write") && !string.IsNullOrWhiteSpace(i.Notes)) return Results.Forbid();
        if (!c.User.Internal() && (i.CompanyId != null || !string.IsNullOrWhiteSpace(i.Instructions))) return Results.Forbid();
        if (string.IsNullOrWhiteSpace(i.Reason)) return Results.BadRequest(new { message = "Indica el motivo de la cita." });
        i = i with { Notes = i.Notes ?? "" };
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        Appointment a;
        if (id != null) { a = (await db.AppointmentsFor(c.User).FirstOrDefaultAsync(x => x.Id == id))!; if (a == null) return Results.NotFound(); if (a.Version != i.Version) return Results.Conflict(new { message = "La cita cambió. Recarga sus datos." }); if (a.Status is not ("Pendiente" or "Confirmada")) return Results.BadRequest(new { message = "Solo se reagendan citas pendientes o confirmadas." }); if (c.User.PatientPortal() && !await WithinPortalRule(a, db)) return Results.BadRequest(new { message = "El plazo de reprogramación terminó. Contacta a recepción." }); }
        else a = new();
        if (id != null && c.User.PatientPortal() && a.CompanyId != null && (i.ServiceId != a.ServiceId || !await db.Companies.AnyAsync(co => co.Id == a.CompanyId && co.Active && (co.ValidUntil == null || co.ValidUntil >= i.Date)))) return Results.BadRequest(new { message = "Para cambiar el servicio o un convenio vencido, contacta a recepción." });
        if (!await Access.SeesPatient(db, c.User, i.PatientId)) return Results.Forbid(); if (c.User.DoctorPortal() && i.DoctorId != c.User.Scope("doctor")) return Results.Forbid();
        var patient = await db.Patients.FindAsync(i.PatientId); var doctor = await db.Staff.FindAsync(i.DoctorId); var service = await db.Services.FindAsync(i.ServiceId);
        if (c.User.PatientPortal() && service != null)
        {
            var possible = await db.Facilities.Where(f => f.Active && f.Kind == "Consultorio" && f.Status == "Disponible").ToListAsync();
            var other = await db.Appointments.Where(x => x.Date == i.Date && x.Id != (id ?? 0) && !Terminal.Contains(x.Status)).ToListAsync();
            var startMinute = i.Time.ToTimeSpan().TotalMinutes;
            var available = possible.FirstOrDefault(f => !other.Any(x => x.FacilityId == f.Id && startMinute < x.Time.ToTimeSpan().TotalMinutes + x.DurationMinutes && startMinute + service.DurationMinutes > x.Time.ToTimeSpan().TotalMinutes));
            if (available == null) return Results.Conflict(new { message = "Ese horario ya no tiene espacio disponible. Elige otro." });
            i = i with { FacilityId = available.Id };
        }
        var facility = await db.Facilities.FindAsync(i.FacilityId);
        if (patient == null || !patient.Active || doctor == null || !doctor.Active || doctor.Kind != "Médico" || service == null || !service.Active || facility == null || !facility.Active || facility.Kind != "Consultorio" || facility.Status != "Disponible") return Results.BadRequest(new { message = "Paciente, médico, servicio y consultorio deben estar activos y disponibles." });
        if (i.Date.ToDateTime(i.Time) < Access.LocalNow()) return Results.BadRequest(new { message = "Selecciona un horario futuro." });
        var settings = await db.Settings.FirstAsync(); var start = i.Time.ToTimeSpan().TotalMinutes; var end = start + service.DurationMinutes;
        if (!doctor.WorkingDays.Split(',').Contains(((int)i.Date.DayOfWeek).ToString()) || start < doctor.StartsAt.ToTimeSpan().TotalMinutes || end > doctor.EndsAt.ToTimeSpan().TotalMinutes || start < settings.OpeningHour * 60 || end > settings.ClosingHour * 60) return Results.BadRequest(new { message = "El horario está fuera de la jornada del médico o de la clínica." });
        var sameDay = await db.Appointments.Where(x => x.Date == i.Date && x.Id != (id ?? 0) && !Terminal.Contains(x.Status) && (x.DoctorId == i.DoctorId || x.FacilityId == i.FacilityId || x.PatientId == i.PatientId)).ToListAsync();
        if (sameDay.Any(x => start < x.Time.ToTimeSpan().TotalMinutes + x.DurationMinutes && end > x.Time.ToTimeSpan().TotalMinutes)) return Results.Conflict(new { message = "El médico, paciente o consultorio ya tiene una cita que se cruza con ese horario." });
        if (i.Reason.Length > 1000 || i.Notes!.Length > 2000 || (i.Instructions?.Length ?? 0) > 2000) return Results.BadRequest(new { message = "Reduce la extensión de motivo y notas." });
        if (i.CompanyId != null && (patient.CompanyId != i.CompanyId || !await db.Companies.AnyAsync(co => co.Id == i.CompanyId && co.Active && (co.ValidUntil == null || co.ValidUntil >= i.Date)))) return Results.BadRequest(new { message = "La cobertura requiere un convenio vigente asociado al paciente." });
        var prior = $"{a.Date} {a.Time}"; a.PatientId = i.PatientId; a.DoctorId = i.DoctorId; a.FacilityId = i.FacilityId; a.ServiceId = i.ServiceId; a.Date = i.Date; a.Time = i.Time; a.DurationMinutes = service.DurationMinutes; a.Reason = i.Reason;
        if (c.User.Can("appointments.notes.write")) a.Notes = i.Notes;
        if (c.User.Internal()) { a.Instructions = i.Instructions ?? a.Instructions; a.CompanyId = i.CompanyId; }
        if (id == null) db.Appointments.Add(a);
        await db.SaveChangesAsync(); db.AppointmentChanges.Add(new() { AppointmentId = a.Id, UserId = c.User.UserId(), Action = id == null ? "Crear" : "Reagendar", Detail = id == null ? $"{i.Date} {i.Time}" : $"{prior} → {i.Date} {i.Time}" }); db.Audit(c, id == null ? "Crear" : "Reagendar", "Cita", a.Id.ToString()); await Access.NotifyPatient(db, a.PatientId, "Agenda actualizada", $"Cita registrada para {a.Date:dd/MM/yyyy} a las {a.Time:HH:mm}."); await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.Ok(new { a.Id });
    }
}
