using Microsoft.EntityFrameworkCore;
namespace Clinica;

public class ClinicDb(DbContextOptions<ClinicDb> options, AuditIntegrity? integrity = null) : DbContext(options)
{
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<RecoveryCode> RecoveryCodes => Set<RecoveryCode>();
    public DbSet<SecureDraft> SecureDrafts => Set<SecureDraft>();
    public DbSet<User> Users => Set<User>(); public DbSet<Role> Roles => Set<Role>();
    public DbSet<Patient> Patients => Set<Patient>(); public DbSet<Staff> Staff => Set<Staff>();
    public DbSet<Facility> Facilities => Set<Facility>(); public DbSet<Service> Services => Set<Service>();
    public DbSet<Company> Companies => Set<Company>(); public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<AppointmentChange> AppointmentChanges => Set<AppointmentChange>();
    public DbSet<ClinicalNote> ClinicalNotes => Set<ClinicalNote>(); public DbSet<Document> Documents => Set<Document>();
    public DbSet<Payment> Payments => Set<Payment>(); public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Notification> Notifications => Set<Notification>(); public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ClinicSettings> Settings => Set<ClinicSettings>(); public DbSet<Backup> Backups => Set<Backup>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AuthSession>().HasIndex(x => x.SessionId).IsUnique();
        b.Entity<AuthSession>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId);
        b.Entity<RecoveryCode>().HasIndex(x => new { x.UserId, x.Hash }).IsUnique();
        b.Entity<RecoveryCode>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId);
        b.Entity<SecureDraft>().HasIndex(x => new { x.UserId, x.DraftKey }).IsUnique();
        b.Entity<SecureDraft>().HasOne<User>().WithMany().HasForeignKey(x => x.UserId);
        b.Entity<User>().HasIndex(x => x.Username).IsUnique(); b.Entity<Patient>().HasIndex(x => x.Curp).IsUnique();
        b.Entity<Role>().HasIndex(x => x.Name).IsUnique();
        b.Entity<Patient>().HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Appointment>().HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Payment>().HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Document>().HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<User>().HasOne<Patient>().WithMany().HasForeignKey(x => x.PatientId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<User>().HasOne<Staff>().WithMany().HasForeignKey(x => x.DoctorId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<User>().HasOne<Company>().WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Appointment>().HasIndex(x => new { x.Date, x.DoctorId }); b.Entity<Appointment>().HasIndex(x => new { x.Date, x.FacilityId });
        b.Entity<Appointment>().HasIndex(x => new { x.Date, x.PatientId });
        b.Entity<Payment>().Property(x => x.Amount).HasPrecision(18, 2); b.Entity<Service>().Property(x => x.Price).HasPrecision(18, 2);
        b.Entity<Invoice>().HasIndex(x => x.PaymentId).IsUnique();
        b.Entity<AppointmentChange>().HasOne<Appointment>().WithMany().HasForeignKey(x => x.AppointmentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<ClinicalNote>().HasOne<Appointment>().WithMany().HasForeignKey(x => x.AppointmentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Payment>().HasOne<Appointment>().WithMany().HasForeignKey(x => x.AppointmentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<AuditLog>().HasIndex(x => x.CreatedAt);
        foreach (var entity in b.Model.GetEntityTypes())
        {
            entity.FindProperty(nameof(Entity.Version))!.IsConcurrencyToken = true;
            foreach (var fk in entity.GetForeignKeys()) fk.DeleteBehavior = DeleteBehavior.Restrict;
        }
    }
    private void PrepareChanges()
    {
        foreach (var entry in ChangeTracker.Entries<AuditLog>())
        {
            if (entry.State is EntityState.Modified or EntityState.Deleted) throw new InvalidOperationException("La auditoría es de solo adición.");
            if (entry.State == EntityState.Added) entry.Entity.Seal = (integrity ?? throw new InvalidOperationException("Falta protección de auditoría.")).Seal(entry.Entity);
        }
        foreach (var entry in ChangeTracker.Entries<Entity>().Where(e => e.State == EntityState.Modified))
        {
            entry.Entity.UpdatedAt = DateTime.UtcNow; entry.Entity.Version = Guid.NewGuid();
        }
    }
    public override Task<int> SaveChangesAsync(CancellationToken token = default) => SaveChangesAsync(true, token);
    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken token = default) { PrepareChanges(); return base.SaveChangesAsync(acceptAllChangesOnSuccess, token); }
    public override int SaveChanges() => SaveChanges(true);
    public override int SaveChanges(bool acceptAllChangesOnSuccess) { PrepareChanges(); return base.SaveChanges(acceptAllChangesOnSuccess); }
}
