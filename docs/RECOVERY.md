# Recuperación controlada

Cada ZIP manual incluye `ClinicaDB.db` (desarrollo) o `ClinicaDB.bak` (SQL Server), `documents/` y un `manifest.json` con hashes SHA-256 de archivos. Guarda estas copias en un medio distinto al servidor. Contienen información privada y requieren protección.

## Prueba de recuperación

1. Trabaja en un entorno aislado y extrae el ZIP en un directorio nuevo.
2. Verifica los hashes de cada documento contra `manifest.json`.
3. Para SQLite, abre `ClinicaDB.db` y ejecuta `PRAGMA integrity_check`; conecta una API de Development apuntando a esa copia y a los documentos extraídos.
4. Para SQL Server, ejecuta `RESTORE VERIFYONLY` y restaura el `.bak` como una base **diferente**, con rutas de datos/log propias. No reemplaces la base operativa para probar.
5. Inicia la aplicación contra la copia, comprueba usuarios, citas, expediente y descargas autorizadas.
6. Documenta tiempo de recuperación, cantidad de registros y resultado de las comprobaciones.

La restauración operativa se hace durante una ventana de mantenimiento: detener escrituras, conservar una copia del estado actual, restaurar base y documentos coordinadamente, comprobar la versión de esquema y verificar accesos antes de reabrir. Después de una recuperación se deben invalidar las sesiones y restablecer accesos cuando corresponda. No se automatizó el reemplazo de una base operativa desde la web.

Las claves de sesión se protegen con DPAPI en Windows y están vinculadas a la identidad del proceso. En otra máquina se generan nuevas claves y los usuarios vuelven a iniciar sesión. Las cuentas/contraseñas de la aplicación viven en la base, no dentro del frontend.

El respaldo manual realiza una instantánea de base y después copia documentos; antes de utilizarlo como mecanismo definitivo hace falta coordinarlo con una ventana sin cargas de archivos o un mecanismo de snapshot, definir retención y verificar restauraciones periódicas. La copia incluye información de backup existente al momento de la instantánea; el evento final de terminación se guarda después en la base operativa.
