# 15 · Mantenimiento y troubleshooting

## Servicios

KRINOS corre bajo **supervisor** en este entorno:

```bash
sudo supervisorctl status            # ver estado
sudo supervisorctl restart backend   # reiniciar API
sudo supervisorctl restart frontend  # reiniciar React
sudo supervisorctl restart all       # reiniciar todo
```

### Logs
```bash
tail -f /var/log/supervisor/backend.err.log
tail -f /var/log/supervisor/backend.out.log
tail -f /var/log/supervisor/frontend.err.log
```

## Hot reload

- Backend: uvicorn con `--reload`. Cambios en `*.py` se aplican automáticamente.
- Frontend: react-scripts. Cambios en JSX/CSS hot-recargan.
- **Solo reinicia supervisor cuando**:
  - Modificas `.env` (variables).
  - Instalas un paquete nuevo (`pip` / `yarn add`).

## MongoDB

```bash
mongo --port 27017 krinos_db

> db.users.find({ role: "admin_general" })
> db.convocatorias.find({}, { codigo: 1, nombre: 1, estado: 1 })
> db.propuestas.countDocuments({ convocatoria_id: "<id>" })
```

### Backup manual
```bash
mongodump --db krinos_db --out /backup/$(date +%Y%m%d_%H%M%S)
```

### Restore
```bash
mongorestore --db krinos_db /backup/<carpeta>/krinos_db
```

## Healthchecks

| URL | Espera |
|-----|--------|
| `${API}/api/health` | `{"status":"ok"}` |
| `${API}/api/` | `{"name":"KRINOS API",...}` |

## Errores comunes

### El frontend no se conecta al backend
- Verifica `REACT_APP_BACKEND_URL` en `/app/frontend/.env`.
- Asegúrate de que apunta a la URL pública (no `localhost`).

### "Token inválido / expirado"
- El JWT dura 7 días por defecto. Re-login.

### "ObjectId is not JSON serializable"
- Significa que algún endpoint olvidó hacer `doc.pop("_id", None)` o `find({...}, {"_id":0})`. Reportar al equipo.

### Carga masiva XLSX rechaza filas
- Verifica que las columnas coincidan exactamente con la plantilla descargada.
- Subregiones deben estar separadas por `;` o `,`.

### Brute force lockout
- 5 intentos fallidos / 15 min bloquean por `identifier` (independiente de IP).
- Se libera automáticamente después de 15 min.

## Limpieza periódica

1. **Reset de auditoría** (si crece demasiado):
   ```
   POST /api/admin/reset-datos
   { "confirmacion": "REINICIAR", "incluir_usuarios": false, "incluir_auditoria": true }
   ```
2. **Eliminación de rankings antiguos** desde la UI (`/ranking` → Historial → 🗑).

## Migraciones

KRINOS usa un patrón **seed idempotente**:
- `seed_admin()` crea `lcorreaq` si no existe.
- `seed_incentivos_2026()` crea la convocatoria INC2026 y catálogos.
- `seed_demo_data()` carga propuestas/jurados/ternas demo solo si no hay datos.

Después de cambios de schema, basta con reiniciar el backend y los seeds completarán los faltantes.
