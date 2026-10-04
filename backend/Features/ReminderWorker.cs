using Microsoft.EntityFrameworkCore;
namespace Clinica;

public sealed class ReminderWorker(IServiceScopeFactory scopes, ILogger<ReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<ClinicDb>(); var now = Access.LocalNow(); var today = DateOnly.FromDateTime(now); var tomorrow = today.AddDays(1);
                var appointments = await db.Appointments.Where(a => (a.Status == "Confirmada" || a.Status == "Pendiente") && a.Date >= today && a.Date <= tomorrow).ToListAsync(stoppingToken);
                foreach (var appointment in appointments.Where(a => a.Date.ToDateTime(a.Time) > now && a.Date.ToDateTime(a.Time) <= now.AddHours(24)))
                {
                    var message = $"Tu cita #{appointment.Id} es el {appointment.Date:dd/MM/yyyy} a las {appointment.Time:HH:mm}.";
                    foreach (var user in await db.Users.Where(u => u.Active && u.PatientId == appointment.PatientId).ToListAsync(stoppingToken))
                        if (!await db.Notifications.AnyAsync(n => n.UserId == user.Id && n.Title == "Tu cita se aproxima" && n.Message == message, stoppingToken)) db.Notifications.Add(new() { UserId = user.Id, Title = "Tu cita se aproxima", Message = message });
                }
                await db.SaveChangesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { logger.LogError(ex, "Error al preparar recordatorios internos"); }
        }
    }
}
