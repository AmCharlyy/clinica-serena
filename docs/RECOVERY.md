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

En despliegues sin certificado configurado, las claves se protegen con DPAPI en Windows y están vinculadas a la identidad del proceso. Esto incluye secretos TOTP, borradores y sellos de auditoría: perder las claves no es solo perder sesiones. Copiarlas a otra máquina sin su protección correspondiente no permite descifrar esos datos. Las cuentas/contraseñas de la aplicación viven en la base, no dentro del frontend.

ClinicaDeploy configura un certificado de recuperación separado del HTTPS para proteger Data Protection. Sus respaldos técnicos `.serena` incluyen claves protegidas, documentos, base y configuración sin secretos; el PFX privado se exporta y custodia por separado. Detiene el sitio durante la instantánea y verifica el cifrado/hash antes de declarar éxito. La recuperación integrada usa una base y una carpeta nuevas, nunca `WITH REPLACE`. Para otro servidor hace falta importar el PFX, validar integridad y promover la copia bajo mantenimiento. Consulta [DEPLOY.md](DEPLOY.md) para el proceso y las limitaciones. Los ZIP manuales antiguos descritos arriba no sustituyen estas copias completas.

El respaldo manual realiza una instantánea de base y después copia documentos; antes de utilizarlo como mecanismo definitivo hace falta coordinarlo con una ventana sin cargas de archivos o un mecanismo de snapshot, definir retención y verificar restauraciones periódicas. La copia incluye información de backup existente al momento de la instantánea; el evento final de terminación se guarda después en la base operativa.
