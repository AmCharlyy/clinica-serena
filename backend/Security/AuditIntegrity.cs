using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
namespace Clinica;

// Authenticated per-event seals detect edits, not deletion by a database administrator.
public sealed class AuditIntegrity(IDataProtectionProvider provider)
{
    private readonly IDataProtector protector = provider.CreateProtector("Clinica.Audit.v1");
    private static string Canonical(AuditLog row) => JsonSerializer.Serialize(new { row.Version, createdTicks = row.CreatedAt.Ticks, row.UserId, row.Username, row.Action, row.Entity, row.RecordId, row.Ip, row.Result, row.Detail });
    public string Seal(AuditLog row) => protector.Protect(Canonical(row));
    public string Verify(AuditLog row)
    {
        if (string.IsNullOrEmpty(row.Seal)) return "Histórico sin sello";
        try { return CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(protector.Unprotect(row.Seal)), Encoding.UTF8.GetBytes(Canonical(row))) ? "Verificado" : "Alterado"; }
        catch (CryptographicException) { return "Alterado o clave no disponible"; }
    }
}
