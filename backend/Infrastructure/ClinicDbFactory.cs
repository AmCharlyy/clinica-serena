using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace Clinica;

public class ClinicDbFactory : IDesignTimeDbContextFactory<ClinicDb>
{
    public ClinicDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ClinicDb>();
        options.UseSqlServer(Environment.GetEnvironmentVariable("ConnectionStrings__Clinic") ?? "Server=localhost;Database=ClinicaDB;Integrated Security=True;Encrypt=True;TrustServerCertificate=False");
        return new ClinicDb(options.Options);
    }
}
