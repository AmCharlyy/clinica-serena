using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public static class WorkbenchEndpoints
{
    public record Metric(string Key, string Label, decimal Value, string Detail, string Format = "count", string? Href = null);
    public record Item(string Key, string Title, string Subtitle, string State, string? Href = null, string Action = "Revisar", string Tone = "normal", DateTime? At = null, decimal? Amount = null);
    public record Panel(string Key, string Title, string Description, string EmptyMessage, int Total, List<Item> Items, string? Href = null);
    public record Alert(string Key, string Title, string Description, string Tone = "notice", string? Href = null);

    public static void MapWorkbench(this WebApplication app)
    {
        app.MapGet("/api/dashboard/workbench", async (string? view, ClinicDb db, HttpContext c, StoragePaths paths, IWebHostEnvironment env) =>
        {
            var user = c.User;
            if (!user.Internal()) return Results.Forbid();
            var available = ViewsFor(user);
            var primary = PrimaryFor(user, available);
            var selected = view ?? primary;
            if (!new[] { "overview", "reception", "finance", "coordination", "access", "audit", "support", "personal" }.Contains(selected))
                return Results.BadRequest(new { message = "El espacio solicitado no existe." });
            if (!available.Contains(selected)) return Results.Forbid();

            var now = Access.LocalNow();
            var today = DateOnly.FromDateTime(now);
            var utcNow = DateTime.UtcNow;
            var utcStart = TimeZoneInfo.ConvertTimeToUtc(now.Date, TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City"));
            var metrics = new List<Metric>();
            var panels = new List<Panel>();
            var alerts = new List<Alert>();

            switch (selected)
            {
                case "reception":
                {
                    var day = db.AppointmentsFor(user).AsNoTracking().Where(a => a.Date == today);
                    var confirmations = db.AppointmentsFor(user).AsNoTracking().Where(a => a.Status == "Pendiente" && a.Date >= today && a.Date <= today.AddDays(7));
                    var arrivals = day.Where(a => a.Status == "Confirmada" && a.CheckedInAt == null);
                    var waiting = day.Where(a => a.Status == "Confirmada" && a.CheckedInAt != null);
                    var current = day.Where(a => a.Status == "En curso");
                    var pendingCount = await confirmations.CountAsync();
                    var arrivalCount = await arrivals.CountAsync();
                    var waitingCount = await waiting.CountAsync();
                    metrics.Add(new("today", "Citas de hoy", await day.CountAsync(a => a.Status != "Cancelada" && a.Status != "Rechazada"), "Sin canceladas ni rechazadas", Href: "/reception"));
                    metrics.Add(new("confirmations", "Por confirmar", pendingCount, "Hoy y los próximos 7 días", Href: "/appointments?status=Pendiente"));
                    metrics.Add(new("arrivals", "Llegadas por registrar", arrivalCount, "Citas confirmadas para hoy", Href: "/reception?task=arrivals"));
                    metrics.Add(new("waiting", "Pacientes en espera", waitingCount, "Llegaron; aún no inicia la consulta", Href: "/reception?task=waiting"));
                    panels.Add(await AppointmentPanel(confirmations, "confirmations", "Solicitudes por confirmar", "Hoy y los próximos 7 días", "No hay solicitudes pendientes en este periodo.", user.Can("appointments.confirm") ? "Revisar y confirmar" : "Ver cita", "/appointments?status=Pendiente"));
                    panels.Add(await AppointmentPanel(waiting, "waiting", "Sala de espera", "Primero las llegadas más antiguas", "No hay pacientes esperando consulta.", "Ver atención", "/reception?task=waiting"));
                    panels.Add(await AppointmentPanel(arrivals, "arrivals", "Llegadas de hoy", "Citas confirmadas sin llegada registrada", "Todas las llegadas están registradas o no hay citas confirmadas.", user.Can("appointments.checkin") ? "Registrar llegada" : "Ver cita", "/reception?task=arrivals"));
                    panels.Add(await AppointmentPanel(current, "current", "En consulta", "Consultas iniciadas hoy", "No hay consultas en curso.", "Ver atención", "/reception?status=En%20curso"));
                    if (waitingCount > 0) alerts.Add(new("waiting", $"{waitingCount} pacientes esperan atención", "Coordina la atención con el equipo médico; recepción no inicia ni cierra consultas.", Href: "/reception?task=waiting"));
                    break;
                }
                case "finance":
                {
                    var payments = db.PaymentsFor(user).AsNoTracking();
                    var pending = payments.Where(p => p.Status == "Pendiente");
                    var paidToday = payments.Where(p => p.Status == "Pagado" && p.CreatedAt >= utcStart && p.CreatedAt < utcStart.AddDays(1));
                    var withoutReceipt = payments.Where(p => p.Status == "Pagado" && !db.Invoices.Any(i => i.PaymentId == p.Id));
                    var pendingCount = await pending.CountAsync();
                    metrics.Add(new("income", "Pagos registrados hoy", await SumPayments(paidToday, db), "Registrados hoy y actualmente pagados · MXN", "money", "/payments?status=Pagado"));
                    metrics.Add(new("pendingAmount", "Importe por cobrar", await SumPayments(pending, db), "Todos los pagos pendientes · MXN", "money", "/payments?status=Pendiente"));
                    metrics.Add(new("pending", "Pagos pendientes", pendingCount, "Pendientes de liquidación", Href: "/payments?status=Pendiente"));
                    metrics.Add(new("receipts", "Sin comprobante", await withoutReceipt.CountAsync(), "Pagos vigentes sin comprobante interno", Href: "/payments?task=receipts"));
                    panels.Add(await PaymentPanel(pending, "pendingPayments", "Cobros pendientes", "Primero los registros más antiguos", "No hay pagos por liquidar.", user.Can("payments.write") ? "Revisar y liquidar" : "Ver pago", "/payments?status=Pendiente"));
                    panels.Add(await PaymentPanel(withoutReceipt, "receipts", "Comprobantes por emitir", "Son comprobantes internos, no facturas fiscales", "Los pagos vigentes tienen comprobante.", user.Can("payments.write") ? "Revisar comprobante" : "Ver pago", "/payments?task=receipts"));
                    if (user.Can("companies.read"))
                    {
                        var companies = db.Companies.AsNoTracking().Where(co => co.Active && co.ValidUntil != null && co.ValidUntil <= today.AddDays(30));
                        var count = await companies.CountAsync();
                        var rows = await companies.OrderBy(co => co.ValidUntil).Take(6).Select(co => new { co.Id, co.Name, co.ValidUntil }).ToListAsync();
                        panels.Add(new("agreements", "Convenios por revisar", "Activos vencidos o con vigencia de hasta 30 días", "No hay convenios próximos a vencer.", count, rows.Select(co => new Item($"company:{co.Id}", co.Name, $"Vigencia: {co.ValidUntil:dd/MM/yyyy}", co.ValidUntil < today ? "Vencido" : "Por vencer", $"/companies?record={co.Id}", "Revisar convenio", co.ValidUntil < today ? "danger" : "warning")).ToList(), "/companies?task=expiring"));
                        if (count > 0) alerts.Add(new("agreements", $"{count} convenios requieren revisión", "La actividad privada del empleado no se convierte en consumo empresarial.", "warning", "/companies?task=expiring"));
                    }
                    break;
                }
                case "coordination":
                {
                    var appts = user.Can("appointments.read") ? await db.AppointmentsFor(user).AsNoTracking().Where(a => a.Date == today && a.Status != "Cancelada" && a.Status != "Rechazada").Select(a => new { a.DoctorId, a.FacilityId, a.Time, a.DurationMinutes, a.Status }).ToListAsync() : [];
                    if (user.Can("appointments.read"))
                    {
                        metrics.Add(new("scheduled", "Citas programadas", appts.Count, "Hoy, sin cancelaciones", Href: "/agenda?view=D%C3%ADa"));
                        metrics.Add(new("completed", "Atenciones finalizadas", appts.Count(a => a.Status == "Finalizada"), "Consultas cerradas hoy", Href: "/appointments?status=Finalizada"));
                    }
                    if (user.Can("staff.read"))
                    {
                        var doctors = await db.Staff.AsNoTracking().Where(s => s.Active && s.Kind == "Médico").OrderBy(s => s.Name).Select(s => new { s.Id, s.Name, s.Specialty, s.StartsAt, s.EndsAt, s.WorkingDays }).ToListAsync();
                        var currentTime = TimeOnly.FromDateTime(now);
                        var dayNumber = ((int)today.DayOfWeek).ToString();
                        var onDuty = doctors.Count(s => s.WorkingDays.Split(',').Contains(dayNumber) && s.StartsAt <= currentTime && s.EndsAt > currentTime);
                        metrics.Add(new("onDuty", "Médicos en jornada", onDuty, "Según día y horario profesional", Href: "/staff"));
                        panels.Add(new("doctors", "Disponibilidad médica", "Jornada configurada; no indica presencia física", "No hay médicos activos registrados.", doctors.Count, doctors.Take(6).Select(s =>
                        {
                            var worksToday = s.WorkingDays.Split(',').Contains(dayNumber);
                            var scheduled = appts.Count(a => a.DoctorId == s.Id);
                            var state = worksToday && s.StartsAt <= currentTime && s.EndsAt > currentTime ? "En jornada" : "Fuera de jornada";
                            var text = $"{s.Specialty} · {s.StartsAt:HH:mm}–{s.EndsAt:HH:mm}" + (user.Can("appointments.read") ? $" · {scheduled} citas hoy" : "");
                            return new Item($"doctor:{s.Id}", s.Name, text, state, user.Can("appointments.read") ? $"/agenda?doctor={s.Id}&view=D%C3%ADa" : $"/staff?record={s.Id}", user.Can("appointments.read") ? "Ver agenda" : "Ver profesional");
                        }).ToList(), "/staff"));
                    }
                    if (user.Can("infrastructure.read"))
                    {
                        var facilities = await db.Facilities.AsNoTracking().Where(f => f.Active && f.Kind == "Consultorio").OrderBy(f => f.Name).Select(f => new { f.Id, f.Name, f.Status, f.Location }).ToListAsync();
                        var currentMinute = now.Hour * 60 + now.Minute;
                        bool Reserved(int id) => appts.Any(a => a.FacilityId == id && (a.Status is "Confirmada" or "En curso") && a.Time.Hour * 60 + a.Time.Minute <= currentMinute && a.Time.Hour * 60 + a.Time.Minute + a.DurationMinutes > currentMinute);
                        metrics.Add(new("rooms", "Consultorios operativos", facilities.Count(f => f.Status == "Disponible"), "Estado del catálogo, no ocupación física", Href: "/facilities"));
                        if (user.Can("appointments.read")) metrics.Add(new("reserved", "Con reserva ahora", facilities.Count(f => Reserved(f.Id)), "Cruce del horario actual con la agenda", Href: "/agenda?view=D%C3%ADa"));
                        panels.Add(new("facilities", "Consultorios y reservas", "Estado operativo y reservas del horario actual", "No hay consultorios activos.", facilities.Count, facilities.Take(6).Select(f => new Item($"facility:{f.Id}", f.Name, f.Location + (user.Can("appointments.read") ? $" · {appts.Count(a => a.FacilityId == f.Id)} citas hoy" : ""), Reserved(f.Id) ? "Con reserva ahora" : f.Status, user.Can("appointments.read") ? $"/agenda?facility={f.Id}&view=D%C3%ADa" : $"/facilities?record={f.Id}", user.Can("appointments.read") ? "Ver agenda" : "Ver consultorio", f.Status == "Mantenimiento" ? "warning" : "normal")).ToList(), "/facilities"));
                        var maintenance = facilities.Count(f => f.Status == "Mantenimiento");
                        if (maintenance > 0) alerts.Add(new("maintenance", $"{maintenance} consultorios en mantenimiento", "Revisa los recursos antes de asignar nuevas citas.", "warning", "/facilities"));
                    }
                    break;
                }
                case "access":
                {
                    if (user.Can("users.read"))
                    {
                        var accounts = db.Users.AsNoTracking();
                        var pending = accounts.Where(u => u.Active && (u.MustChangePassword || u.LastAccess == null || u.LockedUntil > utcNow));
                        metrics.Add(new("activeUsers", "Cuentas activas", await accounts.CountAsync(u => u.Active), "Acceso habilitado", Href: "/users?state=Activos"));
                        metrics.Add(new("initialPassword", "Cambio inicial pendiente", await accounts.CountAsync(u => u.Active && u.MustChangePassword), "Requerido antes de usar el sistema", Href: "/users?task=initialPassword"));
                        metrics.Add(new("locked", "Bloqueos temporales", await accounts.CountAsync(u => u.Active && u.LockedUntil > utcNow), "Bloqueos vigentes, no cuentas desactivadas", Href: "/users"));
                        var count = await pending.CountAsync();
                        var rows = await pending.OrderByDescending(u => u.LockedUntil).ThenBy(u => u.CreatedAt).Take(6).Select(u => new { u.Id, u.Name, u.Username, u.Roles, u.MustChangePassword, u.LastAccess, u.LockedUntil }).ToListAsync();
                        panels.Add(new("accounts", "Accesos que requieren seguimiento", "Primer acceso, cambio inicial o bloqueo vigente", "Las cuentas activas no tienen estos pendientes.", count, rows.Select(u => new Item($"user:{u.Id}", u.Name, $"{u.Username} · {u.Roles}", u.LockedUntil > utcNow ? "Bloqueo temporal" : u.MustChangePassword ? "Cambio inicial pendiente" : "Sin primer acceso", $"/users?record={u.Id}", "Revisar cuenta", u.LockedUntil > utcNow ? "warning" : "normal")).ToList(), "/users"));
                        if (count > 0) alerts.Add(new("accounts", $"{count} cuentas pendientes de seguimiento", "Un restablecimiento de contraseña exige un nuevo cambio al iniciar sesión.", Href: "/users"));
                    }
                    if (user.Can("roles.read"))
                    {
                        var roles = await db.Roles.AsNoTracking().OrderBy(r => r.Name).Select(r => new { r.Id, r.Name, r.Audience, r.Permissions }).ToListAsync();
                        metrics.Add(new("roles", "Roles configurados", roles.Count, "Tipos de acceso explícitos", Href: "/roles"));
                        panels.Add(new("roles", "Alcances y permisos", "Revisa el tipo de acceso antes de asignar cuentas", "No hay roles configurados.", roles.Count, roles.Take(6).Select(r => new Item($"role:{r.Id}", r.Name, $"{r.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries).Length} permisos asignados", AudienceLabel(r.Audience), $"/roles?role={r.Id}", "Revisar permisos")).ToList(), "/roles"));
                    }
                    if (user.Can("audit.read")) panels.Add(await EventPanel(db.AuditLogs.Where(a => a.Entity == "Usuario" || a.Entity == "Rol").Where(a => a.CreatedAt >= utcNow.AddDays(-7) && a.Action != "Login" && a.Action != "Logout" && a.Action != "Login fallido"), "accessChanges", "Cambios recientes de acceso", "Últimos 7 días · sin comentarios privados", "No hay cambios de acceso en este periodo.", "/audit?task=access&days=7"));
                    break;
                }
                case "audit":
                {
                    var events = db.AuditLogs.AsNoTracking().Where(a => a.CreatedAt >= utcNow.AddHours(-24));
                    var failures = events.Where(a => a.Result != "Correcto");
                    var failedCount = await failures.CountAsync();
                    metrics.Add(new("events", "Eventos registrados", await events.CountAsync(), "Últimas 24 horas", Href: "/audit"));
                    metrics.Add(new("denied", "Accesos denegados", await events.CountAsync(a => a.Result == "Denegado"), "Últimas 24 horas", Href: "/audit?task=denied"));
                    metrics.Add(new("failedLogin", "Ingresos fallidos", await events.CountAsync(a => (a.Action == "Login" || a.Action == "Login fallido") && a.Result != "Correcto"), "Últimas 24 horas", Href: "/audit?task=failedLogin"));
                    metrics.Add(new("accessChanges", "Cambios de acceso", await events.CountAsync(a => (a.Entity == "Rol" || a.Entity == "Usuario") && a.Action != "Login" && a.Action != "Logout" && a.Action != "Login fallido"), "Últimas 24 horas", Href: "/audit?task=access"));
                    panels.Add(await EventPanel(failures, "failures", "Eventos para revisar", "Denegaciones y resultados fallidos · últimas 24 horas", "No hay eventos fallidos o denegados en este periodo.", "/audit?task=failures"));
                    panels.Add(await EventPanel(events.Where(a => (a.Entity == "Rol" || a.Entity == "Usuario") && a.Action != "Login" && a.Action != "Logout" && a.Action != "Login fallido"), "changes", "Cambios de cuentas y permisos", "Últimas 24 horas; requiere revisión, no implica una intrusión", "No hay cambios de acceso en este periodo.", "/audit?task=access"));
                    panels.Add(await EventPanel(events, "recentEvents", "Actividad reciente", "Trazabilidad resumida, sin detalles clínicos", "No hay actividad registrada en este periodo.", "/audit"));
                    if (failedCount > 0) alerts.Add(new("failures", $"{failedCount} eventos fallidos o denegados", "Revisa el contexto en la auditoría. Un evento denegado por sí solo no demuestra una intrusión.", "warning", "/audit?task=failures"));
                    break;
                }
                case "support":
                {
                    if (user.Can("system.read"))
                    {
                        var connected = await db.Database.CanConnectAsync();
                        var documentsExist = Directory.Exists(paths.Documents);
                        long? free = null, total = null;
                        try { var root = Path.GetPathRoot(paths.Root); var drive = root == null ? null : new DriveInfo(root); if (drive?.IsReady == true) { free = drive.AvailableFreeSpace; total = drive.TotalSize; } }
                        catch (IOException) { }
                        catch (UnauthorizedAccessException) { }
                        var uptime = (utcNow - System.Diagnostics.Process.GetCurrentProcess().StartTime.ToUniversalTime()).TotalMinutes;
                        metrics.Add(new("uptime", "API en ejecución", (decimal)Math.Floor(uptime), "Minutos desde el inicio del proceso", Href: "/system"));
                        if (free != null) metrics.Add(new("freeDisk", "Espacio disponible", (decimal)free / (1024 * 1024 * 1024), "GB del volumen de almacenamiento", "decimal", "/system"));
                        var checks = new List<Item> {
                            new("api", "API clínica", $".NET {Environment.Version} · {env.EnvironmentName}", "Responde", "/system", "Ver diagnóstico"),
                            new("database", "Conectividad de base", db.Database.IsSqlite() ? "SQLite · entorno de desarrollo" : "SQL Server", connected ? "Conectada" : "Sin conexión", "/system", "Ver diagnóstico", connected ? "normal" : "danger"),
                            new("documents", "Carpeta de documentos", "Existencia comprobada; no certifica escritura ni ACL", documentsExist ? "Disponible" : "No encontrada", "/system", "Ver diagnóstico", documentsExist ? "normal" : "warning"),
                            new("scope", "Alcance del diagnóstico", "No administra IIS, servicios de Windows ni RDP", "Aplicación local", "/system", "Ver diagnóstico")
                        };
                        panels.Add(new("diagnostics", "Comprobaciones de la aplicación", "Lectura de conectividad, proceso y almacenamiento", "No hay comprobaciones disponibles.", checks.Count, checks, "/system"));
                        if (!connected || !documentsExist) alerts.Add(new("connectivity", "Hay una comprobación que requiere revisión", "Consulta el diagnóstico; no se han reiniciado servicios ni modificado carpetas.", "warning", "/system"));
                        if (free != null && total > 0 && (free < 1024L * 1024 * 1024 || (double)free / total < 0.1)) alerts.Add(new("disk", "Espacio de almacenamiento reducido", "Menos de 1 GB disponible o menos del 10 % del volumen. Revisa el servidor antes de generar archivos grandes.", "warning", "/system"));
                    }
                    if (user.Can("backups.read"))
                    {
                        var completed = await db.Backups.CountAsync(b => b.Status == "Completado");
                        var last = await db.Backups.Where(b => b.Status == "Completado").OrderByDescending(b => b.CreatedAt).Select(b => (DateTime?)b.CreatedAt).FirstOrDefaultAsync();
                        var rows = await db.Backups.AsNoTracking().OrderByDescending(b => b.CreatedAt).Take(6).Select(b => new { b.Id, b.Name, b.Status, b.Provider, b.CreatedAt }).ToListAsync();
                        metrics.Add(new("backups", "Respaldos completados", completed, "Historial, no prueba de restauración", Href: "/backups"));
                        panels.Add(new("backups", "Respaldos recientes", "Solo seguimiento; la descarga tiene un permiso independiente", "No se han registrado respaldos.", await db.Backups.CountAsync(), rows.Select(b => new Item($"backup:{b.Id}", b.Name, b.Provider, b.Status, "/backups", "Ver historial", b.Status == "Fallido" ? "danger" : "normal", Utc(b.CreatedAt))).ToList(), "/backups"));
                        if (last == null || last < utcNow.AddHours(-24)) alerts.Add(new("backupAge", last == null ? "No hay un respaldo completado" : "Revisar antigüedad del respaldo", "Referencia operativa: últimas 24 horas. No se genera un respaldo automáticamente ni se garantiza recuperabilidad.", "warning", "/backups"));
                    }
                    break;
                }
                case "overview":
                {
                    if (user.Can("appointments.read")) metrics.Add(new("appointments", "Citas de hoy", await db.AppointmentsFor(user).CountAsync(a => a.Date == today && a.Status != "Cancelada" && a.Status != "Rechazada"), "Atención programada", Href: "/dashboard?work=coordination"));
                    if (user.Can("payments.read")) metrics.Add(new("payments", "Cobros pendientes", await db.PaymentsFor(user).CountAsync(p => p.Status == "Pendiente"), "Registros por liquidar", Href: "/dashboard?work=finance"));
                    if (user.Can("users.read")) metrics.Add(new("users", "Cambios iniciales pendientes", await db.Users.CountAsync(u => u.Active && u.MustChangePassword), "Cuentas que requieren seguimiento", Href: "/dashboard?work=access"));
                    if (user.Can("audit.read")) metrics.Add(new("audit", "Eventos para revisar", await db.AuditLogs.CountAsync(a => a.CreatedAt >= utcNow.AddHours(-24) && a.Result != "Correcto"), "Últimas 24 horas", Href: "/dashboard?work=audit"));
                    if (user.Can("backups.read")) metrics.Add(new("backups", "Respaldos completados", await db.Backups.CountAsync(b => b.Status == "Completado"), "Consulta el seguimiento técnico", Href: "/dashboard?work=support"));
                    alerts.Add(new("overview", "Selecciona un área para trabajar", "Cada área presenta sus pendientes y acciones. Los permisos se comprueban por separado en el servidor."));
                    break;
                }
                default:
                    metrics.Add(new("unread", "Avisos pendientes", await db.Notifications.CountAsync(n => n.UserId == user.UserId() && !n.Read), "Solo tus notificaciones", Href: "/notifications"));
                    alerts.Add(new("limited", "Tu cuenta tiene un alcance limitado", "Usa las herramientas autorizadas del menú. No se concede acceso a una operación por mostrar este inicio."));
                    break;
            }
            return Results.Ok(new { view = selected, defaultView = primary, availableViews = available, date = today, asOf = utcNow, metrics, panels, alerts });
        }).RequireAuthorization();
    }

    public static List<string> ViewsFor(ClaimsPrincipal u)
    {
        var views = new List<string>();
        if (!u.Internal()) return views;
        if (u.Can("appointments.read") && (u.Can("appointments.confirm") || u.Can("appointments.checkin"))) views.Add("reception");
        if (u.Can("payments.read")) views.Add("finance");
        if (u.Can("appointments.read") || u.Can("staff.read") || u.Can("infrastructure.read")) views.Add("coordination");
        if (u.Can("users.read") || u.Can("roles.read")) views.Add("access");
        if (u.Can("audit.read")) views.Add("audit");
        if (u.Can("system.read") || u.Can("backups.read")) views.Add("support");
        if (views.Count > 1) views.Insert(0, "overview");
        if (views.Count == 0) views.Add("personal");
        return views;
    }
    static string PrimaryFor(ClaimsPrincipal u, List<string> views)
    {
        if (u.IsInRole("Superadministrador") && views.Contains("overview")) return "overview";
        if (views.Contains("access")) return "access";
        if (views.Contains("finance")) return "finance";
        if (u.Can("system.read") && views.Contains("support")) return "support";
        if (views.Contains("audit") && !u.Can("appointments.read")) return "audit";
        if (views.Contains("reception") && !u.Can("staff.write") && !u.Can("infrastructure.write")) return "reception";
        if (views.Contains("coordination")) return "coordination";
        return views[0];
    }
    static string AudienceLabel(string audience) => audience switch { "patient" => "Datos propios", "company" => "Convenio propio", "doctor" => "Pacientes asignados", "internal" => "Personal interno", _ => "Revisar alcance" };
    // SQL/SQLite materialize stored UTC instants without a DateTime.Kind.
    static DateTime? Utc(DateTime? value) => value == null ? null : DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
    static async Task<decimal> SumPayments(IQueryable<Payment> q, ClinicDb db) => db.Database.IsSqlite() ? (await q.Select(p => p.Amount).ToListAsync()).Sum() : await q.SumAsync(p => (decimal?)p.Amount) ?? 0;
    static async Task<Panel> AppointmentPanel(IQueryable<Appointment> q, string key, string title, string description, string empty, string action, string href)
    {
        var count = await q.CountAsync();
        var ordered = key == "waiting" ? q.OrderBy(a => a.CheckedInAt).ThenBy(a => a.Id) : q.OrderBy(a => a.Date).ThenBy(a => a.Time).ThenBy(a => a.Id);
        var rows = await ordered.Take(6).Select(a => new { a.Id, a.Patient.Name, doctorName = a.Doctor.Name, serviceName = a.Service.Name, a.Date, a.Time, a.Status, a.CheckedInAt }).ToListAsync();
        return new(key, title, description, empty, count, rows.Select(a => new Item($"appointment:{a.Id}", a.Name, $"{a.Date:dd/MM} · {a.Time:HH:mm} · {a.serviceName} · {a.doctorName}", key == "waiting" ? "En espera" : a.Status, $"/appointments?appointment={a.Id}", action, key == "waiting" || a.Status == "Pendiente" ? "warning" : "normal", Utc(a.CheckedInAt))).ToList(), href);
    }
    static async Task<Panel> PaymentPanel(IQueryable<Payment> q, string key, string title, string description, string empty, string action, string href)
    {
        var count = await q.CountAsync();
        var rows = await q.OrderBy(p => p.CreatedAt).ThenBy(p => p.Id).Take(6).Select(p => new { p.Id, p.Patient.Name, p.Concept, p.Amount, p.Status, p.CreatedAt }).ToListAsync();
        return new(key, title, description, empty, count, rows.Select(p => new Item($"payment:{p.Id}", p.Name, $"PAG-{p.Id:00000} · {p.Concept}", p.Status, $"/payments?record={p.Id}", action, p.Status == "Pendiente" ? "warning" : "normal", Utc(p.CreatedAt), p.Amount)).ToList(), href);
    }
    static async Task<Panel> EventPanel(IQueryable<AuditLog> q, string key, string title, string description, string empty, string href)
    {
        var count = await q.CountAsync();
        var rows = await q.AsNoTracking().OrderByDescending(a => a.Id).Take(6).Select(a => new { a.Id, a.Action, a.Entity, a.Username, a.Result, a.CreatedAt }).ToListAsync();
        return new(key, title, description, empty, count, rows.Select(a => new Item($"audit:{a.Id}", a.Action, $"{a.Username} · {a.Entity}", a.Result, $"/audit?event={a.Id}", "Ver evento", a.Result == "Correcto" ? "normal" : "warning", Utc(a.CreatedAt))).ToList(), href);
    }
}
