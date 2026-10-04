using System.Text.Json;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public static class ManagementEndpoints
{
    public static void MapManagement(this WebApplication app)
    {
        MapCatalog<Staff>(app, "staff", "staff"); MapCatalog<Facility>(app, "facilities", "infrastructure"); MapCatalog<Service>(app, "services", "services"); MapCatalog<Company>(app, "companies", "companies");
        app.MapGet("/api/catalog/public", async (ClinicDb db, HttpContext c) =>
        {
            if (!c.User.Can("catalog.read") && !c.User.Can("appointments.write")) return Results.Forbid();
            return Results.Ok(new { services = await db.Services.Where(s => s.Active).OrderBy(s => s.Name).Select(s => new { s.Id, s.Name, s.Specialty, s.Price, s.DurationMinutes }).ToListAsync(), doctors = await db.Staff.Where(s => s.Active && s.Kind == "Médico").OrderBy(s => s.Name).Select(s => new { s.Id, s.Name, s.Specialty, s.License }).ToListAsync() });
        }).RequireAuthorization();
        app.MapGet("/api/lookups", async (ClinicDb db, HttpContext c) =>
        {
            var roleOptions = c.User.Internal() && (c.User.Can("roles.read") || c.User.Can("users.write")) ? await db.Roles.ToListAsync() : [];
            var u = c.User; return Results.Ok(new
            {
                patients = u.Internal() && u.Can("users.write") ? await db.Patients.Where(x => x.Active).Select(x => new { x.Id, x.Name }).ToListAsync() : u.Can("patients.read") ? await db.PatientsFor(u).Where(x => x.Active).Select(x => new { x.Id, x.Name }).ToListAsync() : null,
                doctors = u.Can("staff.read") || u.Can("appointments.write") || (u.Internal() && u.Can("users.write")) ? await db.Staff.Where(x => x.Active && x.Kind == "Médico" && (!u.DoctorPortal() || x.Id == u.Scope("doctor"))).Select(x => new { x.Id, x.Name }).ToListAsync() : null,
                facilities = !u.PatientPortal() && (u.Can("infrastructure.read") || u.Can("appointments.write")) ? await db.Facilities.Where(x => x.Active && x.Kind == "Consultorio" && x.Status == "Disponible").Select(x => new { x.Id, x.Name }).ToListAsync() : null,
                services = u.Can("services.read") || u.Can("appointments.write") ? await db.Services.Where(x => x.Active).Select(x => new { x.Id, x.Name, x.Price, x.DurationMinutes }).ToListAsync() : null,
                companies = u.Internal() && (u.Can("companies.read") || u.Can("users.write") || u.Can("patients.write") || u.Can("appointments.write")) ? await db.Companies.Where(x => x.Active).Select(x => new { x.Id, x.Name }).ToListAsync() : null,
                roles = roleOptions.Select(x => new { x.Id, x.Name, x.Audience, assignable = x.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries).All(u.Can) && (x.Name != "Superadministrador" || u.IsInRole("Superadministrador")) })
            });
        }).RequireAuthorization();
        app.MapGet("/api/payments", async (ClinicDb db, HttpContext c) =>
        {
            return Results.Ok(await db.PaymentsFor(c.User).OrderByDescending(x => x.CreatedAt).Select(p => new { p.Id, p.PatientId, p.AppointmentId, p.CompanyId, p.Concept, p.Amount, p.Method, p.Status, p.CreatedAt, p.Version, patientName = p.Patient.Name, folio = "PAG-" + p.Id }).ToListAsync());
        }).RequireAuthorization("payments.read");
        app.MapPost("/api/payments", async (Payment input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal() || !await Access.SeesPatient(db, c.User, input.PatientId)) return Results.Forbid();
            var error = Access.Validate(input); if (error != null) return error;
            if (!new[] { "Efectivo", "Tarjeta", "Transferencia", "Convenio" }.Contains(input.Method) || !new[] { "Pagado", "Pendiente" }.Contains(input.Status)) return Results.BadRequest(new { message = "Método o estado no válido." });
            if (input.AppointmentId != null && !await db.Appointments.AnyAsync(a => a.Id == input.AppointmentId && a.PatientId == input.PatientId)) return Results.BadRequest(new { message = "La cita no pertenece a este paciente." });
            if (input.Method == "Convenio" && input.CompanyId == null) return Results.BadRequest(new { message = "Selecciona el convenio que cubre este consumo." });
            if (input.CompanyId != null && (!await db.Patients.AnyAsync(p => p.Id == input.PatientId && p.CompanyId == input.CompanyId) || !await db.Companies.AnyAsync(co => co.Id == input.CompanyId && co.Active && (co.ValidUntil == null || co.ValidUntil >= DateOnly.FromDateTime(Access.LocalNow()))))) return Results.BadRequest(new { message = "La cobertura requiere una empresa asociada y un convenio vigente." });
            await using var tx = await db.Database.BeginTransactionAsync();
            input.Id = 0; input.Patient = null!; input.RecordedBy = c.User.UserId(); input.CreatedAt = DateTime.UtcNow; db.Payments.Add(input); await db.SaveChangesAsync();
            db.Audit(c, "Registrar pago", "Pago", input.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new { input.Id });
        }).RequireAuthorization("payments.write");
        app.MapPost("/api/payments/{id:int}/cancel", async (int id, StatusRequest input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.CompanyPortal() || c.User.PatientPortal()) return Results.Forbid(); var p = await db.Payments.FindAsync(id); if (p == null) return Results.NotFound(); if (input.Version != p.Version) return Results.Conflict(new { message = "El pago cambió." }); if (p.Status == "Anulado" || string.IsNullOrWhiteSpace(input.Reason)) return Results.BadRequest(new { message = "Indica un motivo y selecciona un pago vigente." }); p.Status = "Anulado"; db.Audit(c, "Anular pago", "Pago", id.ToString(), input.Reason); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("payments.write");
        app.MapPost("/api/payments/{id:int}/settle", async (int id, StatusRequest input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal() || c.User.CompanyPortal()) return Results.Forbid(); var p = await db.Payments.FindAsync(id); if (p == null) return Results.NotFound();
            if (p.Version != input.Version) return Results.Conflict(new { message = "El pago cambió. Recarga los datos." }); if (p.Status != "Pendiente") return Results.BadRequest(new { message = "Solo se liquidan pagos pendientes." });
            p.Status = "Pagado"; db.Audit(c, "Liquidar pago", "Pago", id.ToString()); await db.SaveChangesAsync(); return Results.Ok();
        }).RequireAuthorization("payments.write");
        app.MapGet("/api/invoices", async (ClinicDb db, HttpContext c) =>
        {
            var scope = db.PaymentsFor(c.User).Select(p => p.Id); return Results.Ok(await db.Invoices.Where(i => scope.Contains(i.PaymentId)).OrderByDescending(x => x.CreatedAt).Select(i => new { i.Id, i.PaymentId, i.CreatedAt, folio = "COMP-" + i.Id, patientName = i.Payment.Patient.Name, i.Payment.Concept, i.Payment.Amount, i.Payment.Status }).ToListAsync());
        }).RequireAuthorization("payments.read");
        app.MapPost("/api/invoices", async (InvoiceRequest input, ClinicDb db, HttpContext c) =>
        {
            if (c.User.CompanyPortal() || c.User.PatientPortal()) return Results.Forbid(); var payment = await db.Payments.FindAsync(input.PaymentId); if (payment == null || payment.Status != "Pagado") return Results.BadRequest(new { message = "El comprobante requiere un pago vigente." }); if (await db.Invoices.AnyAsync(i => i.PaymentId == input.PaymentId)) return Results.Conflict(new { message = "Este pago ya tiene un comprobante." }); var invoice = new Invoice { PaymentId = input.PaymentId, IssuedBy = c.User.UserId() }; db.Invoices.Add(invoice); db.Audit(c, "Emitir comprobante interno", "Comprobante", input.PaymentId.ToString()); await db.SaveChangesAsync(); return Results.Ok(new { invoice.Id });
        }).RequireAuthorization("payments.write");
        app.MapGet("/api/settings", async (ClinicDb db) => Results.Ok(await db.Settings.FirstAsync())).RequireAuthorization("settings.read");
        app.MapPut("/api/settings", async (ClinicSettings i, ClinicDb db, HttpContext c) =>
        {
            var s = await db.Settings.FirstAsync(); if (s.Version != i.Version) return Results.Conflict(new { message = "La configuración cambió." }); var error = Access.Validate(i); if (error != null) return error; if (i.OpeningHour < 0 || i.ClosingHour > 24 || i.OpeningHour >= i.ClosingHour || i.CancellationHours < 0 || i.CancellationHours > 168) return Results.BadRequest(new { message = "Revisa horario y plazo de cancelación." }); s.Name = i.Name; s.Address = i.Address; s.Phone = i.Phone; s.Email = i.Email; s.OpeningHour = i.OpeningHour; s.ClosingHour = i.ClosingHour; s.CancellationHours = i.CancellationHours; db.Audit(c, "Configurar", "Clínica"); await db.SaveChangesAsync(); return Results.Ok(s);
        }).RequireAuthorization("settings.write");
        app.MapGet("/api/audit", async (int? @event, string? task, int? days, ClinicDb db, AuditIntegrity integrity) =>
        {
            if (days != null && days is not (1 or 7)) return Results.BadRequest(new { message = "El periodo de revisión debe ser de 1 o 7 días." });
            var query = db.AuditLogs.AsNoTracking().AsQueryable();
            if (@event != null) query = query.Where(a => a.Id == @event);
            else if (task != null)
            {
                var from = DateTime.UtcNow.AddDays(-(days ?? 1));
                query = query.Where(a => a.CreatedAt >= from);
                query = task switch
                {
                    "denied" => query.Where(a => a.Result == "Denegado"),
                    "failedLogin" => query.Where(a => (a.Action == "Login" || a.Action == "Login fallido") && a.Result != "Correcto"),
                    "failures" => query.Where(a => a.Result != "Correcto"),
                    "access" => query.Where(a => (a.Entity == "Rol" || a.Entity == "Usuario") && a.Action != "Login" && a.Action != "Logout" && a.Action != "Login fallido"),
                    _ => null
                };
                if (query == null) return Results.BadRequest(new { message = "El filtro de auditoría no existe." });
            }
            var events = await query.OrderByDescending(a => a.Id).Take(500).ToListAsync();
            return Results.Ok(events.Select(item => new { item.Id, createdAt = SessionSecurity.Utc(item.CreatedAt), item.UserId, item.Username, item.Action, item.Entity, item.RecordId, item.Ip, item.Result, item.Detail, integrity = integrity.Verify(item) }));
        }).RequireAuthorization("audit.read");
        app.MapGet("/api/notifications", async (ClinicDb db, HttpContext c) => Results.Ok(await db.Notifications.Where(n => n.UserId == c.User.UserId()).OrderByDescending(n => n.Id).Take(100).ToListAsync())).RequireAuthorization();
        app.MapPost("/api/notifications/{id:int}/read", async (int id, ClinicDb db, HttpContext c) => { var n = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == c.User.UserId()); if (n == null) return Results.NotFound(); n.Read = true; await db.SaveChangesAsync(); return Results.Ok(); }).RequireAuthorization();
        app.MapGet("/api/dashboard", async (ClinicDb db, HttpContext c) =>
        {
            var u = c.User; var now = Access.LocalNow(); var today = DateOnly.FromDateTime(now); var time = TimeOnly.FromDateTime(now); var aq = db.AppointmentsFor(u); var appts = u.Can("appointments.read") ? await aq.Include(a => a.Patient).Include(a => a.Doctor).Include(a => a.Facility).Include(a => a.Service).Where(a => a.Date == today).OrderBy(a => a.Time).ToListAsync() : new List<Appointment>();
            var future = aq.Where(a => (a.Date > today || (a.Date == today && a.Time >= time)) && !ClinicalEndpoints.Terminal.Contains(a.Status));
            var upcomingCount = u.PatientPortal() && u.Can("appointments.read") ? await future.CountAsync() : (int?)null;
            var upcoming = u.PatientPortal() && u.Can("appointments.read") ? await future.Include(a => a.Patient).Include(a => a.Doctor).Include(a => a.Facility).Include(a => a.Service).OrderBy(a => a.Date).ThenBy(a => a.Time).Take(6).ToListAsync() : appts;
            var dayStart = TimeZoneInfo.ConvertTimeToUtc(Access.LocalNow().Date, TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City"));
            var income = u.Can("payments.read") ? (await db.PaymentsFor(u).Where(p => p.Status == "Pagado" && p.CreatedAt >= dayStart && p.CreatedAt < dayStart.AddDays(1)).Select(p => p.Amount).ToListAsync()).Sum() : (decimal?)null;
            return Results.Ok(new { clinicName = (await db.Settings.FirstAsync()).Name, date = today, cancellationHours = (await db.Settings.FirstAsync()).CancellationHours, appointmentCount = u.Can("appointments.read") ? appts.Count : (int?)null, completed = appts.Count(a => a.Status == "Finalizada"), patientCount = !u.PatientPortal() && u.Can("patients.read") ? await db.PatientsFor(u).CountAsync(p => p.Active) : (int?)null, doctorCount = u.Internal() && u.Can("staff.read") ? await db.Staff.CountAsync(s => s.Active && s.Kind == "Médico") : (int?)null, income, upcomingCount, upcoming = upcoming.Select(a => ClinicalEndpoints.AppointmentView(a, u)), unread = await db.Notifications.CountAsync(n => n.UserId == u.UserId() && !n.Read), documentCount = u.PatientPortal() && u.Can("documents.read") ? await db.Documents.CountAsync(d => d.PatientId == u.Scope("patient") && d.Released) : (int?)null, userCount = u.Can("users.read") ? await db.Users.CountAsync() : (int?)null, roleCount = u.Can("roles.read") ? await db.Roles.CountAsync() : (int?)null, auditCount = u.Can("audit.read") ? await db.AuditLogs.CountAsync() : (int?)null, backupCount = u.Can("backups.read") ? await db.Backups.CountAsync() : (int?)null });
        }).RequireAuthorization();
        app.MapGet("/api/reports", async (DateOnly? from, DateOnly? to, bool? export, ClinicDb db, HttpContext c) =>
        {
            if (export == true && !c.User.Can("reports.export")) return Results.Forbid();
            var start = from ?? DateOnly.FromDateTime(Access.LocalNow()).AddDays(-30); var end = to ?? DateOnly.FromDateTime(Access.LocalNow()); if (end < start || end.DayNumber - start.DayNumber > 366) return Results.BadRequest(new { message = "El periodo debe ser válido y menor a un año." });
            var appts = await db.AppointmentsFor(c.User).Include(a => a.Patient).Include(a => a.Doctor).Include(a => a.Facility).Include(a => a.Service).Where(a => a.Date >= start && a.Date <= end).ToListAsync();
            var tz = TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City"); var utcStart = TimeZoneInfo.ConvertTimeToUtc(start.ToDateTime(TimeOnly.MinValue), tz); var utcEnd = TimeZoneInfo.ConvertTimeToUtc(end.AddDays(1).ToDateTime(TimeOnly.MinValue), tz);
            var payments = c.User.Can("payments.read") ? await db.PaymentsFor(c.User).Where(p => p.CreatedAt >= utcStart && p.CreatedAt < utcEnd).ToListAsync() : new List<Payment>();
            db.Audit(c, export == true ? "Exportar reporte" : "Consultar reporte", "Reporte", detail: $"{start} — {end}"); await db.SaveChangesAsync();
            return Results.Ok(new { from = start, to = end, total = appts.Count, completed = appts.Count(a => a.Status == "Finalizada"), cancellations = appts.Count(a => a.Status is "Cancelada" or "Rechazada"), income = c.User.Can("payments.read") ? payments.Where(p => p.Status == "Pagado").Sum(p => p.Amount) : (decimal?)null, byStatus = appts.GroupBy(a => a.Status).Select(g => new { name = g.Key, count = g.Count() }), byDoctor = appts.GroupBy(a => a.Doctor.Name).Select(g => new { name = g.Key, count = g.Count() }), byService = appts.GroupBy(a => a.Service.Name).Select(g => new { name = g.Key, count = g.Count() }), appointments = c.User.Can("appointments.read") ? appts.Select(a => (object)new { a.Id, a.Date, a.Time, a.Status, patientName = a.Patient.Name, doctorName = a.Doctor.Name, serviceName = a.Service.Name }).ToArray() : [] });
        }).RequireAuthorization("reports.read");
    }
    public record InvoiceRequest(int PaymentId);
    static void MapCatalog<T>(WebApplication app, string route, string permission) where T : Entity, new()
    {
        app.MapGet($"/api/{route}", async (ClinicDb db, HttpContext c) =>
        {
            if (c.User.PatientPortal()) return Results.Forbid();
            if (typeof(T) == typeof(Company) && c.User.CompanyPortal()) return Results.Ok(await db.Companies.Where(x => x.Id == c.User.Scope("company")).ToListAsync());
            if (c.User.CompanyPortal()) return Results.Forbid();
            if (c.User.DoctorPortal())
            {
                if (typeof(T) == typeof(Staff)) return Results.Ok(await db.Staff.Where(x => x.Id == c.User.Scope("doctor") && x.Active).Select(x => new { x.Id, x.Name, x.Specialty, x.License }).ToListAsync());
                if (typeof(T) == typeof(Facility)) return Results.Ok(await db.Facilities.Where(x => x.Active && x.Kind == "Consultorio" && x.Status == "Disponible").Select(x => new { x.Id, x.Name, x.Location }).ToListAsync());
                if (typeof(T) == typeof(Service)) return Results.Ok(await db.Services.Where(x => x.Active).Select(x => new { x.Id, x.Name, x.Specialty, x.DurationMinutes, x.Price }).ToListAsync());
                return Results.Forbid();
            }
            if (!c.User.Internal()) return Results.Forbid();
            var rows = await db.Set<T>().OrderBy(x => x.Id).ToListAsync(); return Results.Ok(rows);
        }).RequireAuthorization(permission + ".read");
        app.MapPost($"/api/{route}", async (JsonElement input, ClinicDb db, HttpContext c) => await SaveCatalog<T>(null, input, db, c)).RequireAuthorization(permission + ".write");
        app.MapPut($"/api/{route}/{{id:int}}", async (int id, JsonElement input, ClinicDb db, HttpContext c) => await SaveCatalog<T>(id, input, db, c)).RequireAuthorization(permission + ".write");
    }
    static async Task<IResult> SaveCatalog<T>(int? id, JsonElement input, ClinicDb db, HttpContext c) where T : Entity, new()
    {
        if (c.User.PatientPortal() || c.User.CompanyPortal() || c.User.DoctorPortal()) return Results.Forbid();
        var payload = input.Deserialize<T>(new JsonSerializerOptions(JsonSerializerDefaults.Web)); if (payload == null) return Results.BadRequest(); var error = Access.Validate(payload); if (error != null) return error;
        if (payload is Staff staff && (staff.StartsAt >= staff.EndsAt || staff.WorkingDays.Split(',').Any(x => !int.TryParse(x, out var day) || day < 0 || day > 6) || !new[] { "Médico", "Enfermería", "Auxiliar", "Administrativo" }.Contains(staff.Kind))) return Results.BadRequest(new { message = "Revisa tipo de personal, jornada y días laborables." });
        if (payload is Facility facility && (!new[] { "Consultorio", "Habitación" }.Contains(facility.Kind) || !new[] { "Disponible", "Mantenimiento", "Limpieza", "Ocupada" }.Contains(facility.Status))) return Results.BadRequest(new { message = "Tipo o estado de instalación inválido." });
        var entity = id == null ? new T() : await db.Set<T>().FindAsync(id); if (entity == null) return Results.NotFound(); if (id != null && payload.Version != entity.Version) return Results.Conflict(new { message = "Otro usuario modificó este registro. Recarga sus datos." });
        foreach (var prop in typeof(T).GetProperties().Where(p => p.DeclaringType != typeof(Entity) && p.CanWrite)) prop.SetValue(entity, prop.GetValue(payload));
        await using var tx = await db.Database.BeginTransactionAsync();
        if (id == null) db.Set<T>().Add(entity); await db.SaveChangesAsync(); db.Audit(c, id == null ? "Crear" : "Editar", typeof(T).Name, entity.Id.ToString()); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(entity);
    }
}
