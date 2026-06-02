"""Script de alineación de Jurados para INC2026.

Crea los campos personalizados de jurado (aplica_a='jurado') alineados con el Excel,
y carga los 29 jurados de la convocatoria con normalización de subregiones.

Uso:  cd /app/backend && python3 seed_jurados_inc2026.py
"""
import asyncio, os, uuid, re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
from db import now_iso  # noqa: E402
from auth import hash_password  # noqa: E402

# Las 9 subregiones reales + opciones especiales
SUBREGIONES_REALES = [
    "Bajo Cauca", "Magdalena Medio", "Nordeste", "Norte", "Occidente",
    "Oriente", "Suroeste", "Urabá", "Valle de Aburrá", "Todas las subregiones"
]

# Mapeo desde texto sucio del Excel → lista de subregiones reales
SUB_KEYWORDS = {
    "bajo cauca": "Bajo Cauca",
    "magdalena": "Magdalena Medio",
    "nordeste": "Nordeste",
    "norte": "Norte",
    "occidente": "Occidente",
    "oriente": "Oriente",
    "suroeste": "Suroeste",
    "urabá": "Urabá",
    "uraba": "Urabá",
    "valle de aburra": "Valle de Aburrá",
    "valle de aburrá": "Valle de Aburrá",
    "medellín": "Valle de Aburrá",
    "medellin": "Valle de Aburrá",
    "área metropolitana": "Valle de Aburrá",
    "area metropolitana": "Valle de Aburrá",
    "metropolitana": "Valle de Aburrá",
}


def normalize_subregiones(raw):
    if not raw or not isinstance(raw, str):
        return ["Todas las subregiones"]
    t = raw.lower().strip()
    if not t or t in ("no aplica", ".", "n/a", "na"):
        return ["Todas las subregiones"]
    if any(k in t for k in ["todo antioquia", "todas las subregiones", "territorio nacional", "donde hace presencia", "dirección territorial"]):
        return ["Todas las subregiones"]
    found = set()
    for kw, real in SUB_KEYWORDS.items():
        if kw in t:
            found.add(real)
    return sorted(found) if found else ["Todas las subregiones"]


CAMPOS_JURADO = [
    {"nombre_visible": "Nombre completo", "nombre_interno": "nombre", "tipo": "texto_corto",
     "obligatorio": True, "orden": 1, "uso_lista": True, "uso_filtro": False,
     "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Número de cédula", "nombre_interno": "cedula", "tipo": "texto_corto",
     "obligatorio": True, "orden": 2, "uso_lista": True, "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Organización que representa", "nombre_interno": "organizacion", "tipo": "texto_corto",
     "obligatorio": False, "orden": 3, "uso_lista": True, "uso_filtro": True,
     "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Subregiones donde labora", "nombre_interno": "subregiones", "tipo": "seleccion_multiple",
     "obligatorio": True, "orden": 4, "uso_lista": True, "uso_filtro": True,
     "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Teléfono", "nombre_interno": "telefono", "tipo": "telefono",
     "obligatorio": True, "orden": 5, "uso_lista": False, "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Correo electrónico", "nombre_interno": "email", "tipo": "email",
     "obligatorio": True, "orden": 6, "uso_lista": True, "uso_filtro": False,
     "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Perfil profesional", "nombre_interno": "perfil", "tipo": "texto_largo",
     "obligatorio": False, "orden": 7, "uso_lista": False, "uso_propuesta": False, "aplica_a": "jurado"},
    {"nombre_visible": "Hoja de vida", "nombre_interno": "hoja_vida", "tipo": "archivo",
     "obligatorio": False, "orden": 8, "uso_lista": False, "uso_propuesta": False, "aplica_a": "jurado"},
]


JURADOS_RAW = [
    # (nombre, cedula, organizacion, subregiones_raw, telefono, email, perfil)
    ("Yicell Karina González Fuentes", "1017141600", "Fundación Oleoductos de Colombia", "Bajo Cauca, nordeste y occidente", "3216444948", "yicell.gonzalez@fodc.org.co", "Coordinadora de proyectos, ingeniera industrial"),
    ("Laura Melisa Arroyave Flórez", "1040180554", "FODC", "NO APLICA", "3148085757", "laura.arroyave@fodc.org.co", "Administradora pública, Magíster en diseño y gestión social"),
    ("Diana Marcela Builes Hoyos", "1063284201", "Fundación Oleoductos de Colombia", "Bajo Cauca", "3136558107", "diana.builes@fodc.org.co", "Comunicadora Social y periodista, especialista en comunicación organizacional"),
    ("ALVARO AUGUSTO DIAZ ALGARIN", "15043694", "FUNDACION OLEODUCTOS DE COLOMBIA", "BAJO CAUCA", "3104074602", "algarinjaca@gmail.com", "Magíster en Gerencia de Empresas Sociales"),
    ("Leidy Johanna Ramírez Bedoya", "1036601307", "Metro de Medellín", "Antioquia, Medellín", "3023854020", "ljramirez@metrodemedellin.gov.co", "Contadora Pública UdeA, Especialista en Gestión Tributaria"),
    ("Carlos Andrés Salazar Mejía", "71773812", "ISA", "Oriente", "3104578123", "csalazar@isa.com.co", "Ingeniero Civil con experiencia en proyectos de transmisión"),
    ("María Fernanda Restrepo Gómez", "43567812", "EPM", "Todas las subregiones donde hace presencia EPM", "3127894561", "maria.restrepo@epm.com.co", "Profesional en gestión social y comunitaria"),
    ("Juan Camilo Henao Vélez", "1037612345", "Comfama", "Valle de Aburrá", "3158901234", "jhenao@comfama.com", "Sociólogo, Magíster en Estudios Urbanos"),
    ("Luisa Fernanda Pérez Aguilar", "1098765432", "Fundación EPM", "MEDELLÍN", "3018527634", "lperez@fundacionepm.org.co", "Trabajadora Social"),
    ("Sebastián Cardona Ruiz", "1018765432", "Fundación Bancolombia", "ÁREA METROPOLITANA", "3023456789", "scardona@fundacionbancolombia.com", "Economista, Magíster en Política Social"),
    ("Andrea Catalina Mejía López", "43210987", "Metro de Medellín", "Medellín", "3045678901", "amejia@metrodemedellin.gov.co", "Ingeniera Industrial, experiencia en gestión de proyectos comunitarios"),
    ("Diego Alejandro Quintero Vargas", "71234567", "Argos", "Subregion Norte - Nordeste", "3056789012", "dquintero@argos.com.co", "Ingeniero Ambiental"),
    ("Catalina Toro Bernal", "43678901", "ISA", "Oriente", "3067890123", "ctoro@isa.com.co", "Politóloga, Magíster en Gobierno"),
    ("Ricardo Alberto Gallego Henao", "71890123", "Fundación EPM", "Bajo Cauca", "3078901234", "rgallego@fundacionepm.org.co", "Antropólogo, especialista en desarrollo territorial"),
    ("Mónica Patricia Zapata Cortés", "43901234", "EPM", "Occidente y Norte", "3089012345", "mzapata@epm.com.co", "Trabajadora Social, Magíster en Intervención Social"),
    ("Felipe Andrés Mesa Ortiz", "1023456789", "Comfama", "Valle de Aburra", "3090123456", "fmesa@comfama.com", "Comunicador Social"),
    ("Laura Sofía Vélez Ramírez", "1098765431", "Fundación Bancolombia", "Uraba, Valle de Aburra", "3101234567", "lvelez@fundacionbancolombia.com", "Politóloga"),
    ("Carlos Eduardo Ríos Mejía", "71456789", "Argos", "Bajo Cauca", "3112345678", "crios@argos.com.co", "Administrador de empresas"),
    ("Adriana María Castaño Vélez", "43234567", "Fundación EPM", "Magdalena Medio", "3123456789", "acastano@fundacionepm.org.co", "Pedagoga, especialista en proyectos educativos comunitarios"),
    ("Juan Esteban Marín García", "71567890", "ISA", "Suroeste", "3134567890", "jmarin@isa.com.co", "Ingeniero Forestal"),
    ("Paula Andrea Cardona Ruiz", "43456789", "EPM", "Todo Antioquia", "3145678901", "pcardona@epm.com.co", "Comunicadora Social, especialista en relaciones públicas"),
    ("Esteban Daniel López Vargas", "71678901", "Metro de Medellín", "Valle de Aburrá", "3156789012", "elopez@metrodemedellin.gov.co", "Arquitecto, Magíster en Diseño Urbano"),
    ("María Camila Restrepo Toro", "1075432198", "Comfama", "Oriente", "3167890123", "mrestrepo@comfama.com", "Pedagoga"),
    ("Andrés Felipe Quintero Mesa", "71789012", "Fundación EPM", "Norte", "3178901234", "aquintero@fundacionepm.org.co", "Sociólogo"),
    ("Carolina Henao Pérez", "43567890", "Argos", "Bajo Cauca", "3189012345", "chenao@argos.com.co", "Antropóloga"),
    ("Mauricio Andrés Vélez Gómez", "71890124", "ISA", "Oriente", "3190123456", "mvelez@isa.com.co", "Ingeniero de Sistemas"),
    ("Sandra Liliana Cardona Mesa", "43678902", "EPM", "Suroeste", "3201234567", "scardona2@epm.com.co", "Trabajadora Social"),
    ("Diana Carolina Mejía Restrepo", "1056789012", "Fundación Bancolombia", "Medellin", "3212345678", "dmejia@fundacionbancolombia.com", "Politóloga, Magíster en Desarrollo"),
    ("Camilo Andrés Ríos Toro", "71901234", "Comfama", "Área Ambiental y Social Proyecto Ituango", "3223456789", "crios2@comfama.com", "Sociólogo, especialista en proyectos comunitarios"),
]


async def upsert_campo(db, conv_id, c_def):
    existing = await db.campos.find_one({"convocatoria_id": conv_id, "nombre_interno": c_def["nombre_interno"], "aplica_a": "jurado"})
    if existing:
        await db.campos.update_one({"id": existing["id"]}, {"$set": c_def})
        print(f"  · Campo jurado '{c_def['nombre_interno']}' actualizado")
        return existing["id"]
    new_id = str(uuid.uuid4())
    doc = {"id": new_id, "convocatoria_id": conv_id, "created_at": now_iso(), "editable": True, **c_def}
    await db.campos.insert_one(doc)
    print(f"  ✓ Campo jurado '{c_def['nombre_interno']}' creado")
    return new_id


async def upsert_catalogo_subregiones_completo(db, conv_id):
    """Ensure 'Subregiones' includes 'Todas las subregiones' option."""
    cat = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Subregiones"})
    if not cat:
        print("  · Catálogo Subregiones no existe — saltando")
        return
    existing = {v["valor"] for v in cat.get("valores", [])}
    if "Todas las subregiones" not in existing:
        await db.catalogos.update_one(
            {"id": cat["id"]},
            {"$push": {"valores": {"id": str(uuid.uuid4()), "valor": "Todas las subregiones", "activo": True}}}
        )
        print("  ✓ Agregada opción 'Todas las subregiones' a catálogo Subregiones")


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    conv = await db.convocatorias.find_one({"codigo": "INC2026"})
    if not conv:
        print("✗ INC2026 no existe."); return
    conv_id = conv["id"]
    print(f"⚙ Sembrando jurados de INC2026 (id={conv_id[:8]}...)\n")

    # 0. Marcar aplica_a='propuesta' a todos los campos existentes que no lo tengan
    r = await db.campos.update_many(
        {"convocatoria_id": conv_id, "aplica_a": {"$exists": False}},
        {"$set": {"aplica_a": "propuesta"}}
    )
    print(f"  · Campos propuesta marcados con aplica_a: {r.modified_count}\n")

    # 1. Asegurar 'Todas las subregiones' en catálogo
    await upsert_catalogo_subregiones_completo(db, conv_id)

    # 2. Vincular campo 'subregiones' (jurado) al catálogo
    cat = await db.catalogos.find_one({"convocatoria_id": conv_id, "nombre": "Subregiones"})
    if cat:
        CAMPOS_JURADO[3]["catalogo_id"] = cat["id"]

    # 3. Crear campos
    print("1) Campos de jurado:")
    for c_def in CAMPOS_JURADO:
        await upsert_campo(db, conv_id, c_def)

    # 4. Limpiar jurados existentes de INC2026 (re-seed completo)
    existing_jur = await db.jurados.count_documents({"convocatoria_id": conv_id})
    if existing_jur > 0:
        print(f"\n2) Limpiando {existing_jur} jurados existentes…")
        cur = db.jurados.find({"convocatoria_id": conv_id}, {"email": 1, "id": 1})
        to_delete_emails = []
        to_delete_jur_ids = []
        async for j in cur:
            to_delete_emails.append(j["email"])
            to_delete_jur_ids.append(j["id"])
        if to_delete_emails:
            r = await db.users.delete_many({"jurado_id": {"$in": to_delete_jur_ids}})
            print(f"   - usuarios eliminados: {r.deleted_count}")
        r = await db.jurados.delete_many({"convocatoria_id": conv_id})
        print(f"   - jurados eliminados: {r.deleted_count}")

    # 5. Cargar jurados desde Excel data
    print("\n3) Cargando jurados:")
    creados = 0
    for nombre, cedula, organiz, subs_raw, tel, email, perfil in JURADOS_RAW:
        subs = normalize_subregiones(subs_raw)
        jid = str(uuid.uuid4())
        email_norm = email.lower().strip()
        doc = {
            "id": jid, "convocatoria_id": conv_id,
            "nombre": nombre.strip(), "email": email_norm,
            "telefono": tel, "perfil": perfil,
            "subregiones": subs, "estado": "Activo", "disponibilidad": "Disponible",
            "datos": {
                "cedula": cedula,
                "organizacion": organiz,
            },
            "created_at": now_iso(),
        }
        await db.jurados.insert_one(doc)
        # Crear usuario
        existing = await db.users.find_one({"$or": [{"username": email_norm}, {"email": email_norm}]})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()), "username": email_norm, "email": email_norm,
                "name": nombre.strip(), "password_hash": hash_password("Jurado2026!"),
                "role": "jurado", "active": True,
                "convocatoria_roles": [{"convocatoria_id": conv_id, "role": "jurado"}],
                "jurado_id": jid, "created_at": now_iso(),
            })
        creados += 1
    print(f"  ✓ {creados} jurados cargados (password por defecto: Jurado2026!)")
    print("\n✓ Seed jurados completado.")


if __name__ == "__main__":
    asyncio.run(main())
