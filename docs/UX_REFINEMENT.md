# Refinamiento de experiencia y cuenta

Fecha de revisión: 3 de octubre de 2026.

Esta revisión conserva la dirección visual **Salud serena** y la separación de
datos por audiencia y permisos. Los cambios son de experiencia, accesibilidad y
coherencia; no amplían el acceso de ningún rol.

## Mi cuenta

El avatar de la barra superior y el bloque de identidad de la navegación abren
el mismo menú de cuenta. Desde ahí se accede a:

- **Mi cuenta:** nombre, usuario, tipo de cuenta o funciones asignadas, límite
  de la sesión y acceso a los datos propios permitidos.
- **Seguridad:** estado del autenticador TOTP, códigos de recuperación y cambio
  de contraseña en un panel desplegable.
- **Preferencias:** sonidos, volumen, sonido de nuevos avisos y movimiento
  reducido.
- **Cerrar sesión:** operación única con estado de progreso y error visible.

Las preferencias se guardan por usuario y por navegador. Solo se almacena la
configuración visual y de sonido; no se guardan contraseñas, códigos TOTP ni
datos clínicos en ese espacio del navegador.

## Sonidos y avisos

Los sonidos se generan localmente con Web Audio: no se descargan archivos ni se
envía audio a servicios externos. Se utilizan únicamente para confirmaciones,
errores, nuevos avisos y el último minuto de una sesión. No hay sonido en cada
clic o al pasar el puntero.

- Volumen inicial bajo: 20 %.
- Reproducción únicamente después de una interacción real del usuario.
- Silencio inmediato al desactivar el sonido o esconder la pestaña.
- Las notificaciones pueden silenciarse de forma independiente.
- Los avisos visuales permanecen disponibles aunque todo el audio esté apagado.
- Las muestras de sonido permiten comprobar el volumen antes de trabajar.

La campana muestra el número de avisos sin leer, una vista rápida de los cuatro
más recientes y la acción para marcar cada aviso como leído. Al hacerlo también
se actualiza el contador del inicio correspondiente.

## Coherencia y accesibilidad

- Menús emergentes limitados al área visible, con cierre exterior y con Escape.
- Navegación por teclado en el menú de cuenta y en las pestañas de Mi cuenta.
- El foco regresa al control que abrió una ventana y queda contenido en la
  navegación móvil mientras está abierta.
- En móvil, el fondo queda inactivo, hay un botón de cierre visible y no aparece
  desplazamiento horizontal.
- Las ventanas largas tienen desplazamiento interno; acciones y pie de cuenta
  siguen siendo alcanzables en pantallas pequeñas.
- Las contraseñas tienen controles independientes para mostrar u ocultar el
  contenido, autocompletado adecuado y límites coherentes con el servidor.
- Errores y confirmaciones tienen aspecto, icono, duración y anuncio accesible
  distintos.
- La preferencia de movimiento reducido se aplica inmediatamente y también se
  respeta la configuración del sistema operativo.
- Una caída de red se muestra como problema de conexión y no como cierre de
  sesión. Solo una respuesta de sesión no válida lleva de nuevo al acceso.
- El aviso de sesión distingue inactividad —que sí puede renovarse— del límite
  máximo de seguridad —que exige iniciar sesión otra vez—.

## Correcciones funcionales relacionadas

El inicio del paciente ahora cuenta y presenta como próximas solamente las citas
futuras no terminales. Una cita de hoy cuya hora ya pasó no vuelve a aparecer en
esa lista. Las fechas y horas sin zona explícita se interpretan de forma
consistente y se muestran en la zona de Ciudad de México.

## Verificación realizada

- Compilación TypeScript y empaquetado de producción.
- Pruebas del motor de preferencias y audio, incluida la ausencia de autoplay,
  el silencio, la pestaña oculta y el límite de volumen.
- Pruebas de los once perfiles y sus alcances con una base aislada.
- Pruebas de caché separada por identidad, audiencia, asociaciones, roles y
  permisos.
- Integración del conteo de citas futuras con estados y fechas de frontera.
- Recorrido real en navegador a 1440 × 900 y 390 × 844: cuenta, preferencias,
  contraseña, campana, desconexión, navegación por teclado, foco y Escape.
- Publicación y arranque de humo bajo un mismo origen.

La revisión visual y las pruebas automatizadas utilizaron datos ficticios y una
base separada. En la base local se conservaron sin cambios pacientes, personal,
citas, historial de citas, notas clínicas, documentos, pagos, comprobantes,
empresas, configuración y respaldos. La instancia local activa registró como
leída una notificación del paciente durante la revisión; se conservó ese estado
de uso y no se intentó revertirlo.

## Límites de esta entrega

Este refinamiento no configura IIS, SQL Server, certificados, firewall, RDP,
antimalware ni tareas de respaldo de Windows. Tampoco incluye todavía
`ClinicaDeploy`; esas tareas pertenecen a la validación y al instalador del
servidor.
