# ClinicaDeploy · instalación y operación local

ClinicaDeploy es un asistente de escritorio Windows x64 para Clínica Serena, construido en WPF/.NET 10 con la línea visual Salud Serena. No es una maqueta: genera planes, inspecciona el equipo y dispone de un motor de instalación, actualización, reparación, respaldo cifrado y recuperación aislada. **La validación completa sobre Windows Server + SQL + IIS es una fase de aceptación pendiente**, no una certificación otorgada por compilar el instalador.

El ejecutable es autocontenido: el técnico no necesita Node.js, SDK .NET, Git, Visual Studio ni SSMS para abrirlo. La aplicación clínica publicada es dependiente del runtime: IIS necesita el **Hosting Bundle .NET 10 x64**, instalado después de habilitar IIS o reparado si IIS se habilitó después.

## Entrega y primer uso

Compila desde el repositorio:

```powershell
npm run build:deploy
```

La distribución queda en `artifacts/deploy/<versión>-<fecha>/`:

```text
ClinicaDeploy.exe                 asistente autocontenido y utilidades de integridad
Deploy.ps1                        motor técnico, debe permanecer junto al ejecutable
ClinicaSerena-1.0.0.zip            API + frontend publicados, sin configuración local
ClinicaSerena-1.0.0.zip.sha256     hash del paquete
SHA256SUMS.txt                    integridad de archivos distribuidos
clinica-config.example.json       ejemplo sin contraseñas, requiere completar campos
LEEME.md                          esta guía
```

Entrega **toda la carpeta**, abre `ClinicaDeploy.exe` y usa «Abrir como administrador» para operaciones que cambien el servidor. La elevación pide consentimiento de Windows; nunca se usa la contraseña de la web para administrar el SO. Guardar/importar configuración no exporta contraseñas.

No hay descarga automática de instaladores desde direcciones arbitrarias. «Preparar IIS» habilita componentes del servidor después de una confirmación. «Hosting Bundle oficial» permite seleccionar un instalador local: solo se ejecuta si su firma Authenticode Microsoft es válida. Se informa de reinicios requeridos, sin reiniciar Windows ni IIS globalmente.

**Integridad no es autenticidad**: SHA-256 detecta corrupción, pero un atacante puede sustituir el ZIP y su hash a la vez. Usa una distribución obtenida por un canal confiable y compara hashes independientes. La firma de código comercial de ClinicaDeploy y del script aún no se ha aplicado. Windows puede mostrar SmartScreen. No desactives políticas de seguridad para ocultarlo. En equipos con RemoteSigned/AllSigned, el técnico debe verificar la procedencia y desbloquear únicamente archivos verificados o firmar el script con la CA autorizada de su organización.

## Los seis pasos del asistente

1. **Bienvenida:** seleccionar instalar, actualizar, reparar, respaldar, recuperar, diagnosticar o exportar clave. Para una instalación existente, importar su `state/config.json` y después escoger la operación.
2. **Requisitos:** revisión de solo lectura; los informes sí se escriben. Windows x64 build 17763+, administrador, IIS/WebAdministration, ANCM V2, ASP.NET Core 10 x64, conexión SQL local, cuenta del motor, espacio, certificado y DNS. Windows de escritorio se identifica como laboratorio.
3. **Configurar clínica:** paquete ZIP y SHA esperado, nombre DNS/puerto, sitio y pool dedicados, instancia SQL, base nueva, nombre/contacto de clínica y carpetas separadas.
4. **Seguridad y continuidad:** certificado TLS, administrador individual, alcance firewall, hora de respaldo, custodia de claves y autorización de mantenimiento. Campos adicionales para recuperar en una base/carpeta nuevas.
5. **Revisar e instalar:** alcance explícito y confirmación; no omitir errores bloqueantes. Durante migraciones el asistente impide cerrar la ventana para evitar interrupciones accidentales.
6. **Resultado:** progreso, comprobaciones, errores, informe HTML/JSON y acceso a la clínica. «Operación completada» no equivale a una auditoría de producción aprobada.

## Datos que prepara el técnico

| Dato | Condición |
| --- | --- |
| Instancia SQL | Local al servidor, motor ya instalado/licenciado; Shared Memory habilitado |
| Identidad Windows del técnico | Administrador del servidor y `sysadmin` de esa instancia para provisionar |
| DNS de clínica | Debe resolver a una IP de este servidor desde servidor y clientes |
| Certificado HTTPS | `LocalMachine/My`, RSA o compatible con IIS, clave privada, SAN exacto del DNS, EKU servidor, cadena confiable, más de 7 días de vigencia |
| Puerto | 443 o 1024–65535; binding no ocupado por otro sitio |
| Carpetas | Locales, dedicadas, separadas, sin enlaces/reparse points ni datos previos al instalar |
| Usuario inicial | Nombre y usuario individuales; contraseña 15–128 caracteres, mayúsculas/minúsculas/números |
| Red autorizada | `LocalSubnet` o IPv4/CIDR concretas; no `Any` ni `0.0.0.0/0` |
| Respaldos | Hora local del servidor, mantenimiento autorizado, copia externa y responsable de custodia PFX |

El mínimo de 5 GB libres es una barrera inicial, **no dimensionamiento de producción**. Una copia requiere espacio temporal para BAK, documentos, ZIP, cifrado y verificación. Prever crecimiento, capacidad de SQL Express y disco externo. No se instala SQL Server ni se acepta su licencia automáticamente. No se toca la configuración del router, DNS de Active Directory o certificados raíz de clientes.

El motor necesita SQL Server 2016+ y nivel de compatibilidad 130+ para las consultas EF. Una regla firewall propia limitada no cancela otras reglas allow existentes: revisar el alcance efectivo de red es parte de la entrega. Desmarcar respaldos/firewall al volver a publicar deshabilita únicamente la tarea/regla previamente registrada como propia.

## Arquitectura del despliegue

```text
Navegadores LAN ── HTTPS / DNS de clínica ── IIS: ClinicaSerena
                                              │
                                      IIS APPPOOL\ClinicaSerena
                                              │
                         API / frontend · Production · sin demostración
                                   │                      │
                        SQL local / Shared Memory    datos/documents + keys

Técnico Windows ── ClinicaDeploy ── IIS propio / migraciones / diagnósticos
SYSTEM ── tarea diaria ── SQL COPY_ONLY + archivos ── respaldo .serena
Clave de recuperación PFX ── custodia independiente fuera del servidor
```

Distribución habitual:

```text
C:\ClinicaSerena\
  releases\<id>\       versiones inmutables, API y wwwroot
  state\                configuración y marcador de propiedad
  tool\                 ejecutable + motor para tareas
  reports\              resultados de tareas técnicas sin secretos
D:\ClinicaSerenaData\
  documents\            documentos privados, fuera del sitio web
  keys\                 claves Data Protection protegidas con certificado
  backups\              estado técnico de solo lectura para la web
E:\ClinicaSerenaBackups\
  <fecha>.serena         copias cifradas y autenticadas
```

El asistente usa rutas configurables; no exige esos discos concretos. Administradores y SYSTEM acceden a carpetas técnicas. El pool puede leer la versión y modificar documentos/claves; no puede escribir el programa, leer herramientas/configuración técnica ni administrar SQL. SQL recibe acceso temporal al staging del respaldo y a los archivos de recuperación cuando se necesita. El certificado de recuperación concede lectura de clave privada únicamente a administradores, SYSTEM y pool propio.

## Instalación inicial: qué hace realmente

- Repite requisitos antes de aplicar cambios. Rechaza sitios/pools/bases existentes y carpetas no vacías: nunca se apropia de otro sistema.
- Valida hash del ZIP y hashes internos; bloquea rutas relativas/absolutas peligrosas, ADS, nombres de dispositivos, enlaces, duplicados, archivos extra y tamaños desproporcionados. Extrae a una carpeta nueva.
- Crea pool dedicado x64, sin CLR administrado IIS, con identidad virtual y perfil cargado.
- Crea un certificado RSA 3072 **separado del TLS** para Data Protection y cifrado de respaldos. No instala este certificado como CA confiable de HTTPS.
- Crea base SQL nueva y ejecuta migraciones con la identidad del técnico, mediante `--deploy-initialize` de la API. La contraseña bootstrap solo se pasa en el entorno del proceso y se elimina al terminar; no se incluye en argumentos ni JSON.
- Inicializa roles y solo un superadministrador real. Nombre/contacto de clínica se toman del asistente. No genera pacientes, médicos, servicios ni empresas ficticias. Primer acceso exige cambio de contraseña y enrolamiento TOTP según la política existente.
- Crea login Windows del pool; concede DML sobre `dbo`, pero deniega modificar/eliminar eventos de auditoría. No otorga `db_owner`, DDL ni permisos de backup al proceso web.
- Configura `Production`, SQL Server, `ApplyMigrations=false`, `Demo=false`, `AllowedHosts` exacto y `appsettings.Local.json` sin contraseña SQL. Usa `lpc:` para forzar memoria compartida local; no habilita el puerto SQL ni usa TCP sin cifrar.
- Publica un binding HTTPS SNI, sin HTTP, con certificado ya confiable; desactiva directory browsing, establece identidad anónima del pool y tamaño máximo de carga. Crea solo su regla firewall en perfiles Dominio/Privado y alcance autorizado.
- Registra tarea diaria si se eligió. Verifica HTTPS y disponibilidad SQL con `/api/health/ready`, sin omitir errores TLS. Conserva marcador de versión e informe.

La web muestra el modo de respaldo técnico y su última copia completada, sin ejecutar comandos de Windows desde el navegador. Las copias manuales previas siguen disponibles solo en entornos no administrados por ClinicaDeploy; en producción no se concede a la web la autoridad de respaldo SQL.

## Actualización y reparación

Importar `state/config.json` desde el servidor. Seleccionar nuevo paquete y SHA. Actualizar requiere una versión numérica superior (ej. `1.1.0`); reparar permite volver a publicar la misma versión. No se admite downgrade. Raíces, base, instancia, DNS, puerto, sitio y pool deben coincidir con el marcador registrado; migrar ubicaciones es una intervención diferente.

Antes de cambiar se comprueba que el sitio siga siendo propio, su ruta/binding no hayan sido alterados y el pool no esté compartido con otros sitios. Se detiene solo la clínica y se crea una copia cifrada consistente. Después se prepara otra versión, migra, cambia la ruta IIS y verifica HTTPS+SQL. No se borra la versión previa, los respaldos ni datos.

**No hay rollback SQL automático.** Antes de migrar, un fallo de respaldo permite reabrir la versión anterior. Después de iniciar migraciones, cualquier fallo deja la clínica detenida: revertir solo los binarios puede ser incompatible con el nuevo esquema. El técnico revisa el informe y utiliza reparación compatible o recuperación coordinada. Una instalación inicial fallida puede dejar base, pool o certificado propios parciales: se conservan para diagnóstico; no se borran para permitir un reintento indiscriminado.

Un mutex global impide operaciones simultáneas del asistente/tarea. No evita que un DBA, administrador externo u otra herramienta escriba por fuera del sistema: coordinar la ventana de mantenimiento con ellos.

## Respaldos cifrados

La tarea ejecuta `ClinicaDeploy.exe --run <state/config.json> --operation Backup` como SYSTEM, con instancia única y límite de cuatro horas. Usa la **zona horaria del servidor** y puede arrancar al recuperarse de un horario perdido. No hay envío de correos ni monitor externo de fallos: revisar el último resultado de Task Scheduler y los informes. Comprobar la primera ejecución realmente como SYSTEM antes de entregar.

Si el sitio estaba detenido o el marcador no está en estado listo, la tarea no lo reabre ni vence un mantenimiento previo. Se espera la terminación del proceso propio de IIS antes de copiar documentos; si no termina, el respaldo falla de manera explícita. El descifrado admite respaldos hasta 256 GB descomprimidos y 200 000 archivos, sujeto a espacio y capacidad operativa; la publicación se limita a 4 GB descomprimidos.

Procedimiento:

1. Detener sitio y pool propios; esperar descarga del proceso.
2. `BACKUP DATABASE ... COPY_ONLY, CHECKSUM`, seguido de `RESTORE VERIFYONLY`.
3. Copiar documentos, claves Data Protection, configuración sin secretos y marcador de despliegue. Cada archivo tiene hash dentro del manifiesto.
4. Crear ZIP temporal en carpeta protegida.
5. Cifrar en streaming con AES-256-CBC y autenticar cabecera+cifrado mediante HMAC-SHA256, con claves aleatorias independientes. Envolver ambas claves con RSA-OAEP-SHA256 del certificado de recuperación.
6. Descifrar/verificar una copia temporal y todos sus hashes antes de declarar éxito. Borrar staging/ZIP temporal propios tras el éxito; reabrir la clínica. Ante un fallo, conservar evidencia protegida e informar, sin borrar datos activos.

El archivo `.serena` no incluye la clave privada del certificado. `Exportar clave` genera un PFX protegido por contraseña (mínimo 15 caracteres), usando AES256-SHA256. Moverlo fuera del servidor y guardar contraseña aparte. Una clave PFX dejada junto al respaldo pierde la separación de custodia. **Sin el PFX o la clave privada original no se recupera un respaldo cifrado**.

SYSTEM es una identidad privilegiada de Windows, pero no se le otorga `sysadmin` SQL desde el asistente. Se le concede `db_backupoperator` en la base propia. Como SQL exige permiso de crear bases incluso para VERIFYONLY, se crea en `master` un procedimiento fijo `ClinicaVerify_<sitio>`, firmado por un certificado SQL que solo amplía esa operación. Solo admite rutas staging del directorio de respaldo propio; no SQL arbitrario. El login del certificado no puede autenticarse como usuario. Se elimina su clave privada tras firmar. Este diseño necesita prueba real de permisos en la versión SQL de destino.

No hay purga automática, retención clínica decidida por código ni garantía contra ransomware. Mantener copia desconectada/externa, política de retención acordada y restauraciones periódicas. No usar la misma unidad como única copia.

## Recuperar sin destruir la clínica activa

Seleccionar «Recuperar una copia aislada», respaldo `.serena`, base nueva y carpeta nueva. En el mismo servidor se usa la clave registrada. En otro servidor, importar antes el PFX de recuperación desde el asistente y poner su huella; el motor permite restaurar aunque no exista instalación clínica previa. SQL debe estar preparado y el técnico debe tener autoridad administrativa.

Se valida MAC **antes de escribir plaintext**, se verifica el manifiesto y se ejecuta `RESTORE DATABASE` con `MOVE` hacia archivos nuevos, `CHECKSUM` y `RECOVERY`. No se usa `WITH REPLACE`. Si la base o carpeta destino existe, se rechaza. La recuperación aislada no cambia DNS, IIS ni los datos activos.

La promoción operativa queda deliberadamente bajo control técnico:

1. Conservar otro respaldo actual; poner clínica y procesos externos en mantenimiento.
2. Verificar la versión de aplicación/migraciones registrada en `snapshot/deployment.json`. Usar una publicación compatible con el esquema restaurado.
3. Preparar una API/IIS de recuperación aislada con SQL apuntando a la base recuperada y `Storage:Root` a `snapshot` (contiene `documents`/`keys`). Conceder permisos a un pool propio y a su clave privada de recuperación. No exponerla a pacientes antes de validar.
4. Comprobar cantidades/registros, descargas, documentos, TOTP, integridad de auditoría y cuentas por rol. Medir tiempo de recuperación.
5. Revocar sesiones recuperadas antes de abrir. Revisar recuperación de MFA/contraseñas según protocolo de la clínica; nunca desactivar TOTP globalmente para «arreglar» el acceso.
6. Promover la copia coordinando configuración IIS, base, documentos y tareas; registrar el nuevo estado técnico. No cambiar a mano `state/deployment.json` solo para vencer las comprobaciones de propiedad.

La promoción sobre datos operativos no es un botón automático en esta versión. Separarla evita que un operador sobrescriba expedientes vivos por accidente y exige verificación humana de integridad clínica.

## Modo sin interfaz

`--plan archivo.json` imprime alcance sin modificar el servidor; `--run archivo.json` realiza la operación configurada y requiere las mismas validaciones. Para instalación/exportación las variables `SERENA_BOOTSTRAP` y `SERENA_PFX_PASSWORD` se obtienen por un mecanismo seguro del proceso o entrada interactiva del técnico. No escribir contraseñas en comandos, historial, archivos `.json`, tareas, logs ni repositorio. La interfaz visual es el modo recomendado.

Plan y validación no sustituyen revisión de requisitos. El modo programado `--operation Backup` autoriza mantenimiento para la tarea que el técnico ya eligió durante instalación. Código de salida 0 significa éxito, 4 fallo del proceso/asistente; los resultados JSON/HTML detallan requisitos pendientes y errores. El motor interno usa además 3 para revisión con errores.

Informes de la interfaz: `%LOCALAPPDATA%\ClinicaSerena\DeployReports`; tareas: `<Root>\reports`. No contienen contraseñas/TOTP/documentos clínicos, pero sí metadatos administrativos (rutas, instancia, cuenta técnica): acceso restringido. No se enviarán a servicios externos.

## Límites y aceptación antes de producción

Implementado: interfaz, validador, paquetes, plan, comprobaciones, aprovisionamiento, actualización/reparación, cifrado, tarea, recuperación aislada e informes. Comprobado localmente: compilación, pruebas del núcleo y render visual. **No se ejecutó instalación sobre SQL/IIS reales ni se alteró esta laptop para simular un servidor**.

Pendiente de aceptación en VM Windows Server 2019:

- IIS + Hosting Bundle .NET10; reinicio coordinado de ANCM si aplica.
- SQL compatible, Shared Memory, migraciones, permisos virtual account/SYSTEM y procedimiento firmado.
- TLS/DNS desde servidor y al menos dos clientes LAN; confiar CA raíz mediante la política autorizada.
- Instalar vacío; comprobar ausencia de demo; enrolar admin TOTP y probar roles reales.
- Respaldo manual técnico y tarea ejecutada como SYSTEM; claves fuera del servidor; restaurar en servidor nuevo.
- Actualizar a versión superior y simular fallo de migración/health; verificar mantenimiento e informes.
- ACL efectivas, concurrencia/carga, disco lleno, protección contra malware y recuperación de un fallo del servidor.
- Firma Authenticode de la distribución, políticas de actualización, licencia SQL, RDP/NLA/GPO/antivirus, privacidad y aceptación clínica.

Fuera de esta entrega: SQL remoto/domino o modo SQL-password automático, instalación silenciosa del motor SQL, cambios RDP/firewall global/GPO, autorregistro/SMTP/Brevo, gestión de dispositivos/IP desde la web, reinstalación destructiva, rollback de migraciones, promoción automática de una recuperación y eliminación automática de datos/backups. No se modifica lo que se dejó aplazado.

## Referencias técnicas

- [Microsoft: ASP.NET Core en IIS](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/?view=aspnetcore-10.0).
- [Microsoft: Hosting Bundle](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/hosting-bundle?view=aspnetcore-10.0).
- [Microsoft: .NET en Windows y sistemas compatibles](https://learn.microsoft.com/en-us/dotnet/core/install/windows).
- [Microsoft: protección de claves mediante certificado](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/overview?view=aspnetcore-10.0).
- [Microsoft: VERIFYONLY y permisos](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql).
- [Microsoft: procedimientos firmados por certificado](https://learn.microsoft.com/en-us/sql/relational-databases/tutorial-signing-stored-procedures-with-a-certificate).
