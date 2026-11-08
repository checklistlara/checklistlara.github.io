/* Código compartido por la vista de operador y la vista de gerente:
   clases de las máquinas, conexión con el servidor de Python (API) y utilidades. */

/* ============ CLASES ============ */
class Maquina {
  static tipo = "General";

  //"plantilla" del constructor: es lo que necesita cada máquina para crearse
  constructor({ id, name, area, horas = 0, revision = null, inicio = null, respuestas = {}, notas = "", faltantes = [], tomadaPor = null, turnoInicio = null, turnoFin = null }) {
    this.id = id; // lo asigna la base de datos
    this.name = name;
    this.area = area;
    this.horas = horas;
    this.revision = revision; // cuándo se guardó por última vez (ms); null = nunca
    this.inicio = inicio; // momento (ms) en que empezó a operar; null = inactiva
    this.respuestas = respuestas; // respuestas del chequeo: { indice: valor }
    this.notas = notas;
    this.faltantes = faltantes; // elementos de "inicio" que no se contestaron al arrancar
    this.tomadaPor = tomadaPor; // dispositivo del operador que arrancó la unidad (null = nadie)
    this.turnoInicio = turnoInicio; // cuándo empezó el último turno
    this.turnoFin = turnoFin; // cuándo terminó; los resultados quedan hasta que el gerente "cierre"
  }

  //activado o desactivo y etiqueta de estado
  // ok = operando · warn = operando con elementos sin chequear · done = turno terminado, por cerrar · fail = inactiva
  get terminada() { return !this.inicio && !!this.turnoFin; }
  get status() {
    if (!this.inicio) return this.terminada ? "done" : "fail";
    return this.faltantes.length ? "warn" : "ok";
  }
  get label() {
    if (!this.inicio) return this.terminada ? "Turno terminado · por cerrar" : "Inactiva";
    const n = this.faltantes.length;
    if (!n) return "Operando";
    return `Operando · ${n === 1 ? "faltó 1 elemento" : `faltaron ${n} elementos`}`;
  }

  // Texto de "Última revisión"
  get revisionTexto() { return this.revision ? formatFecha(this.revision) : "Sin revisiones"; }

  /*
    Iniciar, terminar y cerrar un turno ya no se hacen aquí: los hace el servidor de Python
    (ver iniciarTurno, terminarTurno y cerrarTurno más abajo).
      Inactiva -> iniciar -> Operando -> terminar -> Turno terminado (por cerrar) -> cerrar -> Inactiva
  */

  // Lista de elementos "estandar", cada tipo de maquina puede extender o sobreescribir la lista
  // Aquí puedes añadir varios más
  get checks() {
    return [
      "Paro de emergencia",
      "Limpieza general",
      { tipo: "slider", nombre: "Nivel de combustible" },
      { tipo: "foto", nombre: "Foto del tablero" },
      { tipo: "numero", nombre: "Litros de aceite en el tanque", unidad: "L" },
      { tipo: "booleano", nombre: "¿Luces funcionando?" },
      { tipo: "numero", nombre: "Kilometraje inicial", unidad: "km", momento: "inicio" },
      { tipo: "numero", nombre: "Kilometraje final", unidad: "km", momento: "fin" },
      { tipo: "acordeon", nombre: "Operador", opciones: "operadores", momento: "inicio" },
      { tipo: "foto", nombre: "Fotos de los neumáticos", cantidad: 2 }, // 2 fotos = 2 botones
    ];
  }
  get tipo() { return this.constructor.tipo; }
}

//CLASES EXTRA
//FORMATO:
//class {nombre de la clase} extends Maquina {
//   static tipo = "nombre de la clase";
//   get checks() { return [...super.checks, "chequeo1", "chequeo2" ... ]; }
//}

class Olla extends Maquina {
  static tipo = "Olla";
  get checks() {
    return [
      {tipo: "numero", nombre: "Kilometraje inicial", unidad: "km", momento: "inicio"},
      {tipo: "numero", nombre: "Kilometraje final", unidad: "km", momento: "fin"},

      {tipo: "booleano", nombre: "Licencia"},

      {tipo: "slider", nombre: "Nivel de combustible inicial", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de combustible final", momento: "fin"},

      {tipo: "numero", nombre: "Niveles de aceite inicial", unidad: "L", momento: "inicio"},
      {tipo: "numero", nombre: "Niveles de aceite final", unidad: "L", momento: "fin"},

      {tipo: "numero", nombre: "Niveles de agua inicial", unidad: "L", momento: "inicio"},
      {tipo: "numero", nombre: "Niveles de agua final", unidad: "L", momento: "fin"},

      {tipo: "foto", nombre: "Tablero de instrumentos inicial", momento: "inicio"},
      {tipo: "foto", nombre: "Tablero de instrumentos final", momento: "fin"},

      { tipo: "acordeon", nombre: "Operador", opciones: "operadores", momento: "inicio" },

      {tipo: "foto", nombre: "Fotos del exterior", cantidad: 4}, // 4 fotos = 4 botones
    ];
  }
}

const TIPOS = [Olla, Maquina]; //Aquí van los tipos de maquina

/* ============ CONEXIÓN CON EL SERVIDOR (API de Python) ============ */
// Todas las funciones devuelven { ok, estado, datos, error }; nunca lanzan errores.
async function api(ruta, { metodo = "GET", cuerpo, formData, keepalive = false } = {}) {
  const opciones = { method: metodo, headers: {}, keepalive };
  if (formData) {
    opciones.body = formData;
  } else if (cuerpo !== undefined) {
    opciones.headers["Content-Type"] = "application/json";
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(ruta, opciones);
  } catch (err) {
    return { ok: false, estado: 0, datos: null, error: "No hay conexión con el servidor." };
  }
  let datos = null;
  try { datos = await respuesta.json(); } catch (err) { /* respuestas sin contenido (204) */ }
  const error = respuesta.ok ? "" : ((datos && datos.error) || `Error ${respuesta.status}`);
  return { ok: respuesta.ok, estado: respuesta.status, datos, error };
}

// "machines" y "operadores" son copias de lo último que mandó el servidor; recargar() las actualiza
const machines = [];
const operadores = [];

// Convierte lo que manda el servidor en un objeto de su clase (Olla, Maquina...)
function aMaquina(d) {
  const Clase = TIPOS.find(T => T.name === d.clase) || Maquina;
  return new Clase(d);
}

// Pone una unidad actualizada (la que respondió el servidor) en la copia local
function ponerUnidad(d) {
  const nueva = aMaquina(d);
  const i = machines.findIndex(m => m.id === nueva.id);
  if (i >= 0) machines[i] = nueva; else machines.push(nueva);
  return nueva;
}

// Vuelve a pedir al servidor las unidades y los operadores. Devuelve false si no hubo conexión.
async function recargar() {
  const [u, o] = await Promise.all([api("/api/unidades"), api("/api/operadores")]);
  if (u.ok) machines.splice(0, machines.length, ...u.datos.map(aMaquina));
  if (o.ok) {
    o.datos.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    operadores.splice(0, operadores.length, ...o.datos);
  }
  return u.ok && o.ok;
}

// ---- unidades ----
const crearUnidad = datos => api("/api/unidades", { metodo: "POST", cuerpo: datos });
const eliminarUnidad = id => api(`/api/unidades/${id}`, { metodo: "DELETE" });
const guardarRespuestas = (m, dispositivo) =>
  api(`/api/unidades/${m.id}/respuestas`, { metodo: "PATCH", keepalive: true, cuerpo: { respuestas: m.respuestas, notas: m.notas, dispositivo } });
const iniciarTurno = (id, faltantes, dispositivo) =>
  api(`/api/unidades/${id}/iniciar`, { metodo: "POST", cuerpo: { faltantes, dispositivo } });
const terminarTurno = (id, dispositivo) =>
  api(`/api/unidades/${id}/terminar`, { metodo: "POST", cuerpo: { dispositivo } });
const cerrarTurno = id => api(`/api/unidades/${id}/cerrar`, { metodo: "POST" });

// Sube una foto (un Blob) y devuelve su dirección: { ok, datos: { url } }
function subirFoto(id, blob, dispositivo) {
  const formData = new FormData();
  formData.append("archivo", blob, "foto.jpg");
  formData.append("dispositivo", dispositivo);
  return api(`/api/unidades/${id}/fotos`, { metodo: "POST", formData });
}

// ---- operadores ----
const crearOperador = nombre => api("/api/operadores", { metodo: "POST", cuerpo: { nombre } });
const editarOperador = (id, nombre) => api(`/api/operadores/${id}`, { metodo: "PUT", cuerpo: { nombre } });
const eliminarOperador = id => api(`/api/operadores/${id}`, { metodo: "DELETE" });

// ---- actualización automática ----
// Pregunta cada pocos segundos si algo cambió en el servidor y, si cambió (o volvió la conexión), llama a alCambiar()
function vigilarCambios(alCambiar, cadaMs = 2000) {
  let ultima = null;
  let sinConexion = false;
  async function revisar() {
    const r = await api("/api/version");
    if (!r.ok) { sinConexion = true; return; }
    const cambio = ultima !== null && r.datos.version !== ultima;
    ultima = r.datos.version;
    if (cambio || sinConexion) { sinConexion = false; alCambiar(); }
  }
  revisar();
  return setInterval(revisar, cadaMs);
}

/* ============ UTILIDADES ============ */
// Evita que nombres con < > & " ' rompan el HTML
function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatFecha(ts) {
  return new Date(ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function formatDuracion(horas) {
  const total = Math.round(horas * 3600);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h} h ${min} min ${s} s`;
}

let toastTimer;
function showToast(titulo, detalle = "") {
  const t = document.getElementById("toast");
  t.innerHTML = `<strong>${titulo}</strong>${detalle ? `<span>${detalle}</span>` : ""}`;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ============ CHEQUEOS (lo que comparten las dos vistas) ============ */
//tipos de chequeo
const TIPO_CHECK = { check: "Casilla", slider: "Deslizador", foto: "Foto", numero: "Dato numérico", booleano: "Sí / No", acordeon: "Selección" };

// Zonas del nivel de combustible (porcentaje del tanque)
const ZONAS = [
  { hasta: 25,  color: "#d13c3c", texto: "#fff" }, // 0-25   rojo
  { hasta: 50,  color: "#f08a24", texto: "#fff" }, // 25-50  naranja
  { hasta: 75,  color: "#e8c21a", texto: "#222" }, // 50-75  amarillo
  { hasta: 101, color: "#2e9e5b", texto: "#fff" }, // 75-100 verde
];
const GRADIENTE = `linear-gradient(to right, ${ZONAS.map((z, k) => `${z.color} ${k * 25}% ${(k + 1) * 25}%`).join(", ")})`;
const zonaDe = p => ZONAS.find(z => p < z.hasta);

// Fotos de un elemento: "cantidad" indica cuántas lleva (por defecto 1).
// Con 1 foto la respuesta es un texto; con varias, una lista (con null en las que faltan).
const cantidadFotos = c => Math.max(1, Math.floor(Number(c.cantidad) || 1));
function fotosDe(c, v) {
  const lista = Array.isArray(v) ? v : (v ? [v] : []);
  return Array.from({ length: cantidadFotos(c) }, (_, k) => lista[k] || null);
}

function normalizar(c) {
  return typeof c === "string" ? { tipo: "check", nombre: c } : c;
}

// Opciones de un acordeón: una lista fija, o "operadores" para usar los operadores registrados
const opcionesDe = c => c.opciones === "operadores" ? operadores.map(o => o.nombre) : (Array.isArray(c.opciones) ? c.opciones : []);

function estaRespondido(c, v) {
  if (v === undefined || v === null) return false;
  if (c.tipo === "numero") return v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (c.tipo === "check") return v === true;
  if (c.tipo === "booleano") return typeof v === "boolean";
  if (c.tipo === "slider") return typeof v !== "boolean" && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100; // porcentaje válido
  if (c.tipo === "acordeon") {
    // Con "operadores" basta un nombre: si después lo renombran o lo borran, el turno conserva a quien se eligió
    return c.opciones === "operadores" ? (typeof v === "string" && v !== "") : opcionesDe(c).includes(v);
  }
  if (c.tipo === "foto") return fotosDe(c, v).every(Boolean); // con varias fotos, deben estar todas
  return true; // slider (se movió) y foto (se subió)
}

// Elementos de "inicio" que siguen sin contestar
function faltantesAlIniciar(m) {
  return m.checks
    .map(normalizar)
    .filter((c, i) => c.momento === "inicio" && !estaRespondido(c, m.respuestas[i]))
    .map(c => c.nombre);
}
