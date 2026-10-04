using Clinica;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

var temp=Path.Combine(Path.GetTempPath(),"serena-bootstrap-tests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(temp);
var count=0;
void Assert(bool value,string label){if(!value)throw new Exception(label);Console.WriteLine("OK · "+label);count++;}
try
{
    using var rsa=RSA.Create(3072);
    var request=new CertificateRequest("CN=Serena-Isolated-Tests",rsa,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
    using var certificate=request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1),DateTimeOffset.UtcNow.AddDays(1));
    var keys=Path.Combine(temp,"keys");Directory.CreateDirectory(keys);
    var protection=DataProtectionProvider.Create(new DirectoryInfo(keys),b=>b.SetApplicationName("ClinicaSerena").ProtectKeysWithCertificate(certificate));
    var integrity=new AuditIntegrity(protection);
    var options=new DbContextOptionsBuilder<ClinicDb>().UseSqlite($"Data Source={Path.Combine(temp,"bootstrap.db")};Pooling=False").Options;
    await using(var db=new ClinicDb(options,integrity))
    {
        await db.Database.EnsureCreatedAsync();
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{
            ["Demo:Enabled"]="true",
            ["Bootstrap:Password"]="InitialPassword2026!",
            ["Bootstrap:Username"]="responsable",["Bootstrap:Name"]="Responsable de prueba",["Bootstrap:Email"]="responsable@example.invalid",
            ["Bootstrap:ClinicName"]="Clínica de prueba aislada",["Bootstrap:ClinicAddress"]="Dirección configurada",["Bootstrap:ClinicPhone"]="5500000000",["Bootstrap:ClinicEmail"]="clinica@example.invalid"
        }).Build();
        await using(var transaction=await db.Database.BeginTransactionAsync()){await Seed.Initialize(db,config,false);await transaction.CommitAsync();}
        Assert(await db.Users.CountAsync()==1,"Production seed creates exactly one account");
        Assert(await db.Roles.CountAsync()==11,"All role policies remain available");
        Assert(!await db.Patients.AnyAsync()&&!await db.Staff.AnyAsync()&&!await db.Services.AnyAsync()&&!await db.Companies.AnyAsync(),"No fictitious clinical/financial records even if Demo flag is true");
        var user=await db.Users.SingleAsync();Assert(user.Name=="Responsable de prueba"&&user.Username=="responsable"&&user.Email=="responsable@example.invalid","Real bootstrap identity is respected");
        Assert(user.MustChangePassword,"Initial production password must be changed");
        Assert(new PasswordHasher<User>().VerifyHashedPassword(user,user.PasswordHash,"InitialPassword2026!")!=PasswordVerificationResult.Failed,"Password is hashed and usable");
        var clinic=await db.Settings.SingleAsync();Assert(clinic.Name=="Clínica de prueba aislada"&&clinic.Address=="Dirección configurada","Production clinic settings contain no hardcoded demonstration identity");
        await Seed.Initialize(db,config,false);Assert(await db.Users.CountAsync()==1,"Bootstrap repeated does not reset credentials or add a second admin");
        var log=await db.AuditLogs.FirstAsync();Assert(integrity.Verify(log)=="Verificado","Initial audit is sealed");
        using var transferred=X509CertificateLoader.LoadPkcs12(certificate.Export(X509ContentType.Pfx,"isolated-transfer-password"),"isolated-transfer-password",X509KeyStorageFlags.EphemeralKeySet);
        var copied=Path.Combine(temp,"copied-keys");Directory.CreateDirectory(copied);foreach(var file in Directory.EnumerateFiles(keys))File.Copy(file,Path.Combine(copied,Path.GetFileName(file)));
        var restored=DataProtectionProvider.Create(new DirectoryInfo(copied),b=>b.SetApplicationName("ClinicaSerena").ProtectKeysWithCertificate(transferred));
        Assert(new AuditIntegrity(restored).Verify(log)=="Verificado","Certificate + protected key ring preserve audit seals across provider reconstruction");
        var secret=protection.CreateProtector("Clinica.Totp.Test").Protect("TEST-NOT-A-REAL-TOTP");Assert(restored.CreateProtector("Clinica.Totp.Test").Unprotect(secret)=="TEST-NOT-A-REAL-TOTP","Protected authentication secret survives controlled recovery");
        Assert(Directory.EnumerateFiles(keys).All(file=>File.ReadAllText(file).Contains("encryptedSecret")),"Key ring is encrypted with certificate");
    }
    Console.WriteLine($"PASS: {count} bootstrap/recovery assertions on isolated SQLite; not SQL/IIS certification.");
}
finally{if(temp.StartsWith(Path.Combine(Path.GetTempPath(),"serena-bootstrap-tests-"),StringComparison.OrdinalIgnoreCase))Directory.Delete(temp,true);}
