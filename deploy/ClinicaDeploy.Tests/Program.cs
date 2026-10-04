using ClinicaDeploy;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

var folder=Path.Combine(Path.GetTempPath(),"serena-deploy-tests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
var count=0;
void Assert(bool value,string label){if(!value)throw new Exception("FAILED: "+label);Console.WriteLine("OK · "+label);count++;}
void Reject(Action action,string label){try{action();}catch(Exception ex) when(ex is InvalidDataException or CryptographicException or IOException){Assert(true,label);return;}throw new Exception("FAILED: accepted "+label);}
try
{
    var c=new DeploymentConfig();Assert(c.Validate().Count==0,"Defaults are safe to plan, not to apply");
    Assert(c.Validate(true).Count>=4,"New installation requires package/hash/TLS/admin/key custody");
    Assert(!(c with{Operation="Update"}).Validate(true).All(e=>!e.Contains("mantenimiento")),"Update requires maintenance authorization");
    foreach(var path in new[]{@"C:\",@"C:\Windows\data",@"C:\Users\Public\clinic",@"C:\safe\..\Users",@"\\server\share",@"C:\clinic:stream"})Assert(!DeploymentConfig.SafePath(path),"Reject broad/system/network/ADS path: "+path);
    Assert((c with{DataPath=c.Root+@"\data"}).Validate().Count>0,"Reject nested data and installation roots");
    Assert((c with{SqlServer="remote-db"}).Validate().Count>0,"Do not silently deploy remote SQL");
    Assert(!DeploymentConfig.ValidScope("Any")&&!DeploymentConfig.ValidScope("0.0.0.0/0")&&DeploymentConfig.ValidScope("192.168.1.0/24,10.10.1.5"),"Narrow IPv4 firewall scopes");
    Assert(DeploymentConfig.StrongPassword("StrongPassword2026!")&&!DeploymentConfig.StrongPassword("weak"),"Bootstrap password rules");
    foreach(var name in new[]{"../escape","/absolute","a\\b","a:b","a/../b","a./b","CON.txt","COM1","x//y","x/"})Assert(!SafePackage.SafeEntry(name),"Reject unsafe ZIP entry: "+name);
    Assert(SafePackage.SafeEntry("wwwroot/assets/app.js"),"Accept ordinary package path");
    var source=Path.Combine(folder,"source");Directory.CreateDirectory(Path.Combine(source,"wwwroot"));File.WriteAllText(Path.Combine(source,"Clinica.Api.dll"),"test assembly");File.WriteAllText(Path.Combine(source,"web.config"),"test config");File.WriteAllText(Path.Combine(source,"wwwroot","index.html"),"<p>test</p>");
    var package=Path.Combine(folder,"app.zip");SafePackage.Create(source,package,"ClinicaSerena","1.0.0");var hash=SafePackage.Hash(package);
    var output=Path.Combine(folder,"extracted");var manifest=SafePackage.Extract(package,output,hash);Assert(manifest.Files.Count==3&&File.Exists(Path.Combine(output,"Clinica.Api.dll")),"Complete manifest extraction");
    Reject(()=>SafePackage.Extract(package,output,hash),"Never overwrite an extraction destination");
    Reject(()=>SafePackage.Extract(package,Path.Combine(folder,"bad-hash"),new string('0',64)),"Reject package SHA mismatch before extraction");
    var evil=Path.Combine(folder,"evil.zip");using(var zip=ZipFile.Open(evil,ZipArchiveMode.Create)){using(var writer=new StreamWriter(zip.CreateEntry("../escape.txt").Open()))writer.Write("escape");using(var writer=new StreamWriter(zip.CreateEntry("manifest.json").Open()))writer.Write("{}");}
    Reject(()=>SafePackage.Extract(evil,Path.Combine(folder,"evil-output"),SafePackage.Hash(evil)),"ZIP traversal attack blocked");Assert(!File.Exists(Path.Combine(folder,"escape.txt")),"No escaped file written");
    var corrupt=Path.Combine(folder,"corrupt.zip");File.Copy(package,corrupt);using(var zip=ZipFile.Open(corrupt,ZipArchiveMode.Update)){zip.GetEntry("Clinica.Api.dll")!.Delete();using var writer=new StreamWriter(zip.CreateEntry("Clinica.Api.dll").Open());writer.Write("tampered");}
    Reject(()=>SafePackage.Extract(corrupt,Path.Combine(folder,"corrupt-output"),SafePackage.Hash(corrupt)),"Internal manifest corruption blocked even if ZIP hash matches");
    File.WriteAllText(Path.Combine(source,"appsettings.Local.json"),"{}");var leak=Path.Combine(folder,"leak.zip");SafePackage.Create(source,leak,"ClinicaSerena","1.0.0");Reject(()=>SafePackage.Extract(leak,Path.Combine(folder,"leak-output"),SafePackage.Hash(leak)),"Reject local configuration in release");
    using var rsa=RSA.Create(3072);var encrypted=Path.Combine(folder,"backup.serena");BackupCipher.Encrypt(package,encrypted,rsa);var plain=Path.Combine(folder,"restored.zip");BackupCipher.Decrypt(encrypted,plain,rsa);Assert(SafePackage.Hash(plain)==hash,"Streaming backup round-trip");
    using var wrong=RSA.Create(3072);Reject(()=>BackupCipher.Decrypt(encrypted,Path.Combine(folder,"wrong.zip"),wrong),"Wrong private key blocked");
    var modified=Path.Combine(folder,"modified.serena");var bytes=File.ReadAllBytes(encrypted);bytes[^40]^=1;File.WriteAllBytes(modified,bytes);var plaintext=Path.Combine(folder,"tampered.zip");Reject(()=>BackupCipher.Decrypt(modified,plaintext,rsa),"Authenticated ciphertext tampering blocked");Assert(!File.Exists(plaintext),"No plaintext written before full MAC validation");
    Reject(()=>BackupCipher.Encrypt(package,encrypted,rsa),"Never overwrite encrypted backups");
    var configFile=Path.Combine(folder,"config.json");c.Write(configFile);Assert(!File.ReadAllText(configFile).Contains("Password"),"Config export contains no password properties");
    Assert(DeploymentConfig.Read(configFile)==c,"Configuration serialization round-trip");
    Assert((c with{Operation="Restore",RecoveryDatabase=c.Database}).Validate(true).Any(e=>e.Contains("sobrescribir")),"Restore cannot use active database name");
    Assert((c with{Operation="Update"}).Plan().Any(s=>s.Contains("sin rollback")),"Plan documents migration rollback boundary");
    Console.WriteLine($"PASS: {count} assertions. No IIS, SQL or firewall changes.");
}
finally{if(folder.StartsWith(Path.Combine(Path.GetTempPath(),"serena-deploy-tests-"),StringComparison.OrdinalIgnoreCase))Directory.Delete(folder,true);}
