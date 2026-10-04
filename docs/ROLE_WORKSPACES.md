# Espacios, permisos y alcance de datos

Implementado y revisado localmente el 3 de octubre de 2026. Se conserva Salud serena y un solo inicio de sesión; la experiencia posterior depende del tipo de acceso y los permisos efectivos.

## Modelo aplicado

```text
Inicio de sesión común
  → cuenta activa y sesión válida
  → roles con tipo de acceso explícito
  → permisos compatibles con ese tipo
  → espacio y rutas autorizadas
  → API comprueba acción, alcance de registros y campos de respuesta
```

Un rol personalizado no obtiene alcance global por cambiar de nombre. Su `Audience` es obligatorio e inmutable. Los tipos paciente, médico y empresa requieren una asociación válida y un único rol; no se mezclan con personal interno. Las cuentas incompatibles quedan sin permisos efectivos, en lugar de convertirse en administradores.

Los permisos internos pueden combinarse entre roles internos. No conceden acceso a Windows, IIS, SQL Server ni RDP. Los permisos se releen en el servidor en cada petición; el navegador también actualiza su sesión periódicamente. La caché de datos distingue identidad, asociaciones, roles y permisos: cuando cambia la autorización, se consultan datos nuevos y se cierran las vistas anteriores, sin reutilizar sus formularios abiertos.

## Experiencias predeterminadas

| Perfil | Espacio y herramientas | Límite principal |
|---|---|---|
| Paciente | Mi inicio, mis citas, mi perfil, documentos publicados, servicios y especialistas | Solo sus datos; sin buscador de pacientes, inventario ni formularios administrativos |
| Empresa | Empleados asociados, citas cubiertas, consumos, comprobantes, documentos del convenio y reportes | Identidad mínima de empleados y actividad con cobertura explícita; sin expediente ni motivos de consulta |
| Médico | Mi jornada, mi agenda, mis citas, mis pacientes, expedientes y documentos | Pacientes con relación asistencial; no confirma citas ni hace check-in de recepción |
| Recepción | Registro de pacientes, agenda, citas, confirmación, check-in y documentos administrativos | Sin notas de consulta, diagnósticos ni tratamientos |
| Administrador general | Coordinación operativa, catálogos y reportes | Sin expedientes clínicos ni administración técnica crítica por defecto |
| Administración clínica | Coordinación de médicos, consultorios, pacientes, citas y reportes | Sin notas de consulta; dispone de los servicios necesarios para programar citas |
| Administración financiera | Servicios, pagos, comprobantes, empresas y reportes | Identidad mínima de pacientes; sin detalles clínicos ni notas de citas |
| Administrador de usuarios | Cuentas, roles y auditoría | Selectores mínimos para asociar cuentas; no accede al directorio clínico ni puede delegar autoridad crítica que no posee |
| Auditor | Eventos y reportes agregados | Sin listas identificables de citas, motivos ni notas; lectura y exportación autorizada |
| Soporte | Estado de la aplicación, configuración de lectura e historial de respaldos | No descarga respaldos ni accede a pacientes por defecto |
| Superadministrador | Administración integral de la aplicación | Permisos de aplicación; no administración remota del servidor |

La navegación, los títulos y los formularios se adaptan al espacio; los controles comunes siguen reutilizándose. Escribir una ruta administrativa directamente no evita la protección, y llamar a la API tampoco.

## Citas y documentación

- `Notes`: notas internas operativas. Solo se devuelven con `appointments.notes.read`, y requieren `appointments.notes.write` para modificarse. No equivalen a notas del expediente clínico.
- `Instructions`: indicaciones autorizadas para el paciente, independientes de las notas internas. El paciente no puede sobrescribirlas al reagendar.
- Confirmar y registrar llegada requieren `appointments.confirm` y `appointments.checkin` respectivamente.
- Solicitar cita como paciente usa un formulario personal y horarios disponibles. La API asigna el consultorio y evita revelar nombres de otros pacientes. La solicitud tiene un horizonte máximo de 180 días y los cambios respetan el plazo configurado de la clínica.
- Una cita cancelada o rechazada no crea por sí sola una relación que permita al médico abrir el expediente. Una relación previa no cancelada, incluso una consulta finalizada, permite continuidad asistencial: restringir esa duración sería una política adicional.
- Publicar archivos, exportar reportes y descargar respaldos son acciones independientes (`documents.publish`, `reports.export`, `backups.download`).
- La exportación de reportes usa campos explícitos y comprobación del servidor; no serializa motivos o notas ocultos. El CSV escapa fórmulas.

## Cobertura empresarial

`Appointment.CompanyId`, `Payment.CompanyId` y `Document.CompanyId` representan cobertura o compartición explícita. La empresa no hereda toda la actividad privada de una persona porque esta figure como empleado.

Para crear cobertura se comprueba empresa activa, asociación del paciente y vigencia del convenio. Los documentos empresariales se limitan a comprobantes publicados y compartidos expresamente. Un estudio, receta o resultado no se entrega al portal empresarial.

La cobertura histórica no se recalcula automáticamente al cambiar la empresa actual del paciente. Los registros anteriores sin cobertura quedan privados: es intencional que el portal empresarial aparezca vacío hasta registrar actividad cubierta. No se asignó retrospectivamente ningún convenio a los datos existentes.

## Actualización sin pérdida de datos

- SQLite de desarrollo: actualización aditiva; se realiza una copia consistente antes de añadir las columnas a una base antigua. Copias en `data/schema-backups/`.
- SQL Server: migración EF `20261003200635_RolePortalsAndCoverage` y script idempotente actualizado en `database/ClinicaDB.sql`. Generados, todavía no ejecutados contra SQL Server real.
- La política de roles antigua se actualiza una sola vez (`PolicyVersion`); los cambios posteriores de permisos no se reescriben en cada arranque.
- Se conservaron las columnas originales de pacientes, citas, notas clínicas, documentos, pagos, empresas, personal e instalaciones. Se compararon con el respaldo previo. No se vació ni recreó la base.
- Se añadieron tres cuentas ficticias faltantes únicamente en el entorno de demostración: `general`, `accesos`, `coordinacion`.
- Los roles personalizados antiguos con asociaciones incompatibles requieren revisión del administrador; el sistema bloquea el alcance ambiguo, no lo amplía silenciosamente.

## Verificación y pendientes

20 grupos nuevos de roles y 13 grupos de integración aprobados; calendario y paquete publicado aprobados. Navegación de los 11 perfiles revisada, junto con selectores de asociación y reserva de cita a 390 × 640. No se guardaron registros clínicos nuevos durante esta revisión visual.

Los grafos y el informe de `graphify-out/ROLES_ANALYSIS.md` describen el estado anterior a esta implementación y están marcados para actualizarse; no son una certificación de la versión actual. Sirvieron para localizar relaciones de permisos, formularios y respuestas que debían separarse.

Esta validación es local con SQLite/Development. Faltan SQL Server/IIS/HTTPS reales, pruebas de carga, restauración y aceptación por usuarios antes de manejar información clínica real. TOTP, sesiones persistidas, confirmación sensible y recuperación supervisada ya están implementados; antimalware y políticas de Windows siguen siendo tareas de despliegue. ClinicaDeploy permanece fuera de alcance. Consulta `VERIFICATION.md` y `SECURITY.md`.
