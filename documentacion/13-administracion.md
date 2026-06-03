# 13 · Administración del sistema

Solo accesible para el rol **Administrador General**.

Menú: `/administracion` con 6 pestañas:

## 1. Usuarios

CRUD completo de usuarios del sistema. Cada usuario tiene:
- `username` único (email).
- `role` (1 de los 7 roles).
- `active` (boolean).

Acciones por usuario:
- **Editar**: nombre, email, rol, contraseña.
- **Desactivar / Activar**.
- **Eliminar** (hard-delete vía DELETE `/api/users/{id}`).

> No se puede eliminar al usuario `admin_general` actualmente autenticado.

## 2. Roles & Permisos

Matriz **predefinida** de permisos rol × módulo × acción. Por ahora es **read-only** (v1 estática).
Roadmap: convertir en editable (P2).

## 3. IA Asistida

Configura el proveedor de IA (OpenAI, Anthropic, Gemini) y el modelo.
- **Universal Key**: usa el balance de Emergent LLM Key (recomendado).
- **BYOK**: pega tu propia API key (sk-…).

Capacidades activas:
- ✨ Resumen de propuesta
- ✨ Sugerencia de observación de evaluación
- ✨ Mejora de redacción del perfil de jurado
- ⏳ Detección de inconsistencias (próximo)

## 4. Correos (SendGrid)

Configura:
- API Key (Mail Send Full Access)
- Email remitente verificado
- Nombre remitente

Plantillas embebidas (triggers):
- `jurado_invitado` · cuando se crea un jurado
- `recordatorio_evaluacion` · 3 días antes del cierre
- `habilitacion` · cuando una propuesta cambia de estado
- `resultados` · al publicar ranking
- `reset_password` · solicitud del usuario
- `acta_firmada` · cuando un jurado firma

> **Estado actual: MOCKED**. Los envíos se activarán cuando registres una API key válida.

## 5. Imagen gráfica

- Nombre del producto, tagline, propietario.
- Colores primario y secundario (afecta cabeceras y badges).
- Vista previa en tiempo real.

## 6. Sistema (NUEVO)

Operaciones críticas del administrador:

### 6.1 Reiniciar datos operativos

⚠️ **Acción destructiva**. Borra todos los datos operativos (propuestas, jurados, ternas, asignaciones, evaluaciones, rankings, actas) **preservando la configuración** y al admin general.

Opciones:
- ☑ Eliminar usuarios (excepto admin_general)
- ☑ Eliminar registros de auditoría
- ☑ Filtrar por convocatoria_id (si vacío, afecta todas)
- ✍ Confirmación: escribir `REINICIAR`

Endpoint backend: `POST /api/admin/reset-datos`.

### 6.2 Usuarios de prueba por rol

Crea (idempotente) 8 usuarios de prueba:

| Email | Rol | Password |
|-------|-----|----------|
| admin.conv@krinos.test | admin_convocatoria | Pruebas2026! |
| supervisor@krinos.test | supervisor | Pruebas2026! |
| invitado@krinos.test | invitado | Pruebas2026! |
| auditor@krinos.test | auditor | Pruebas2026! |
| integrante@krinos.test | integrante_terna | Pruebas2026! |
| jurado1@krinos.test | jurado | Pruebas2026! |
| jurado2@krinos.test | jurado | Pruebas2026! |
| jurado3@krinos.test | jurado | Pruebas2026! |

Si la convocatoria activa está seleccionada, también crea los 3 jurados en `db.jurados` listos para conformar ternas.

Endpoint: `POST /api/admin/seed-test-users?convocatoria_id=<id>`.

### 6.3 Catálogo "Estados de Propuesta"

Crea el catálogo del workflow de habilitación documental con 13 estados:

`Registrada → En revisión documental → Habilitada / No habilitada / Subsanación pendiente → Subsanada → Asignada → En evaluación individual → En evaluación colectiva → Rankeada → Ganadora / Elegible / Lista de espera`

Endpoint: `POST /api/admin/seed-estados-propuesta?convocatoria_id=<id>`.

Una vez creado, el dropdown de Estado en `/propuestas` lo usa automáticamente y se puede editar desde `Configuración → Catálogos`.
