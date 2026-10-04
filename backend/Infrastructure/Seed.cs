using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace Clinica;

public static class Seed
{
    public static async Task Initialize(ClinicDb db, IConfiguration config, bool development)
    {
        if (await db.Roles.AnyAsync()) { await UpgradeRolePolicy(db); if (development && config.GetValue<bool>("Demo:Enabled")) await EnsureDemoAccessRoles(db); return; }
        var all = string.Join(',', Access.Permissions);
        var roles = new (string, string, string)[]{
            ("Superadministrador","Administración integral de la aplicación",all),
            ("Administrador general","Operación y reportes","patients.read,patients.write,staff.read,staff.write,infrastructure.read,infrastructure.write,appointments.read,appointments.write,documents.read,documents.write,services.read,reports.read,companies.read,settings.read"),
            ("Administrador de usuarios","Cuentas y acceso","users.read,users.write,roles.read,roles.write,audit.read,sessions.read,sessions.revoke"),
            ("Administración financiera","Cobros y convenios","patients.read,payments.read,payments.write,services.read,services.write,companies.read,companies.write,reports.read,documents.read"),
            ("Administración clínica","Coordinación clínica sin notas médicas","patients.read,patients.write,staff.read,staff.write,appointments.read,appointments.write,infrastructure.read,infrastructure.write,documents.read,reports.read"),
            ("Auditor","Lectura de eventos y reportes","audit.read,reports.read"),
            ("Soporte","Diagnóstico de la aplicación","system.read,backups.read,settings.read"),
            ("Recepción","Pacientes, check-in y citas","patients.read,patients.write,staff.read,infrastructure.read,appointments.read,appointments.write,services.read,documents.read,documents.write"),
            ("Médico","Pacientes asignados y consultas","patients.read,appointments.read,appointments.write,records.read,records.write,documents.read,documents.write,staff.read,services.read,infrastructure.read"),
            ("Paciente","Portal personal","patients.read,appointments.read,appointments.write,documents.read,services.read,staff.read,infrastructure.read"),
            ("Empresa","Portal de convenio sin información clínica","patients.read,appointments.read,payments.read,companies.read,reports.read,documents.read")
        };
        foreach (var (name, description, permissions) in roles) db.Roles.Add(new() { Name = name, Description = description, Audience = Access.DefaultAudience(name), Permissions = NewPermissions(name, permissions) });
        db.Settings.Add(new() { Name = config["Bootstrap:ClinicName"] ?? "Clínica Serena", Address = development ? "Av. del Bienestar 120 · Datos de demostración" : config["Bootstrap:ClinicAddress"] ?? "", Phone = development ? "55 0000 0000" : config["Bootstrap:ClinicPhone"] ?? "", Email = development ? "contacto@example.invalid" : config["Bootstrap:ClinicEmail"] ?? "" });
        await db.SaveChangesAsync();
        var password = development && config.GetValue<bool>("Demo:Enabled") ? "SerenaDemo!2026" : config["Bootstrap:Password"];
        if (string.IsNullOrWhiteSpace(password) || (!development && (password.Length < 15 || password.Length > 128 || !password.Any(char.IsUpper) || !password.Any(char.IsLower) || !password.Any(char.IsDigit)))) throw new InvalidOperationException("Configure Bootstrap__Password de 15 a 128 caracteres con mayúscula, minúscula y número.");
        var hasher = new PasswordHasher<User>();
        void AddUser(string username, string name, string role, int? patient = null, int? doctor = null, int? company = null)
        {
            var user = new User { Username = username, Name = name, Email = $"{username}@example.invalid", Roles = role, PatientId = patient, DoctorId = doctor, CompanyId = company, MustChangePassword = !development };
            user.PasswordHash = hasher.HashPassword(user, password); db.Users.Add(user);
        }
        AddUser(config["Bootstrap:Username"] ?? "admin", config["Bootstrap:Name"] ?? (development ? "Ana Martínez" : "Administrador inicial"), "Superadministrador");
        if (!development) db.Users.Local.Single().Email = config["Bootstrap:Email"] ?? "";
        if (development && config.GetValue<bool>("Demo:Enabled"))
        {
            var company = new Company { Name = "Horizonte · Empresa demo", Rfc = "DEM010101AAA", Contact = "Laura Méndez", Email = "empresa@example.invalid", Agreement = "Convenio de demostración: consultas generales y seguimiento.", ValidUntil = new(2027, 12, 31) };
            db.Companies.Add(company); await db.SaveChangesAsync();
            var ps = new[] { new Patient { Name = "Mariana López", Curp = "DEMO900101MDFABC01", BirthDate = new(1990, 1, 1), Phone = "5500000101", Sex = "Femenino", CompanyId = company.Id }, new Patient { Name = "Javier Hernández", Curp = "DEMO780505HDFABC02", BirthDate = new(1978, 5, 5), Phone = "5500000102", Sex = "Masculino", CompanyId = company.Id }, new Patient { Name = "Valeria Castro", Curp = "DEMO990314MDFABC03", BirthDate = new(1999, 3, 14), Phone = "5500000103", Sex = "Femenino" } };
            var doctors = new[] { new Staff { Name = "Elena Torres", Kind = "Médico", Specialty = "Medicina general", License = "DEMO-001" }, new Staff { Name = "Gabriel Ruiz", Kind = "Médico", Specialty = "Medicina interna", License = "DEMO-002" }, new Staff { Name = "Sofía Medina", Kind = "Médico", Specialty = "Medicina general", License = "DEMO-003" } };
            var facilities = new[] { new Facility { Name = "Consultorio 01" }, new Facility { Name = "Consultorio 02" }, new Facility { Name = "Habitación 101", Kind = "Habitación" } };
            var services = new[] { new Service { Name = "Consulta general", Price = 650, DurationMinutes = 30 }, new Service { Name = "Seguimiento", Price = 450, DurationMinutes = 30 }, new Service { Name = "Valoración integral", Price = 950, DurationMinutes = 60 } };
            db.Patients.AddRange(ps); db.Staff.AddRange(doctors); db.Staff.Add(new() { Name = "Andrea Flores", Kind = "Enfermería", Specialty = "Enfermería general" }); db.Facilities.AddRange(facilities); db.Services.AddRange(services); await db.SaveChangesAsync();
            var today = DateOnly.FromDateTime(Access.LocalNow());
            for (int i = 0; i < 3; i++) db.Appointments.Add(new() { PatientId = ps[i].Id, CompanyId = ps[i].CompanyId, DoctorId = doctors[i].Id, FacilityId = facilities[i % 2].Id, ServiceId = services[i].Id, Date = today, Time = new(9 + i, 0), DurationMinutes = services[i].DurationMinutes, Status = i == 1 ? "Pendiente" : "Confirmada", Reason = "Consulta de demostración" });
            db.Payments.Add(new() { PatientId = ps[0].Id, CompanyId = company.Id, Concept = "Consulta general · demostración", Amount = 650, Method = "Convenio" });
            db.ClinicalNotes.Add(new() { PatientId = ps[0].Id, DoctorId = doctors[0].Id, AuthorId = 1, Content = "Nota ficticia para explorar el expediente.", Diagnosis = "Valoración de demostración", Treatment = "Seguimiento de demostración", Allergies = "No documentadas" });
            AddUser("recepcion", "Lucía Mendoza", "Recepción"); AddUser("medico", "Elena Torres", "Médico", doctor: doctors[0].Id); AddUser("paciente", "Mariana López", "Paciente", patient: ps[0].Id); AddUser("empresa", "Laura Méndez", "Empresa", company: company.Id); AddUser("auditor", "Carlos Vega", "Auditor"); AddUser("finanzas", "Paula Ortiz", "Administración financiera"); AddUser("soporte", "Luis Silva", "Soporte");
            await EnsureDemoAccessRoles(db);
            await db.SaveChangesAsync();
            foreach (var user in await db.Users.ToListAsync()) db.Notifications.Add(new() { UserId = user.Id, Title = "Bienvenido a Clínica Serena", Message = "Este entorno contiene datos ficticios para explorar el sistema." });
        }
        db.AuditLogs.Add(new() { Action = "Inicialización", Entity = "Sistema", Detail = development ? "Datos ficticios de desarrollo" : "Cuenta inicial creada" }); await db.SaveChangesAsync();
    }
    static string NewPermissions(string name, string existing)
    {
        if (name == "Superadministrador") return string.Join(',', Access.Permissions);
        var permissions = existing.Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
        if (name == "Paciente") { permissions.ExceptWith(["staff.read", "infrastructure.read", "services.read"]); permissions.Add("catalog.read"); }
        if (name == "Médico") { permissions.Add("catalog.read"); permissions.UnionWith(["appointments.notes.read", "appointments.notes.write", "documents.publish"]); }
        if (name is "Recepción" or "Administrador general" or "Administración clínica") permissions.UnionWith(["appointments.confirm", "appointments.checkin", "appointments.notes.read", "appointments.notes.write"]);
        if (name == "Administración clínica") permissions.Add("services.read");
        if (permissions.Contains("documents.write") && name != "Paciente") permissions.Add("documents.publish");
        if (permissions.Contains("reports.read")) permissions.Add("reports.export");
        return string.Join(',', permissions);
    }
    static async Task UpgradeRolePolicy(ClinicDb db)
    {
        foreach (var role in await db.Roles.Where(r => r.PolicyVersion == 0).ToListAsync())
        {
            role.Audience = Access.DefaultAudience(role.Name);
            role.Permissions = NewPermissions(role.Name, role.Permissions);
            role.PolicyVersion = 1;
            db.AuditLogs.Add(new() { Action = "Actualizar política de acceso", Entity = "Rol", RecordId = role.Id.ToString(), Detail = "Alcance explícito y permisos de acción; permisos personalizados previos conservados salvo límites del portal." });
        }
        foreach (var role in await db.Roles.Where(r => r.PolicyVersion < 2).ToListAsync())
        {
            // Add only the new security permissions to default roles; retain other customizations.
            var permissions = role.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries).ToHashSet();
            if (role.Name == "Superadministrador") permissions.UnionWith(["sessions.read", "sessions.revoke", "security.manage"]);
            if (role.Name == "Administrador de usuarios") permissions.UnionWith(["sessions.read", "sessions.revoke"]);
            role.Permissions = string.Join(',', permissions); role.PolicyVersion = 2;
        }
        await db.SaveChangesAsync();
    }
    static async Task EnsureDemoAccessRoles(ClinicDb db)
    {
        foreach (var (username, name, role) in new[] { ("general", "Daniel Ríos", "Administrador general"), ("accesos", "Isabel Ramos", "Administrador de usuarios"), ("coordinacion", "Teresa Soto", "Administración clínica") })
        {
            if (await db.Users.AnyAsync(u => u.Username == username)) continue;
            var user = new User { Username = username, Name = name, Roles = role, Email = $"{username}@example.invalid" };
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, "SerenaDemo!2026"); db.Users.Add(user);
        }
        await db.SaveChangesAsync();
    }
}
