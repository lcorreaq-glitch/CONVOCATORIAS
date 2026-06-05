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

### Branding institucional + Tarjeta de convocatoria en Actas (Feb 2026 v13)
- ✅ **Header image institucional**: imagen PNG/JPG horizontal subible desde Configuración → Plantillas de Actas. Se renderiza al inicio de cada PDF como banner (17cm × 3.5cm).
- ✅ **Footer image institucional**: imagen subible que se imprime al final de cada acta (después de firmas).
- ✅ **Tarjeta de Convocatoria** siempre presente en el PDF: muestra CÓDIGO + NOMBRE + VIGENCIA + ENTIDAD con borde lateral verde institucional. Garantiza que cada acta sea identificable.
- ✅ Branding almacenado en `convocatoria.configuracion.acta_branding.{header_image_url, footer_image_url}` como data URLs.
- ✅ Endpoints: `GET /api/convocatorias/{cid}/acta-branding` y `PATCH` (admin). Validado con curl → PDF renderiza el header verde correctamente (verificado vía Gemini OCR del PDF generado).
- ✅ UI: nuevo bloque "Identidad Gráfica Institucional" en lo alto del panel Plantillas, con uploaders dual (Header / Footer), preview de la imagen cargada y botón "Quitar".

### Actas INC2026 alineadas al .docx oficial + Rediseño Eval Colectiva + Vista Jurado (Feb 2026 v14)

**Actas INC2026 — Texto literal según .docx oficial**:
- ✅ Individual: certificación menciona los **5 criterios por nombre** (Incidencia e impacto, Participación e inclusión, Fortalecimiento institucional, Capacidad organizativa, Medio ambiente), "hasta 95 puntos posibles", "5 puntos adicionales de priorización territorial (PDET, Sentencia Río Atrato o Río Cauca)" y **PÁRRAFO CRÍTICO sobre enfoques diferenciales** (mujeres, discapacidad, etnias) que NO suman al tope legal de 100 puntos.
- ✅ Colectiva Terna: certificación con cascada de desempates explícita "(primer registro, mayor impacto, mayor inclusión, enfoque en mujeres, enfoque en discapacidad, enfoque étnico y sorteo, en ese orden)" + "(+5 puntos)" priorización territorial. Tabla cambia "Subregión" por **"Observación Consolidada de la Terna"**.
- ✅ Subregional: tabla mantiene Subregión + columna observación. Cada firmante muestra su **Terna** asignada.
- ✅ **INVITADO(A) GARANTE** del proceso: nuevo firmante opcional configurable en `convocatoria.configuracion.invitado_garante` con `{nombre, documento, firma_url, entidad_rol}`. Aparece al final de actas Colectiva-Terna y Subregional con rol "Invitado(a) Garante del Proceso · Acompañamiento Técnico/Control".

**Rediseño `/evaluaciones/colectiva/:id` (mismo patrón que individual)**:
- ✅ Header sticky con totales y barra · Banda resumen horizontal de propuesta con iconos por campo · **Sub-banda de Terna** con chips de integrantes · Ficha completa en Drawer.
- ✅ Modalidad 1 (promedio): criterios full-width con barra de progreso por criterio + observación consolidada.
- ✅ Modalidad 2 (nueva evaluación por terna): tarjeta heroica para iniciar v2 + tabla con avance + card "Resultado definitivo" con puntaje grande.

**Vista jurado optimizada `/evaluaciones`**:
- ✅ Eyebrow "Mi panel de trabajo" + título "Mis Evaluaciones".
- ✅ **2 cards heroicas con contadores**: Etapa Individual (verde) + Etapa Colectiva (ámbar) con porcentaje grande, barra de progreso, contador pendientes/terminadas.
- ✅ **Filtros**: search + select estado (default "Solo pendientes" para jurado) + limpiar filtro.
- ✅ Botón de fila contextual: "Continuar" (pendiente) o "Abrir" (terminada).
- ✅ Estados con badges semánticos: Pendiente (reloj ámbar) · Firmada/Bloqueada (candado) · Finalizada (check verde).

**Endpoints**:
- (sin cambios, solo extensión en `/api/evaluaciones-colectivas?mias=true` ya existente).

### Fix PDF actas: footer fijo + headers tabla + merge plantilla (Feb 2026 v15)
- ✅ **Footer al pie absoluto**: ahora se dibuja vía `canvas onPage` callback de ReportLab, garantizando que aparezca pegado al borde inferior de CADA página, sin importar la cantidad de contenido. Se reserva `bottomMargin=3.2cm` cuando hay footer image.
- ✅ **Headers de tabla con `Paragraph`** (en lugar de strings): wrappean automáticamente sin solaparse con la columna vecina. Columnas redimensionadas (6 cols: 0.9/2.5/2.3/4.2/2.4/4.7 cm).
- ✅ **Merge de plantilla con default**: `_get_template` ahora hace `{...default, ...saved_no_vacios}`. Si el admin edita solo 1 campo (ej. `tabla_titulo`), los demás textos (considerandos, certificación, cierre) siguen siendo el default INC2026 oficial. Antes se borraban todos cuando se guardaba un PATCH parcial.
- ✅ Verificado vía OCR del PDF: los 4 considerandos (a/b/c/d) aparecen completos, certificación incluye los 5 criterios y los 5 puntos PDET/Río Atrato/Río Cauca, columnas sin solapamientos, footer al borde inferior.

### Motor de Dashboards Inteligentes — FASE 1 (Feb 2026 v16)
- ✅ Backend `routes_dashboards.py` con motor `GET /api/dashboards?convocatoria_id=...` que devuelve dashboards visibles según rol + datos pre-resueltos.
- ✅ **RBAC por rol**: admin_general/admin_convocatoria/supervisor ven los 5 dashboards globales; jurado solo ve "Mi panel de evaluación"; integrante_terna ve avance_terna.
- ✅ **6 tipos de widgets**: `kpi` (counter coloreado), `progress` (barra + % grande), `pie` (recharts), `bar` (recharts horizontal stacked done/pending), `ranking` (lista con medallas), `stats` (4 mini cards), `progress_multi` (barras por entidad).
- ✅ **5 dashboards INC2026 derivados automáticamente**:
  - Avance general (KPIs propuestas/jurados/ternas, progress eval ind/col, pie estado propuestas)
  - Avance por jurado (carga de trabajo + Top jurados por avance)
  - Avance por terna (carga + progress multi)
  - Distribución territorial (subregión, municipio top 10) — solo si campo `subregion` existe
  - Resultados (stats puntajes + Top 10 ranking)
- ✅ **Vista jurado**: "Mi panel de evaluación" con KPIs Mis Asignadas/Pendientes/Finalizadas + Avance Personal + Promedio emitido.
- ✅ Frontend `Dashboard.jsx` reescrito completamente con `recharts` instalado. UI con grid responsive 1/2/3/4 columnas + cards con borde verde institucional.
- ✅ Verificado e2e: admin ve 5 dashboards + jurado ve solo el suyo (RBAC funcional).

### Dashboards FASES 2+3+4 — Comparativos, Editor sin código, Auto-sugerencias (Feb 2026 v17)
**Fase 2 — Indicadores avanzados**:
- ✅ **8 nuevos data sources**: `comparativo_jurados`, `comparativo_ternas`, `comparativo_subregiones`, `time_series_evaluaciones` (14 días), `dist_linea`, `ranking_por_linea`, `dist_priorizacion`, `kpi_ganadores/elegibles/lista_espera`.
- ✅ **2 dashboards INC2026 nuevos**:
  - "Resultados por línea / temática" (pie + ranking)
  - "Indicadores de priorización poblacional" (mujeres, discapacidad, étnico, víctimas, PDET)
- ✅ **3 widgets de comparativo** integrados en dashboards de jurado/terna/subregión (bar charts horizontales con promedio).
- ✅ **Widget `time_series`** con LineChart (recharts) en avance general.
- ✅ Total: **7 dashboards y 24 widgets** disponibles para admin (vs 5 dashboards / 15 widgets antes).

**Fase 3 — Editor sin código**:
- ✅ Endpoints: `GET /api/dashboards/overrides` y `PATCH` con operaciones incrementales: `add_hidden_dashboard`, `remove_hidden_dashboard`, `add_hidden_widget`, `remove_hidden_widget`, `custom_widget`, `delete_custom_widget_id`, `reset`.
- ✅ Endpoint `GET /api/dashboards/catalog` con los 24 data sources + 9 widget types disponibles.
- ✅ UI: botón **"Editar dashboards"** abre dialog con lista completa (incluyendo los ocultos en amarillo discontinuo). Toggle por dashboard (Ocultar/Mostrar) y por widget individual (clic en chip). Botón "Restaurar default".

**Fase 4 — Auto-sugerencias**:
- ✅ Función `_generate_suggestions(campos, dashboards_existentes, overrides)`: detecta campos configurados (subregion, linea, municipio, enfoque_poblacional) y sugiere widgets que aún no se visualizan.
- ✅ Banner ámbar **"Sugerencias inteligentes"** en lo alto del dashboard cuando hay sugerencias activas, con razón explicativa (rationale).
- ✅ Endpoints: `POST /api/dashboards/suggestions/{id}/accept` y `/dismiss` (descartar guarda en `hidden_widgets` para no volver a sugerir).
- ✅ Verificado: al ocultar "territorial", aparecen 2 sugerencias `sug_subregion` y `sug_municipio` con texto "Detectamos el campo 'Subregión'/'Municipio'…".

## Backlog / próximas tareas

### v21 — Onboarding personalizado + verificación dashboard jurado (Feb 2026)
**Frontend nuevo `WelcomeOnboarding.jsx`**:
- ✅ Modal de 4 pasos que aparece UNA vez por usuario (flag en localStorage `krinos_onboarding_<userid>_v1`).
- ✅ Paso 1: Bienvenida personalizada con nombre, ícono y badge del rol + descripción del rol desde DB.
- ✅ Paso 2: Tarjetas grid con los módulos accesibles en el sidebar (icono + nombre + número de acciones).
- ✅ Paso 3: Lista de TODOS los permisos por módulo con chips traducidos al español (Ver, Crear, Evaluar, Firmar, Exportar, etc.).
- ✅ Paso 4: 3 consejos rápidos (Mi Perfil, Cambiar contraseña, Permisos personalizables).
- ✅ Botones Anterior/Saltar/Siguiente con progress dots.
- ✅ Auto-montado en `Layout.jsx` (se activa al primer ingreso de cada usuario).

**Verificación Dashboard del Jurado**:
- ✅ Backend `_dashboards_for_role`: para rol "jurado" SOLO crea dashboard "mi_avance" con 5 widgets propios. Dashboards territoriales/línea/priorización filtrados con `role != "jurado"`.
- ✅ Data sources `mias_asignadas`, `mias_pendientes`, `mias_finalizadas`, `mi_avance_personal`, `mi_promedio_emitido` filtran por `jurado_id == user.jurado_id`. Cero exposición de datos de otros jurados.
- ✅ Sidebar muestra solo 3 módulos (Dashboard, Evaluaciones, Actas) gracias al gating por permisos.
- ✅ Confirmación E2E con jurado1@krinos.test: ve solo "Mi panel de evaluación" + sus 5 KPIs personales.

**Limpieza correlacionada**:
- ✅ `MiPerfil.jsx` universal (ya implementado en v19): admin ve cambio de contraseña, jurado ve firma+CV+IA.



### v20 — Roles & Permisos totalmente administrables + Gating del sidebar (Feb 2026)
**Backend `routes_permissions.py` (re-escrito)**:
- ✅ Colección MongoDB `roles` con CRUD completo. `is_system=true` para los 7 roles base.
- ✅ `MODULES_CATALOG` con 24 módulos × 19 acciones canónicas (view/create/edit/delete/sign/evaluate/export/import/send_welcome/reset_password/configure/auto/seed/reset/etc).
- ✅ Seed idempotente en startup (server.py lifespan).
- ✅ Endpoints:
  - `GET /catalog` — módulos y acciones disponibles.
  - `GET /matrix` — matrix completa para la UI editable (versión 2.0).
  - `GET /roles`, `GET /roles/{code}` — lista y consulta.
  - `POST /roles` — crear rol custom (snake_case, valida permisos contra catálogo).
  - `PATCH /roles/{code}` — actualizar name/description/permissions.
  - `DELETE /roles/{code}` — bloqueado para is_system; bloqueado si hay usuarios asignados.
  - `PATCH /roles/{code}/permissions` — toggle granular {module, action, allowed}.
  - `GET /me` — permisos del usuario autenticado.
- ✅ Defensa anti-bloqueo: `admin_general` no puede perder view en roles/usuarios/sistema/administracion.

**Backend `routes_users.py`**:
- ✅ `ALLOWED_ROLES` hardcoded → eliminado. Ahora valida contra `db.roles` (acepta roles custom).

**Frontend**:
- ✅ `AuthContext` expone `permissions` global + función `can(module, action)`. Refresca tras login.
- ✅ `Layout.jsx` — sidebar filtrado por `can(module, 'view')`. Cada item del nav tiene su módulo declarado. Administración ahora requiere `can("administracion","view")` (no rol hardcoded).
- ✅ `RolesPanel` (Administración → Roles & Permisos) reescrito:
  - Lista lateral con todos los roles + icono escudo en los del sistema.
  - Panel derecho con matriz interactiva: cada (módulo × acción) es un botón toggle verde/gris.
  - Atajos "Todos / Ninguno" por fila.
  - Editar nombre/descripción del rol.
  - Botón Crear rol (modal con code+name+description).
  - Eliminar rol custom (bloqueado para is_system; bloqueado si hay users).
- ✅ `UsersPanel` — el select de Rol carga roles dinámicos desde `/api/permissions/roles` (incluye roles custom).

**Testing (iter 15)**: 22/22 pytest PASS · 0 críticos. Verificado E2E manual: crear rol custom → asignar a user → user.permissions/me refleja permisos → DELETE rol bloqueado si hay users.



### v19 — Login limpio + Recuperar contraseña + Bienvenida + Correos Gmail/SendGrid (Feb 2026)
**Backend nuevo `email_service.py`**:
- ✅ Servicio unificado de envío de correos con soporte de **Gmail SMTP** (smtplib 587 + STARTTLS, Contraseña de Aplicación 16 chars) y **SendGrid** (API REST `/v3/mail/send`).
- ✅ Plantillas HTML institucionales: `welcome`, `reset_password`, `notification` con branding KRINOS.
- ✅ Log de envíos en colección `email_log`.

**Backend endpoints nuevos**:
- ✅ `POST /api/auth/forgot-password` — link de recuperación con token JWT (expira 1h). NO revela si el email existe.
- ✅ `POST /api/auth/reset-password` — verifica token, cambia password y limpia bloqueos brute force.
- ✅ `PATCH /api/settings/email` — config unificada Gmail/SendGrid (selector + sub-bloques). Patch parcial preserva campos. Migración auto del bloque legacy `sendgrid`.
- ✅ `POST /api/settings/email/test` — envío de prueba según proveedor activo.
- ✅ `POST /api/users/{id}/send-welcome` — bienvenida con o sin contraseña temporal.
- ✅ `POST /api/admin/credenciales-jurado/{id}/send-welcome` y `reset-password` con `enviar_correo:true`.

**Frontend**:
- ✅ Login: removidas credenciales demo + link "¿Olvidaste tu contraseña?" con modal y endpoint conectado.
- ✅ Nueva página `/reset-password?token=<jwt>` (validación + redirect login).
- ✅ Propuestas: tabla compacta de 4 columnas + botón **"Ver propuesta"** con modal `PropuestaDetalle` que agrupa todos los campos por secciones.
- ✅ Admin → Correos: selector visual Gmail/SendGrid, guía paso a paso para Contraseña de Aplicación de Gmail (links a `myaccount.google.com/apppasswords` + 2FA), sidebar contextual.
- ✅ Admin → Usuarios: botón "Bienvenida" por fila.
- ✅ Jurados: icono Mail (azul) por fila.

**Testing (iter 14)**: 21/21 pytest PASS. Regresión admin 28/28 OK.



### v18 — Reset operativo + Delete unificado + Usuarios de prueba (Feb 2026)
**Backend nuevo** `routes_admin.py`:
- ✅ `POST /api/admin/reset-datos` — borra propuestas, jurados, ternas, asignaciones, evaluaciones (ind+col), rankings, actas y opcionalmente usuarios/auditoría. Requiere `confirmacion="REINICIAR"`. Preserva configuración (convocatorias, campos, catálogos, criterios, desempates, plantillas, branding).
- ✅ `POST /api/admin/seed-test-users?convocatoria_id=<id>` — crea/reactiva 8 usuarios de prueba (1 por rol + 3 jurados con registro en `db.jurados` para conformar terna). Password compartida `Pruebas2026!`.
- ✅ `POST /api/admin/seed-estados-propuesta?convocatoria_id=<id>` — seed idempotente del catálogo "Estados de Propuesta" con 13 valores (Registrada → En revisión documental → Habilitada / No habilitada / Subsanación pendiente → Subsanada → ... → Ganadora / Lista de espera).
- ✅ `GET /api/admin/credenciales-jurado/{jid}` — consulta usuario asociado a un jurado.
- ✅ `POST /api/admin/credenciales-jurado/{jid}/reset-password` — genera password segura con `secrets`, devuelve en claro **una sola vez** para envío por correo.
- ✅ `DELETE /api/admin/{propuestas,jurados,evaluaciones-individuales,evaluaciones-colectivas,rankings}/{id}` — hard-delete con cascada. Borrar jurado también elimina su user, lo pull-fuera de ternas y limpia asignaciones+evals.
- ✅ `POST /api/jurados` actualizado: devuelve campo `credenciales` `{username, password, rol}` cuando crea un user nuevo.

**Frontend**:
- ✅ Nueva pestaña **"Sistema"** en `/administracion` con 3 cards: Reiniciar datos (rojo, doble confirmación), Usuarios de prueba (preview de la lista), Catálogo Estados de Propuesta (genera).
- ✅ Botón **🗑 eliminar** en Propuestas, Jurados, Evaluaciones (individuales + colectivas), Ranking (historial). Asignaciones/Ternas/Usuarios ya tenían.
- ✅ Botón **🔑 resetear contraseña** en cada fila de Jurados.
- ✅ Dropdown **editable de Estado** en /propuestas → usa el catálogo "Estados de Propuesta" si existe, con fallback a la lista estática.
- ✅ Dialog **"Credenciales generadas"** que aparece tras crear un jurado o resetear pwd — muestra usuario + password copiables con botón "Copiar ambas" (una sola vez por seguridad).

**Documentación**:
- ✅ Carpeta `/app/documentacion/` creada (preparada para subir a GitHub):
  - `README.md` (índice + inicio rápido + stack)
  - `01-vision-general.md` · `02-glosario-y-roles.md` · `03-arquitectura.md`
  - `05-flujo-operativo.md` (orden recomendado de carga + credenciales jurado)
  - `13-administracion.md` (panel Sistema documentado)
  - `14-api-reference.md` (referencia REST completa)
  - `15-mantenimiento.md` (logs, troubleshooting, mongodump)

**Testing (iteración 13)**: 28/28 pytest PASS, 0 issues. Permisos por rol verificados (jurado→403, admin_convocatoria→sin reset, admin_general→todo). Cascadas DELETE verificadas. Idempotencia confirmada.

---

## Backlog / próximas tareas pendientes

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

### v22 — Plantilla de carga masiva alineada al formulario dinámico (Feb 2026)

**Plantilla Propuestas (`GET/POST /api/propuestas-template`+`-import`)**:
- ✅ Mapeo de tipos corregido (`lista`, `seleccion_multiple`, `si_no`, `texto_corto`, `texto_largo`, `numero_*`, `fecha`, `hora`, `url`, `email`, `archivo`).
- ✅ Columna **"Estado (opcional)"** al final, valor por defecto desde catálogo.
- ✅ Hoja **"Catálogos"** con todos los valores válidos referenciados (Subregiones, Estados, etc.).
- ✅ Hoja **"Instrucciones"** con tipo amigable + obligatorio + valores.
- ✅ Import valida `estado` contra catálogo "Estados de Propuesta" (rechaza fila con mensaje claro).
- ✅ Removido panel duplicado "Catálogo Estados de Propuesta" de Administración → Sistema (solo gestionable desde Configuración → Catálogos).

**Plantilla Jurados (`GET/POST /api/jurados-template`+`-import`)** — mismo formato que Propuestas:
- ✅ 2 filas header (etiqueta + nombre interno) + fila ejemplo prellena con valores reales del catálogo.
- ✅ Hojas Propuestas/Instrucciones/Catálogos.
- ✅ Columna **"Estado (opcional)"** validada contra catálogo "Estados de Jurado" (Activo/Inactivo/Suspendido/Vacaciones/Retirado).
- ✅ Excluye automáticamente columnas duplicadas con base (`nombre`, `email`, `telefono`, `subregiones`, `perfil`) y los campos con `rol_especial=firma/hoja_vida/foto` (esos se cargan desde Mi Perfil, no por Excel).
- ✅ Nuevo endpoint `POST /api/admin/seed-estados-jurado` para crear el catálogo inicial.

**Modelo Campo — `rol_especial`** (escalable a otras convocatorias):
- ✅ Nuevo atributo en `CampoIn`: `rol_especial: firma | hoja_vida | documento | foto | None` (solo aplica_a=jurado).
- ✅ UI `CamposPanel` (Configuración → Campos sub-tab Jurado): muestra un selector "Rol especial" cuando se edita un campo de jurado.
- ✅ Tipo `archivo` agregado a la lista de tipos disponibles.

**`JuradoDetalle` (Drawer "👁 Ver")** — sin duplicados:
- ✅ Resuelve firma/cédula/hoja de vida/foto desde el campo parametrizable con `rol_especial` correspondiente; fallback a las claves legacy (`firma_url`, `cedula`, `hoja_vida`) si no se configuró.
- ✅ La sección "Información adicional" excluye automáticamente los campos con `rol_especial`, evitando que aparezcan dos veces.

**`MiPerfil` del jurado**:
- ✅ Carga campos `aplica_a=jurado` y los resuelve dinámicamente.
- ✅ Las secciones Firma / Hoja de Vida / Cédula / Foto usan el `nombre_interno` del campo configurado.
- ✅ Nueva sección **"Información adicional solicitada"**: renderiza el resto de campos parametrizables (texto, archivo, fecha, si/no, etc.) como inputs editables con `ExtraCampoInput`. Permite cargar anexos extras sin que el admin tenga que tocar código.
- ✅ Tipo `archivo` soportado con upload + previsualización + delete.

**Validación e2e**:
- Propuestas: descarga (3 hojas, 18 cols) → import → 1 creado, 1 rechazado por estado inválido.
- Jurados: descarga (3 hojas, 8 cols sin duplicar) → import → 1 creado con estado="Activo", 1 rechazado por estado inválido "EstadoQueNoExiste".

### v22.1 — Fix UX: input REINICIAR uppercase (Feb 2026)
- ✅ El input de confirmación "REINICIAR" en Administración → Sistema usaba `className="uppercase"` (solo visual) pero comparaba con `=== "REINICIAR"` exacto. Si el usuario escribía minúsculas, veía mayúsculas pero el valor real no coincidía y el botón nunca se habilitaba. Corregido normalizando con `.toUpperCase()` en el `onChange`.

### v22.2 — Tipografía consistente, vista previa perfil jurado, QR de verificación de actas (Feb 2026)

**Tipografía consistente en `/propuestas`**:
- ✅ Columnas Código (font-mono tabular-nums, color muted), Nombre (capitalize + lowercase para normalizar MAYÚSCULAS heredadas de Excel) y Organización (idem) ahora se muestran con estilo uniforme. Los datos en BD permanecen iguales — solo se transforma para visualización.

**Vista previa del perfil del jurado** (`JuradoPerfilPreview.jsx`):
- ✅ Nuevo componente en `Configuración → Campos` sub-tab Jurado. Botón "Vista previa del perfil" abre un modal que muestra exactamente cómo verá el jurado su pantalla "Mi Perfil" con los campos parametrizados actuales (foto, firma, hoja de vida, cédula con badges del rol especial), incluyendo la sección "Información adicional solicitada" que lista todos los campos extras.
- ✅ Avisa cuando no hay campo con un `rol_especial` específico, indicando que se usa la clave legacy.

**QR de verificación pública en actas PDF**:
- ✅ Cada acta (Individual, Colectiva-Terna, Subregional) embedea un código de verificación corto (12 chars SHA256) + QR generado con ReportLab.
- ✅ Persistencia en colección `actas_verificacion` con metadatos (jurado/terna/subregion, fecha emisión, conteo firmantes).
- ✅ El QR apunta a `{FRONTEND_URL}/verificar/{codigo}` (página pública).
- ✅ Endpoint **PÚBLICO** `GET /api/actas/verificar/{codigo}` devuelve metadatos sin requerir autenticación (válido / tipo / convocatoria / emisión inicial+última / meta).
- ✅ Nueva ruta frontend `/verificar/:codigo` con UI institucional (banner verde con ShieldCheck, código grande monospace, cards de metadatos, mensaje de error rojo si código inválido).

**Validación e2e**: Acta individual generada → PDF 60KB con QR + texto "Código de verificación: 43C333E2531E", endpoint público devuelve `{valido:true, jurado_nombre:"Alvaro Augusto Diaz Algarin", subregiones:["Bajo Cauca"]...}`, código falso → 404, página `/verificar/:codigo` renderiza correctamente.

