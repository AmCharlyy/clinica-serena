# Verificación de Clínica Serena

Fecha de revisión local más reciente: 3 de octubre de 2026 (Ciudad de México).

## Resultado comprobado

- API ASP.NET Core: compilación correcta, sin errores ni advertencias.
- Interfaz React/TypeScript: comprobación de tipos y compilación de distribución correctas.
- Publicación completa: API y frontend en `artifacts/clinica`, con `wwwroot` y configuración de IIS generada por el SDK.
- `npm run test:integration`: **13 grupos aprobados**, con base de datos y archivos aislados de la demostración.
- `npm run test:roles`: **20 grupos aprobados**, incluidos los 11 perfiles, alcance de roles personalizados, notas internas, cobertura empresarial, reportes y permisos de acción.
- `npm run test:workbench`: **23 grupos aprobados**, incluidos los 11 inicios, áreas no autorizadas, colas por orden de llegada, pagos/comprobantes, acceso mínimo de roles personalizados, auditoría filtrada y timestamps UTC.
- `npm run test:workbench-filters`: **31 comprobaciones aprobadas** de filtros de pendientes y etiquetas de espacios, sin herencia de funciones por el nombre del rol.
- `npm run test:access-context`: clave de caché distinta al cambiar identidad, tipo, asociaciones, roles o permisos; orden estable y sin mutar la sesión.
- `npm run test:calendar`: cambios de día/semana/mes/año, mes de seis semanas y febrero bisiesto/no bisiesto aprobados.
- `npm run test:published`: recursos estáticos, rutas React profundas, sesión y API bajo un mismo origen aprobados en un proceso aislado.
- Auditorías de dependencias npm y NuGet: no reportaron vulnerabilidades conocidas al ejecutarlas. Esto no sustituye una revisión de seguridad ni garantiza ausencia de vulnerabilidades.

## Flujos de integración

1. Inicio de sesión, rutas protegidas y rechazo de solicitudes sin CSRF.
2. Alcance propio del paciente y de la empresa; separación de expedientes; ocultamiento de CURP y motivos/notas de citas para empresas.
3. Actualización del contacto personal y edición de roles con control de versión.
4. Administrador de usuarios: alta de cuentas operativas sin lectura clínica; restricciones sobre el superadministrador y sobre sus propios roles.
5. Liquidación de pagos pendientes.
6. Alta/edición de empresas, pacientes y servicios; CURP única y rechazo de versiones obsoletas.
7. Citas: creación, conflicto por intervalo, transiciones válidas, cancelación, liberación del horario e historial.
8. Recepción y médico: check-in, inicio y finalización de consulta.
9. Nota de consulta: autoría, cierre y rechazo de cierre por otro usuario o de un segundo cierre.
10. Documentos privados: validación, publicación, descarga autorizada y rechazo de contenido incompatible.
11. Pagos y comprobantes internos: emisión única, anulación con motivo y cálculo de ingresos sin pagos anulados.
12. Usuarios: asociación obligatoria del portal, cambio de contraseña inicial, revocación de sesión y protección de la cuenta raíz.
13. Respaldo ZIP real de base/documentos, historial, descarga, auditoría y notificaciones.

## Revisión en navegador

Se recorrieron el inicio de sesión, dashboard, pacientes, alta de un paciente ficticio, creación de una cita, agenda semanal/mensual y portal del paciente. Se revisaron capturas a 1440 × 1000 y 390 × 844; el menú móvil se oculta también para navegación por teclado y la agenda puede desplazarse horizontalmente dentro de su panel.

Las capturas se encuentran en `output/playwright/`. La demostración conserva los registros ficticios creados durante la exploración. Los procesos de prueba no modifican esa base.

### Formularios sin recortes

Se corrigió una altura emulada que había quedado en el navegador de revisión: la página calculaba 1000 px de alto aunque el área visible real de la ventana era de 730 px. Se desactivó ese tamaño de prueba sin cambiar la sesión del usuario.

El componente compartido de ventanas ahora limita su altura al espacio disponible (`dvh`), mantiene el encabezado visible y permite desplazar únicamente el contenido. Las acciones de los formularios permanecen visibles, y el fondo no se desplaza mientras la ventana está abierta. Se conservó el desbordamiento necesario para imprimir comprobantes.

Comprobaciones realizadas con Playwright en una sesión separada, sin guardar nuevos registros:

- Alta de paciente a 1366 × 560: ventana y botones dentro del área visible desde su apertura.
- Alta de paciente a 390 × 640: desplazamiento interno; empresa asociada y registro activo completamente visibles al llegar al final.
- Alta de usuario a 1366 × 560: ventana y botones visibles; contenido con desplazamiento interno.
- Teclado: acceso a Cancelar y Guardar cambios con Tab; cierre con Escape y recuperación del desplazamiento de la página.
- Comprobación de tipos, compilación y prueba aislada del paquete publicado aprobadas.

Capturas: `output/playwright/modal-fixed-desktop.png`, `modal-fixed-mobile.png` y `modal-fixed-mobile-end.png`.

## Límites de esta validación

### Inicios operativos por área — 3 de octubre

Se revisaron los ocho perfiles internos a 1440 × 1000 y 390 × 640, sin desbordamiento horizontal de la página. Se conservan los inicios separados de paciente, empresa y médico. Las pruebas aisladas comprueban cambios reales en pendientes al registrar llegadas, iniciar consultas, liquidar pagos y emitir comprobantes; verifican que recepción no puede iniciar una consulta y que los otros portales no pueden consultar el endpoint interno.

Los accesos a pagos, roles, agenda y auditoría se revisan en una sesión de navegador separada, sin guardar cambios clínicos ni de permisos. Capturas `workbench-*.png` en `output/playwright/`. Los reinicios de la API de desarrollo causan fallos transitorios de conexión; no se usaron como prueba de un fallo permanente del sistema.

No se añadió migración de base en esta mejora. El diagnóstico sigue limitado a la aplicación y los respaldos siguen siendo manuales. Alcance exacto: [WORKBENCHES.md](WORKBENCHES.md).

### Separación de espacios — 3 de octubre

Se verificaron los inicios y la navegación de los 11 perfiles en una sesión separada. Paciente y empresa no muestran herramientas internas; médico no muestra Recepción. Se revisaron servicios públicos, reserva de cita y selección de horarios del paciente, sin guardar citas nuevas. Las asociaciones del alta de usuario cambian correctamente entre Paciente, Médico y Empresa.

La reserva a 390 × 640 mantiene visibles Cancelar/Solicitar cita y desplaza el contenido dentro de la ventana. Capturas: `paciente-inicio.png`, `paciente-servicios.png`, `paciente-cita-movil.png`, `empresa-inicio.png`, `medico-inicio.png` en `output/playwright/`.

El editor del rol Paciente solo presenta los cinco permisos compatibles. Abrir `/users` directamente con ese perfil muestra una sección no autorizada, sin formulario de administración.

La actualización local conserva los datos originales y creó un respaldo previo consistente en `data/schema-backups/`. Las citas, pagos y documentos antiguos no se compartieron retrospectivamente con empresas. El script SQL idempotente se regeneró con la migración nueva, sin ejecutarlo contra SQL Server. La API local se reinició con el código actualizado y su salud respondió `ok`.

Detalle de reglas implementadas en [ROLE_WORKSPACES.md](ROLE_WORKSPACES.md). Los grafos del análisis previo están marcados como históricos y pendientes de regeneración.

### Entornos no comprobados

Todas las pruebas de ejecución se realizaron con SQLite en **Development**. La prueba del paquete publicado también utiliza Development; no prueba las cookies Secure/HTTPS detrás de IIS, SQL Server ni permisos del servidor. El esquema SQL Server y las migraciones están preparados, pero aún no se ejecutaron contra ese motor.

Antes de usar datos reales hacen falta pruebas de SQL Server/IIS/Windows Server, concurrencia y carga; restauración en un entorno de recuperación; validación de permisos de carpetas y servicio; MFA y antimalware; políticas de retención, consentimiento y acceso a información clínica; auditoría externa y aceptación por usuarios.

Los comprobantes son simulados, las notificaciones son internas, los convenios no calculan tarifas automáticamente y el diagnóstico no administra servicios de Windows. Los respaldos son manuales, la restauración no se ejecuta desde la web y **ClinicaDeploy no forma parte de esta entrega**. Consulta `RECOVERY.md` y el alcance pendiente del README.
