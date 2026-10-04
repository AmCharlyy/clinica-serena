using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace Clinica;

// Upgrade legacy EnsureCreated development databases additively. SQL Server uses EF migrations.
public static class DevelopmentSchema
{
    public static async Task Upgrade(ClinicDb db, StoragePaths paths)
    {
        var columns = new (string Table, string Column, string Definition)[]
        {
            ("Roles", "Audience", "TEXT NOT NULL DEFAULT 'internal'"),
            ("Roles", "PolicyVersion", "INTEGER NOT NULL DEFAULT 0"),
            ("Appointments", "Instructions", "TEXT NOT NULL DEFAULT ''"),
            ("Appointments", "CompanyId", "INTEGER NULL REFERENCES Companies(Id)"),
            ("Payments", "CompanyId", "INTEGER NULL REFERENCES Companies(Id)"),
            ("Documents", "CompanyId", "INTEGER NULL REFERENCES Companies(Id)"),
            ("Users", "MfaEnabled", "INTEGER NOT NULL DEFAULT 0"),
            ("Users", "MfaSecret", "TEXT NOT NULL DEFAULT ''"),
            ("Users", "LastTotpStep", "INTEGER NOT NULL DEFAULT -1"),
            ("Users", "MfaFailures", "INTEGER NOT NULL DEFAULT 0"),
            ("Users", "AccessExpiresAt", "TEXT NULL"),
            ("Users", "AccessReviewedAt", "TEXT NULL"),
            ("Users", "SharedWorkstation", "INTEGER NOT NULL DEFAULT 0"),
            ("AuditLogs", "Seal", "TEXT NOT NULL DEFAULT ''"),
            ("AuthSessions", "EnrollmentExpiresAt", "TEXT NULL")
        };
        await db.Database.OpenConnectionAsync();
        var connection = (SqliteConnection)db.Database.GetDbConnection();
        var missing = new List<(string Table, string Column, string Definition)>();
        foreach (var column in columns)
        {
            await using var command = connection.CreateCommand(); command.CommandText = $"PRAGMA table_info(\"{column.Table}\")";
            await using var reader = await command.ExecuteReaderAsync(); var found = false;
            while (await reader.ReadAsync()) if (reader.GetString(1) == column.Column) found = true;
            if (!found) missing.Add(column);
        }
        var schema = new Dictionary<string, string>
        {
            ["AuthSessions"] = "CREATE TABLE AuthSessions (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL, Version TEXT NOT NULL, SessionId TEXT NOT NULL, UserId INTEGER NOT NULL REFERENCES Users(Id), Stage TEXT NOT NULL, LastActivityAt TEXT NOT NULL, AbsoluteExpiresAt TEXT NOT NULL, RevokedAt TEXT NULL, ReauthenticatedAt TEXT NULL, Ip TEXT NOT NULL, UserAgent TEXT NOT NULL, EnrollmentSecret TEXT NOT NULL, EnrollmentExpiresAt TEXT NULL); CREATE UNIQUE INDEX IX_AuthSessions_SessionId ON AuthSessions(SessionId); CREATE INDEX IX_AuthSessions_UserId ON AuthSessions(UserId);",
            ["RecoveryCodes"] = "CREATE TABLE RecoveryCodes (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL, Version TEXT NOT NULL, UserId INTEGER NOT NULL REFERENCES Users(Id), Hash TEXT NOT NULL, UsedAt TEXT NULL); CREATE UNIQUE INDEX IX_RecoveryCodes_UserId_Hash ON RecoveryCodes(UserId, Hash);",
            ["SecureDrafts"] = "CREATE TABLE SecureDrafts (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, CreatedAt TEXT NOT NULL, UpdatedAt TEXT NOT NULL, Version TEXT NOT NULL, UserId INTEGER NOT NULL REFERENCES Users(Id), DraftKey TEXT NOT NULL, AccessFingerprint TEXT NOT NULL, Ciphertext TEXT NOT NULL, ExpiresAt TEXT NOT NULL); CREATE UNIQUE INDEX IX_SecureDrafts_UserId_DraftKey ON SecureDrafts(UserId, DraftKey);"
        };
        var missingTables = new List<string>();
        foreach (var table in schema.Keys) { await using var check = connection.CreateCommand(); check.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=$name"; check.Parameters.AddWithValue("$name", table); if (Convert.ToInt32(await check.ExecuteScalarAsync()) == 0) missingTables.Add(table); }
        if (missing.Count == 0 && missingTables.Count == 0) return;
        var backupDirectory = Path.Combine(paths.Root, "schema-backups"); Directory.CreateDirectory(backupDirectory);
        var backupPath = Path.Combine(backupDirectory, $"before-security-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}.db");
        await using (var target = new SqliteConnection($"Data Source={backupPath};Pooling=False")) { await target.OpenAsync(); connection.BackupDatabase(target); }
        await using var transaction = await db.Database.BeginTransactionAsync();
        // All identifiers and definitions are compile-time allowlisted above, never request input.
        foreach (var column in missing.Where(x => !missingTables.Contains(x.Table))) { await using var command = connection.CreateCommand(); command.Transaction = (SqliteTransaction)transaction.GetDbTransaction(); command.CommandText = $"ALTER TABLE \"{column.Table}\" ADD COLUMN \"{column.Column}\" {column.Definition}"; await command.ExecuteNonQueryAsync(); }
        foreach (var table in missingTables) { await using var command = connection.CreateCommand(); command.Transaction = (SqliteTransaction)transaction.GetDbTransaction(); command.CommandText = schema[table]; await command.ExecuteNonQueryAsync(); }
        foreach (var table in new[] { "Appointments", "Payments", "Documents" }) { await using var command = connection.CreateCommand(); command.Transaction = (SqliteTransaction)transaction.GetDbTransaction(); command.CommandText = $"CREATE INDEX IF NOT EXISTS \"IX_{table}_CompanyId\" ON \"{table}\" (\"CompanyId\")"; await command.ExecuteNonQueryAsync(); }
        await transaction.CommitAsync();
    }
}
