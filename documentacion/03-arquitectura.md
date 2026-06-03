# 03 · Arquitectura técnica

## Diagrama general

```
┌──────────────────────────────────────────────────────────────┐
│              Cliente Web (React 19 + Vite)                    │
│   - shadcn/ui + Tailwind + Recharts + lucide-react            │
│   - Axios via REACT_APP_BACKEND_URL                           │
└────────────────────────────┬──────────────────────────────────┘
                             │ HTTPS + JWT Bearer
                             ▼
┌──────────────────────────────────────────────────────────────┐
│         Backend FastAPI (Python 3.11) - Uvicorn :8001         │
│  ┌─────────────┬─────────────┬─────────────┬──────────────┐  │
│  │  auth.py    │ routes_data │ routes_eval │routes_actas  │  │
│  │ routes_users│routes_config│routes_reports│routes_dash  │  │
│  │ routes_admin│ routes_ai   │ routes_permissions          │  │
│  └─────────────┴─────────────┴─────────────┴──────────────┘  │
│  ReportLab (PDF) · openpyxl (Excel) · bcrypt · Motor (Mongo)  │
└────────────────────────────┬──────────────────────────────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
   ┌─────────┐         ┌─────────────┐       ┌────────────┐
   │ MongoDB │         │ Emergent LLM│       │  SendGrid  │
   │ (Motor) │         │ (GPT-4o, IA)│       │ (correos)  │
   └─────────┘         └─────────────┘       └────────────┘
```

## Capas

### Frontend (`/app/frontend`)
- **React 19** con React Router (CRA-like, build con Vite/CRA).
- **Componentes UI**: `shadcn/ui` (`/app/frontend/src/components/ui/`).
- **Páginas**: `/app/frontend/src/pages/*.jsx`.
- **Estado**: `AuthContext` para sesión activa + convocatoria seleccionada.
- **Cliente API**: `/app/frontend/src/lib/api.js` con interceptor que inyecta `Authorization: Bearer <token>`.

### Backend (`/app/backend`)
- **FastAPI** con `lifespan` (startup → seed admin + datos demo + índices).
- **Routers separados por dominio** (`routes_*.py`).
- **MongoDB async** vía `motor`. Colecciones principales:
  - `users`, `convocatorias`, `campos`, `catalogos`, `criterios`, `desempates`
  - `propuestas`, `jurados`, `ternas`, `asignaciones`
  - `evaluaciones_individuales`, `evaluaciones_colectivas`
  - `rankings`, `actas`, `actas_templates`, `auditoria`, `settings`
- **Auth**: JWT (HS256) + `bcrypt` para password hashing. Brute force lockout (5 intentos / 15 min).

### Servicios externos
- **Emergent Universal Key**: acceso unificado a OpenAI / Anthropic / Gemini para tareas de IA (mejora de redacción, resumen).
- **SendGrid**: envío de correos institucionales (configurable; **mocked** hasta que se cargue API key).

## Variables de entorno

### Backend (`/app/backend/.env`)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=krinos_db
CORS_ORIGINS=*
JWT_SECRET=<random secret>
```

### Frontend (`/app/frontend/.env`)
```
REACT_APP_BACKEND_URL=https://<preview-domain>
```

## Modelo de datos clave

```
convocatorias
  ├─ campos (uso_propuesta, uso_lista, uso_filtro, uso_desempate, aplica_a)
  ├─ catalogos (jerarquía padre_id, valores activos)
  ├─ criterios (oficiales con ponderación + diferenciales)
  └─ desempates (orden, tipo_comparacion)

propuestas        ─┐
jurados ─ users    ├─ asignaciones ─┐
ternas             │                ├─ evaluaciones_individuales
                   │                └─ evaluaciones_colectivas
                                              │
                                              └─ rankings
                                              └─ actas (PDF)
```

## Patrones críticos

- **ObjectId nunca expuesto**: siempre `await col.find_one({...}, {"_id": 0, ...})` o `doc.pop("_id")`.
- **Datetime UTC**: `now_iso()` devuelve ISO con timezone-aware.
- **Audit**: cada acción de escritura llama `await audit(user, accion, entidad, id, detalle, valor_anterior, valor_nuevo)`.
- **Hot reload**: backend (`uvicorn --reload`) y frontend (`react-scripts start`) gestionados por supervisor.
