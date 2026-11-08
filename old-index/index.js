
/* ============ CLASES ============ */
const OPERADORES = ["Carlos M.", "Ana R.", "Luis P."];  
class Maquina {
  static tipo = "General";
  static nextId = 1;

//"plantilla" del constructor: es lo que necesita cada máquina para crearse
  constructor({ id, name, area, horas = 0, revision = "Sin revisiones", inicio = null, respuestas = {}, notas = "", faltantes = [] }) {
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
    this.faltantes = faltantes;
  }

  //activado o desactivo y etiqueta de estado
  get status() {
    if (!this.inicio) return "fail";
    return this.faltantes.length ? "warn" : "ok";
  }
  get label() {
    if (!this.inicio) return "Inactiva";
    const n = this.faltantes.length;
    if (!n) return "Operando";
    return `Operando · ${n === 1 ? "faltó 1 elemento" : `faltaron ${n} elementos`}`;
  }


// revisar hora al momento guardar cambios
  /*
    Inactiva -> guarda la hora de inicio y pasa a operando.
    Operando -> calcula el tiempo transcurrido, lo suma a las horas de uso y pasa a inactiva.
  */
  
  guardarCambios(faltantes = []) {
    const ahora = Date.now();
    this.revision = new Date(ahora).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

    if (this.inicio) {
      const horasTrabajadas = (ahora - this.inicio) / 3600000;
      this.horas = Math.round((this.horas + horasTrabajadas) * 10000) / 10000;
      this.inicio = null;
      this.respuestas = {};
      this.notas = "";
      this.faltantes = [];
      return { activa: false, horasTrabajadas };
    }
    this.inicio = ahora;
    this.faltantes = faltantes;
    return { activa: true };
  }

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
      { tipo: "acordeon", nombre: "Operador", opciones: OPERADORES },
    ];
  }
  get tipo() { return this.constructor.tipo; }

  // Lo que se guarda en localStorage (incluye el nombre de la clase para reconstruirla)
  toJSON() {
    const { id, name, area, responsable, horas, revision, inicio, respuestas, notas, faltantes } = this;
    return { clase: this.constructor.name, id, name, area, responsable, horas, revision, inicio, respuestas, notas, faltantes };
  }
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
    ];
  }
}

const TIPOS = [Olla, Maquina]; //Aquí van los tipos de maquina

/* ============ ALMACENAMIENTO ============ */
const STORAGE_KEY = "checklist_maquinas_v1";

function loadMachines() {
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

function saveMachines() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(machines));
    return true;
  } catch (err) {
    console.warn("No se pudo guardar en localStorage:", err);
    return false;
  }
}

/* ============ DATOS ============ */
//aquí creamos "maquinas" nuevas como demostración. Serán cargadas automaticamente si no hay alguna ya registrada
const machines = loadMachines() ?? [
  // Formato:
  //new {Clase}({ name: "", area: "", horas: [], respuestas: {(numero de chequeo):(valor), ... }, notas: "" }),

  new Olla({
    name: "Olla Nueva", area: "Baja California Sur", horas: 75, respuestas: { 0: 1000, 2: true, 3: 80, 5: "img/tablero_instrumentos.jpg"}, notas: "Revisar niveles de aceite y agua."}),
];



/* ============ REFERENCIAS ============ */
const list = document.getElementById("list");
const main = document.getElementById("main");
const search = document.getElementById("search");
const navButtons = document.querySelectorAll(".sidebar button[data-view]");
const btnMenu = document.getElementById("btn-menu");
const menu = document.getElementById("menu");
let selectedId = null;
let confirmDeleteId = null;

// Evita que nombres con < > & " ' rompan el HTML
function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ============ NAV ============ */
function setNav(view) {
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  btnMenu.classList.toggle("active", view === "edit" || view === "manage");
}

navButtons.forEach(b => b.addEventListener("click", () => {
  setNav(b.dataset.view);
  if (b.dataset.view === "new") renderForm();
  else showSelected();
}));

/* ============ LISTA ============ */
function renderList() {
  const q = search.value.trim().toLowerCase();
  list.innerHTML = "";
  machines
    .filter(m => m.name.toLowerCase().includes(q) || m.area.toLowerCase().includes(q))
    .forEach(m => {
      const li = document.createElement("li");
      li.className = "item" + (m.id === selectedId ? " selected" : "");
      li.innerHTML = `<span class="dot ${m.status}"></span>
        <div><div class="name">${esc(m.name)}</div><div class="sub">${esc(m.tipo)} · ${esc(m.area)}</div></div>`;
      li.onclick = () => { selectedId = m.id; setNav("machines"); renderList(); renderDetail(m); };
      list.appendChild(li);
    });
}

/* ============ DETALLE ============ */
function showSelected() {
  const m = machines.find(x => x.id === selectedId);
  if (m) renderDetail(m);
  else main.innerHTML = `<div class="empty">Selecciona una máquina de la lista</div>`;
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

function aplicarZona(sl, p) {
  const z = zonaDe(p);
  sl.style.setProperty("--zona", z.color);
  sl.style.setProperty("--zona-txt", z.texto);
  sl.querySelector(".slider-val").textContent = p + " %";
}

// Las respuestas se guardan solas poco después de cada cambio
let tGuardar = null;
function guardarPronto() {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => { tGuardar = null; saveMachines(); }, 300);
}
window.addEventListener("beforeunload", () => {
  if (tGuardar) { clearTimeout(tGuardar); saveMachines(); }
});

// Reduce la foto para que quepa en localStorage
function reducirImagen(archivo, max = 1024, calidad = 0.7) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", calidad));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagen no válida")); };
    img.src = url;
  });
}

function normalizar(c) {
  return typeof c === "string" ? { tipo: "check", nombre: c } : c;
}

function estaRespondido(c, v) {
  if (v === undefined || v === null) return false;
  if (c.tipo === "numero") return v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;
  if (c.tipo === "check") return v === true;
  if (c.tipo === "booleano") return typeof v === "boolean";
  if (c.tipo === "acordeon") return c.opciones.includes(v); // debe ser una de las opciones
  return true; // slider (se movió) y foto (se subió)
}

function controlHTML(c, i, v) {
  switch (c.tipo) {
    case "slider": {
      const respondido = v !== undefined;
      const p = respondido ? v : 50;
      const z = zonaDe(p);
      const estilo = `--grad:${GRADIENTE}` + (respondido ? `;--zona:${z.color};--zona-txt:${z.texto}` : "");
      const marcas = [0, 25, 50, 75, 100]
        .map(n => `<span style="left:calc(11px + (100% - 22px) * ${n / 100})">${n}%</span>`).join("");
      return `<div class="slider ${respondido ? "answered" : ""}" style="${estilo}">
        <div class="slider-row">
          <input type="range" id="chk-${i}" min="0" max="100" step="1" value="${p}">
          <output class="slider-val">${respondido ? p + " %" : "—"}</output>
        </div>
        <div class="slider-marks">${marcas}</div>
      </div>`;
    }
    case "foto":
      return `<div class="foto">
        <img class="foto-thumb" alt="Foto del chequeo" ${v ? `src="${v}"` : "hidden"}>
        <input type="file" id="chk-${i}" accept="image/*" hidden>
        <button type="button" class="btn secondary" data-foto>${v ? "Cambiar foto" : "Sube una foto"}</button>
      </div>`;
    case "numero":
      return `<div class="num">
        <input type="number" id="chk-${i}" min="0" step="0.1" placeholder="0.0" value="${esc(v ?? "")}">
        <span class="unit">${esc(c.unidad || "")}</span>
      </div>`;
    case "booleano": {
      const tache = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
      const tick = `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
      return `<div class="bool">
        <button type="button" class="bool-btn no ${v === false ? "sel" : ""}" data-bool="0" aria-pressed="${v === false}" title="No" aria-label="No">${tache}</button>
        <button type="button" class="bool-btn si ${v === true ? "sel" : ""}" data-bool="1" aria-pressed="${v === true}" title="Sí" aria-label="Sí">${tick}</button>
      </div>`;
    }
    default:
      return `<input type="checkbox" id="chk-${i}" ${v ? "checked" : ""}>`;

    case "acordeon": {
    const flecha = `<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>`;
    const respondido = c.opciones.includes(v);
    return `<button type="button" class="acc-head ${respondido ? "answered" : ""}" id="chk-${i}" data-acc aria-expanded="false">
      <span class="acc-val">${respondido ? esc(v) : "Selecciona una opción"}</span>${flecha}
    </button>`;
    }
  }
}

function checksHTML(m) {

  // Panel con las opciones del acordeón (queda oculto hasta que se abre)
function panelHTML(c, v) {
  return `<div class="acc-panel" hidden>${c.opciones.map((o, k) =>
    `<button type="button" class="acc-opt ${o === v ? "sel" : ""}" data-opt="${k}">${esc(o)}</button>`).join("")}</div>`;
}

// Abre o cierra el acordeón de una fila (si no se indica, alterna)
function toggleAcordeon(head, abrir) {
  const li = head.closest("li");
  const panel = li.querySelector(".acc-panel");
  abrir = abrir ?? panel.hidden;
  panel.hidden = !abrir;
  li.classList.toggle("open", abrir);
  head.setAttribute("aria-expanded", abrir);
}

function checksHTML(m) {
  // Antes de iniciar se muestran los chequeos "inicio"; con la unidad operando, los de "fin"
  const fase = m.inicio ? "fin" : "inicio";
  return m.checks.map((raw, i) => {
    const c = normalizar(raw);
    if (c.momento && c.momento !== fase) return ""; // no es de esta fase (conserva su posición i)
    const v = m.respuestas[i];
    return `<li data-i="${i}">
      <span class="dot ${estaRespondido(c, v) ? "ok" : "fail"}"></span>
      <label class="chk-name" for="chk-${i}">${esc(c.nombre)}</label>
      <div class="chk-control">${controlHTML(c, i, v)}</div>
      ${c.tipo === "acordeon" ? panelHTML(c, v) : ""}
    </li>`;
  }).join("");
}
  // Antes de iniciar se muestran los chequeos "inicio"; con la unidad operando, los de "fin"
  const fase = m.inicio ? "fin" : "inicio";
  return m.checks.map((raw, i) => {
    const c = normalizar(raw);
    if (c.momento && c.momento !== fase) return ""; // no es de esta fase (conserva su posición i)
    const v = m.respuestas[i];
    return `<li data-i="${i}">
      <span class="dot ${estaRespondido(c, v) ? "ok" : "fail"}"></span>
      <label class="chk-name" for="chk-${i}">${esc(c.nombre)}</label>
      <div class="chk-control">${controlHTML(c, i, v)}</div>
    </li>`;
  }).join("");
}

// Se ejecuta cuando el usuario contesta un chequeo
function onChequeo(m, el) {
  const li = el.closest("li[data-i]");
  const i = Number(li.dataset.i);
  const c = normalizar(m.checks[i]);
  const r = m.respuestas;
  const dot = li.querySelector(".dot");
  const marcar = ok => { dot.className = "dot " + (ok ? "ok" : "fail"); };

  if (c.tipo === "slider") {
    const p = Number(el.value);
    r[i] = p;
    const sl = li.querySelector(".slider");
    sl.classList.add("answered");
    aplicarZona(sl, p);
    marcar(true);
    guardarPronto();
  } else if (c.tipo === "numero") {
    r[i] = el.value.trim();
    marcar(estaRespondido(c, r[i]));
    guardarPronto();
  } else if (c.tipo === "foto") {
    const archivo = el.files[0];
    el.value = "";
    if (!archivo) return;
    const anterior = r[i];
    reducirImagen(archivo)
      .then(url => {
        r[i] = url;
        if (!saveMachines()) {
          // Sin espacio: se restaura lo anterior para no bloquear los demás guardados
          if (anterior === undefined) delete r[i]; else r[i] = anterior;
          showToast("No se pudo guardar la foto", "Es demasiado grande para el almacenamiento");
          return;
        }
        const img = li.querySelector(".foto-thumb");
        img.src = url;
        img.hidden = false;
        li.querySelector("[data-foto]").textContent = "Cambiar foto";
        marcar(true);
      })
      .catch(() => showToast("No se pudo leer la imagen", "Prueba con otra foto"));
  } else if (c.tipo === "booleano") {
    const valor = el.dataset.bool === "1";
    r[i] = valor;
    li.querySelectorAll("[data-bool]").forEach(b => {
      const activo = (b.dataset.bool === "1") === valor;
      b.classList.toggle("sel", activo);
      b.setAttribute("aria-pressed", activo);
    });
    marcar(true);
    guardarPronto();
  } else {
    r[i] = el.checked;
    marcar(el.checked);
    guardarPronto();
  }
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

// Parte superior del detalle (encabezado y tarjetas)
function topHTML(m) {
  return `
    <div class="detail-head">
      <h1>${esc(m.name)}</h1>
      <span class="badge ${m.status}">${m.label}</span>
    </div>
    ${m.faltantes.length ? `<div class="aviso">Faltaron por chequear al iniciar: <strong>${m.faltantes.map(esc).join(", ")}</strong></div>` : ""}
    <div class="cards">
      <div class="card"><div class="label">Tipo</div><div class="value">${m.tipo}</div></div>
      <div class="card"><div class="label">Área</div><div class="value">${esc(m.area)}</div></div>
      <div class="card"><div class="label">Última revisión</div><div class="value">${esc(m.revision)}</div></div>
      <div class="card"><div class="label">Horas de uso</div><div class="value">${m.horas.toLocaleString("es-MX", { maximumFractionDigits: 2 })} h</div></div>
      ${m.inicio ? `<div class="card"><div class="label">Operando desde</div><div class="value">${formatFecha(m.inicio)}</div></div>` : ""}
    </div>`;
}

// Barra inferior con el botón de guardar
function barHTML(m) {
  const hint = m.inicio
    ? "Operando. Al guardar se detendrá, se sumarán las horas y el chequeo quedará en blanco."
    : "Inactiva. Al guardar pasará a operando.";
  return `<span class="save-hint">${hint}</span>
    <button type="button" class="btn primary" id="btn-guardar">Guardar cambios</button>`;
}
// renderiza la barra con mensaje y botón
function renderDetail(m) {
  main.innerHTML = `
    <div id="detail-top">${topHTML(m)}</div>
    <h3>Check list</h3>
    <ul class="checks" id="checks">${checksHTML(m)}</ul>
    <div class="notes">
      <h3>Notas</h3>
      <textarea id="notas" placeholder="Observaciones de la revisión...">${esc(m.notas)}</textarea>
    </div>
    <div class="save-bar" id="save-bar">${barHTML(m)}</div>`;

  document.getElementById("save-bar").addEventListener("click", e => {
    if (e.target.closest("#btn-guardar")) guardar(m);
  });

  document.getElementById("notas").addEventListener("input", e => { m.notas = e.target.value; guardarPronto(); });

  const ul = document.getElementById("checks");
  ul.addEventListener("input", e => { if (["range", "number"].includes(e.target.type)) onChequeo(m, e.target); });
  ul.addEventListener("change", e => { if (["checkbox", "file"].includes(e.target.type)) onChequeo(m, e.target); });
  ul.addEventListener("click", e => {
    const f = e.target.closest("[data-foto]");
    if (f) f.parentElement.querySelector("input[type=file]").click();
    const bo = e.target.closest("[data-bool]");
    if (bo) onChequeo(m, bo);
  });
}

function guardar(m) {
  // Al iniciar: elementos de "inicio" que siguen sin contestar
  const faltantes = m.inicio ? [] : m.checks
    .map(normalizar)
    .filter((c, i) => c.momento === "inicio" && !estaRespondido(c, m.respuestas[i]))
    .map(c => c.nombre);

  const r = m.guardarCambios(faltantes);
  saveMachines();
  renderList();
  if (r.activa) {
    document.getElementById("detail-top").innerHTML = topHTML(m);
    document.getElementById("save-bar").innerHTML = barHTML(m);
    document.getElementById("checks").innerHTML = checksHTML(m);
  } else {
    renderDetail(m); // fin de turno: chequeo y notas vuelven a quedar en blanco
  }

  const n = faltantes.length;
  showToast("Checklist guardado", r.activa
    ? (n ? `Operando, pero faltaron ${n} elemento${n > 1 ? "s" : ""} por chequear` : "Unidad en operación")
    : `Tiempo trabajado: ${formatDuracion(r.horasTrabajadas)} · chequeo reiniciado`);
}

/* ============ FORMULARIO DE NUEVO REGISTRO ============ */
function renderForm() {
  main.innerHTML = `
    <div class="detail-head"><h1>Nuevo registro</h1></div>
    <form class="form" id="form" novalidate>
    
      <div class="row">
        <div class="field">
          <label for="f-name">Nombre</label>
          <input id="f-name" type="text" placeholder="Ej. Torno CNC 05">
        </div>
        <div class="field">
          <label for="f-area">Área</label>
          <input id="f-area" type="text" placeholder="Ej. Taller A">
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label for="f-horas">Horas de uso</label>
          <input id="f-horas" type="number" min="0" step="1" value="0">
        </div>
        <div class="field">
          <label for="f-tipo">Tipo de máquina</label>
          <select id="f-tipo">
            ${TIPOS.map((T, i) => `<option value="${i}">${T.tipo}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="preview">
        <h3>Check list de este tipo</h3>
        <ul id="f-preview"></ul>
      </div>
      <div class="error" id="f-error"></div>
      <div class="actions">
        <button type="submit" class="btn primary">Guardar máquina</button>
        <button type="button" class="btn secondary" id="f-cancel">Cancelar</button>
      </div>
    </form>`;

  const tipoSel = document.getElementById("f-tipo");
  const preview = document.getElementById("f-preview");

  function updatePreview() {
    // Leer el getter desde el prototipo evita crear una máquina de prueba
    const checks = TIPOS[tipoSel.value].prototype.checks;
    preview.innerHTML = checks.map(raw => {
      const c = normalizar(raw);
      const fase = c.momento ? ` · ${c.momento === "inicio" ? "al iniciar" : "al terminar"}` : "";
      return `<li>${esc(c.nombre)} <span class="hint">· ${TIPO_CHECK[c.tipo]}${fase}</span></li>`;
    }).join("");
  }
  tipoSel.addEventListener("change", updatePreview);
  updatePreview();

  document.getElementById("f-cancel").onclick = () => { setNav("machines"); showSelected(); };
  document.getElementById("form").addEventListener("submit", e => { e.preventDefault(); saveMachine(); });
  document.getElementById("f-name").focus();
}

function saveMachine() {
  const name = document.getElementById("f-name").value.trim();
  const area = document.getElementById("f-area").value.trim();
  const horas = Number(document.getElementById("f-horas").value);
  const Tipo = TIPOS[document.getElementById("f-tipo").value];
  const error = document.getElementById("f-error");

  if (!name || !area) { error.textContent = "Completa nombre y área."; return; }
  if (!Number.isFinite(horas) || horas < 0) { error.textContent = "Las horas de uso deben ser 0 o más."; return; }

  const m = new Tipo({ name, area, horas });
  machines.push(m);
  saveMachines();

  selectedId = m.id;
  search.value = "";
  setNav("machines");
  renderList();
  renderDetail(m);
}

/* ============ SUBMENÚ ============ */
function toggleMenu(force) {
  const abrir = force ?? menu.hidden;
  menu.hidden = !abrir;
  if (abrir) menu.style.top = btnMenu.getBoundingClientRect().top + "px";
}

btnMenu.addEventListener("click", e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener("click", e => { if (!menu.contains(e.target)) toggleMenu(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape") toggleMenu(false); });

menu.addEventListener("click", e => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  toggleMenu(false);
  if (b.dataset.action === "edit") { setNav("edit"); renderEdit(); }
  else { confirmDeleteId = null; setNav("manage"); renderManage(); }
});

/* ============ EDITAR INFORMACIÓN ============ */
function renderEdit() {
  if (!machines.length) {
    main.innerHTML = `<div class="detail-head"><h1>Editar información</h1></div><p class="muted">No hay unidades registradas.</p>`;
    return;
  }
  const inicial = machines.find(m => m.id === selectedId) || machines[0];

  main.innerHTML = `
    <div class="detail-head"><h1>Editar información</h1></div>
    <form class="form" id="edit-form" novalidate>
      <div class="field">
        <label for="e-maq">Unidad</label>
        <select id="e-maq">
          ${machines.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="e-name">Nombre</label>
        <input id="e-name" type="text">
      </div>
      <div class="row">
        <div class="field">
          <label for="e-area">Área</label>
          <input id="e-area" type="text">
        </div>
      </div>
      <div class="error" id="e-error"></div>
      <div class="actions">
        <button type="submit" class="btn primary">Guardar información</button>
        <button type="button" class="btn secondary" id="e-cancel">Cancelar</button>
      </div>
    </form>`;

  const sel = document.getElementById("e-maq");
  const fName = document.getElementById("e-name");
  const fArea = document.getElementById("e-area");
  const fResp = document.getElementById("e-resp");

  function cargar() {
    const m = machines.find(x => x.id === Number(sel.value));
    fName.value = m.name;
    fArea.value = m.area;
    document.getElementById("e-error").textContent = "";
  }

  sel.value = inicial.id;
  sel.addEventListener("change", cargar);
  cargar();

  document.getElementById("e-cancel").onclick = () => { setNav("machines"); showSelected(); };
  document.getElementById("edit-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = fName.value.trim();
    const area = fArea.value.trim();
    const m = machines.find(x => x.id === Number(sel.value));
    m.name = name;
    m.area = area;
    saveMachines();

    selectedId = m.id;
    setNav("machines");
    renderList();
    renderDetail(m);
    showToast("Información actualizada", esc(m.name));
  });
}

/* ============ ADMINISTRAR UNIDADES ============ */
function renderManage() {
  const filas = machines.map(m => {
    const confirmando = m.id === confirmDeleteId;
    const aviso = m.inicio ? " Está operando y se perderá el tiempo en curso." : "";
    const acciones = confirmando
      ? `<span class="confirm-text">¿Eliminar esta unidad?${aviso}</span>
          <button type="button" class="btn danger" data-act="yes">Sí, eliminar</button>
          <button type="button" class="btn secondary" data-act="no">Cancelar</button>`
      : `<button type="button" class="btn danger" data-act="ask">Eliminar</button>`;
    return `<li class="manage-row" data-id="${m.id}">
      <span class="dot ${m.status}"></span>
      <div class="grow"><div class="name">${esc(m.name)}</div><div class="sub">${esc(m.tipo)} · ${esc(m.area)}</div></div>
      <div class="row-actions">${acciones}</div>
    </li>`;
  }).join("");

  main.innerHTML = `
    <div class="detail-head"><h1>Administrar unidades</h1></div>
    ${machines.length ? `<ul class="manage-list" id="manage-list">${filas}</ul>` : `<p class="muted">No hay unidades registradas.</p>`}`;

  const ul = document.getElementById("manage-list");
  if (!ul) return;
  ul.addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = Number(b.closest("li").dataset.id);
    if (b.dataset.act === "ask") { confirmDeleteId = id; renderManage(); }
    else if (b.dataset.act === "no") { confirmDeleteId = null; renderManage(); }
    else if (b.dataset.act === "yes") eliminar(id);
  });
}

function eliminar(id) {
  const i = machines.findIndex(m => m.id === id);
  if (i < 0) return;
  const [m] = machines.splice(i, 1);
  if (selectedId === id) selectedId = null;
  confirmDeleteId = null;
  saveMachines();
  renderList();
  renderManage();
  showToast("Unidad eliminada", esc(m.name));
}

/* ============ INICIO ============ */
search.addEventListener("input", renderList);
renderList();
showSelected();