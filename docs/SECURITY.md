# Seguridad de Clínica Serena

Implementación local del 3 de octubre de 2026. No sustituye una evaluación independiente, el despliegue seguro ni las obligaciones aplicables a expedientes médicos. El instalador, el portal público, SMTP/Brevo y FIDO2 quedan fuera de esta entrega.

## Autenticación y segundo factor

- Cuenta individual por persona; las cuentas demo representan personas ficticias, aunque su usuario sea `recepcion` o `medico`. No reutilizar estas cuentas ni contraseñas en producción. Las cuentas laborales se crean exclusivamente desde la administración autorizada, no mediante registro público.
- Contraseñas nuevas/temporales: 15–128 caracteres, mayúscula, minúscula y número; se permiten espacios y pegar desde gestores. El servidor usa PasswordHasher de ASP.NET Core y actualiza hashes que necesiten rehash. El cambio no acepta la misma contraseña actual. La unicidad entre servicios/personas es una política de operación, no una garantía que pueda comprobar el sistema.
- Todas las cuentas no pacientes requieren TOTP: personal interno, médicos y empresas. Los pacientes pueden activarlo en Mi cuenta. No se puede desactivar MFA laboral mediante un botón o modificarlo enviando campos a Usuarios.
- Login entrega una sesión incompleta: `password`, `enrollment` o `mfa`. No tiene roles ni permisos operativos. El servidor bloquea también dashboard, lookups, notificaciones, borradores y otros endpoints autenticados hasta completar los pasos. Si la cuenta ya tiene MFA, restablecer la contraseña NO evita el segundo factor.
- TOTP estándar: SHA-1, seis dígitos, 30 segundos; tolerancia de un intervalo anterior/siguiente para desfase. Verificación con Otp.NET 1.4.1; QR PNG generado localmente con QRCoder 1.8.0. Compatible con aplicaciones que admitan `otpauth://totp`, como Google Authenticator, Microsoft Authenticator y 2FAS.
- La semilla se cifra con ASP.NET Data Protection. La clave manual y el QR solo se devuelven al usuario en su sesión de configuración, caducan a los diez minutos y no se envían a proveedores de QR. No fotografiar, compartir ni registrar esas claves.
- El último intervalo aceptado se consume mediante actualización atómica en BD. No se acepta el mismo TOTP para login y otra acción; esperar al siguiente intervalo o usar un código de recuperación. No adelantar el reloj para obtener más códigos.
- Diez códigos aleatorios de recuperación de 128 bits, mostrados una sola vez y almacenados como SHA-256 ligado al usuario. Uso atómico y único. Renovarlos invalida los anteriores; guardar en un gestor o fuera del equipo, nunca junto a una copia de la semilla.
- Cinco fallos de contraseña o segundo factor bloquean nuevos intentos durante 15 minutos. Límites por IP: 10 logins/minuto y 60 solicitudes/minuto a endpoints de verificación/configuración del factor; la cuota mayor de MFA permite varios puestos en la misma red. La API no registra contraseñas ni códigos.
- Los errores de login son genéricos tanto para cuentas existentes como desconocidas/inactivas/bloqueadas. Las cuentas que no pueden entrar pasan por una verificación de hash ficticio para reducir diferencias de tiempo, sin garantizar anonimato perfecto frente a mediciones sofisticadas.

La primera configuración de una cuenta laboral requiere una entrega controlada de credenciales temporales y comprobar la identidad del trabajador; conocer una contraseña temporal antes del enrolamiento sigue siendo un riesgo. TOTP no es resistente al phishing. Las llaves FIDO2/WebAuthn son una ampliación futura para cuentas privilegiadas.

## Sesiones y acciones sensibles

- Cookies HttpOnly, SameSite Strict, Secure en producción; CSRF en las escrituras, TLS y HSTS fuera de Development. Nunca guardar cookies/tokens en localStorage ni sessionStorage.
- Sesiones persistidas en `AuthSessions`, identificador aleatorio y comprobación de cuenta, SecurityStamp, permisos actuales, revocación, vigencia y tiempos en CADA solicitud. Las cookies antiguas sin sesión persistida quedan inválidas después de actualizar.
- Inactividad: 5 minutos para permisos de cuentas/configuración crítica/recepción y para usuarios marcados como equipo compartido; 15 minutos para otros puestos. Duración máxima: 8 horas, sin renovación deslizante. Sesión incompleta: máximo diez minutos.
- La interfaz avisa en el último minuto y registra actividad real de interacción como máximo cada 30 segundos. Consultar `me`, salud y otros sondeos no prolonga la sesión. El servidor comprueba los límites; el navegador no puede extender el máximo de ocho horas. El registro de actividad no prueba presencia humana frente a un atacante que ya posea una sesión.
- Contraseña y TOTP/código de recuperación para obtener una confirmación adicional de tres minutos, ligada exclusivamente a esa sesión. Se exige al cambiar usuarios/roles/configuración/contraseña, gestionar sesiones/vigencia, restablecer o sustituir factores, renovar códigos, crear/descargar respaldos y exportar información. La confirmación no añade permisos.
- Se normalizan mayúsculas y barra final de las rutas; no se evita la confirmación usando variantes de URL. El servidor responde `428 step_up_required`; la interfaz pide confirmación y reintenta solo una vez.
- Cambios de contraseña, permisos/alcances, baja, vigencia y MFA invalidan las sesiones mediante SecurityStamp. Administración puede revocar una sesión o todas las sesiones de una cuenta. Los cambios de permisos de un rol se releen en cada solicitud.

## Permisos, altas y bajas

Se mantienen los cuatro espacios y todos los controles de acción, registro y campos del servidor. Un paciente no se convierte en personal interno por modificar la URL ni el contenido de una petición. Una empresa no recibe expedientes ni actividad privada sin cobertura explícita.

La delegación está limitada a los permisos efectivos del actor, también al editar roles existentes, resetear contraseñas y gestionar cuentas/sesiones. El administrador de usuarios no puede conceder `records.read` o accesos financieros que no posee. Los selectores identifican qué roles puede asignar. Las cuentas fuera de su autoridad necesitan intervención del superadministrador, no una elevación automática.

Nuevos permisos: `sessions.read`, `sessions.revoke`, `security.manage`. El rol raíz recibe los tres; el rol predeterminado de administración de usuarios recibe los dos primeros. Solo `security.manage` permite recuperación supervisada de MFA. Las políticas de roles se actualizan aditivamente sin sobrescribir personalizaciones anteriores.

En Seguridad y sesiones se registra revisión trimestral (aviso a los 90 días), vigencia de acceso opcional, equipo compartido y baja. Dar de baja o terminar la vigencia revoca el uso de cookies en servidor. La revisión es un procedimiento humano: marcarla no demuestra que se haya evaluado correctamente. Se exige motivo administrativo y confirmación adicional, y se conserva al menos un superadministrador activo sin vencimiento.

## Recuperación del autenticador

1. Conservar el teléfono: entrar con contraseña y TOTP; Mi cuenta → Sustituir autenticador; confirmar identidad; escanear la nueva clave y guardar los nuevos códigos. Las demás sesiones y los factores anteriores dejan de servir. Si se abandona este proceso, queda únicamente acceso al enrolamiento.
2. Teléfono perdido: entrar con contraseña y un código de recuperación. Después sustituir el autenticador. Un código no sustituye la contraseña ni concede permisos administrativos.
3. Sin teléfono ni códigos: otro superadministrador autorizado verifica presencialmente identidad y autorización, registra motivo y declara esa verificación; confirma su propia contraseña y factor; realiza Recuperar TOTP. La API invalida factor/códigos/sesiones del solicitante y obliga al enrolamiento. No existe recuperación privilegiada por correo ni restablecimiento propio en esta ruta. Una declaración no reemplaza una comprobación humana real: para producción, aplicar doble aprobación externa para cuentas privilegiadas.
4. Único superadministrador sin factores: no hay bypass web. Se necesita procedimiento excepcional presencial, coordinado por responsables de seguridad y BD, con control de cambios, respaldo y auditoría externa. Crear una segunda cuenta individual de emergencia, MFA independiente y códigos custodiados antes del despliegue; no una cuenta compartida con contraseña pública.

## Auditoría y exportaciones

Los eventos registran actor, fecha UTC, acción, registro, IP y resultado. Se auditan acceso a expedientes, cambios, archivos descargados, autorización de exportación, respaldos, gestión de cuentas, factores y sesiones. Las exportaciones de catálogos y auditoría comprueban permiso de lectura y `reports.export`, además de confirmación sensible. Los reportes vuelven a consultar datos con el alcance actual. Autorizar una exportación no acredita que el navegador haya guardado el archivo.

Los eventos nuevos llevan un sello autenticado de Data Protection. El contexto de BD impide editar/eliminar auditoría en los métodos normales de guardado; no existen endpoints de modificación. Auditoría muestra `Verificado`, `Histórico sin sello` o `Alterado`. Los eventos anteriores no se vuelven a sellar como si fueran verificados. No se copian semilla, contraseña, códigos de recuperación/TOTP ni texto completo de notas clínicas. Los motivos administrativos deben escribirse sin datos clínicos.

Un sello detecta cambios de una fila, NO la eliminación de eventos ni un administrador del servidor que controla claves y BD. Para producción se requieren permisos SQL de solo SELECT/INSERT en auditoría para la cuenta de la aplicación, evitar `db_owner`, copias periódicas externas con retención y acceso separado. Revisar pérdida de claves y alertas de integridad. Los exports y logs contienen datos sensibles por sí mismos; no publicarlos.

## Borradores protegidos

Formularios de pacientes, pagos, citas del personal y notas de consulta guardan automáticamente después de 700 ms sin cambios. Cifrados en `SecureDrafts`, asociados al usuario y a una huella de roles, permisos y asociaciones; control de alcance de registros al guardar/restaurar. No se guardan contraseñas, archivos ni formularios de credenciales. No se persisten datos clínicos en almacenamiento del navegador.

Restauración explícita desde el mismo formulario. Un cambio de versión del registro impide recuperar un borrador obsoleto. El formulario muestra si la última actualización realmente se guardó; lo escrito justo antes del corte, si aún no llegó al servidor, puede perderse. El guardado final elimina el borrador. Caducan en 24 horas; limpieza cada 15 minutos. Sesiones vencidas/revocadas se depuran después de 30 días; no se purga auditoría ni expediente.

No todos los formularios especializados poseen autosalvado (p. ej. archivos y reservas rápidas del portal). Antes de ampliar el autosalvado deben definirse claves, permisos y reglas de concurrencia; no guardar indiscriminadamente contenido sensible en el navegador.

## Windows Server, IIS y SQL Server: pendientes del despliegue

No se han cambiado firewall, RDP, servicios, políticas de bloqueo, antivirus ni usuarios de Windows de esta laptop.

- Mantener Windows Server, Hosting Bundle, SQL Server, navegador y dependencias actualizados; programar mantenimiento fuera de consultas.
- IIS con HTTPS y certificado confiable también en LAN; identidad de servicio dedicada y sin administrador local; perfil cargado para DPAPI; carpetas de aplicación, claves, documentos, logs y respaldos fuera del sitio público y protegidas mediante ACL. No conceder escritura general al sitio.
- Configurar firewall para la aplicación y administración desde redes/IP autorizadas. SQL no accesible a clientes del navegador. RDP restringido a red de administración/VPN; no exponerlo a internet. El TOTP de esta web NO protege RDP, SSMS ni las cuentas de Windows.
- Bloqueo automático de puestos compartidos, cuentas individuales del SO, antimalware/Defender y mínimo privilegio. Estas configuraciones se aplican por responsables de Windows/GPO, no desde el navegador clínico.
- Sincronizar reloj/NTP del servidor y los autenticadores. No incrementar arbitrariamente la tolerancia de TOTP.
- Custodiar y respaldar claves de Data Protection por separado de los ZIP de BD/documentos. DPAPI vincula la protección al usuario/equipo: copiar `data/keys` a otro servidor no garantiza poder descifrarlo. Diseñar protección transferible (p. ej. certificado privado custodiado) y probar restauración antes de producción. No incluir claves sin protección junto a la base.
- Plan de respaldo cifrado externo, retención y restauraciones probadas. Una copia dentro del mismo disco no protege contra ransomware o fallo físico. Los respaldos conservan datos y también pueden contener borradores expirados hasta cumplir su retención.
- Revisar privacidad y retención aplicables, protocolo de recuperación, autorización de trabajadores, doble aprobación y revisión periódica de accesos.

## Datos y verificación

Actualización SQLite aditiva y respaldo consistente previo en `data/schema-backups/before-security-*.db`. La migración EF `SecuritySessionsAndTotp` y `database/ClinicaDB.sql` se generan para SQL Server; no se ejecutaron contra un SQL Server real. No se recreó ni vació la base clínica.

Pruebas automáticas con bases aisladas, nunca con semillas de cuentas reales: `npm run test:security`, `test:integration`, `test:roles`, `test:workbench`, `test:published`, `test:access-context`, `test:workbench-filters`, `test:calendar`. La suite de seguridad verifica TOTP interoperable, replay, hashes/cifrado, sesión incompleta, tiempos reales del servidor, revocación, reautenticación, delegación, recuperación, auditoría y borradores. Publicación y revisión visual local no certifican IIS, SQL Server ni Windows Server.

## Referencias

- [OWASP: MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).
- [OWASP: sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- [Microsoft: TOTP y QR en ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/identity-enable-qrcodes?view=aspnetcore-10.0).
- [Otp.NET: implementación y ventanas de verificación](https://github.com/kspearrin/Otp.NET).
- [QRCoder: generación local de PNG](https://github.com/Shane32/QRCoder).
