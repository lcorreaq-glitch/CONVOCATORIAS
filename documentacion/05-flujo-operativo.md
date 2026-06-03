# 05 · Flujo operativo oficial

> Guía paso a paso recomendada para arrancar una convocatoria en KRINOS desde cero hasta la publicación de resultados.

## Orden recomendado

```
1. CONFIGURACIÓN (admin)
   ├─ a. Crear / activar la convocatoria
   ├─ b. Definir campos (propuesta + jurado)
   ├─ c. Cargar catálogos (subregiones, municipios, líneas, estados, etc.)
   ├─ d. Definir criterios oficiales y diferenciales
   ├─ e. Configurar reglas de desempate (en cascada)
   ├─ f. Subir plantillas de actas + branding institucional
   └─ g. (Opcional) Configurar cupos por grupo (subregión)

2. CARGUE DE JURADOS
   ├─ a. Descargar plantilla XLSX dinámica
   ├─ b. Cargar masivamente → se generan usuarios automáticamente
   └─ c. (Admin) Reset de contraseña + envío por correo institucional

3. CONFORMAR TERNAS / GRUPOS
   └─ a. Crear ternas agrupando jurados por territorio o tema

4. CARGUE DE PROPUESTAS
   ├─ a. Descargar plantilla XLSX dinámica
   ├─ b. Cargar masivamente desde Excel oficial
   └─ c. Validar campos obligatorios

5. HABILITACIÓN DOCUMENTAL (workflow opcional)
   ├─ a. Revisar cada propuesta
   └─ b. Marcar Estado: Habilitada / No habilitada / Subsanación pendiente / Subsanada

6. ASIGNACIONES
   ├─ Opción A: Asignación masiva por subregión (1 click)
   ├─ Opción B: Asignación automática inteligente (con balanceo de carga)
   └─ Opción C: Asignación manual fila por fila

7. EVALUACIÓN INDIVIDUAL (jurados)
   ├─ Cada jurado entra a /evaluaciones → "Continuar"
   ├─ Califica cada criterio (con observación)
   ├─ Estados: Borrador → Iniciada → En edición → Finalizada → Firmada
   └─ Carga su firma digital desde /mi-perfil

8. EVALUACIÓN COLECTIVA (terna)
   ├─ Modalidad 1: Promedio de individuales finalizadas
   └─ Modalidad 2: Nueva evaluación deliberada por la terna

9. RANKING
   ├─ Generar ranking (subregión / línea / general)
   ├─ Aplicar cupos por subregión
   ├─ Desempates automáticos en cascada
   └─ Identificar ganadores vs lista de espera vs incentivos sobrantes

10. ACTAS PDF
    ├─ Acta individual por jurado
    ├─ Acta colectiva por terna (con firmas de los 3 integrantes)
    └─ Acta subregional (firmable por todos los jurados de la subregión)

11. REPORTES Y PUBLICACIÓN
    ├─ Exportar a Excel (avance jurado, avance terna, consolidado, auditoría)
    └─ Compartir dashboard público con invitados de consulta
```

## ¿Cómo se generan las credenciales de un jurado?

1. Al **crear un jurado** (manual o por carga masiva), el sistema:
   - Genera registro en `db.jurados`.
   - Crea automáticamente un **usuario** en `db.users` con:
     - `username` = email del jurado (en minúscula).
     - `password` = `Jurado2026!` por defecto (cargas masivas) o la elegida en el formulario.
     - `role` = `jurado`.

2. Después de crear un jurado **manualmente**, KRINOS muestra un **diálogo "Credenciales generadas"** con usuario + contraseña copiables (visible una sola vez).

3. Si pierdes la contraseña inicial, puedes:
   - Ir a **Jurados** → ícono 🔑 en la fila → "Resetear contraseña".
   - Se generará una nueva contraseña temporal (mostrada una sola vez) para envío al jurado.

4. Cuando esté configurado SendGrid, el sistema podrá enviar el correo automáticamente.

## Reset operativo (antes del lanzamiento oficial)

Si llenaste el sistema con datos de prueba y quieres iniciar oficialmente:

1. Ve a **Administración → Sistema → Reiniciar datos**.
2. Marca las opciones (eliminar usuarios excepto admin, eliminar auditoría).
3. Escribe `REINICIAR` y presiona el botón rojo.
4. El sistema borrará: propuestas, jurados, ternas, asignaciones, evaluaciones, rankings, actas, auditoría, usuarios (salvo admin_general).
5. **Preserva**: convocatorias, campos, catálogos, criterios, desempates, plantillas de actas, branding e imagen.
