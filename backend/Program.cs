using Clinica;
using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography.X509Certificates;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true);
// Environment overrides are transient during bootstrap; passwords never belong in Local.json.
builder.Configuration.AddEnvironmentVariables();
var paths = new StoragePaths(Path.GetFullPath(builder.Configuration["Storage:Root"] ?? "../data"));
Directory.CreateDirectory(paths.Root); Directory.CreateDirectory(paths.Documents); Directory.CreateDirectory(paths.Backups); Directory.CreateDirectory(Path.Combine(paths.Root, "keys"));
builder.Services.AddSingleton(paths);
builder.Services.AddSingleton<AuditIntegrity>();
builder.Services.AddScoped<SessionSecurity>();
var protection = builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(paths.Root, "keys"))).SetApplicationName("ClinicaSerena");
var keyCertificate = builder.Configuration["DataProtection:CertificateThumbprint"];
if (!string.IsNullOrWhiteSpace(keyCertificate))
{
    using var store = new X509Store(StoreName.My, StoreLocation.LocalMachine); store.Open(OpenFlags.ReadOnly);
    var certificates = store.Certificates.Find(X509FindType.FindByThumbprint, keyCertificate, false);
    if (certificates.Count != 1 || !certificates[0].HasPrivateKey) throw new InvalidOperationException("El certificado de protección de datos no está disponible.");
    protection.ProtectKeysWithCertificate(certificates[0]);
}
else if (OperatingSystem.IsWindows()) protection.ProtectKeysWithDpapi();
var provider = builder.Configuration["Database:Provider"];
if (provider == "Sqlite" && !builder.Environment.IsDevelopment()) throw new InvalidOperationException("SQLite está habilitado únicamente en desarrollo.");
var connection = builder.Configuration.GetConnectionString("Clinic") ?? throw new InvalidOperationException("Configure ConnectionStrings__Clinic.");
if (string.IsNullOrWhiteSpace(connection)) throw new InvalidOperationException("Configure ConnectionStrings__Clinic antes de iniciar la API.");
builder.Services.AddDbContext<ClinicDb>(o => { if (provider == "Sqlite") o.UseSqlite(connection); else o.UseSqlServer(connection); });
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles);
builder.Services.AddAntiforgery(o => { o.HeaderName = "X-CSRF-TOKEN"; o.Cookie.Name = "Clinica.Csrf"; o.Cookie.SameSite = SameSiteMode.Strict; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; });
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "Clinica.Session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Strict; o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(8); o.SlidingExpiration = false;
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; }; o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
    o.Events.OnValidatePrincipal = async c =>
    {
        await c.HttpContext.RequestServices.GetRequiredService<SessionSecurity>().Validate(c);
    };
});
builder.Services.AddAuthorization(o => { foreach (var permission in Access.Permissions) o.AddPolicy(permission, p => p.RequireAuthenticatedUser().RequireClaim("permission", permission)); });
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429; o.AddPolicy("login", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new() { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("factor", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new() { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.AddPolicy("backup", c => RateLimitPartition.GetConcurrencyLimiter(c.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "local", _ => new() { PermitLimit = 1, QueueLimit = 0 }));
});
builder.Services.AddProblemDetails(); builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 11 * 1024 * 1024);
builder.Services.AddHostedService<ReminderWorker>();
builder.Services.AddHostedService<SecurityCleanupWorker>();
var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async c =>
{
    var error = c.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
    var status = error is DbUpdateConcurrencyException ? 409 : error is DbUpdateException ? 409 : error is BadHttpRequestException or System.Text.Json.JsonException ? 400 : 500;
    c.Response.StatusCode = status; await c.Response.WriteAsJsonAsync(new { message = status == 409 ? "El registro cambió o existe un conflicto de datos. Recarga e inténtalo nuevamente." : status == 400 ? "La solicitud contiene datos inválidos." : "No fue posible completar la operación. Consulta los registros del servidor." });
}));
if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
app.Use(async (c, next) =>
{
    c.Response.Headers.XContentTypeOptions = "nosniff"; c.Response.Headers["Referrer-Policy"] = "same-origin"; c.Response.Headers["X-Frame-Options"] = "DENY";
    if (c.Request.Path.StartsWithSegments("/api")) c.Response.Headers.CacheControl = "no-store";
    await next();
});
app.UseDefaultFiles(); app.UseStaticFiles(); app.UseAuthentication();
app.Use(async (c, next) =>
{
    await next();
    if (c.Response.StatusCode == 403 && c.User.Identity?.IsAuthenticated == true) { var db = c.RequestServices.GetRequiredService<ClinicDb>(); db.Audit(c, "Acceso denegado", "Permiso", detail: c.Request.Path, result: "Denegado"); await db.SaveChangesAsync(); }
});
app.UseAuthorization(); app.UseRateLimiter();
app.Use(async (c, next) =>
{
    var stage = c.User.FindFirstValue("stage"); var path = (c.Request.Path.Value ?? "").ToLowerInvariant();
    if (c.User.Identity?.IsAuthenticated == true && stage != "full" && path.StartsWith("/api/"))
    {
        var allowed = path is "/api/auth/me" or "/api/auth/csrf" or "/api/auth/logout" or "/api/auth/login" || (stage == "password" && path == "/api/auth/password") || (stage == "mfa" && path == "/api/auth/mfa/verify") || (stage == "enrollment" && path is "/api/auth/mfa/enroll" or "/api/auth/mfa/confirm");
        if (!allowed) { c.Response.StatusCode = 403; await c.Response.WriteAsJsonAsync(new { code = "authentication_incomplete", message = "Completa la contraseña inicial y el segundo factor antes de acceder al sistema." }); return; }
    }
    if (c.Request.Path.StartsWithSegments("/api") && c.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE")
    {
        try { await c.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(c); } catch (AntiforgeryValidationException) { c.Response.StatusCode = 400; await c.Response.WriteAsJsonAsync(new { message = "La sesión de seguridad cambió. Recarga la página." }); return; }
    }
    if (c.User.Identity?.IsAuthenticated == true && stage == "full" && SessionSecurity.Sensitive(c))
    {
        var session = await c.RequestServices.GetRequiredService<SessionSecurity>().Current(c);
        if (session == null || !SessionSecurity.Fresh(session)) { c.Response.StatusCode = 428; await c.Response.WriteAsJsonAsync(new { code = "step_up_required", message = "Confirma tu contraseña y segundo factor para esta acción sensible." }); return; }
    }
    await next();
});
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", application = "ClinicaSerena" }));
app.MapGet("/api/health/ready", async (ClinicDb db) => await db.Database.CanConnectAsync()
    ? Results.Ok(new { status = "ready" }) : Results.Json(new { status = "unavailable" }, statusCode: 503));
app.MapAuth(); app.MapSecurity(); app.MapClinical(); app.MapManagement(); app.MapStorage(); app.MapWorkbench();
app.MapFallback(async c => { if (c.Request.Path.StartsWithSegments("/api")) { c.Response.StatusCode = 404; return; } var index = Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "index.html"); if (File.Exists(index)) { c.Response.ContentType = "text/html"; await c.Response.SendFileAsync(index); } else { c.Response.StatusCode = 404; } });
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ClinicDb>();
    if (app.Environment.IsDevelopment() && db.Database.IsSqlite()) { await db.Database.EnsureCreatedAsync(); await DevelopmentSchema.Upgrade(db, paths); }
    else if (builder.Configuration.GetValue<bool>("Database:ApplyMigrations")) await db.Database.MigrateAsync();
    else if (!await db.Database.CanConnectAsync()) throw new InvalidOperationException("SQL Server no está disponible. Ejecuta las migraciones antes de iniciar.");
    await using var transaction = await db.Database.BeginTransactionAsync(); await Seed.Initialize(db, builder.Configuration, app.Environment.IsDevelopment()); await transaction.CommitAsync();
}
// Only the elevated deployment tool uses this mode, with a temporary migration identity.
if (args.Contains("--deploy-initialize")) { await app.DisposeAsync(); return; }
await app.RunAsync();
public partial class Program { }
