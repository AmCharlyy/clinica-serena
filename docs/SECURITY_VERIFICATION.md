# Verificación de la entrega de seguridad

3 de octubre de 2026 · Windows local · ASP.NET Core 10 / React · SQLite en Development.

## Resultado

- Compilaciones Debug, Release y frontend TypeScript/Vite correctas, sin errores ni advertencias del compilador.
- 30 grupos de seguridad aprobados, incluyendo concurrencia entre actividad y reautenticación, TOTP estándar, rechazo de reutilización, recuperación, bloqueo, sesión incompleta, caducidad, revocación, exportaciones, delegación, revisión de accesos y cifrado/aislamiento de borradores.
- 13 grupos de integración aprobados: pacientes, citas, expedientes, archivos, pagos, cuentas, respaldos, reportes y CSRF.
- 20 grupos de roles y 23 grupos de inicios operativos aprobados, con los once perfiles y roles personalizados.
- 31 comprobaciones de filtros, contexto de caché y calendario aprobados.
- Paquete publicado probado con frontend y API en el mismo origen, login limitado hasta completar TOTP, rutas profundas y recursos locales.
- Auditoría de dependencias: NuGet (incluidas transitivas) y npm de producción no informaron vulnerabilidades conocidas en las fuentes consultadas. No demuestra ausencia de vulnerabilidades.

## Revisión visual aislada

Vista de prueba en 5097, base independiente y cuenta ficticia. Configuración y login TOTP recorridos con un código calculado de forma independiente. Revisados 1366 × 768 y 390 × 844, diálogos de configuración y confirmación sensible, gestión de sesiones y borradores de pacientes. El borrador se guardó, se ofreció al reabrir el formulario y se restauró con el valor esperado, sin crear un paciente.

Una comprobación visual detectó una carrera entre el registro de actividad y la confirmación sensible: ambos modificaban la versión de la sesión. Se corrigió el registro de actividad mediante actualización atómica de su campo, y se añadió una prueba simultánea. La confirmación sensible y la revisión administrativa se completaron después de corregirla.

La caducidad detectada por varias peticiones concurrentes también se volvió atómica: todas rechazan el acceso y solo una registra el cierre. La prueba de inactividad incluye ocho peticiones simultáneas.

Las capturas con QR/claves y rastros temporales de autenticación de la cuenta ficticia se eliminaron al cerrar la revisión; se conservan únicamente capturas sin factores. No se configuraron factores en las cuentas de la base local del usuario.

## Conservación de datos

Se compararon conteos y hashes de filas ordenadas de 14 tablas antes y después de la actualización de `data/clinica-dev.db`: sin diferencias en Patients, Staff, Facilities, Services, Companies, Appointments, AppointmentChanges, ClinicalNotes, Documents, Payments, Invoices, Notifications, Settings y Backups.

Respaldo consistente previo: `data/schema-backups/before-security-20261003-233816-86c3c4e31718479badfb19c0d0257f09.db`. Copia del código anterior: `output/security/before-20261003-165232`.

La migración `20261003233019_SecuritySessionsAndTotp` y el script SQL idempotente se generaron. No hubo vaciado, recreación ni eliminación de registros clínicos.

## Pendientes antes de producción

Pruebas reales con SQL Server/IIS/HTTPS y la identidad de servicio de Windows; restauración de BD, documentos y claves; control de permisos de SQL/NTFS; carga, aceptación con trabajadores y pacientes; políticas de Windows y procedimiento de recuperación privilegiada. FIDO2, instalador y correo no se implementaron.

El grafo histórico se utilizó para localizar relaciones, y el código actual y las pruebas para verificar esta entrega. El grafo no es un certificado de seguridad ni sustituye las evidencias actuales. Detalles y límites en [SECURITY.md](SECURITY.md).
