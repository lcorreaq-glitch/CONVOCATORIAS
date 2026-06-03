# 02 · Glosario y roles

## Glosario

| Término | Definición |
|---------|------------|
| **Convocatoria** | Proceso de selección con un conjunto de propuestas, criterios, jurados y un ciclo de vida (Borrador → Activa → Finalizada). |
| **Propuesta** | Iniciativa, proyecto o postulación cargada al sistema (manual o masivo). |
| **Jurado** | Persona habilitada para evaluar propuestas asignadas. Cada jurado tiene un usuario con credenciales. |
| **Terna / Grupo** | Conjunto de jurados que deliberan colectivamente sobre un grupo de propuestas. |
| **Asignación** | Vínculo entre una propuesta y un jurado (individual) o una terna (colectiva). |
| **Evaluación individual** | Calificación de cada criterio que hace un jurado sobre una propuesta. |
| **Evaluación colectiva** | Calificación consolidada de la terna sobre la propuesta (modalidad promedio o nueva deliberación). |
| **Criterio oficial** | Variable que pondera y suma hasta el 100 % del puntaje base. |
| **Criterio diferencial** | Variable adicional que NO suma al 100 % oficial pero queda registrada (mujeres, discapacidad, étnico). |
| **Desempate** | Regla en cascada para resolver puntajes iguales (fecha de radicación, criterio específico, sorteo). |
| **Cupo** | Cantidad de propuestas ganadoras configurada por grupo (ej. por subregión). |
| **Acta** | Documento PDF oficial con encabezado institucional, considerandos, certificación, tabla de propuestas y firmas. |
| **Etapas de propuesta** | Catálogo del workflow documental: Registrada → En revisión → Habilitada / No habilitada / Subsanación → Subsanada → … → Ganadora. |
| **Cascada de desempates** | Orden secuencial en que se aplican las reglas de desempate hasta resolverlo. |
| **Bono de priorización** | +5 pts automáticos a propuestas marcadas como priorizadas (PDET, Río Atrato, Río Cauca…). |

## Roles del sistema

| # | Rol | Descripción | Permisos clave |
|---|-----|-------------|----------------|
| 1 | **Administrador General** | Máximo nivel. Configura todo. | Crear convocatorias, usuarios, hacer reset, gestión total |
| 2 | **Administrador de Convocatoria** | Opera una convocatoria específica. | CRUD propuestas/jurados/ternas/asignaciones; sin acceso a otros admins |
| 3 | **Supervisor** | Seguimiento y monitoreo. | Lectura completa + reportes; sin modificar evaluaciones |
| 4 | **Jurado** | Evalúa propuestas asignadas. | Solo sus evaluaciones, su perfil y actas individuales propias |
| 5 | **Integrante de Terna** | Participa en deliberación colectiva. | Acceso a evaluaciones colectivas de su terna |
| 6 | **Invitado de Consulta** | Solo lectura. | Ve resultados publicados y dashboards generales |
| 7 | **Auditor** | Acceso a trazabilidad. | Lectura completa + módulo de auditoría |

## Etapas de la convocatoria

```
Configuración → Cargue de Propuestas → Habilitación Documental →
Asignación de Evaluadores → Evaluación Individual → Evaluación Colectiva →
Consolidación → Ranking y Desempates → Publicación de Resultados → Cierre
```
