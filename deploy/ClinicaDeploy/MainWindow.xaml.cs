using System.Diagnostics;
using System.IO;
using System.Security.Principal;
using System.Security.Cryptography.X509Certificates;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;

namespace ClinicaDeploy.Desktop;
public partial class MainWindow : Window
{
    int page; bool running; string reports="";
    readonly string[] titles=["Tu clínica, lista para cuidar.","Un servidor preparado.","Cada cosa en su lugar.","Seguridad desde el primer día.","Revisa. Confirma. Instala.","Un resultado, sin dudas."];
    readonly string[] subtitles=["Un asistente claro para preparar, proteger y mantener tu sistema local.","Comprueba antes de cambiar. Cada requisito tiene una explicación.","Configura el entorno y los datos reales de tu clínica.","Identidades separadas, HTTPS y un camino de recuperación.","Nada oculto: este es el plan que se ejecutará sobre el servidor.","Consulta la ejecución y conserva el informe para la entrega técnica."];
    public MainWindow()
    {
        InitializeComponent();Steps.SelectedIndex=0;
        Privilege.Text=Admin()?"●  Administrador de Windows":"○  Revisión sin elevación";
        Closing+=(_,e)=>{if(running){e.Cancel=true;MessageBox.Show("Hay una operación en curso. Espera su resultado para no interrumpir SQL o dejar el sitio en un estado incierto.","Operación en curso",MessageBoxButton.OK,MessageBoxImage.Warning);}};
    }
    static bool Admin()=>new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
    public void ShowPage(int value)
    {
        if(Pages==null)return;page=Math.Clamp(value,0,5);
        foreach(UIElement child in Pages.Children)child.Visibility=Visibility.Collapsed;
        Pages.Children[page].Visibility=Visibility.Visible;Heading.Text=titles[page];Subtitle.Text=subtitles[page];Eyebrow.Text=$"PASO {page+1:00} / 06 · CLINICADEPLOY";
        BackButton.IsEnabled=page>0 && !running;NextButton.IsEnabled=!running;
        NextButton.Content=page==0?"Comenzar  →":page==4?"Ejecutar operación":page==5?"Volver al inicio":"Continuar  →";
        if(Steps.SelectedIndex!=page)Steps.SelectedIndex=page;
        if(page==4)
        {
            ConfirmCheck.IsChecked=false;
            try
            {
                var c=Config();
                ReviewSummary.Text=$"{c.ClinicName} · {((ComboBoxItem)Operation.SelectedItem).Content}\nDestino: {Environment.MachineName} · IIS {c.Site} / {c.Pool}\nAcceso: https://{c.Host}:{c.Port}\nSQL local: {c.SqlServer} · {c.Database}\nPrograma: {c.Root}\nDatos: {c.DataPath}\nRespaldos: {c.BackupPath} · {(c.ScheduleBackup ? "diario "+c.BackupTime : "sin tarea diaria")}\nRegla HTTPS: {(c.EnableFirewall ? c.FirewallScope : "sin regla creada por el asistente")}";
                if(c.Operation=="Restore")ReviewSummary.Text+=$"\nRecuperar en: {c.RecoveryDatabase} · {c.RecoveryPath}";
                PlanText.Text=string.Join("\n\n",c.Plan().Select((p,i)=>$"{i+1:00}   {p}"));
            }
            catch(Exception ex){PlanText.Text=ex.Message;}
        }
    }
    void StepChanged(object sender,SelectionChangedEventArgs e){if(!running)ShowPage(Steps.SelectedIndex);}
    void Back(object sender,RoutedEventArgs e)=>ShowPage(page-1);
    async void Next(object sender,RoutedEventArgs e)
    {
        if(page==4)
        {
            if(ConfirmCheck.IsChecked!=true){Alert("Confirma que revisaste el alcance y las advertencias.");return;}
            try{var c=Config();var errors=c.Validate(true);if(errors.Count>0){Alert(string.Join("\n",errors));return;}await Execute(c);}catch(Exception ex){Alert(ex.Message);}
        }
        else ShowPage(page==5?0:page+1);
    }
    void OperationChanged(object sender,SelectionChangedEventArgs e){if(ConfirmCheck!=null)ConfirmCheck.IsChecked=false;}
    string Mode=>(Operation.SelectedItem as ComboBoxItem)?.Tag?.ToString()??"Install";
    DeploymentConfig Config()=>new()
    {
        Operation=Mode,Package=PackageBox.Text.Trim(),ExpectedPackageSha256=HashBox.Text.Trim(),Host=HostBox.Text.Trim(),Port=int.TryParse(PortBox.Text,out var p)?p:0,
        Root=RootBox.Text.Trim(),DataPath=DataBox.Text.Trim(),BackupPath=BackupBox.Text.Trim(),Site=SiteBox.Text.Trim(),Pool=PoolBox.Text.Trim(),SqlServer=SqlBox.Text.Trim(),Database=DatabaseBox.Text.Trim(),
        ClinicName=ClinicBox.Text.Trim(),ClinicAddress=AddressBox.Text.Trim(),ClinicPhone=PhoneBox.Text.Trim(),ClinicEmail=EmailBox.Text.Trim(),TlsThumbprint=TlsBox.Text.Trim().Replace(" ",""),
        AdminUsername=AdminUserBox.Text.Trim(),AdminName=AdminNameBox.Text.Trim(),AdminEmail=AdminEmailBox.Text.Trim(),EnableFirewall=FirewallCheck.IsChecked==true,FirewallScope=ScopeBox.Text.Trim(),
        ScheduleBackup=ScheduleCheck.IsChecked==true,BackupTime=TimeBox.Text.Trim(),AcceptMaintenance=MaintenanceCheck.IsChecked==true,AcceptRecoveryKeyCustody=CustodyCheck.IsChecked==true,
        BackupFile=RecoveryFileBox.Text.Trim(),RecoveryDatabase=RecoveryDbBox.Text.Trim(),RecoveryPath=RecoveryPathBox.Text.Trim(),RecoveryThumbprint=RecoveryKeyBox.Text.Trim()
    };
    void SetConfig(DeploymentConfig c)
    {
        PackageBox.Text=c.Package;HashBox.Text=c.ExpectedPackageSha256;HostBox.Text=c.Host;PortBox.Text=c.Port.ToString();RootBox.Text=c.Root;DataBox.Text=c.DataPath;BackupBox.Text=c.BackupPath;
        SiteBox.Text=c.Site;PoolBox.Text=c.Pool;SqlBox.Text=c.SqlServer;DatabaseBox.Text=c.Database;ClinicBox.Text=c.ClinicName;AddressBox.Text=c.ClinicAddress;PhoneBox.Text=c.ClinicPhone;EmailBox.Text=c.ClinicEmail;
        TlsBox.Text=c.TlsThumbprint;AdminUserBox.Text=c.AdminUsername;AdminNameBox.Text=c.AdminName;AdminEmailBox.Text=c.AdminEmail;FirewallCheck.IsChecked=c.EnableFirewall;ScopeBox.Text=c.FirewallScope;
        ScheduleCheck.IsChecked=c.ScheduleBackup;TimeBox.Text=c.BackupTime;CustodyCheck.IsChecked=false;MaintenanceCheck.IsChecked=false;ConfirmCheck.IsChecked=false;
        RecoveryFileBox.Text=c.BackupFile;RecoveryDbBox.Text=c.RecoveryDatabase;RecoveryPathBox.Text=c.RecoveryPath;RecoveryKeyBox.Text=c.RecoveryThumbprint;
        foreach(ComboBoxItem item in Operation.Items)if(item.Tag.ToString()==c.Operation)Operation.SelectedItem=item;
    }
    static void Alert(string text)=>MessageBox.Show(text,"Clínica Serena",MessageBoxButton.OK,MessageBoxImage.Information);
    static bool Confirm(string text)=>MessageBox.Show(text,"Confirma el alcance",MessageBoxButton.YesNo,MessageBoxImage.Warning)==MessageBoxResult.Yes;
    async Task Execute(DeploymentConfig c)
    {
        if(running)return;
        if(c.Operation is not ("Check" or "Diagnostics") && !Admin()){Alert("Abre el asistente como administrador de Windows. No se modificará el servidor desde esta sesión.");return;}
        var secret=new Dictionary<string,string>();if(c.Operation=="Install")secret["SERENA_BOOTSTRAP"]=AdminPassword.Password;if(c.Operation=="ExportKey")secret["SERENA_PFX_PASSWORD"]=ExportPassword.Password;
        try
        {
            reports=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ClinicaSerena","DeployReports");
            ShowPage(5);running=true;Steps.IsEnabled=false;NextButton.IsEnabled=false;BackButton.IsEnabled=false;Progress.IsIndeterminate=true;ResultTitle.Text="Operación en curso";LogBox.Clear();ResultMessage.Text="No cierres el asistente. Los mensajes no incluyen contraseñas ni información clínica.";
            var result=await new DeployRunner().Run(c,secret,Path.Combine(AppContext.BaseDirectory,"Deploy.ps1"),reports,line=>Dispatcher.Invoke(()=>{LogBox.AppendText(line+Environment.NewLine);LogBox.ScrollToEnd();}));
            ResultTitle.Text=result.Success?"Operación completada":"Hay puntos que requieren atención";ResultMessage.Text=result.Message+(result.Recovery==null?"":"\n"+result.Recovery);CheckItems.ItemsSource=result.Checks;
        }
        catch(Exception ex){ResultTitle.Text="No se completó la operación";ResultMessage.Text=ex.Message;}
        finally{running=false;secret.Clear();AdminPassword.Clear();ExportPassword.Clear();Progress.IsIndeterminate=false;Steps.IsEnabled=true;ShowPage(5);}
    }
    async void CheckServer(object sender,RoutedEventArgs e){try{await Execute(Config() with {Operation="Check"});}catch(Exception ex){Alert(ex.Message);}}
    async void EnableIis(object sender,RoutedEventArgs e){if(Confirm("Se habilitarán componentes IIS en esta máquina. No se reiniciará automáticamente. ¿Continuar?"))await Execute(Config() with {Operation="EnableIis"});}
    async void InstallHosting(object sender,RoutedEventArgs e)
    {
        var dialog=new OpenFileDialog{Filter="Hosting Bundle Microsoft (*.exe)|*.exe"};if(dialog.ShowDialog()!=true)return;
        if(Confirm("Se verificará la firma Microsoft y se ejecutará el instalador seleccionado. Puede requerir reinicio coordinado. ¿Continuar?"))await Execute(Config() with {Operation="Hosting",HostingBundle=dialog.FileName});
    }
    void ChoosePackage(object sender,RoutedEventArgs e){var dialog=new OpenFileDialog{Filter="Publicación clínica (*.zip)|*.zip"};if(dialog.ShowDialog()==true){PackageBox.Text=dialog.FileName;var sha=dialog.FileName+".sha256";if(File.Exists(sha))HashBox.Text=File.ReadAllText(sha).Trim().Split(' ')[0];}}
    void ChooseBackup(object sender,RoutedEventArgs e){var dialog=new OpenFileDialog{Filter="Respaldo Serena (*.serena)|*.serena"};if(dialog.ShowDialog()==true)RecoveryFileBox.Text=dialog.FileName;}
    void ImportConfig(object sender,RoutedEventArgs e){var dialog=new OpenFileDialog{Filter="Configuración sin secretos (*.json)|*.json"};if(dialog.ShowDialog()==true){try{SetConfig(DeploymentConfig.Read(dialog.FileName));}catch(Exception ex){Alert(ex.Message);}}}
    void ExportConfig(object sender,RoutedEventArgs e){var dialog=new SaveFileDialog{Filter="Configuración sin secretos (*.json)|*.json",FileName="clinica-config.json"};if(dialog.ShowDialog()==true){Config().Write(dialog.FileName);Alert("Configuración exportada sin contraseñas. Contiene rutas y datos administrativos: compártela solo con personal autorizado.");}}
    void ListCertificates(object sender,RoutedEventArgs e)
    {
        using var store=new X509Store(StoreName.My,StoreLocation.LocalMachine);store.Open(OpenFlags.ReadOnly);
        Certificates.Text=string.Join("\n\n",store.Certificates.Cast<X509Certificate2>().Where(c=>c.HasPrivateKey).OrderBy(c=>c.Subject).Select(c=>$"{c.Subject}\n{c.Thumbprint} · vence {c.NotAfter:yyyy-MM-dd}"));
        if(Certificates.Text.Length==0)Certificates.Text="No hay certificados con clave privada. El técnico debe instalar el certificado HTTPS de su CA y configurar DNS.";
    }
    void ImportRecoveryKey(object sender,RoutedEventArgs e)
    {
        if(!Admin()){Alert("Importar una clave privada en Equipo local requiere elevación.");return;}
        if(ExportPassword.Password.Length<15){Alert("Introduce la contraseña PFX en el campo de exportación/recuperación de arriba.");return;}
        var dialog=new OpenFileDialog{Filter="Clave privada de recuperación (*.pfx)|*.pfx"};if(dialog.ShowDialog()!=true)return;
        if(!Confirm("Se importará la clave privada de recuperación en Equipo local. Elige exclusivamente el PFX de esta clínica. ¿Continuar?"))return;
        try{using var certificate=X509CertificateLoader.LoadPkcs12FromFile(dialog.FileName,ExportPassword.Password,X509KeyStorageFlags.MachineKeySet|X509KeyStorageFlags.PersistKeySet);using var store=new X509Store(StoreName.My,StoreLocation.LocalMachine);store.Open(OpenFlags.ReadWrite);store.Add(certificate);RecoveryKeyBox.Text=certificate.Thumbprint;Alert("Clave importada. La recuperación no reemplazará la base ni los archivos activos.");}
        catch(Exception ex){Alert("No pudo importarse la clave: "+ex.Message);}finally{ExportPassword.Clear();}
    }
    void Elevate(object sender,RoutedEventArgs e)
    {
        if(running)return;if(Admin()){Alert("Esta sesión ya está elevada.");return;}
        if(!Confirm("Se abrirá otra instancia elevada. Las contraseñas no se transfieren; guarda primero la configuración si necesitas conservarla. ¿Continuar?"))return;
        try{Process.Start(new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=true,Verb="runas"});Close();}catch(Exception ex){Alert("No se pudo elevar: "+ex.Message);}
    }
    void OpenReports(object sender,RoutedEventArgs e){if(reports.Length==0||!Directory.Exists(reports)){Alert("Todavía no hay informes.");return;}Process.Start(new ProcessStartInfo("explorer.exe"){ArgumentList={reports},UseShellExecute=true});}
    void OpenClinic(object sender,RoutedEventArgs e){try{var c=Config();if(c.Validate().Count>0){Alert("Revisa la configuración antes de abrir.");return;}Process.Start(new ProcessStartInfo($"https://{c.Host}:{c.Port}"){UseShellExecute=true});}catch(Exception ex){Alert(ex.Message);}}
}
