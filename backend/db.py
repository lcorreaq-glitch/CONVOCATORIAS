"""KRINOS - Database connection, indexes and seeding."""
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient

_client: AsyncIOMotorClient | None = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_indexes():
    db = get_db()
    # Users
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True)
    # Auth
    await db.login_attempts.create_index("identifier")
    # Domain
    await db.convocatorias.create_index("codigo", unique=True)
    await db.catalogos.create_index([("convocatoria_id", 1), ("nombre", 1)])
    await db.campos.create_index([("convocatoria_id", 1), ("nombre_interno", 1)])
    await db.propuestas.create_index([("convocatoria_id", 1), ("codigo", 1)])
    await db.jurados.create_index([("convocatoria_id", 1), ("email", 1)])
    await db.ternas.create_index([("convocatoria_id", 1), ("codigo", 1)])
    await db.asignaciones.create_index([("propuesta_id", 1), ("jurado_id", 1), ("terna_id", 1)])
    await db.evaluaciones_individuales.create_index([("propuesta_id", 1), ("jurado_id", 1)])
    await db.evaluaciones_colectivas.create_index([("propuesta_id", 1), ("terna_id", 1)])
    await db.auditoria.create_index("fecha")


async def seed_admin():
    from auth import hash_password, verify_password
    db = get_db()
    username = os.environ["ADMIN_USERNAME"]
    email = os.environ["ADMIN_EMAIL"]
    password = os.environ["ADMIN_PASSWORD"]
    name = os.environ.get("ADMIN_NAME", "Administrador")
    existing = await db.users.find_one({"username": username})
    if existing is None:
        import uuid
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": username,
            "email": email,
            "name": name,
            "password_hash": hash_password(password),
            "role": "admin_general",
            "active": True,
            "convocatoria_roles": [],
            "created_at": now_iso(),
        })
    else:
        # Mantener admin alineado con .env (idempotente)
        updates = {}
        if existing.get("email") != email: updates["email"] = email
        if existing.get("name") != name: updates["name"] = name
        if not verify_password(password, existing.get("password_hash", "")):
            updates["password_hash"] = hash_password(password)
        existing_role = existing.get("role")
        if existing_role != "admin_general": updates["role"] = "admin_general"
        if not existing.get("active", True): updates["active"] = True
        if updates:
            await db.users.update_one({"username": username}, {"$set": updates})


async def seed_incentivos_2026():
    """Seed the Incentivos Antioquia 2026 convocatoria as the first configured process."""
    import uuid
    db = get_db()
    if await db.convocatorias.find_one({"codigo": "INC2026"}):
        return

    conv_id = str(uuid.uuid4())
    await db.convocatorias.insert_one({
        "id": conv_id,
        "codigo": "INC2026",
        "nombre": "Iniciativas Comunitarias Antioquia 2026",
        "descripcion": "Convocatoria de incentivos y estímulos para iniciativas comunitarias de las subregiones de Antioquia.",
        "vigencia": "2026",
        "tipo": "Convocatoria de iniciativas comunitarias",
        "entidades": [{
            "nombre": "Gobernación de Antioquia",
            "tipo": "Entidad Pública",
            "rol": "Convocante / Operadora / Financiadora",
            "nit": "890.900.286-0",
            "responsable": "Secretaría de Participación Ciudadana",
            "cargo": "Secretaría",
            "correo": "participacion@antioquia.gov.co",
            "telefono": "+57 604 383 8300",
            "principal": True,
        }],
        "estado": "Activa",
        "etapa_actual": "Evaluación Individual",
        "etapas_habilitadas": [
            "Configuración", "Cargue de Propuestas", "Habilitación Documental",
            "Asignación de Evaluadores", "Evaluación Individual",
            "Evaluación Colectiva", "Consolidación", "Ranking y Desempates",
            "Publicación de Resultados", "Cierre"
        ],
        "fechas": {
            "apertura_propuestas": "2026-01-15",
            "cierre_propuestas": "2026-02-15",
            "apertura_evaluacion_individual": "2026-03-01",
            "cierre_evaluacion_individual": "2026-03-31",
            "apertura_evaluacion_colectiva": "2026-04-01",
            "cierre_evaluacion_colectiva": "2026-04-15",
        },
        "modalidad_evaluacion_colectiva": "promedio_individuales",
        "modelo_expediente": "externo",
        "imagen_grafica": {
            "color_primario": "#059669",
            "logo_url": "",
        },
        "created_at": now_iso(),
        "created_by": "system",
    })

    # Catálogos
    subregiones = ["Urabá", "Oriente", "Norte", "Bajo Cauca", "Nordeste",
                   "Suroeste", "Occidente", "Magdalena Medio", "Valle de Aburrá"]
    cat_sub_id = str(uuid.uuid4())
    await db.catalogos.insert_one({
        "id": cat_sub_id, "convocatoria_id": conv_id,
        "nombre": "Subregiones", "descripcion": "Subregiones de Antioquia",
        "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": s, "activo": True, "padre_valor_id": None} for s in subregiones],
        "created_at": now_iso(),
    })

    lineas = ["Participación Ciudadana", "Cultura", "Educación",
              "Medio Ambiente", "Deporte", "Infraestructura Comunitaria",
              "Emprendimiento", "Salud Comunitaria"]
    await db.catalogos.insert_one({
        "id": str(uuid.uuid4()), "convocatoria_id": conv_id,
        "nombre": "Líneas", "descripcion": "Líneas de participación de la convocatoria",
        "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": l, "activo": True, "padre_valor_id": None} for l in lineas],
        "created_at": now_iso(),
    })

    tipos_org = ["Junta de Acción Comunal", "ONG", "Organización Étnica",
                 "Cooperativa", "Colectivo Juvenil", "Asociación Mujeres",
                 "Asociación Productiva", "Veeduría Ciudadana"]
    await db.catalogos.insert_one({
        "id": str(uuid.uuid4()), "convocatoria_id": conv_id,
        "nombre": "Tipos de Organización", "descripcion": "Tipo de organización postulante",
        "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": t, "activo": True, "padre_valor_id": None} for t in tipos_org],
        "created_at": now_iso(),
    })

    enfoques = ["Mujeres", "Niñas, Niños y Adolescentes", "Jóvenes",
                "Adulto Mayor", "Discapacidad", "Indígenas", "Afrodescendientes",
                "LGBTIQ+", "Víctimas del Conflicto", "Rural Campesino"]
    await db.catalogos.insert_one({
        "id": str(uuid.uuid4()), "convocatoria_id": conv_id,
        "nombre": "Enfoque Poblacional", "descripcion": "Poblaciones beneficiarias",
        "activo": True, "padre_id": None,
        "valores": [{"id": str(uuid.uuid4()), "valor": e, "activo": True, "padre_valor_id": None} for e in enfoques],
        "created_at": now_iso(),
    })

    # Campos personalizados (base + adicionales)
    campos = [
        {"nombre_visible": "Subregión", "nombre_interno": "subregion", "tipo": "lista", "obligatorio": True, "orden": 1, "uso_filtro": True, "uso_ranking": False},
        {"nombre_visible": "Municipio", "nombre_interno": "municipio", "tipo": "texto_corto", "obligatorio": True, "orden": 2, "uso_filtro": True, "uso_ranking": False},
        {"nombre_visible": "Tipo de Organización", "nombre_interno": "tipo_organizacion", "tipo": "lista", "obligatorio": True, "orden": 3, "uso_filtro": True},
        {"nombre_visible": "Enfoque Poblacional", "nombre_interno": "enfoque_poblacional", "tipo": "seleccion_multiple", "obligatorio": False, "orden": 4, "uso_filtro": True},
        {"nombre_visible": "Línea", "nombre_interno": "linea", "tipo": "lista", "obligatorio": True, "orden": 5, "uso_filtro": True},
        {"nombre_visible": "Temática", "nombre_interno": "tematica", "tipo": "texto_corto", "obligatorio": False, "orden": 6, "uso_filtro": True},
        {"nombre_visible": "Representante Legal", "nombre_interno": "representante_legal", "tipo": "texto_corto", "obligatorio": True, "orden": 7},
        {"nombre_visible": "Fecha de Radicación", "nombre_interno": "fecha_radicacion", "tipo": "fecha", "obligatorio": True, "orden": 8, "uso_desempate": True},
        {"nombre_visible": "Hora de Radicación", "nombre_interno": "hora_radicacion", "tipo": "hora", "obligatorio": True, "orden": 9, "uso_desempate": True},
        {"nombre_visible": "Priorizada", "nombre_interno": "priorizada", "tipo": "si_no", "obligatorio": False, "orden": 10},
        {"nombre_visible": "Link Expediente Documental", "nombre_interno": "link_expediente", "tipo": "url", "obligatorio": True, "orden": 11},
    ]
    for c in campos:
        c["id"] = str(uuid.uuid4())
        c["convocatoria_id"] = conv_id
        c["created_at"] = now_iso()
        await db.campos.insert_one(c)

    # Criterios oficiales (suman 100)
    criterios = [
        {"nombre": "Incidencia e Impacto Comunitario", "descripcion": "Nivel de afectación positiva en la comunidad.", "puntaje_min": 0, "puntaje_max": 30, "ponderacion": 30, "oficial": True, "orden": 1},
        {"nombre": "Participación e Inclusión", "descripcion": "Mecanismos de participación y enfoque inclusivo.", "puntaje_min": 0, "puntaje_max": 20, "ponderacion": 20, "oficial": True, "orden": 2},
        {"nombre": "Capacidad Organizativa", "descripcion": "Trayectoria y capacidad ejecutora.", "puntaje_min": 0, "puntaje_max": 15, "ponderacion": 15, "oficial": True, "orden": 3},
        {"nombre": "Fortalecimiento Institucional", "descripcion": "Aporte al fortalecimiento institucional.", "puntaje_min": 0, "puntaje_max": 20, "ponderacion": 20, "oficial": True, "orden": 4},
        {"nombre": "Medio Ambiente", "descripcion": "Aporte ambiental y sostenibilidad.", "puntaje_min": 0, "puntaje_max": 10, "ponderacion": 10, "oficial": True, "orden": 5},
        {"nombre": "Priorización", "descripcion": "Priorización aplicable por la convocatoria.", "puntaje_min": 0, "puntaje_max": 5, "ponderacion": 5, "oficial": True, "orden": 6},
        # Criterios diferenciales (no suman al 100)
        {"nombre": "Impacto en Mujeres, Niñas y Jóvenes", "descripcion": "Aporte diferencial a esta población.", "puntaje_min": 0, "puntaje_max": 10, "ponderacion": 0, "oficial": False, "diferencial": True, "orden": 7},
        {"nombre": "Impacto en Población con Discapacidad", "descripcion": "Aporte diferencial a esta población.", "puntaje_min": 0, "puntaje_max": 10, "ponderacion": 0, "oficial": False, "diferencial": True, "orden": 8},
        {"nombre": "Impacto en Población Indígena y Afrodescendiente", "descripcion": "Aporte diferencial a esta población.", "puntaje_min": 0, "puntaje_max": 10, "ponderacion": 0, "oficial": False, "diferencial": True, "orden": 9},
    ]
    for c in criterios:
        c["id"] = str(uuid.uuid4())
        c["convocatoria_id"] = conv_id
        c["obligatorio"] = True
        c["created_at"] = now_iso()
        await db.criterios.insert_one(c)

    # Desempates
    desempates = [
        {"orden": 1, "nombre": "Fecha y hora de radicación más antigua", "campo": "fecha_radicacion", "tipo_comparacion": "fecha_mas_antigua"},
        {"orden": 2, "nombre": "Mayor puntaje en Incidencia e Impacto Comunitario", "campo": "criterio:Incidencia e Impacto Comunitario", "tipo_comparacion": "mayor_valor"},
        {"orden": 3, "nombre": "Mayor puntaje en Participación e Inclusión", "campo": "criterio:Participación e Inclusión", "tipo_comparacion": "mayor_valor"},
        {"orden": 4, "nombre": "Mayor puntaje en Mujeres, Niñas y Jóvenes", "campo": "criterio:Impacto en Mujeres, Niñas y Jóvenes", "tipo_comparacion": "mayor_valor"},
        {"orden": 5, "nombre": "Mayor puntaje en Discapacidad", "campo": "criterio:Impacto en Población con Discapacidad", "tipo_comparacion": "mayor_valor"},
        {"orden": 6, "nombre": "Mayor puntaje en Étnico", "campo": "criterio:Impacto en Población Indígena y Afrodescendiente", "tipo_comparacion": "mayor_valor"},
        {"orden": 7, "nombre": "Sorteo", "campo": "sorteo", "tipo_comparacion": "sorteo"},
    ]
    for d in desempates:
        d["id"] = str(uuid.uuid4())
        d["convocatoria_id"] = conv_id
        d["activo"] = True
        d["created_at"] = now_iso()
        await db.desempates.insert_one(d)


async def seed_demo_data():
    """Seed demo propuestas, jurados, ternas for INC2026 to make platform demonstrable end-to-end."""
    import uuid
    db = get_db()
    conv = await db.convocatorias.find_one({"codigo": "INC2026"})
    if not conv:
        return
    conv_id = conv["id"]
    # Skip if already seeded
    if await db.propuestas.count_documents({"convocatoria_id": conv_id}) > 0:
        return

    from auth import hash_password

    # Jurados
    jurados_data = [
        {"nombre": "Ana María Pérez", "email": "ana.perez@krinos.gov.co", "especialidad": "Desarrollo comunitario", "linea_experiencia": "Participación Ciudadana", "territorio": "Urabá"},
        {"nombre": "Carlos Vélez Restrepo", "email": "carlos.velez@krinos.gov.co", "especialidad": "Gestión cultural", "linea_experiencia": "Cultura", "territorio": "Oriente"},
        {"nombre": "Diana Cortés Mejía", "email": "diana.cortes@krinos.gov.co", "especialidad": "Educación rural", "linea_experiencia": "Educación", "territorio": "Norte"},
        {"nombre": "Esteban Marín García", "email": "esteban.marin@krinos.gov.co", "especialidad": "Medio ambiente", "linea_experiencia": "Medio Ambiente", "territorio": "Suroeste"},
        {"nombre": "Fernanda Salazar", "email": "fernanda.salazar@krinos.gov.co", "especialidad": "Equidad de género", "linea_experiencia": "Participación Ciudadana", "territorio": "Bajo Cauca"},
        {"nombre": "Gustavo Hernández", "email": "gustavo.hernandez@krinos.gov.co", "especialidad": "Infraestructura social", "linea_experiencia": "Infraestructura Comunitaria", "territorio": "Magdalena Medio"},
    ]
    jurado_ids = {}
    for j in jurados_data:
        jid = str(uuid.uuid4())
        await db.jurados.insert_one({
            "id": jid, "convocatoria_id": conv_id,
            **j, "telefono": "+57 300 555 0000", "perfil": "Profesional",
            "disponibilidad": "Disponible", "estado": "Activo",
            "created_at": now_iso(),
        })
        jurado_ids[j["email"]] = jid
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": j["email"], "email": j["email"], "name": j["nombre"],
            "password_hash": hash_password("Jurado2026!"),
            "role": "jurado", "active": True,
            "convocatoria_roles": [{"convocatoria_id": conv_id, "role": "jurado"}],
            "jurado_id": jid,
            "created_at": now_iso(),
        })

    # Ternas: T1 Urabá, T2 Oriente, T3 Norte
    ternas_data = [
        ("T1", "Terna Urabá", "Urabá", ["ana.perez@krinos.gov.co", "carlos.velez@krinos.gov.co", "fernanda.salazar@krinos.gov.co"]),
        ("T2", "Terna Oriente", "Oriente", ["carlos.velez@krinos.gov.co", "diana.cortes@krinos.gov.co", "esteban.marin@krinos.gov.co"]),
        ("T3", "Terna Norte", "Norte", ["diana.cortes@krinos.gov.co", "gustavo.hernandez@krinos.gov.co", "ana.perez@krinos.gov.co"]),
    ]
    terna_ids = {}
    for codigo, nombre, terr, emails in ternas_data:
        tid = str(uuid.uuid4())
        integrantes = [{"jurado_id": jurado_ids[e], "nombre": next(j["nombre"] for j in jurados_data if j["email"] == e), "rol": "Evaluador"} for e in emails]
        await db.ternas.insert_one({
            "id": tid, "convocatoria_id": conv_id,
            "codigo": codigo, "nombre": nombre, "tipo": "Terna",
            "integrantes": integrantes, "territorio": terr,
            "estado": "Activo", "observaciones": "",
            "created_at": now_iso(),
        })
        terna_ids[codigo] = tid

    # Propuestas
    propuestas_data = [
        ("P-0001", "Huerta Comunitaria El Edén", "JAC El Edén", "Urabá", "Apartadó", "Junta de Acción Comunal", "Medio Ambiente", "Soberanía alimentaria", "Pedro Pérez"),
        ("P-0002", "Escuela de Música Urabá Vive", "Fundación Música Urabá", "Urabá", "Turbo", "ONG", "Cultura", "Formación musical", "Luisa Mejía"),
        ("P-0003", "Casa de la Mujer Resiliente", "Asociación Mujeres Urabá", "Urabá", "Carepa", "Asociación Mujeres", "Participación Ciudadana", "Empoderamiento femenino", "María Gómez"),
        ("P-0004", "Cine Móvil Antioquia Oriente", "Cooperativa Cinéfilos", "Oriente", "Rionegro", "Cooperativa", "Cultura", "Cine alternativo", "Andrés Mora"),
        ("P-0005", "Aulas Verdes Guarne", "JAC Guarne Centro", "Oriente", "Guarne", "Junta de Acción Comunal", "Educación", "Educación ambiental", "Carolina Ruiz"),
        ("P-0006", "Mercado Campesino El Retiro", "Asociación Productores", "Oriente", "El Retiro", "Asociación Productiva", "Emprendimiento", "Economía local", "Jaime Toro"),
        ("P-0007", "Biblioteca Comunal Yarumal", "JAC Yarumal Centro", "Norte", "Yarumal", "Junta de Acción Comunal", "Educación", "Lectura y cultura", "Rosa Cardona"),
        ("P-0008", "Salud Mental Joven", "Colectivo Juvenil Norte", "Norte", "Santa Rosa de Osos", "Colectivo Juvenil", "Salud Comunitaria", "Bienestar juvenil", "David Acevedo"),
        ("P-0009", "Cancha Multifuncional Caucasia", "JAC Caucasia La Esperanza", "Bajo Cauca", "Caucasia", "Junta de Acción Comunal", "Deporte", "Recreación", "Hernando Pino"),
        ("P-0010", "Banda Sinfónica Suroeste", "ONG Música Suroeste", "Suroeste", "Andes", "ONG", "Cultura", "Formación instrumental", "Liliana Castaño"),
        ("P-0011", "Granja Integral Etnoeducativa", "Org. Indígena Embera", "Suroeste", "Jardín", "Organización Étnica", "Educación", "Educación propia", "Wernemar Tascón"),
        ("P-0012", "Veeduría Ambiental Magdalena", "Veeduría Magdalena", "Magdalena Medio", "Puerto Berrío", "Veeduría Ciudadana", "Medio Ambiente", "Control social ambiental", "Sandra Botero"),
    ]
    prop_ids = []
    for codigo, nombre, org, sub, mun, tipo, linea, tematica, repr_ in propuestas_data:
        pid = str(uuid.uuid4())
        prop_ids.append((pid, sub))
        await db.propuestas.insert_one({
            "id": pid, "convocatoria_id": conv_id,
            "codigo": codigo, "nombre": nombre, "organizacion": org,
            "datos": {
                "subregion": sub, "municipio": mun, "tipo_organizacion": tipo,
                "linea": linea, "tematica": tematica, "representante_legal": repr_,
                "fecha_radicacion": "2026-02-10", "hora_radicacion": f"10:{(prop_ids.__len__() * 5) % 60:02d}",
                "enfoque_poblacional": ["Mujeres", "Rural Campesino"] if "Mujer" in tipo else ["Rural Campesino"],
                "priorizada": False,
                "link_expediente": f"https://drive.google.com/drive/folders/demo-{codigo}",
            },
            "estado": "Habilitada",
            "created_at": now_iso(),
        })

    # Asignaciones automáticas por subregión
    subregion_to_terna = {"Urabá": "T1", "Oriente": "T2", "Norte": "T3"}
    for pid, sub in prop_ids:
        codigo_t = subregion_to_terna.get(sub)
        if not codigo_t: continue
        tid = terna_ids[codigo_t]
        # Asignación colectiva
        await db.asignaciones.insert_one({
            "id": str(uuid.uuid4()), "convocatoria_id": conv_id,
            "propuesta_id": pid, "terna_id": tid,
            "tipo_evaluacion": "colectiva", "etapa": "Evaluación Colectiva",
            "estado": "Creada", "created_at": now_iso(),
        })
        # Asignaciones individuales (cada miembro)
        terna_doc = await db.ternas.find_one({"id": tid})
        for integ in terna_doc.get("integrantes", []):
            aid = str(uuid.uuid4())
            await db.asignaciones.insert_one({
                "id": aid, "convocatoria_id": conv_id,
                "propuesta_id": pid, "jurado_id": integ["jurado_id"], "terna_id": tid,
                "tipo_evaluacion": "individual", "etapa": "Evaluación Individual",
                "estado": "Creada", "created_at": now_iso(),
            })
            await db.evaluaciones_individuales.insert_one({
                "id": str(uuid.uuid4()),
                "convocatoria_id": conv_id, "propuesta_id": pid,
                "jurado_id": integ["jurado_id"], "asignacion_id": aid,
                "estado": "Borrador", "puntajes": {}, "observaciones": {},
                "observacion_final": "", "puntaje_total": 0,
                "puntaje_diferencial_total": 0,
                "created_at": now_iso(),
            })
