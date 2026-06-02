"""Script de alineación de la convocatoria INC2026 con la plantilla Excel real.

Agrega campos faltantes (Nombre organización, NIT, ID organismo comunal, Ganador 2024/2025),
crea catálogos faltantes (Municipios de Antioquia, Temáticas) y vincula los campos tipo lista
al catálogo correspondiente.

Es idempotente: si un campo o catálogo ya existe (por nombre/nombre_interno), se omite.

Uso:  cd /app/backend && python3 align_inc2026.py
"""
import asyncio, os, uuid
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
from db import now_iso  # noqa: E402

# 125 municipios de Antioquia agrupados por subregión
MUNICIPIOS_POR_SUBREGION = {
    "Bajo Cauca": ["Cáceres", "Caucasia", "El Bagre", "Nechí", "Tarazá", "Zaragoza"],
    "Magdalena Medio": ["Caracolí", "Maceo", "Puerto Berrío", "Puerto Nare", "Puerto Triunfo", "Yondó"],
    "Nordeste": ["Amalfi", "Anorí", "Cisneros", "Remedios", "San Roque", "Santo Domingo", "Segovia", "Vegachí", "Yalí", "Yolombó"],
    "Norte": ["Angostura", "Belmira", "Briceño", "Campamento", "Carolina del Príncipe", "Don Matías", "Entrerríos", "Gómez Plata", "Guadalupe", "Ituango",
              "San Andrés de Cuerquia", "San José de la Montaña", "San Pedro de los Milagros", "Santa Rosa de Osos", "Toledo", "Valdivia", "Yarumal"],
    "Occidente": ["Abriaquí", "Anzá", "Armenia", "Buriticá", "Cañasgordas", "Dabeiba", "Ebéjico", "Frontino", "Giraldo", "Heliconia",
                  "Liborina", "Olaya", "Peque", "Sabanalarga", "San Jerónimo", "Santa Fe de Antioquia", "Sopetrán", "Uramita"],
    "Oriente": ["Abejorral", "Alejandría", "Argelia", "El Carmen de Viboral", "Cocorná", "Concepción", "El Peñol", "El Retiro", "El Santuario", "Granada",
                "Guarne", "Guatapé", "La Ceja", "La Unión", "Marinilla", "Nariño", "Rionegro", "San Carlos", "San Francisco", "San Luis",
                "San Rafael", "San Vicente Ferrer", "Sonsón"],
    "Suroeste": ["Amagá", "Andes", "Angelópolis", "Betania", "Betulia", "Caicedo", "Caramanta", "Ciudad Bolívar", "Concordia", "Fredonia",
                 "Hispania", "Jardín", "Jericó", "La Pintada", "Montebello", "Pueblorrico", "Salgar", "Santa Bárbara", "Támesis", "Tarso",
                 "Titiribí", "Urrao", "Valparaíso", "Venecia"],
    "Urabá": ["Apartadó", "Arboletes", "Carepa", "Chigorodó", "Murindó", "Mutatá", "Necoclí", "San Juan de Urabá", "San Pedro de Urabá", "Turbo", "Vigía del Fuerte"],
    "Valle de Aburrá": ["Barbosa", "Bello", "Caldas", "Copacabana", "Envigado", "Girardota", "Itagüí", "La Estrella", "Medellín", "Sabaneta"],
}

TEMATICAS = [
    ("1_1", "Línea 1 — Acción Comunal Activa"),
    ("1_2", "Línea 1 — Cuidado Integral"),
    ("2_1", "Línea 2 — Memoria y Cultura"),
    ("2_2", "Línea 2 — Patrimonio Comunitario"),
    ("3_1", "Línea 3 — Educación para la Paz"),
    ("3_2", "Línea 3 — Liderazgos Juveniles"),
    ("4_1", "Línea 4 — Infraestructura Comunitaria"),
    ("4_2", "Línea 4 — Casetas y Espacios de Encuentro"),
]


async def upsert_catalogo(db, conv_id: str, nombre: str, descripcion: str, valores: list[str]):
    existing = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": nombre})
    if existing:
        # Sincronizar valores faltantes (mantener IDs existentes)
        existing_vals = {v["valor"] for v in existing.get("valores", [])}
        nuevos = [{"id": str(uuid.uuid4()), "valor": v, "activo": True, "padre_valor_id": None}
                  for v in valores if v not in existing_vals]
        if nuevos:
            await db.catalogos.update_one(
                {"id": existing["id"]},
                {"$push": {"valores": {"$each": nuevos}}}
            )
            print(f"  · Catálogo '{nombre}' actualizado: +{len(nuevos)} valores")
        else:
            print(f"  · Catálogo '{nombre}' ya completo (sin cambios)")
        return existing["id"]
    cat_id = str(uuid.uuid4())
    await db.catalogos.insert_one({
        "id": cat_id, "convocatoria_id": conv_id, "nombre": nombre,
        "descripcion": descripcion, "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": v, "activo": True, "padre_valor_id": None}
                    for v in valores],
        "created_at": now_iso(),
    })
    print(f"  ✓ Catálogo '{nombre}' creado con {len(valores)} valores")
    return cat_id


async def upsert_campo(db, conv_id: str, campo: dict):
    existing = await db.campos.find_one({"convocatoria_id": conv_id, "nombre_interno": campo["nombre_interno"]})
    if existing:
        # Solo actualizar el catalogo_id y tipo si difieren
        update = {}
        for k in ("catalogo_id", "tipo", "uso_filtro", "uso_ranking", "uso_desempate", "uso_actas", "obligatorio", "nombre_visible"):
            if k in campo and existing.get(k) != campo[k]:
                update[k] = campo[k]
        if update:
            await db.campos.update_one({"id": existing["id"]}, {"$set": update})
            print(f"  · Campo '{campo['nombre_interno']}' actualizado: {list(update.keys())}")
        else:
            print(f"  · Campo '{campo['nombre_interno']}' ya existe (sin cambios)")
        return existing["id"]
    new_id = str(uuid.uuid4())
    doc = {"id": new_id, "convocatoria_id": conv_id, "created_at": now_iso(),
           "editable": True, **campo}
    await db.campos.insert_one(doc)
    print(f"  ✓ Campo '{campo['nombre_interno']}' creado")
    return new_id


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]

    conv = await db.convocatorias.find_one({"codigo": "INC2026"})
    if not conv:
        print("✗ INC2026 no existe.")
        return
    conv_id = conv["id"]
    print(f"⚙ Alineando INC2026 (id={conv_id[:8]}...)")
    print()

    print("1) Catálogos:")
    todos_municipios = sorted({m for ms in MUNICIPIOS_POR_SUBREGION.values() for m in ms})
    cat_municipios_id = await upsert_catalogo(db, conv_id, "Municipios", "125 municipios de Antioquia", todos_municipios)
    cat_tematicas_id = await upsert_catalogo(db, conv_id, "Temáticas", "Sublíneas temáticas por línea principal",
                                              [f"{cod} · {nombre}" for cod, nombre in TEMATICAS])

    # Buscar IDs de catálogos existentes
    cat_sub = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Subregiones"})
    cat_tipos = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Tipos de Organización"})
    cat_enfoques = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Enfoque Poblacional"})
    cat_lineas = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Líneas"})

    print()
    print("2) Campos (alineación con plantilla Excel):")
    # Orden completo de los 14 campos dinámicos del Excel (los códigos auto y estado no son campos dinámicos)
    campos_alineados = [
        {"nombre_visible": "Subregión", "nombre_interno": "subregion", "tipo": "lista",
         "obligatorio": True, "orden": 1, "uso_filtro": True, "uso_actas": True,
         "catalogo_id": cat_sub["id"] if cat_sub else None},
        {"nombre_visible": "Municipio", "nombre_interno": "municipio", "tipo": "lista",
         "obligatorio": True, "orden": 2, "uso_filtro": True, "uso_actas": True,
         "catalogo_id": cat_municipios_id},
        {"nombre_visible": "Tipo de Organización", "nombre_interno": "tipo_organizacion", "tipo": "lista",
         "obligatorio": True, "orden": 3, "uso_filtro": True, "uso_actas": True,
         "catalogo_id": cat_tipos["id"] if cat_tipos else None},
        {"nombre_visible": "Enfoque Poblacional", "nombre_interno": "enfoque_poblacional", "tipo": "seleccion_multiple",
         "obligatorio": False, "orden": 4, "uso_filtro": True,
         "catalogo_id": cat_enfoques["id"] if cat_enfoques else None},
        {"nombre_visible": "Nombre Organización", "nombre_interno": "nombre_organizacion", "tipo": "texto_corto",
         "obligatorio": True, "orden": 5, "uso_actas": True},
        {"nombre_visible": "NIT/RUT", "nombre_interno": "nit_rut", "tipo": "texto_corto",
         "obligatorio": True, "orden": 6, "uso_actas": True},
        {"nombre_visible": "ID Organismo Comunal", "nombre_interno": "id_organismo_comunal", "tipo": "texto_corto",
         "obligatorio": False, "orden": 7},
        {"nombre_visible": "Línea", "nombre_interno": "linea", "tipo": "lista",
         "obligatorio": True, "orden": 8, "uso_filtro": True, "uso_actas": True,
         "catalogo_id": cat_lineas["id"] if cat_lineas else None},
        {"nombre_visible": "Temática", "nombre_interno": "tematica", "tipo": "lista",
         "obligatorio": True, "orden": 9, "uso_filtro": True,
         "catalogo_id": cat_tematicas_id},
        {"nombre_visible": "Ganador 2024", "nombre_interno": "ganador_2024", "tipo": "si_no",
         "obligatorio": False, "orden": 10, "uso_filtro": True},
        {"nombre_visible": "Ganador 2025", "nombre_interno": "ganador_2025", "tipo": "si_no",
         "obligatorio": False, "orden": 11, "uso_filtro": True},
        {"nombre_visible": "Fecha de Radicación", "nombre_interno": "fecha_radicacion", "tipo": "fecha",
         "obligatorio": True, "orden": 12, "uso_desempate": True, "uso_actas": True},
        {"nombre_visible": "Hora de Radicación", "nombre_interno": "hora_radicacion", "tipo": "hora",
         "obligatorio": True, "orden": 13, "uso_desempate": True},
        {"nombre_visible": "Link Consulta Propuesta", "nombre_interno": "link_expediente", "tipo": "url",
         "obligatorio": True, "orden": 14, "uso_actas": True},
    ]
    for c_def in campos_alineados:
        await upsert_campo(db, conv_id, c_def)

    print()
    print("✓ Alineación completada.")


if __name__ == "__main__":
    asyncio.run(main())
