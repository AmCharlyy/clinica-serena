using System.Diagnostics;
using System.Net;
using System.Text.Json;

namespace ClinicaDeploy;

public record CheckResult(string Name, string Status, string Detail);
public record RunResult(bool Success, string Message, List<CheckResult> Checks, string? Recovery = null);
public sealed class DeployRunner
{
    public async Task<RunResult> Run(DeploymentConfig config, IReadOnlyDictionary<string, string> secrets, string script, string reportDirectory, Action<string> progress, CancellationToken cancel = default)
    {
        var errors = config.Validate(config.Operation != "Check" && config.Operation != "Diagnostics");
        if (errors.Count > 0) throw new InvalidDataException(string.Join(Environment.NewLine, errors));
        if (config.Operation == "Install" && (!secrets.TryGetValue("SERENA_BOOTSTRAP", out var password) || !DeploymentConfig.StrongPassword(password))) throw new InvalidDataException("Contraseña inicial: 15–128 caracteres, mayúscula, minúscula y número.");
        Directory.CreateDirectory(reportDirectory);
        var id = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N")[..8];
        var file = Path.Combine(reportDirectory, id + ".config.json"); var resultFile = Path.Combine(reportDirectory, id + ".result.json"); config.Write(file);
        var start = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = System.Text.Encoding.UTF8, StandardErrorEncoding = System.Text.Encoding.UTF8 };
        // Honor the organization's existing execution policy; never weaken AllSigned or a GPO.
        foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-File", script, "-ConfigPath", file, "-ResultPath", resultFile }) start.ArgumentList.Add(arg);
        foreach (var secret in secrets) start.Environment[secret.Key] = secret.Value;
        var log = new List<string>();
        string Redact(string line) { foreach (var value in secrets.Values.Where(v => v.Length > 0).OrderByDescending(v => v.Length)) line = line.Replace(value, "[PROTEGIDO]", StringComparison.Ordinal); return line; }
        using var process = Process.Start(start) ?? throw new IOException("No se pudo iniciar el motor de instalación.");
        // No forced cancellation during migration/backup: terminating SQL can leave an ambiguous state.
        async Task Pump(StreamReader reader) { string? line; while ((line = await reader.ReadLineAsync()) != null) { line = Redact(line); lock (log) log.Add(line); progress(line); } }
        await Task.WhenAll(Pump(process.StandardOutput), Pump(process.StandardError), process.WaitForExitAsync());
        var result = File.Exists(resultFile) ? JsonSerializer.Deserialize<RunResult>(File.ReadAllText(resultFile), DeploymentConfig.Json)! : new RunResult(false, "El motor no dejó un resultado. Revisa el informe, firma/política de ejecución del script y no repitas migraciones sin diagnóstico.", []);
        if (process.ExitCode != 0 && result.Success) result = result with { Success = false };
        result = result with { Message = Redact(result.Message) };
        var body = "<!doctype html><html lang='es'><meta charset='utf-8'><title>Informe ClinicaDeploy</title><style>body{font:16px Segoe UI;margin:40px;color:#183b35;background:#f4f7f5}pre{white-space:pre-wrap;background:white;padding:24px;border-radius:16px}td{padding:12px;border-bottom:1px solid #ddd}</style><h1>Clínica Serena · Informe técnico</h1><p>" + WebUtility.HtmlEncode(result.Message) + "</p><p>UTC: " + id + " · " + WebUtility.HtmlEncode(config.Operation) + "</p><table>" + string.Join("", result.Checks.Select(c => "<tr><td>" + WebUtility.HtmlEncode(c.Name) + "</td><td>" + WebUtility.HtmlEncode(c.Status) + "</td><td>" + WebUtility.HtmlEncode(c.Detail) + "</td></tr>")) + "</table><pre>" + WebUtility.HtmlEncode(string.Join(Environment.NewLine, log)) + "</pre></html>";
        await File.WriteAllTextAsync(Path.Combine(reportDirectory, id + ".html"), body);
        return result;
    }
}
