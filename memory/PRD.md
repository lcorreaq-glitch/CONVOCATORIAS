# KRINOS - Plataforma de Convocatorias, Evaluación, Jurados, Ranking y Actas

## Problema y propósito
Plataforma web parametrizable para gestionar convocatorias, concursos, estímulos, becas y procesos de selección que requieran cargar propuestas, consultar expedientes documentales, asignar evaluadores, realizar evaluaciones individuales y colectivas, consolidar puntajes, generar rankings, resolver desempates, producir actas y generar reportes.

**Primer caso configurado**: Iniciativas Comunitarias Antioquia 2026 (INC2026) — Gobernación de Antioquia.

## Stack
- **Backend**: FastAPI + MongoDB (motor async), JWT con bcrypt, pydantic v2, openpyxl (Excel), reportlab (PDF).
- **Frontend**: React 19 + React Router + Tailwind + shadcn/ui + lucide-react + sonner.
- **Auth**: JWT Bearer token vía `Authorization` header (cross-origin safe). 7 roles: admin_general, admin_convocatoria, supervisor, jurado, integrante_terna, invitado, auditor.

## User personas
1. **Administrador General (`lcorreaq`)** — máximo nivel, configura convocatorias, usuarios, parámetros globales.
2. **Administrador de Convocatoria** — opera y configura una convocatoria específica.
3. **Supervisor** — seguimiento y monitoreo; sin permisos de edición de evaluaciones.
4. **Jurado** — evalúa propuestas asignadas (Borrador→Iniciada→En edición→Finalizada→Firmada).
5. **Integrante de Terna** — participa en evaluación colectiva.
6. **Invitado de Consulta** — solo lectura.
7. **Auditor** — accede a auditoría y trazabilidad.

## Core requirements (estáticos)
- Configuración 100% paramétrica sin tocar código (convocatorias, campos, catálogos, criterios, desempates).
- Carga masiva Excel para propuestas y jurados con plantilla autogenerada.
- Expediente documental externo (URLs Drive/OneDrive) o interno.
- Asignaciones manuales o masivas (por subregión).
- Evaluación individual con máquina de estados estricta y bloqueo por fecha.
- Evaluación colectiva como promedio configurable de individuales finalizadas.
- Ranking agrupado por cualquier campo (subregión, línea, etc.) con desempates en cascada.
- Actas PDF generadas con plantilla institucional (logo Gobernación, firmantes, código verificación).
- Reportes: avance por jurado, avance por terna, consolidado individual, exportables a Excel.
- Auditoría completa (usuario, rol, acción, entidad, valor anterior/nuevo, fecha/IP).

## Implementado (1ª iteración — Jun 02, 2026)
### Backend (FastAPI)
- ✅ Auth JWT (login, /me, logout, refresh) con brute-force lockout (5 intentos, 15 min, identifier-only key para k8s).
- ✅ Usuarios CRUD (solo admin_general).
- ✅ Convocatorias CRUD + estados (Borrador/Configurada/Activa/Suspendida/Finalizada/Anulada).
- ✅ Catálogos CRUD con jerarquía (`padre_id`, `padre_valor_id`).
- ✅ Campos personalizados (16 tipos: texto, número, fecha, lista, etc.) con flags por convocatoria.
- ✅ Criterios oficiales + diferenciales (no suman al 100).
- ✅ Reglas de desempate ordenadas con tipos de comparación.
- ✅ Propuestas: CRUD, filtros, **plantilla Excel + carga masiva**.
- ✅ Jurados: CRUD, **plantilla Excel + carga masiva**, auto-creación de usuario asociado.
- ✅ Ternas: CRUD, integrantes con roles.
- ✅ Asignaciones: manual, **asignación masiva por subregión** (crea individuales + colectivas automáticamente).
- ✅ Evaluaciones individuales: state machine completa, validación de criterios obligatorios/rangos, firma.
- ✅ Evaluaciones colectivas: cálculo automático de promedio de individuales finalizadas.
- ✅ Rankings: agrupación configurable, desempates en cascada automáticos.
- ✅ Actas PDF: individual, colectiva, ranking — con reportlab y encabezado institucional.
- ✅ Reportes: avance jurado, avance terna, consolidado individual, auditoría — exportables Excel.
- ✅ Dashboard: 11 métricas + distribución por subregión.
- ✅ Auditoría: registra todas las acciones (create/update/delete/login/firma/generate_acta).

### Frontend (React)
- ✅ Login institucional con layout asimétrico 42/58, hero geométrico Cabinet Grotesk + IBM Plex.
- ✅ Sidebar institucional con selector de convocatoria activa.
- ✅ Dashboard con grid de control room y barras de subregión.
- ✅ Convocatorias (cards), Configuración (tabs: campos/catálogos/criterios/desempates).
- ✅ Propuestas con filtros, carga masiva Excel, link a expediente.
- ✅ Jurados con carga masiva Excel.
- ✅ Ternas con integrantes y "Asignar por subregión" 1-click.
- ✅ Asignaciones con creación manual y reasignación.
- ✅ Evaluación individual con **split-pane** (expediente | criterios), Guardar/Finalizar/Firmar/Acta PDF.
- ✅ Evaluación colectiva con puntajes consolidados.
- ✅ Ranking visualizado por grupos con corona Top 1 y columna desempate.
- ✅ Actas (individual + colectiva con descarga PDF).
- ✅ Reportes con tabs y export Excel.
- ✅ Auditoría con buscador y filtros.
- ✅ Usuarios con creación y activación/desactivación.

### Datos demo precargados
- 1 convocatoria (INC2026), 9 catálogos, 16 campos, 10 criterios, 7 desempates.
- **12 propuestas** habilitadas distribuidas en 6 subregiones, **6 jurados** con usuarios asociados, **3 ternas** (T1 Urabá, T2 Oriente, T3 Norte), **24 evaluaciones** individuales en Borrador.

### Módulo Configuración rediseñado (Feb 2026)
- ✅ Pestaña **Resumen** con diagrama de flujo, alertas y mapa de vinculaciones + sección de tipos de comparación del sistema.
- ✅ **Vinculación explícita**: campos tipo lista usan selector de Catálogo; desempates usan selector Criterio/Campo/Sorteo.
- ✅ **Ordenamiento**: drag&drop nativo + botones ↑↓ + sort por columna + búsqueda. Endpoints `POST /api/{campos|criterios|desempates}/reordenar`.
- ✅ **Reutilización amigable** (Feb 2026 v2): renombrado "Clonar" → **"Usar como plantilla"** con wizard de 3 pasos (Elegir → Vista previa → Listo). JSON Import/Export movidos a menú "Avanzado". Onboarding al crear convocatoria con tarjetas "En blanco" vs "Desde plantilla". Cada card de Convocatorias tiene botón "✨ Usar otra como plantilla para esta".
- ✅ **Switcher de convocatoria** prominente en cabecera del módulo (además del sidebar).
- ✅ **"Se usa en" editable inline** con popover en flags de Campos.
- ✅ **Catálogos como tabla unificada** con popover de valores, columna "Usado por (campos)" y hard-delete con check de uso.
- ✅ **Endpoint resumen**: `GET /api/convocatorias/{cid}/configuracion/resumen` devuelve counts, catalogo_usage, desempate_refs, alertas, stats.
- ✅ Componentes split: `/app/frontend/src/pages/configuracion/{ResumenPanel,CamposPanel,CatalogosPanel,CriteriosPanel,DesempatesPanel,AccionesGlobales,SortableTable,InlineFlagsEditor,PlantillaWizard}.jsx`.

## Testing
- **Backend**: 39/39 PASS (100%) — ronda 2 tras fix de ObjectId leak y brute-force key.
- **Frontend**: validación manual con screenshots en login → dashboard → ranking → configuración → reportes.

## Backlog / próximas tareas

### P0 (cierre de funcionalidad clave)
- [ ] Pantalla "Mis evaluaciones" optimizada para rol Jurado (vista filtrada por defecto, contador de pendientes).
- [ ] Expansión del seed `subregion_to_terna` para cubrir Suroeste, Bajo Cauca, Magdalena Medio.
- [ ] Firma electrónica de actas colectivas (estado parcial/total).
- [ ] Habilitación documental (estado "Subsanación pendiente" con flujo).

### P1 (segunda fase del documento original)
- [ ] Asignación automática por reglas (carga por jurado, especialidad, territorio).
- [ ] Integración Google Drive API para listado de archivos desde la carpeta del expediente.
- [ ] Notificaciones por correo (SendGrid/Emergent) a jurados y supervisores.
- [ ] Panel público de resultados (lectura para invitados/postulantes).
- [ ] IA asistida (resumen propuesta, sugerencia observación, borrador acta) con Claude Sonnet.

### P2 (mejoras y robustecimiento)
- [ ] Plantillas de actas editables visualmente (WYSIWYG con variables dinámicas).
- [ ] Constructor de reportes ad-hoc (selector de columnas + filtros + agrupaciones).
- [ ] Versión de actas con código QR de verificación.
- [ ] Importación masiva de catálogos.
- [ ] Permisos granulares por convocatoria (matriz rol × convocatoria × acción).
- [ ] Dashboards multi-convocatoria para administrador general.

## Notas técnicas
- Patrón de inserción Mongo: siempre `await db.X.insert_one(doc); doc.pop("_id", None)` antes de retornar (motor muta el dict).
- Auth cross-origin: usar Bearer token via `Authorization` header, NO cookies (CORS wildcard + credentials no es válido).
- Lock_key de brute-force: identifier-only (no IP) para sobrevivir a k8s ingress.
