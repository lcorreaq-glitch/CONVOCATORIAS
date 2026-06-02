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

### Módulo Jurados parametrizable + Mi Perfil + IA (Feb 2026 v7)
- ✅ **Campo `aplica_a` ('propuesta' | 'jurado')** en modelo Campo. Configuración → Campos ahora tiene sub-tabs visibles para alternar.
- ✅ **Tipo de campo `archivo`** con upload base64 hasta 10MB (PDF, DOCX, XLSX, ZIP, JPG). Endpoint `POST /api/upload/file`.
- ✅ **IA mejorar redacción**: `POST /api/ai/mejorar-texto` con Emergent LLM Key + GPT-4o. Botón "✨ Mejorar con IA" sobre el campo Perfil en JuradoForm y MiPerfil.
- ✅ **JuradoForm dinámico**: secciones (Datos personales, Subregiones multiselect, Perfil + IA, Información adicional con campos extra dinámicos + hoja de vida).
- ✅ **Jurados list rediseñado**: banner contextual, columnas dinámicas (`uso_lista`), filtros estilo Airtable, búsqueda.
- ✅ **Plantilla XLSX dinámica** según campos jurado configurados. Carga masiva con normalización de subregiones (formato `; o ,`).
- ✅ **Ruta `/mi-perfil`** para rol Jurado: ver/editar datos seguros (teléfono, perfil con IA), subir foto y hoja de vida. Datos críticos (nombre, email, subregiones) solo lectura.
- ✅ **Seed INC2026**: 8 campos jurado + 29 jurados cargados desde el Excel del usuario con normalización de subregiones desordenadas.

### Asignaciones: carga masiva + asignación automática (Feb 2026 v9)
- ✅ Banner contextual `ConvocatoriaContextBanner` agregado en /asignaciones.
- ✅ **Plantilla XLSX dinámica** (`GET /api/asignaciones-template`) con hojas auxiliares de referencia: Propuestas, Ternas, Jurados.
- ✅ **Carga masiva** (`POST /api/asignaciones-import`): admite filas con `propuesta_codigo`, `tipo_evaluacion` (individual/colectiva), `terna_codigo` o `jurado_email`. Detecta duplicados y crea evaluación borrador automáticamente.
- ✅ **Asignación automática inteligente** (`POST /api/asignaciones/auto`): criterios configurables — N jurados por propuesta, filtrar por subregión, balancear carga, asignar terna por subregión. NO duplica asignaciones existentes. UI con switches para cada criterio + resultado detallado.

### Módulo Jurados parametrizable + Mi Perfil + IA (Feb 2026 v7 + v8)
- ✅ v7: Campos por aplica_a, tipo archivo, IA, JuradoForm dinámico, banner, columnas dinámicas, plantilla XLSX dinámica, /mi-perfil, 29 jurados seed.
- ✅ **v8 — Vista detalle compartida**: nuevo componente `JuradoDetalle` (drawer/Dialog read-only) accesible a cualquier rol autenticado con botón 👁 en cada fila. Muestra avatar, contacto, subregiones, perfil completo, hoja de vida descargable y todos los campos extras. Solo admin ve botón "Editar" en el footer.
- ✅ Columna **Teléfono** activada en grilla (`uso_lista: true`).
- ✅ Link al **`/mi-perfil`** desde el user-block del sidebar (clickeable para cualquier rol).
- ✅ Permisos verificados: rol Jurado puede ver lista + detalle, no edita; admin puede todo.

### Filtros dinámicos en /propuestas (Feb 2026 v5 + v6)
- ✅ v5: Filtros dinámicos según campos con `uso_filtro=true`.
- ✅ **v6 (UX rediseñada estilo Airtable/Notion)**: solo búsqueda + Estado + botón "Filtrar por…" visibles por defecto. Click → Popover con buscador y lista de campos disponibles. Cada filtro elegido se agrega como **chip activo** con su control inline + X. Botón "Limpiar" cuando hay activos. Patrón profesional y manejable incluso con 20+ campos disponibles.

### Flags editables `uso_propuesta` + `uso_lista` y columnas dinámicas (Feb 2026 v4)
- ✅ Eliminado el badge fijo `propuesta` en Configuración → Campos. Reemplazado por **2 flags editables**:
  - **`form propuesta`** (verde) — controla si el campo aparece en el formulario de Propuesta.
  - **`lista propuestas`** (azul) — controla si el campo aparece como columna en la tabla de /propuestas.
- ✅ Tabla `/propuestas` ahora **renderiza columnas dinámicamente** según los campos con `uso_lista=true`. Backend `CampoIn` actualizado.
- ✅ `PropuestaForm` filtra solo campos con `uso_propuesta!==false`.
- ✅ INC2026 seedeada: 7 campos con `uso_lista=true` (subregion, municipio, tipo_organizacion, linea, tematica, nombre_organizacion, nit_rut) y todos con `uso_propuesta=true`.

### Banner de contexto + Vista previa del formulario (Feb 2026 v3)
- ✅ Nuevo componente **`ConvocatoriaContextBanner`** visible en /propuestas (y reutilizable en otros módulos): muestra en qué convocatoria está parado el usuario, switcher inline, contadores de campos/catálogos/propuestas y link rápido a Configuración.
- ✅ Botón **"Vista previa del formulario"** en Configuración → Campos: abre el formulario exacto que verán los usuarios al crear una propuesta, en modo solo-lectura (PropuestaForm prop `previewMode=true`).
- ✅ Refuerzo en card "Campos" del Resumen con tip sobre la vista previa.

### Módulo Propuestas con formulario dinámico (Feb 2026)
- ✅ **Formulario dinámico de propuesta** que renderiza inputs según los campos configurados de la convocatoria activa. Selects de lista/multi alimentados desde catálogos vinculados. Componente: `/app/frontend/src/pages/propuestas/PropuestaForm.jsx`.
- ✅ Botón **"Nueva propuesta"** + icono Editar por fila en `/app/frontend/src/pages/Propuestas.jsx`.
- ✅ Secciones agrupadas: Identificación · Territorial · Organización · Categorización · Datos administrativos.
- ✅ Validación de obligatorios con marcado visual en rojo + toast.
- ✅ **Alineación INC2026 con plantilla Excel oficial** (17 columnas) vía `/app/backend/align_inc2026.py` (idempotente). Campos agregados: nombre_organizacion, nit_rut, id_organismo_comunal, ganador_2024, ganador_2025. Catálogos nuevos: **Municipios (125 valores de Antioquia)**, **Temáticas (8 sublíneas)**. Remapeo de catalogo_id en municipio (texto→lista), tipo_organizacion, enfoque_poblacional, linea, tematica.

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

### Ranking & Desempates rediseñado (Feb 2026 v10)
- ✅ **Panel "Cómo se calcula este ranking"** con explicación dinámica según `modo` (colectivo = promedio jurados terna, con fallback a promedio individuales; individual = promedio individuales finalizadas).
- ✅ **Reglas de desempate en cascada visibles** como chips numerados en el header.
- ✅ **Historial movido a Popover** ("Historial (N)") en el header en lugar de chips llenando la franja superior.
- ✅ **Columna "Fuente"** por propuesta (Colectiva / Promedio individuales / Sin evaluación) con badges tonales.
- ✅ **Detalle de propuesta (Dialog)** accesible con botón "Detalle ▸" por fila — muestra: puesto, puntaje oficial vs máximo, diferencial, fuente, tabla de criterios oficiales (puntaje / máximo / %), criterios diferenciales (caja naranja, no suman), y reglas de desempate con el **valor real** que tomó cada regla para esa propuesta + indicador "↑ Aplicada" cuando la regla se ejecutó.
- ✅ **Indicador visual de empate**: filas con mismo `puntaje_total` resaltadas en amarillo claro.
- ✅ Default `modo=colectivo` + `agrupar_por=subregion` (alineado con la spec: ranking por subregión sobre evaluación colectiva).

### Sistema de Actas configurables — 3 tipos + firmas (Feb 2026 v11)
**Fase A — Infraestructura de firmas**
- ✅ Nuevo componente `SignaturePad` (canvas táctil/mouse + subida de imagen PNG/JPG vía `/api/upload/image`).
- ✅ `MiPerfil` ahora incluye **campo Documento (C.C.)** y sección **"Firma para actas"** con canvas + upload.
- ✅ `JuradoDetalle` (drawer admin) muestra firma registrada y permite al admin **capturarla en nombre del jurado**.
- ✅ Datos almacenados en `jurados.datos.firma_url` (data URL base64) y `jurados.datos.cedula`.

**Fase B — Plantillas de Actas configurables**
- ✅ Nueva tab "Plantillas de Actas" en `/configuracion` con sidebar de 3 tipos (Individual / Colectiva-Terna / Subregional).
- ✅ 7 campos editables por plantilla: encabezado, considerandos, certificación, tabla_titulo, tabla_subtitulo, texto_cierre, pie_firmantes_titulo.
- ✅ **11 etiquetas dinámicas** (merge tags) con copiado al portapapeles: `{{convocatoria_nombre}}`, `{{convocatoria_codigo}}`, `{{convocatoria_vigencia}}`, `{{fecha}}`, `{{fecha_dia}}`, `{{fecha_mes}}`, `{{fecha_anio}}`, `{{jurado_nombre}}`, `{{jurado_documento}}`, `{{subregion}}`, `{{terna_codigo}}`.
- ✅ **Toggle** `uso_acta_subregional` (por convocatoria) — habilitado por default en INC2026.
- ✅ Seed con **texto literal** de los 3 .docx de Iniciativas 2026 cuando `codigo=INC2026`; placeholder genérico para otras convocatorias.

**Fase C — Generación PDF + Workflow de firma**
- ✅ `GET /api/actas/individual-jurado/{jurado_id}` → PDF con encabezado · NOMBRE/SUBREGIÓN · CONSIDERANDO QUE · CERTIFICO QUE · tabla (Nº/Propuesta/Municipio/Org/Puntaje/Observación) · cierre · firma del jurado embebida.
- ✅ `GET /api/actas/colectiva-terna/{terna_id}` → PDF de los 3 integrantes con firmas embebidas.
- ✅ `GET /api/actas/subregional?convocatoria_id=...&subregion=...` → PDF firmable por todos los jurados de la subregión.
- ✅ `POST /api/actas/individual-jurado/{jid}/forzar` → admin marca el acta como emitible aun sin todas las evaluaciones finalizadas.
- ✅ `POST /api/actas/colectiva-terna/{tid}/firmar` y `POST /api/actas/subregional/firmar` → cada jurado registra su firma (requiere firma cargada en Mi Perfil).
- ✅ Endpoint de estado `GET /api/actas-pendientes` devuelve estado de los 3 tipos: Pendiente / Requiere firma / Falta firmar / Emitible.

**Fase D — UI rediseñada `/actas`**
- ✅ 3 tabs: Individuales (9) · Colectivas (Terna) (1) · Subregionales (6 INC2026) — la última se oculta si `uso_acta_subregional=false`.
- ✅ Banner explicativo por tab + tabla con avance (barra de progreso), documento del jurado, estado de firma, badges de estado y acciones contextuales (Forzar / Firmar / Descargar PDF).
- ✅ Dialog de confirmación al forzar acta individual.

### Rediseño UX `/evaluaciones/individual/:id` (Feb 2026 v12)
- ✅ **Layout vertical** (eliminado split 2 columnas).
- ✅ **Header sticky compacto**: back · código/nombre · estado · totales con barra de progreso · acciones.
- ✅ **Banda resumen horizontal** con datos clave de la propuesta inline (Organización, Subregión, Municipio, Tipo, NIT, Línea, Temática) + iconos por tipo de campo.
- ✅ **Drawer "Ficha completa"** lateral con todos los campos `uso_propuesta/uso_actas/uso_lista` (botón en banda resumen).
- ✅ **Criterios a todo el ancho** (max-w 1280px centrado): mejor legibilidad, textarea + sugerencia IA en línea.
- ✅ **Totales con tarjetas semánticas**: oficial verde + diferencial amarillo (no suma).
- ✅ Banner v1 con grid de 5 criterios cuando es etapa colectiva.

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
