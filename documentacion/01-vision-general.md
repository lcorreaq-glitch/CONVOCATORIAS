# 01 · Visión general

## ¿Qué es KRINOS?

**KRINOS by ELEA** es una plataforma SaaS web, **parametrizable e institucional**, diseñada para administrar convocatorias y procesos de selección competitivos a gran escala: incentivos, becas, estímulos, concursos, premios, programas de fomento, etc.

A diferencia de soluciones cerradas, KRINOS **no está atado al código a una entidad o convocatoria específica**: todos los campos, criterios, catálogos, reglas de desempate, cupos y plantillas son **configurables desde la interfaz** por un administrador, sin intervención técnica.

## Objetivos

1. **Estandarizar** todo el ciclo de vida de una convocatoria (configuración → cargue → habilitación → evaluación → ranking → actas → publicación).
2. **Garantizar trazabilidad y auditoría** de cada decisión (quién, cuándo, qué cambió).
3. **Eliminar errores manuales** en consolidación de puntajes, desempates y distribución de cupos.
4. **Producir documentos oficiales** (actas, reportes, exportes Excel) con identidad gráfica institucional.
5. **Brindar inteligencia de gestión** vía dashboards parametrizables por rol.

## Caso de uso de referencia

**Iniciativas Comunitarias Antioquia 2026 (INC2026)** — Gobernación de Antioquia.
- 9 subregiones, 125 municipios.
- Hasta 1 000 propuestas, 30+ jurados, 9 ternas territoriales.
- 5 criterios oficiales (suma 95 pts) + 5 pts de priorización territorial + 3 enfoques diferenciales.
- Cupos asignados por subregión (Urabá 14, Oriente 10, Norte 8, etc.).

## Principios de diseño

- **Configuración primero, código después.** El 95 % de lo que un administrador necesita se hace desde la UI.
- **RBAC sólido.** 7 roles con permisos diferenciados.
- **Auditable.** Todo cambio queda registrado con usuario, IP, valor anterior y nuevo.
- **Robustez documental.** Las actas se generan con texto literal de los actos administrativos, con firmas digitales embebidas.
- **Parametrizable visualmente.** Dashboards, plantillas y branding son editables sin código.
