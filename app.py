"""
Servidor del sistema de checklist (Flask + PostgreSQL).

- Entrega las páginas de la carpeta "static" (operador.html, gerente.html...).
- Ofrece la API que usan la vista de operador y la de gerente.
- Guarda todo en PostgreSQL: unidades, operadores y fotos.

Cómo ejecutarlo:
    pip install flask "psycopg[binary]"
    python app.py

La conexión se toma de la variable de entorno DATABASE_URL.
Si no existe, se usa la de abajo (usuario postgres, base "checklist").
"""
import os
import sys
import time
import json
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from flask import Flask, Response, jsonify, redirect, request

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/checklist"
)

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0          # mientras desarrollas, no guardar archivos viejos en caché
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024   # tamaño máximo de una petición (las fotos)

TIPOS_FOTO = {"image/jpeg", "image/png", "image/webp"}
MAX_FOTO = 6 * 1024 * 1024


# ======================================================================
# BASE DE DATOS
# ======================================================================
ESQUEMA = """
CREATE TABLE IF NOT EXISTS meta (
    clave TEXT PRIMARY KEY,
    valor BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS operadores (
    id     SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL
);
-- no puede haber dos operadores con el mismo nombre (sin importar mayúsculas)
CREATE UNIQUE INDEX IF NOT EXISTS operadores_nombre_unico ON operadores (lower(nombre));

CREATE TABLE IF NOT EXISTS unidades (
    id           SERIAL PRIMARY KEY,
    clase        TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    area         TEXT NOT NULL,
    horas        DOUBLE PRECISION NOT NULL DEFAULT 0,
    revision     BIGINT,                        -- cuándo se guardó por última vez (ms)
    inicio       BIGINT,                        -- NULL = no está operando
    respuestas   JSONB NOT NULL DEFAULT '{}',
    notas        TEXT NOT NULL DEFAULT '',
    faltantes    JSONB NOT NULL DEFAULT '[]',
    tomada_por   TEXT,                          -- dispositivo (teléfono) que arrancó la unidad
    turno_inicio BIGINT,
    turno_fin    BIGINT                         -- con valor y sin "inicio" = turno terminado, por cerrar
);

CREATE TABLE IF NOT EXISTS fotos (
    id        SERIAL PRIMARY KEY,
    unidad_id INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
    tipo      TEXT NOT NULL,
    contenido BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS fotos_unidad ON fotos (unidad_id);
"""


@contextmanager
def db():
    """Abre una conexión con una transacción: si algo falla, se deshace todo."""
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conexion:
        yield conexion


def preparar_base():
    """Crea las tablas si no existen y, solo la primera vez, carga datos de ejemplo."""
    with db() as c:
        c.execute(ESQUEMA)
        c.execute("INSERT INTO meta (clave, valor) VALUES ('version', 1) ON CONFLICT DO NOTHING")
        primera_vez = c.execute(
            "INSERT INTO meta (clave, valor) VALUES ('sembrado', 1) "
            "ON CONFLICT DO NOTHING RETURNING clave"
        ).fetchone()
        if primera_vez:
            for nombre in ("Carlos M.", "Ana R.", "Luis P."):
                c.execute("INSERT INTO operadores (nombre) VALUES (%s)", (nombre,))
            c.execute(
                "INSERT INTO unidades (clase, nombre, area, horas, respuestas, notas) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                ("Olla", "Olla Nueva", "Baja California Sur", 75,
                 Jsonb({"0": 1000, "2": True, "3": 80}), "Revisar niveles de aceite y agua."),
            )


def tocar(c):
    """Sube el número de versión: así las pantallas saben que algo cambió y se actualizan."""
    c.execute("UPDATE meta SET valor = valor + 1 WHERE clave = 'version'")


# ======================================================================
# UTILIDADES
# ======================================================================
class ErrorApi(Exception):
    def __init__(self, mensaje, codigo=400):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.codigo = codigo


@app.errorhandler(ErrorApi)
def responder_error(e):
    return jsonify(error=e.mensaje), e.codigo


@app.errorhandler(psycopg.OperationalError)
def sin_base(e):
    return jsonify(error="No hay conexión con la base de datos."), 503


def ahora_ms():
    return int(time.time() * 1000)


def texto(valor, campo, maximo=80):
    """Limpia espacios de más y valida que no esté vacío ni sea demasiado largo."""
    limpio = " ".join(str(valor or "").split())
    if not limpio:
        raise ErrorApi(f"Falta {campo}.")
    if len(limpio) > maximo:
        raise ErrorApi(f"{campo[0].upper() + campo[1:]} es demasiado largo.")
    return limpio


def cuerpo_json():
    datos = request.get_json(silent=True)
    return datos if isinstance(datos, dict) else {}


def unidad_json(f):
    """Convierte una fila de la base en el objeto que espera el JavaScript."""
    return {
        "id": f["id"],
        "clase": f["clase"],
        "name": f["nombre"],
        "area": f["area"],
        "horas": f["horas"],
        "revision": f["revision"],
        "inicio": f["inicio"],
        "respuestas": f["respuestas"],
        "notas": f["notas"],
        "faltantes": f["faltantes"],
        "tomadaPor": f["tomada_por"],
        "turnoInicio": f["turno_inicio"],
        "turnoFin": f["turno_fin"],
    }


def bloquear(c, uid):
    """Lee la unidad y la bloquea mientras dura la transacción (evita que dos peticiones se pisen)."""
    f = c.execute("SELECT * FROM unidades WHERE id = %s FOR UPDATE", (uid,)).fetchone()
    if not f:
        raise ErrorApi("La unidad ya no existe.", 404)
    return f


def validar_edicion(f, dispositivo):
    """Reglas para cambiar las respuestas de una unidad."""
    if f["turno_fin"] and not f["inicio"]:
        raise ErrorApi("El turno ya terminó: los resultados esperan a que el gerente los cierre.", 409)
    if f["inicio"] and f["tomada_por"] and f["tomada_por"] != dispositivo:
        raise ErrorApi("La unidad la opera otro dispositivo.", 409)


# ======================================================================
# PÁGINAS
# ======================================================================
@app.get("/")
def inicio():
    return redirect("/operador.html")


@app.get("/api/version")
def version():
    """Número que sube con cada cambio; las pantallas lo consultan para saber cuándo actualizarse."""
    with db() as c:
        valor = c.execute("SELECT valor FROM meta WHERE clave = 'version'").fetchone()["valor"]
    return jsonify(version=valor)


# ======================================================================
# UNIDADES
# ======================================================================
@app.get("/api/unidades")
def listar_unidades():
    with db() as c:
        filas = c.execute("SELECT * FROM unidades ORDER BY id").fetchall()
    return jsonify([unidad_json(f) for f in filas])


@app.post("/api/unidades")
def crear_unidad():
    d = cuerpo_json()
    clase = texto(d.get("clase"), "la clase", 40)
    nombre = texto(d.get("name"), "el nombre")
    area = texto(d.get("area"), "el área")
    try:
        horas = float(d.get("horas", 0))
    except (TypeError, ValueError):
        raise ErrorApi("Las horas de uso deben ser un número.")
    if not (0 <= horas < 1e7):
        raise ErrorApi("Las horas de uso deben ser 0 o más.")

    with db() as c:
        f = c.execute(
            "INSERT INTO unidades (clase, nombre, area, horas) VALUES (%s, %s, %s, %s) RETURNING *",
            (clase, nombre, area, horas),
        ).fetchone()
        tocar(c)
    return jsonify(unidad_json(f)), 201


@app.delete("/api/unidades/<int:uid>")
def eliminar_unidad(uid):
    with db() as c:
        if not c.execute("DELETE FROM unidades WHERE id = %s RETURNING id", (uid,)).fetchone():
            raise ErrorApi("La unidad ya no existe.", 404)
        tocar(c)
    return "", 204


@app.patch("/api/unidades/<int:uid>/respuestas")
def guardar_respuestas(uid):
    """El operador guarda sus respuestas y notas (se llama solo, cada vez que contesta algo)."""
    d = cuerpo_json()
    respuestas, notas, dispositivo = d.get("respuestas"), d.get("notas", ""), d.get("dispositivo")
    if not isinstance(respuestas, dict):
        raise ErrorApi("Las respuestas no son válidas.")
    if not isinstance(notas, str) or len(notas) > 5000:
        raise ErrorApi("Las notas no son válidas.")
    if len(json.dumps(respuestas)) > 200_000:
        raise ErrorApi("Las respuestas son demasiado grandes.", 413)

    with db() as c:
        f = bloquear(c, uid)
        validar_edicion(f, dispositivo)
        c.execute(
            "UPDATE unidades SET respuestas = %s, notas = %s WHERE id = %s",
            (Jsonb(respuestas), notas, uid),
        )
        tocar(c)
    return jsonify(ok=True)


@app.post("/api/unidades/<int:uid>/iniciar")
def iniciar_turno(uid):
    """Primer guardado: la unidad pasa a operando y queda ligada al dispositivo del operador."""
    d = cuerpo_json()
    dispositivo = texto(d.get("dispositivo"), "el dispositivo", 100)
    faltantes = d.get("faltantes", [])
    if not isinstance(faltantes, list) or not all(isinstance(x, str) for x in faltantes):
        raise ErrorApi("Los faltantes no son válidos.")

    ahora = ahora_ms()
    with db() as c:
        f = bloquear(c, uid)
        if f["inicio"]:
            raise ErrorApi("La unidad ya está operando.", 409)
        if f["turno_fin"]:
            raise ErrorApi("La unidad tiene un turno terminado: falta que el gerente lo cierre.", 409)
        otra = c.execute(
            "SELECT nombre FROM unidades WHERE tomada_por = %s AND inicio IS NOT NULL", (dispositivo,)
        ).fetchone()
        if otra:
            raise ErrorApi(f"Ya tienes otra unidad en operación ({otra['nombre']}).", 409)

        f = c.execute(
            "UPDATE unidades SET inicio = %s, turno_inicio = %s, turno_fin = NULL, faltantes = %s, "
            "tomada_por = %s, revision = %s WHERE id = %s RETURNING *",
            (ahora, ahora, Jsonb(faltantes), dispositivo, ahora, uid),
        ).fetchone()
        tocar(c)
    return jsonify(unidad=unidad_json(f))


@app.post("/api/unidades/<int:uid>/terminar")
def terminar_turno(uid):
    """Segundo guardado: se suman las horas trabajadas y los resultados quedan para el gerente."""
    d = cuerpo_json()
    dispositivo = d.get("dispositivo")

    ahora = ahora_ms()
    with db() as c:
        f = bloquear(c, uid)
        if not f["inicio"]:
            raise ErrorApi("La unidad no está operando.", 409)
        if f["tomada_por"] and f["tomada_por"] != dispositivo:
            raise ErrorApi("Solo el dispositivo que arrancó la unidad puede terminar el turno.", 409)

        trabajadas = (ahora - f["inicio"]) / 3600000
        f = c.execute(
            "UPDATE unidades SET horas = %s, inicio = NULL, turno_fin = %s, tomada_por = NULL, "
            "revision = %s WHERE id = %s RETURNING *",
            (round(f["horas"] + trabajadas, 4), ahora, ahora, uid),
        ).fetchone()
        tocar(c)
    return jsonify(unidad=unidad_json(f), horasTrabajadas=trabajadas)


@app.post("/api/unidades/<int:uid>/cerrar")
def cerrar_turno(uid):
    """El gerente cierra el turno: se limpian los resultados y las fotos de la unidad."""
    with db() as c:
        f = bloquear(c, uid)
        if f["inicio"] or not f["turno_fin"]:
            raise ErrorApi("No hay un turno terminado por cerrar.", 409)
        c.execute("DELETE FROM fotos WHERE unidad_id = %s", (uid,))
        f = c.execute(
            "UPDATE unidades SET respuestas = '{}'::jsonb, notas = '', faltantes = '[]'::jsonb, "
            "turno_inicio = NULL, turno_fin = NULL WHERE id = %s RETURNING *",
            (uid,),
        ).fetchone()
        tocar(c)
    return jsonify(unidad=unidad_json(f))


# ======================================================================
# FOTOS
# ======================================================================
@app.post("/api/unidades/<int:uid>/fotos")
def subir_foto(uid):
    """Guarda una foto en la base y devuelve su dirección (el JS la guarda en las respuestas)."""
    archivo = request.files.get("archivo")
    dispositivo = request.form.get("dispositivo")
    if archivo is None:
        raise ErrorApi("No llegó ninguna foto.")
    if archivo.mimetype not in TIPOS_FOTO:
        raise ErrorApi("Solo se aceptan fotos JPG, PNG o WEBP.", 415)
    contenido = archivo.read()
    if not contenido:
        raise ErrorApi("La foto está vacía.")
    if len(contenido) > MAX_FOTO:
        raise ErrorApi("La foto es demasiado grande.", 413)

    with db() as c:
        f = bloquear(c, uid)
        validar_edicion(f, dispositivo)
        fid = c.execute(
            "INSERT INTO fotos (unidad_id, tipo, contenido) VALUES (%s, %s, %s) RETURNING id",
            (uid, archivo.mimetype, contenido),
        ).fetchone()["id"]
    return jsonify(url=f"/fotos/{fid}.jpg"), 201


@app.get("/fotos/<int:fid>.jpg")
def ver_foto(fid):
    with db() as c:
        f = c.execute("SELECT tipo, contenido FROM fotos WHERE id = %s", (fid,)).fetchone()
    if not f:
        return "", 404
    respuesta = Response(bytes(f["contenido"]), mimetype=f["tipo"])
    respuesta.headers["Cache-Control"] = "public, max-age=31536000, immutable"  # cada foto tiene su propio número
    return respuesta


# ======================================================================
# OPERADORES
# ======================================================================
@app.get("/api/operadores")
def listar_operadores():
    with db() as c:
        filas = c.execute("SELECT id, nombre FROM operadores ORDER BY lower(nombre)").fetchall()
    return jsonify(filas)


@app.post("/api/operadores")
def crear_operador():
    nombre = texto(cuerpo_json().get("nombre"), "el nombre", 60)
    try:
        with db() as c:
            f = c.execute(
                "INSERT INTO operadores (nombre) VALUES (%s) RETURNING id, nombre", (nombre,)
            ).fetchone()
            tocar(c)
    except psycopg.errors.UniqueViolation:
        raise ErrorApi("Ya hay un operador con ese nombre.", 409)
    return jsonify(f), 201


@app.put("/api/operadores/<int:oid>")
def editar_operador(oid):
    nombre = texto(cuerpo_json().get("nombre"), "el nombre", 60)
    try:
        with db() as c:
            f = c.execute(
                "UPDATE operadores SET nombre = %s WHERE id = %s RETURNING id, nombre", (nombre, oid)
            ).fetchone()
            if not f:
                raise ErrorApi("El operador ya no existe.", 404)
            tocar(c)
    except psycopg.errors.UniqueViolation:
        raise ErrorApi("Ya hay un operador con ese nombre.", 409)
    return jsonify(f)


@app.delete("/api/operadores/<int:oid>")
def eliminar_operador(oid):
    with db() as c:
        if not c.execute("DELETE FROM operadores WHERE id = %s RETURNING id", (oid,)).fetchone():
            raise ErrorApi("El operador ya no existe.", 404)
        tocar(c)
    return "", 204


# ======================================================================
# ARRANQUE
# ======================================================================
if __name__ == "__main__":
    try:
        preparar_base()
    except psycopg.OperationalError as e:
        print("\nNo se pudo conectar con PostgreSQL.")
        print(f"  Dirección usada: {DATABASE_URL}")
        print("  Revisa que PostgreSQL esté encendido, que exista la base de datos 'checklist'")
        print("  y que el usuario y la contraseña sean correctos.")
        print("  Puedes cambiar la dirección con la variable de entorno DATABASE_URL.")
        print(f"\nDetalle: {e}")
        sys.exit(1)

    print("\nListo. Abre en el navegador:")
    print("  Operador:  http://127.0.0.1:5000/operador.html")
    print("  Gerente:   http://127.0.0.1:5000/gerente.html")
    print("  (desde el teléfono, usa la dirección IP de esta computadora en vez de 127.0.0.1)\n")
    # host="0.0.0.0" permite entrar desde otros dispositivos de la red (los teléfonos).
    # No actives debug=True junto con 0.0.0.0: el modo debug permite ejecutar código desde el navegador.
    # Si quieres que el servidor se reinicie solo al cambiar app.py, usa: app.run(port=5000, debug=True)
    app.run(host="0.0.0.0", port=5000, debug=False)
