/* Código compartido por la vista de operador y la vista de gerente:
   clases de las máquinas, almacenamiento y utilidades. */

/* ============ CLASES ============ */
class Maquina {
  static tipo = "General";
  static nextId = 1;

  //"plantilla" del constructor: es lo que necesita cada máquina para crearse
  constructor({ id, name, area, horas = 0, revision = "Sin revisiones", inicio = null, respuestas = {}, notas = "", faltantes = [], tomadaPor = null, turnoInicio = null, turnoFin = null }) {
    // Si viene un id (máquina guardada) se conserva; si no, se asigna uno nuevo
    this.id = id ?? Maquina.nextId;
    Maquina.nextId = Math.max(Maquina.nextId, this.id + 1);
    this.name = name;
    this.area = area;
    this.horas = horas;
    this.revision = revision;
    this.inicio = inicio; // momento (ms) en que empezó a operar; null = inactiva
    this.respuestas = respuestas; // respuestas del chequeo: { indice: valor }
    this.notas = notas;
    this.faltantes = faltantes; // elementos de "inicio" que no se contestaron al arrancar
    this.tomadaPor = tomadaPor; // dispositivo del operador que arrancó la unidad (null = nadie)
    this.turnoInicio = turnoInicio; // cuándo empezó el último turno
    this.turnoFin = turnoFin; // cuándo terminó; los resultados quedan hasta que el gerente "cierre"
  }

  get checks() {
    return [
      "Paro de emergencia",
      "Limpieza general",
      {tipo: "slider", nombre: "Nivel de combustible", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de combustible", momento: "fin"},
      {tipo: "acordeon", nombre: "Operador", opciones: "operadores"}
    ];
  }

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

  guardarCambios(faltantes = [], tomadaPor = null) {
    const ahora = Date.now();
    this.revision = new Date(ahora).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

    if (this.inicio) {
      const horasTrabajadas = (ahora - this.inicio) / 3600000;
      this.horas = Math.round((this.horas + horasTrabajadas) * 10000) / 10000;
      this.inicio = null;
      this.turnoFin = ahora;   // los resultados se quedan para que el gerente los revise y los cierre
      this.tomadaPor = null;
      return { activa: false, horasTrabajadas };
    }
    this.inicio = ahora;
    this.turnoInicio = ahora;
    this.turnoFin = null;
    this.faltantes = faltantes;
    this.tomadaPor = tomadaPor;
    return { activa: true };
  }

  // El gerente cierra el turno: se limpian los resultados y la unidad queda lista para el siguiente
  cerrar() {
    this.respuestas = {};
    this.notas = "";
    this.faltantes = [];
    this.turnoInicio = null;
    this.turnoFin = null;
  }

  // Lista de elementos "estandar", cada tipo de maquina puede extender o sobreescribir la lista
  // Aquí puedes añadir varios más
  
  get tipo() { return this.constructor.tipo; }

  // Lo que se guarda en localStorage (incluye el nombre de la clase para reconstruirla)
  toJSON() {
    const { id, name, area, horas, revision, inicio, respuestas, notas, faltantes, tomadaPor, turnoInicio, turnoFin } = this;
    return { clase: this.constructor.name, id, name, area, horas, revision, inicio, respuestas, notas, faltantes, tomadaPor, turnoInicio, turnoFin };
  }
}

class Olla extends Maquina {
  static tipo = "Olla";
  get checks() {
    return [

      // head
      { tipo: "acordeon", nombre: "Operador", opciones: "operadores"},

      {tipo: "numero", nombre: "Kilometraje inicial", unidad: "km", momento: "inicio"},
      {tipo: "numero", nombre: "Kilometraje final", unidad: "km", momento: "fin"},

      {tipo: "booleano", nombre: "Tarjeta de circulación"},

      {tipo: "booleano", nombre: "Poliza de seguro"},

      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "fin"},

      //body
      {tipo: "booleano", nombre: "Licencia"},

      {tipo: "slider", nombre: "Nivel de combustible inicial", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de combustible final", momento: "fin"},

      {tipo: "slider", nombre: "Niveles de aceite inicial", unidad: "L", momento: "inicio"},
      {tipo: "slider", nombre: "Niveles de aceite final", unidad: "L", momento: "fin"},

      {tipo: "slider", nombre: "Niveles de agua inicial", unidad: "L", momento: "inicio"},
      {tipo: "slider", nombre: "Niveles de agua final", unidad: "L", momento: "fin"},

      {tipo: "booleano", nombre: "Purgar tanque de aire", unidad: "L"},

      {tipo: "booleano", nombre: "Limpieza general de la cabina", momento: "inicio"},
      {tipo: "booleano", nombre: "Limpieza general de la cabina", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de luces", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de luces", momento: "fin"},

      {tipo: "booleano", nombre: "Tension de bandas", momento: "inicio"},
      {tipo: "booleano", nombre: "Tension de bandas", momento: "fin"},

      {tipo: "numero", nombre: "Agua de lavado inicial", unidad: "L", momento: "inicio"},
      {tipo: "numero", nombre: "Agua de lavado final", unidad: "L", momento: "fin"},

      {tipo: "foto", nombre: "Tablero de instrumentos inicial", momento: "inicio"},
      {tipo: "foto", nombre: "Tablero de instrumentos final", momento: "fin"},

      {tipo: "booleano", nombre: "Fugas", momento: "inicio"},
      {tipo: "booleano", nombre: "Fugas", momento: "fin"},

      {tipo: "acordeon", nombre: "Estado de las llantas", opciones: ["Bien", "Revisar", "Mal"], momento: "inicio"},
      {tipo: "acordeon", nombre: "Estado de las llantas", opciones: ["Bien", "Revisar", "Mal"], momento: "fin"},

      {tipo: "numero", nombre: "Presión de llantas inicial", unidad: "psi", momento: "inicio"},
      {tipo: "numero", nombre: "Presión de llantas final", unidad: "psi", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar el chasis", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar el chasis", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de los rodillos del tambor", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de los rodillos del tambor", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar suspensión", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar suspensión", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar funcionamiento del abanico de enfriamiento de aceite hidraulico", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar funcionamiento del abanico de enfriamiento de aceite hidraulico", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar estado de crucetas", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar estado de crucetas", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar sistema de giro de tambor", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar sistema de giro de tambor", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar estado de Dynachute", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar estado de Dynachute", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar estado físico general del tambor", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar estado físico general del tambor", momento: "fin"},

      {tipo: "foto", nombre: "Fotos de la unidad: Frontal, lateral piloto, lateral copiloto y trasera", cantidad: "4", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de la unidad: Frontal, lateral piloto, lateral copiloto y trasera", cantidad: "4", momento: "fin"},
    ];
  }
}

class Retro extends Maquina {
  static tipo = "Cargador frontal / retro"
  get checks() {
    return [
      { tipo: "acordeon", nombre: "Operador", opciones: "operadores"},

      {tipo: "numero", nombre: "Kilometraje inicial", unidad: "km", momento: "inicio"},
      {tipo: "numero", nombre: "Kilometraje final", unidad: "km", momento: "fin"},

      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "fin"},

      {tipo: "booleano", nombre: "Purgar filtros de diesel", momento: "inicio"},
      {tipo: "booleano", nombre: "Purgar filtros de diesel", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar filtro de aire", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar filtro de aire", momento: "fin"},

      {tipo: "booleano", nombre: "Revision de pistones", momento: "inicio"},
      {tipo: "booleano", nombre: "Revision de pistones", momento: "fin"},

      {tipo: "booleano", nombre: "Limpieza general de la unidad", momento: "inicio"},
      {tipo: "booleano", nombre: "Limpieza general de la unidad", momento: "fin"},

      {tipo: "booleano", nombre: "Luces en general", momento: "inicio"},
      {tipo: "booleano", nombre: "Luces en general", momento: "fin"},

      {tipo: "booleano", nombre: "Tensión de bandas", momento: "inicio"},
      {tipo: "booleano", nombre: "Tensión de bandas", momento: "fin"},

      {tipo: "booleano", nombre: "Revision de sistema electricos", momento: "inicio"},
      {tipo: "booleano", nombre: "Revision de sistema electricos", momento: "fin"},

      {tipo: "slider", nombre: "Niveles de aceite", momento: "inicio"},
      {tipo: "slider", nombre: "Niveles de aceite", momento: "fin"},

      {tipo: "booleano", nombre: "Fugas de aceite y agua", momento: "inicio"},
      {tipo: "booleano", nombre: "Fugas de aceite y agua", momento: "fin"},

      {tipo: "booleano", nombre: "Fugas de aceite en el sistema hidraulico", momento: "inicio"},
      {tipo: "booleano", nombre: "Fugas de aceite en el sistema hidraulico", momento: "fin"},

      {tipo: "acordeon", nombre: "Estado de las llantas", opciones: ["Bien", "Regular", "Mal"], momento: "inicio"},
      {tipo: "acordeon", nombre: "Estado de las llantas", opciones: ["Bien", "Regular", "Mal"], momento: "fin"},

      {tipo: "booleano", nombre: "Calibración de las llantas", momento: "inicio"},
      {tipo: "booleano", nombre: "Calibración de las llantas", momento: "fin"},

      {tipo: "booleano", nombre: "Engrasado general", momento: "inicio"},
      {tipo: "booleano", nombre: "Engrasado general", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de graseras en general", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de graseras en general", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de cucharon de carga", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de cucharon de carga", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de estabilizadores", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de estabilizadores", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de estabilizadores", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de estabilizadores", momento: "fin"},

      {tipo: "slider", nombre: "Nivel de combustible inicial", momento: "inicio" },
      {tipo: "slider", nombre: "Nivel de combustible final", momento: "fin" },

      {tipo: "foto", nombre: "Fotos de la unidad", cantidad: "4", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de la unidad", cantidad: "4", momento: "fin"},

    ];

  }
}

class Pipa extends Maquina {
  static tipo = "Camión cisterna / Pipa"
  get checks() {
    return [

      //head
      { tipo: "acordeon", nombre: "Operador", opciones: "operadores"},

      {tipo: "numero", nombre: "Kilometraje inicial", unidad: "km", momento: "inicio"},
      {tipo: "numero", nombre: "Kilometraje final", unidad: "km", momento: "fin"},

      {tipo: "booleano", nombre: "Tarjeta de circulación"},

      {tipo: "booleano", nombre: "Poliza de seguro"},

      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de las placas", cantidad: "2", momento: "fin"},

      //body
      {tipo: "booleano", nombre: "Licencia"},

      {tipo: "slider", nombre: "Nivel de combustible", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de combustible", momento: "fin"},

      {tipo: "slider", nombre: "Nivel de aceite", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de aceite", momento: "fin"},

      {tipo: "slider", nombre: "Nivel de agua", momento: "inicio"},
      {tipo: "slider", nombre: "Nivel de agua", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar filtros de aire", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar filtros de aire", momento: "fin"},

      {tipo: "booleano", nombre: "Purgar tanques de aire", momento: "inicio"},
      {tipo: "booleano", nombre: "Purgar tanques de aire", momento: "fin"},

      {tipo: "booleano", nombre: "Limpieza general de la unidad", momento: "inicio"},
      {tipo: "booleano", nombre: "Limpieza general de la unidad", momento: "fin"},

      {tipo: "booleano", nombre: "Luces en general", momento: "inicio"},
      {tipo: "booleano", nombre: "Luces en general", momento: "fin"},

      {tipo: "foto", nombre: "Tablero de indicaciones", momento: "inicio"},
      {tipo: "foto", nombre: "Tablero de indicaciones", momento: "fin"},

      {tipo: "booleano", nombre: "Fugas de aceite y agua", momento: "inicio"},
      {tipo: "booleano", nombre: "Fugas de aceite y agua", momento: "fin"},

      {tipo: "acordeon", nombre: "Estado fisico de las llantas", opciones: ["Bien", "Regular", "Mal"], momento: "inicio"},
      {tipo: "acordeon", nombre: "Estado fisico de las llantas", opciones: ["Bien", "Regular", "Mal"], momento: "fin"},

      {tipo: "numero", nombre: "Calibracion de las llantas", unidad: "psi", momento: "inicio"},
      {tipo: "numero", nombre: "Calibracion de las llantas", unidad: "psi", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar tensores del chasis", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar tensores del chasis", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar estado fisico de cisterna", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar estado fisico de cisterna", momento: "fin"},

      {tipo: "booleano", nombre: "Fugas de agua", momento: "inicio"},
      {tipo: "booleano", nombre: "Fugas de agua", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar estado de crucetas", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar estado de crucetas", momento: "fin"},

      {tipo: "booleano", nombre: "Revisar suspención", momento: "inicio"},
      {tipo: "booleano", nombre: "Revisar suspención", momento: "fin"},

      {tipo: "booleano", nombre: "Estado de carrocería y pintura", momento: "inicio"},
      {tipo: "booleano", nombre: "Estado de carrocería y pintura", momento: "fin"},

      {tipo: "foto", nombre: "Fotos de la unidad", cantidad: "4", momento: "inicio"},
      {tipo: "foto", nombre: "Fotos de la unidad", cantidad: "4", momento: "fin"},
    ];

  }
}

const TIPOS = [Olla, Retro, Pipa, Maquina]; //Aquí van los tipos de maquina

/* ============ ALMACENAMIENTO ============ */
const STORAGE_KEY = "checklist_maquinas_v1";

// Lee la lista guardada (null si no hay nada o está dañada)
function leerAlmacen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw).map(d => {
      const Clase = TIPOS.find(T => T.name === d.clase) || Maquina;
      return new Clase(d);
    });
  } catch (err) {
    console.warn("No se pudo leer localStorage:", err);
    return null;
  }
}

function escribirAlmacen(lista) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista));
    return true;
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
    return false;
  }
}

// Cada vista guarda SOLO la unidad que cambió: así una vista no pisa lo que hizo la otra.
// Devuelve false si no se pudo guardar o si la unidad ya no existe (a menos que se pida crearla).
function guardarUnidad(m, { crear = false } = {}) {
  const lista = leerAlmacen() ?? [];
  const i = lista.findIndex(x => x.id === m.id);
  if (i >= 0) lista[i] = m;
  else if (crear) lista.push(m);
  else return false;
  return escribirAlmacen(lista);
}

function eliminarUnidad(id) {
  return escribirAlmacen((leerAlmacen() ?? []).filter(x => x.id !== id));
}

/* ============ OPERADORES ============ */
// Los registra el gerente; en el checklist se eligen con un acordeón que tenga opciones: "operadores"
const OPERADORES_KEY = "checklist_operadores_v1";

function leerOperadores() {
  try {
    const lista = JSON.parse(localStorage.getItem(OPERADORES_KEY));
    return Array.isArray(lista) ? lista : null;
  } catch (err) {
    return null;
  }
}

function escribirOperadores(lista) {
  try {
    localStorage.setItem(OPERADORES_KEY, JSON.stringify(lista));
    return true;
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
    return false;
  }
}

// Igual que con las unidades: se guarda solo el operador que cambió
function guardarOperador(op, { crear = false } = {}) {
  const lista = leerOperadores() ?? [];
  const i = lista.findIndex(x => x.id === op.id);
  if (i >= 0) lista[i] = op;
  else if (crear) lista.push(op);
  else return false;
  return escribirOperadores(lista);
}

function eliminarOperador(id) {
  return escribirOperadores((leerOperadores() ?? []).filter(o => o.id !== id));
}

function nuevoIdOperador() {
  return (leerOperadores() ?? []).reduce((mayor, o) => Math.max(mayor, o.id), 0) + 1;
}

// "operadores" siempre refleja lo último guardado, en orden alfabético
const operadores = [];
function recargarOperadores() {
  const lista = leerOperadores() ?? [];
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  operadores.splice(0, operadores.length, ...lista);
}

recargarOperadores();

/* ============ DATOS ============ */
// "machines" siempre refleja lo último guardado: recargar() lo actualiza
const machines = [];
function recargar() {
  const lista = leerAlmacen();
  if (lista) machines.splice(0, machines.length, ...lista);
  recargarOperadores();
}

recargar();

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

/* ============ CHEQUEOS ============ */
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

const cantidadFotos = c => Math.max(1, Math.floor(Number(c.cantidad) || 1));
function fotosDe(c, v) {
  const lista = Array.isArray(v) ? v : (v ? [v] : []);
  return Array.from({ length: cantidadFotos(c) }, (_, k) => lista[k] || null);
}

function normalizar(c) {
  return typeof c === "string" ? { tipo: "check", nombre: c } : c;
}

const opcionesDe = c => c.opciones === "operadores" ? operadores.map(o => o.nombre) : (Array.isArray(c.opciones) ? c.opciones : []);

function estaRespondido(c, v) {
  if (v === undefined || v === null) return false;
  if (c.tipo === "numero") return v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (c.tipo === "check") return v === true;
  if (c.tipo === "booleano") return typeof v === "boolean";
  if (c.tipo === "acordeon") {
  return c.opciones === "operadores" ? (typeof v === "string" && v !== "") : opcionesDe(c).includes(v);
}
  if (c.tipo === "foto") return fotosDe(c, v).every(Boolean);
  return true; // slider (se movió) y foto (se subió)
}

// Elementos de "inicio" que siguen sin contestar
function faltantesAlIniciar(m) {
  return m.checks
    .map(normalizar)
    .filter((c, i) => c.momento === "inicio" && !estaRespondido(c, m.respuestas[i]))
    .map(c => c.nombre);
}
