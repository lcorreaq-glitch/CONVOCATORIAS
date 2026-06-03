# 📚 KRINOS — Documentación del Sistema

> **KRINOS by ELEA** · Plataforma SaaS parametrizable para gestión integral de convocatorias, evaluación de propuestas, jurados, ternas, ranking y actas oficiales.

---

## 🧭 Índice

| # | Documento | Audiencia |
|---|-----------|-----------|
| 01 | [Visión general](./01-vision-general.md) | Todos |
| 02 | [Glosario y roles](./02-glosario-y-roles.md) | Todos |
| 03 | [Arquitectura técnica](./03-arquitectura.md) | Equipo técnico |
| 04 | [Guía de instalación y entornos](./04-instalacion-entornos.md) | Equipo técnico |
| 05 | [Flujo operativo oficial](./05-flujo-operativo.md) | Administrador |
| 06 | [Gestión de convocatorias y configuración](./06-configuracion-convocatorias.md) | Administrador |
| 07 | [Carga y administración de propuestas](./07-propuestas.md) | Administrador / Supervisor |
| 08 | [Gestión de jurados y ternas](./08-jurados-y-ternas.md) | Administrador |
| 09 | [Asignaciones, evaluaciones y firmas](./09-evaluaciones-y-actas.md) | Administrador / Jurado |
| 10 | [Ranking, cupos y desempates](./10-ranking-y-cupos.md) | Administrador |
| 11 | [Actas PDF y firmas digitales](./11-actas-pdf.md) | Administrador |
| 12 | [Reportes, auditoría y dashboards](./12-reportes-y-dashboards.md) | Administrador / Auditor |
| 13 | [Administración del sistema](./13-administracion.md) | Administrador General |
| 14 | [API de referencia (REST)](./14-api-reference.md) | Desarrolladores |
| 15 | [Mantenimiento y troubleshooting](./15-mantenimiento.md) | Equipo técnico |

---

## 🚀 Inicio rápido

1. **Login** con el administrador general → cargado por defecto:
   - Usuario: `lcorreaq`
   - Contraseña: `Chocolate2026!`
2. Configura la convocatoria desde **Configuración** (campos, catálogos, criterios, desempates, plantillas de actas).
3. Carga **jurados** (con generación automática de usuarios).
4. Crea **ternas** y carga **propuestas**.
5. Genera **asignaciones** (manual, masiva o automática).
6. Los jurados ejecutan **evaluaciones individuales** → la terna realiza la **evaluación colectiva**.
7. **Genera el ranking**, aplica desempates, distribuye **cupos por subregión**.
8. Descarga **actas PDF** con firmas digitales y branding institucional.

---

## 📦 Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 19 + Tailwind + shadcn/ui + Recharts |
| Backend | FastAPI (Python 3.11) + Motor (MongoDB async) |
| Base de datos | MongoDB |
| Auth | JWT Bearer + bcrypt |
| PDF | ReportLab Platypus |
| IA | OpenAI GPT-4o vía Emergent LLM Key |
| Email | SendGrid (configurable) |

---

## 🆘 Soporte

Equipo ELEA · soporte@elea.co
