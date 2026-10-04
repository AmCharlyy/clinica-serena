import type { Session } from "./api";

export function workspaceFor(user: Session) {
  const can = (permission: string) => user.permissions.includes(permission);
  if (user.audience === "blocked")
    return {
      name: "Acceso pendiente",
      title: "Tu acceso necesita revisión.",
      description:
        "Contacta al administrador para corregir el tipo de acceso y su asociación. No se conceden permisos mientras exista una configuración incompatible.",
      kind: "blocked",
    };
  if (user.audience === "patient")
    return {
      name: "Mi salud",
      title: "Tu salud, en un mismo lugar.",
      description:
        "Tus citas, documentos publicados y datos personales. Solo tú y el equipo autorizado.",
      kind: "patient",
    };
  if (user.audience === "company")
    return {
      name: "Portal de mi empresa",
      title: "Tu convenio, con claridad.",
      description:
        "Empleados asociados y atención cubierta por tu convenio. Las consultas privadas no se comparten.",
      kind: "company",
    };
  if (user.audience === "doctor")
    return {
      name: "Mi espacio clínico",
      title: "Tu jornada, centrada en las personas.",
      description:
        "Tu agenda y los pacientes con una relación asistencial válida, sin herramientas de recepción o finanzas.",
      kind: "doctor",
    };
  if (user.roles.includes("Superadministrador"))
    return {
      name: "Administración integral",
      title: "Una clínica conectada y bajo control.",
      description:
        "Operación, acceso y herramientas críticas de la aplicación, claramente separados.",
      kind: "admin",
    };
  if (can("users.read") || can("roles.read"))
    return {
      name: "Gestión de accesos",
      title: "El acceso correcto para cada persona.",
      description:
        "Cuentas, asociaciones y permisos. Sin acceso automático a información clínica.",
      kind: "access",
    };
  if (can("payments.read"))
    return {
      name: "Administración financiera",
      title: "Las cuentas claras, la atención tranquila.",
      description:
        "Cobros, comprobantes y convenios con información mínima del paciente.",
      kind: "finance",
    };
  if (can("system.read"))
    return {
      name: "Soporte técnico",
      title: "Un sistema disponible para cuidar.",
      description:
        "Conectividad, configuración y respaldos autorizados. Sin pacientes ni expedientes.",
      kind: "support",
    };
  if (can("audit.read") && !can("appointments.read"))
    return {
      name: "Auditoría",
      title: "Trazabilidad sin acceso innecesario.",
      description:
        "Eventos y reportes agregados. Los motivos de consulta y notas no forman parte de los reportes.",
      kind: "audit",
    };
  if (
    can("appointments.read") &&
    (can("appointments.confirm") || can("appointments.checkin")) &&
    !can("staff.write") &&
    !can("infrastructure.write")
  )
    return {
      name: "Recepción",
      title: "La jornada empieza contigo.",
      description:
        "Pacientes, confirmaciones y llegadas, según tus permisos de operación.",
      kind: "reception",
    };
  if (
    !can("appointments.read") &&
    !can("staff.read") &&
    !can("infrastructure.read") &&
    can("backups.read")
  )
    return {
      name: "Seguimiento de respaldos",
      title: "Un sistema disponible para cuidar.",
      description:
        "Historial de respaldos autorizado, sin diagnóstico ni descarga implícitos.",
      kind: "support",
    };
  if (
    !can("appointments.read") &&
    !can("staff.read") &&
    !can("infrastructure.read")
  )
    return {
      name: "Mi trabajo",
      title: "Tu espacio de trabajo está listo.",
      description:
        "Tus avisos y las herramientas autorizadas para esta cuenta.",
      kind: "personal",
    };
  return {
    name: "Coordinación de la clínica",
    title: "Un buen día para coordinar.",
    description:
      "Pacientes, recursos y agenda según tus responsabilidades, sin acceso clínico implícito.",
    kind: "operations",
  };
}
