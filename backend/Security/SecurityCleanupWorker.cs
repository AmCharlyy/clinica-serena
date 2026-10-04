using Microsoft.EntityFrameworkCore;
namespace Clinica;

// Expired drafts are temporary, not medical records. Audit events are never purged here.
public sealed class SecurityCleanupWorker(IServiceScopeFactory scopes, ILogger<SecurityCleanupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(15));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<ClinicDb>(); var now = DateTime.UtcNow;
                await db.SecureDrafts.Where(x => x.ExpiresAt <= now).ExecuteDeleteAsync(stoppingToken);
                var retention = now.AddDays(-30);
                await db.AuthSessions.Where(x => x.AbsoluteExpiresAt < retention || x.RevokedAt < retention).ExecuteDeleteAsync(stoppingToken);
            }
            catch (Exception exception) when (!stoppingToken.IsCancellationRequested) { logger.LogError(exception, "No fue posible depurar datos temporales de seguridad."); }
        }
    }
}
