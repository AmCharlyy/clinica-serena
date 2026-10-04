using System.IO;
using System.Security.Cryptography.X509Certificates;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace ClinicaDeploy.Desktop;
public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        if (e.Args.Length == 0) { new MainWindow().Show(); return; }
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
        try
        {
            var a=e.Args;
            switch(a[0])
            {
                case "--render":
                    var view = new MainWindow(); if(a.Length>2) view.ShowPage(int.Parse(a[2]));
                    var content=(FrameworkElement)view.Content;content.Width=1360;content.Height=920;content.Measure(new Size(1360,920));content.Arrange(new Rect(0,0,1360,920));content.UpdateLayout();
                    var bitmap=new RenderTargetBitmap(1360,920,96,96,PixelFormats.Pbgra32);bitmap.Render(content);
                    var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(bitmap));using(var file=File.Create(a[1])) png.Save(file);
                    Shutdown(0);return;
                case "--validate":
                    var errors=DeploymentConfig.Read(a[1]).Validate();if(errors.Count>0) throw new InvalidDataException(string.Join("\n",errors));break;
                case "--pack": SafePackage.Create(a[1],a[2],a[3],a[4]);break;
                case "--extract": SafePackage.Extract(a[1],a[2],a[3]);break;
                case "--extract-backup": SafePackage.Extract(a[1],a[2],a[3],false);break;
                case "--encrypt": case "--decrypt":
                    using(var store=new X509Store(StoreName.My,StoreLocation.LocalMachine))
                    {
                        store.Open(OpenFlags.ReadOnly);var certs=store.Certificates.Find(X509FindType.FindByThumbprint,a[3],false);
                        if(certs.Count!=1) throw new InvalidDataException("Certificado de recuperación ausente.");
                        using var rsa=a[0]=="--encrypt"?certs[0].GetRSAPublicKey():certs[0].GetRSAPrivateKey();
                        if(rsa==null) throw new InvalidDataException("Clave RSA ausente.");
                        if(a[0]=="--encrypt") BackupCipher.Encrypt(a[1],a[2],rsa);else BackupCipher.Decrypt(a[1],a[2],rsa);
                    }break;
                case "--plan":
                    var plan=DeploymentConfig.Read(a[1]);Console.WriteLine(string.Join("\n",plan.Plan()));break;
                case "--run":
                    var config=DeploymentConfig.Read(a[1]);
                    if(a.Length==4 && a[2]=="--operation") config=config with {Operation=a[3],AcceptMaintenance=true};
                    var secret=new Dictionary<string,string>();foreach(var key in new[]{"SERENA_BOOTSTRAP","SERENA_PFX_PASSWORD"}){var value=Environment.GetEnvironmentVariable(key);if(!string.IsNullOrEmpty(value))secret[key]=value;}
                    var reportFolder=config.Operation is "Install" or "Check" or "Diagnostics" ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ClinicaSerena","DeployReports") : Path.Combine(config.Root,"reports");
                    var result=await new DeployRunner().Run(config,secret,Path.Combine(AppContext.BaseDirectory,"Deploy.ps1"),reportFolder,Console.WriteLine);
                    Shutdown(result.Success?0:4);return;
                default: throw new ArgumentException("Modo desconocido. Usa interfaz sin argumentos, --plan archivo.json o --run archivo.json.");
            }
            Shutdown(0);
        }
        catch(Exception ex) { Console.Error.WriteLine("ClinicaDeploy: "+ex.Message);Shutdown(4); }
    }
}
