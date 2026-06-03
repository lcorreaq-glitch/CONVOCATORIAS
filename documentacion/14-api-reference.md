# 14 · API de referencia (REST)

Base URL: `${REACT_APP_BACKEND_URL}/api`

Todos los endpoints (salvo `/auth/login`) requieren header:
```
Authorization: Bearer <jwt_token>
```

## Auth

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| POST | `/auth/login` | `{ username, password }` | Devuelve `{ ..., access_token }` |
| GET | `/auth/me` | — | Usuario actual |
| POST | `/auth/logout` | — | Invalida sesión |
| POST | `/auth/refresh` | — | Refresca token |

## Usuarios (`admin_general`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/users` | Lista usuarios |
| POST | `/users` | Crea usuario |
| PATCH | `/users/{id}` | Actualiza |
| DELETE | `/users/{id}` | Desactiva (soft) |

## Convocatorias / Configuración

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/PATCH | `/convocatorias` | CRUD convocatorias |
| GET/POST/PATCH/DELETE | `/campos` | Campos personalizados |
| GET/POST/PATCH/DELETE | `/catalogos` | Catálogos |
| GET/POST/PATCH/DELETE | `/criterios` | Criterios |
| GET/POST/PATCH/DELETE | `/desempates` | Reglas de desempate |

## Propuestas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/propuestas?convocatoria_id=` | Lista filtrada |
| POST | `/propuestas` | Crea |
| PATCH | `/propuestas/{id}` | Edita |
| DELETE | `/admin/propuestas/{id}` | Elimina (hard) + cascada |
| GET | `/propuestas-template?convocatoria_id=` | Descarga XLSX |
| POST | `/propuestas-import` | Carga masiva |

## Jurados

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/jurados?convocatoria_id=` | Lista |
| POST | `/jurados` | Crea (devuelve `credenciales` si crea user) |
| PATCH | `/jurados/{id}` | Edita |
| DELETE | `/admin/jurados/{id}?eliminar_usuario=true` | Elimina + user + ternas + evals |
| GET | `/admin/credenciales-jurado/{id}` | Consulta usuario asociado |
| POST | `/admin/credenciales-jurado/{id}/reset-password` | Resetea pwd (devuelve nueva) |
| GET | `/jurados-template?convocatoria_id=` | XLSX dinámica |
| POST | `/jurados-import` | Carga masiva |

## Ternas / Asignaciones / Evaluaciones

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST/DELETE | `/ternas` | CRUD ternas |
| GET/POST/DELETE | `/asignaciones` | CRUD asignaciones |
| POST | `/asignaciones/masiva-subregion` | 1-click |
| POST | `/asignaciones/auto` | Asignación inteligente |
| GET/PATCH | `/evaluaciones-individuales/{id}` | Eval. individual |
| POST | `/evaluaciones-individuales/{id}/firmar` | Firmar |
| DELETE | `/admin/evaluaciones-individuales/{id}` | Eliminar (admin) |
| GET/POST/PATCH | `/evaluaciones-colectivas/{id}` | Eval. colectiva |
| DELETE | `/admin/evaluaciones-colectivas/{id}` | Eliminar (admin) |

## Rankings

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/rankings?convocatoria_id=` | Lista rankings |
| POST | `/rankings/generar?convocatoria_id=&agrupar_por=&modo=` | Genera |
| GET/PATCH | `/convocatorias/{cid}/cupos-ganadores` | Configura cupos |
| DELETE | `/admin/rankings/{id}` | Elimina ranking |

## Actas (PDF)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/actas/individual-jurado/{jid}` | PDF acta individual |
| GET | `/actas/colectiva-terna/{tid}` | PDF acta colectiva |
| GET | `/actas/subregional?convocatoria_id=&subregion=` | PDF subregional |
| POST | `/actas/individual-jurado/{jid}/forzar` | Admin marca emitible |
| POST | `/actas/colectiva-terna/{tid}/firmar` | Firma del jurado |
| POST | `/actas/subregional/firmar` | Firma subregional |
| GET | `/convocatorias/{cid}/acta-templates` | Plantillas configurables |
| GET/PATCH | `/convocatorias/{cid}/acta-branding` | Branding institucional |

## Dashboards y Reportes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/dashboards?convocatoria_id=` | Dashboards filtrados por rol |
| GET | `/dashboards/catalog` | 24 fuentes + 9 widgets |
| GET/PATCH | `/dashboards/overrides` | Editor sin código |
| POST | `/dashboards/suggestions/{id}/accept` o `/dismiss` | Sugerencias auto |
| GET | `/reportes/avance-jurado` | Reporte |
| GET | `/reportes/export-excel?tipo=…` | Export Excel |

## Administración del sistema (admin_general)

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/admin/reset-datos` | Reset operativo |
| POST | `/admin/seed-test-users?convocatoria_id=` | 8 usuarios de prueba |
| POST | `/admin/seed-estados-propuesta?convocatoria_id=` | Catálogo de estados |
| DELETE | `/admin/propuestas/{id}` | Hard-delete propuesta |
| DELETE | `/admin/jurados/{id}` | Hard-delete jurado |
| DELETE | `/admin/evaluaciones-individuales/{id}` | Hard-delete eval ind. |
| DELETE | `/admin/evaluaciones-colectivas/{id}` | Hard-delete eval col. |
| DELETE | `/admin/rankings/{id}` | Hard-delete ranking |

## IA

| Método | Ruta | Body | Descripción |
|--------|------|------|-------------|
| POST | `/ai/mejorar-texto` | `{ texto, contexto }` | Mejora con GPT-4o |
| GET | `/ai/status` | — | Estado del proveedor |

## Configuración global

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/PATCH | `/settings` | Settings globales |
| PATCH | `/settings/ai` | Provider, modelo, BYOK |
| PATCH | `/settings/sendgrid` | API key + remitente |
| POST | `/settings/sendgrid/test` | Envía correo prueba |
| PATCH | `/settings/branding` | Nombre, colores |
