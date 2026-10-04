# Inicios orientados al trabajo

Actualización local: 3 de octubre de 2026. Se mantiene el diseño Salud Serena y el inicio de sesión común.

## Experiencia por área

| Área | Trabajo presentado en el inicio |
| --- | --- |
| Recepción | Solicitudes pendientes de hoy y los próximos 7 días; llegadas de hoy; cola por antigüedad del check-in; consultas en curso. |
| Finanzas | Importe pendiente, pagos por liquidar, comprobantes internos por emitir y convenios activos vencidos o que vencen en 30 días. |
| Coordinación | Agenda de hoy, jornadas médicas configuradas, estado operativo de consultorios y reservas que coinciden con la hora actual. |
| Gestión de accesos | Cuentas sin primer acceso, con cambio inicial de contraseña pendiente o bloqueo vigente; alcances de roles; cambios de acceso de los últimos 7 días, si tiene permiso de auditoría. |
| Auditoría | Denegaciones, ingresos fallidos y cambios de cuentas/permisos en las últimas 24 horas; actividad reciente. |
| Soporte | Conectividad de la base, proceso de la API, existencia de la carpeta documental, espacio disponible y seguimiento de respaldos. |

El superadministrador inicia en un resumen que permite entrar a cada área. Administración general y clínica inician en coordinación. Una cuenta con varias responsabilidades puede cambiar entre las áreas permitidas. No se concede un permiso nuevo por mostrar una pestaña.

Paciente, empresa y médico mantienen sus portales y alcance anteriores. Ninguno puede consultar el nuevo endpoint interno, aunque construya la URL manualmente.

## Arquitectura y autorización

- `backend/Features/WorkbenchEndpoints.cs`: endpoint de lectura `GET /api/dashboard/workbench`, selección de áreas por permisos efectivos y proyecciones mínimas; no devuelve entidades completas.
- `frontend/src/pages/WorkbenchDashboard.tsx`: presentación común de métricas y listas, con contenido específico por área. No contiene copias de las reglas de confirmación, consulta, pago o edición de permisos.
- `frontend/src/workbenchFilters.ts`: filtros de trabajo reutilizables y verificables para llegadas, espera, comprobantes, convenios y contraseñas iniciales.
- La huella de identidad y autorización sigue separando la caché. Los nuevos datos se actualizan cada 30 segundos mientras el inicio está activo, y al guardar mediante los módulos existentes. También hay actualización manual.
- Cada lista resume hasta seis registros y muestra su total. Los accesos rápidos abren el detalle autorizado o una lista filtrada; los cambios requieren los permisos, validaciones y versiones del endpoint original.
- Los roles personalizados reciben solo las secciones respaldadas por sus permisos. Un rol que solo lee profesionales no recibe citas; uno que solo lee roles no recibe cuentas; uno que solo lee respaldos no recibe diagnóstico del servidor. Una cuenta sin módulos reconocidos recibe un inicio mínimo con sus avisos.
- El parámetro `view` solo elige un área ya permitida. Áreas conocidas sin permiso devuelven 403; áreas desconocidas, 400. Cambiar parámetros de registro no altera el alcance de los datos.

La auditoría ahora admite un evento concreto o filtros controlados (`denied`, `failedLogin`, `failures`, `access`) de 1 o 7 días, con máximo 500 resultados. Sigue requiriendo `audit.read`. Permite revisar el evento elegido incluso si hay más de 500 eventos recientes generales.

## Interpretación correcta de los indicadores

- Las fechas operativas corresponden a Ciudad de México; los instantes de actividad/check-in se transmiten explícitamente en UTC y se muestran en esa zona.
- “Pagos registrados hoy” suma los pagos creados hoy que actualmente están pagados. **No equivale a flujo de caja por fecha de liquidación**: aún falta un campo de fecha de liquidación para ese informe contable.
- Jornada configurada no demuestra presencia física; reserva de consultorio no demuestra ocupación real. El estado operativo proviene del catálogo.
- Los comprobantes son internos y no tienen validez fiscal. No se cambian automáticamente las tarifas de los convenios.
- Un fallo o denegación en auditoría requiere revisión y no demuestra una intrusión por sí solo. El resumen no expone notas, motivos, hashes, comentarios privados de auditoría ni rutas físicas.
- El diagnóstico no comprueba IIS/RDP/servicios de Windows ni certifica permisos de escritura o ACL. No reinicia procesos ni modifica el servidor.
- La alerta de respaldo usa una referencia operativa de 24 horas. No programa respaldos, descarga archivos ni garantiza que puedan restaurarse.

## Verificación y alcance

`npm run test:workbench` usa el puerto 5094 y su propia base/directorio de datos. Comprueba los 11 perfiles, rechazo de áreas ajenas, actualización de colas/pagos/comprobantes, orden de llegada, filtros de auditoría, timestamps UTC y cinco roles personalizados de acceso mínimo. Primero debe compilarse la API Debug; el puerto debe estar libre.

`npm run test:workbench-filters` comprueba los filtros y las etiquetas de espacios sin conceder funciones por el nombre de un rol. Las pruebas previas de integración, roles, calendario y contexto de acceso siguen siendo relevantes.

Capturas de escritorio y móvil: `output/playwright/workbench-*.png`. Las pruebas de escritura se hicieron en datos aislados; la revisión visual no guardó pacientes, citas, pagos ni permisos en la demostración.

No se cambió el esquema de base para esta mejora. La publicación se verificó con SQLite en Development; quedan pendientes SQL Server, IIS y Windows Server reales. **ClinicaDeploy permanece fuera del alcance.** Más detalles en `VERIFICATION.md` y `ROLE_WORKSPACES.md`.
