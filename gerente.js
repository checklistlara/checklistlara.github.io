/* ============ VISTA DE GERENTE (monitor) ============
   - Ve todas las unidades y sus respuestas, pero NO puede editarlas ni hacer el checklist.
   - Puede ver las fotos, ampliarlas y descargarlas.
   - Puede registrar unidades nuevas y eliminarlas (administrar). */

/* ============ REFERENCIAS ============ */
const list = document.getElementById("list");
const main = document.getElementById("main");
const search = document.getElementById("search");
const navButtons = document.querySelectorAll(".sidebar button[data-view]");
const btnMenu = document.getElementById("btn-menu");
const menu = document.getElementById("menu");
const lightbox = document.getElementById("lightbox");
let selectedId = null;
let confirmDeleteId = null;
let vista = "machines"; // machines | new | manage

const unidad = id => machines.find(m => m.id === id);

/* ============ NAV ============ */
function setNav(view) {
  vista = view;
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.view === view));
  btnMenu.classList.toggle("active", view === "manage");
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

/* ============ DETALLE (solo lectura) ============ */
function showSelected() {
  const m = unidad(selectedId);
  if (m) renderDetail(m);
  else main.innerHTML = `<div class="empty">Selecciona una máquina de la lista</div>`;
}

// Nombre para guardar la foto: unidad-elemento.ext
function nombreArchivo(m, c, src, k = 0) {
  let base = `${m.name}-${c.nombre}`
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
  if (cantidadFotos(c) > 1) base += `_${k + 1}`;
  const mime = /^data:image\/(\w+)/.exec(src);
  const ext = mime ? (mime[1] === "jpeg" ? "jpg" : mime[1])
    : ((/\.(\w{2,4})(?:[?#]|$)/.exec(src) || [])[1] || "jpg");
  return `${base}.${ext}`;
}

function fotoHTML(m, c, src, i, k) {
  return `<div class="foto-ro">
    <img class="foto-thumb" src="${esc(src)}" alt="${esc(c.nombre)} ${k + 1}" data-ver="${i}" data-slot="${k}">
    <div class="foto-acciones">
      <button type="button" class="btn secondary" data-ver="${i}" data-slot="${k}">Ver</button>
      <a class="btn secondary" href="${esc(src)}" download="${esc(nombreArchivo(m, c, src, k))}">Descargar</a>
    </div>
  </div>`;
}

function fotosHTML(m, c, v, i) {
  const n = cantidadFotos(c);
  const fotos = fotosDe(c, v);
  if (!fotos.some(Boolean)) return `<span class="sin-resp">Sin foto</span>`;
  const items = fotos.map((src, k) => src
    ? fotoHTML(m, c, src, i, k)
    : `<span class="sin-resp">Foto ${k + 1}: sin subir</span>`).join("");
  if (n === 1) return items;
  return `<div class="fotos-ro"><div class="fotos-fila">${items}</div><div class="foto-prog">${fotos.filter(Boolean).length} de ${n} fotos</div></div>`;
}

function valorHTML(m, c, v, i) {
  if (c.tipo === "foto") return fotosHTML(m, c, v, i);
  if (!estaRespondido(c, v)) return `<span class="sin-resp">Sin responder</span>`;
  switch (c.tipo) {
    case "slider": {
      const z = zonaDe(v);
      return `<span class="pill" style="background:${z.color};color:${z.texto}">${esc(v)} %</span>`;
    }
    case "numero":
      return `<strong>${esc(v)}</strong> <span class="muted">${esc(c.unidad || "")}</span>`;
    case "booleano":
      return v ? `<span class="tf si">✓ Sí</span>` : `<span class="tf no">✕ No</span>`;
    case "acordeon":
      return `<span class="opcion">${esc(v)}</span>`;
    default:
      return `<span class="tf si">✓ Hecho</span>`;
  }
}

function renderDetail(m) {
  const filas = m.checks.map((raw, i) => {
    const c = normalizar(raw);
    const v = m.respuestas[i];
    const fase = c.momento ? `<span class="hint">${c.momento === "inicio" ? "al iniciar" : "al terminar"}</span>` : "";
    return `<li>
      <span class="dot ${estaRespondido(c, v) ? "ok" : "fail"}"></span>
      <span class="chk-name">${esc(c.nombre)}${fase}</span>
      <div class="chk-val">${valorHTML(m, c, v, i)}</div>
    </li>`;
  }).join("");

  main.innerHTML = `
    <div class="detail-head">
      <h1>${esc(m.name)}</h1>
      <span class="badge ${m.status}">${esc(m.label)}</span>
    </div>
    ${m.faltantes.length ? `<div class="aviso">Faltaron por chequear al iniciar: <strong>${m.faltantes.map(esc).join(", ")}</strong></div>` : ""}
    <div class="cards">
      <div class="card"><div class="label">Tipo</div><div class="value">${esc(m.tipo)}</div></div>
      <div class="card"><div class="label">Área</div><div class="value">${esc(m.area)}</div></div>
      <div class="card"><div class="label">Última revisión</div><div class="value">${esc(m.revision)}</div></div>
      <div class="card"><div class="label">Horas de uso</div><div class="value">${m.horas.toLocaleString("es-MX", { maximumFractionDigits: 2 })} h</div></div>
      ${m.inicio ? `<div class="card"><div class="label">Operando desde</div><div class="value">${formatFecha(m.inicio)}</div></div>` : ""}
    </div>
    <h3>Check list</h3>
    <ul class="checks">${filas}</ul>
    <h3 class="gap">Notas</h3>
    <div class="notes-ro">${m.notas ? esc(m.notas) : `<span class="sin-resp">Sin notas</span>`}</div>`;
}

/* ============ FOTOS: VER Y DESCARGAR ============ */
function abrirFoto(m, i) {
  const c = normalizar(m.checks[i]);
  const src = m.respuestas[i];
  if (!src) return;
  document.getElementById("lb-img").src = src;
  const dl = document.getElementById("lb-dl");
  dl.href = src;
  dl.download = nombreArchivo(m, c, src);
  lightbox.hidden = false;
}
function cerrarFoto() { lightbox.hidden = true; }

main.addEventListener("click", e => {
  const ver = e.target.closest("[data-ver]");
  const m = unidad(selectedId);
  if (ver && m) abrirFoto(m, Number(ver.dataset.ver));
});
document.getElementById("lb-close").addEventListener("click", cerrarFoto);
lightbox.addEventListener("click", e => { if (e.target === lightbox) cerrarFoto(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { cerrarFoto(); toggleMenu(false); } });

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

  recargar(); // para que el id nuevo no choque con unidades registradas desde otra vista
  const m = new Tipo({ name, area, horas });
  if (!guardarUnidad(m, { crear: true })) { error.textContent = "No se pudo guardar la máquina."; return; }
  recargar();

  selectedId = m.id;
  search.value = "";
  setNav("machines");
  renderList();
  renderDetail(unidad(m.id));
}

/* ============ SUBMENÚ ============ */
function toggleMenu(force) {
  const abrir = force ?? menu.hidden;
  menu.hidden = !abrir;
  if (abrir) menu.style.top = btnMenu.getBoundingClientRect().top + "px";
}

btnMenu.addEventListener("click", e => { e.stopPropagation(); toggleMenu(); });
document.addEventListener("click", e => { if (!menu.contains(e.target)) toggleMenu(false); });

menu.addEventListener("click", e => {
  if (!e.target.closest("[data-action]")) return;
  toggleMenu(false);
  confirmDeleteId = null;
  setNav("manage");
  renderManage();
});

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
  const m = unidad(id);
  if (!m) return;
  eliminarUnidad(id);
  recargar();
  if (selectedId === id) selectedId = null;
  confirmDeleteId = null;
  renderList();
  renderManage();
  showToast("Unidad eliminada", esc(m.name));
}

/* ============ ACTUALIZACIÓN EN VIVO ============ */
// Cuando el operador guarda algo (en otra pestaña), el monitor se actualiza solo
window.addEventListener("storage", e => {
  if (e.key !== STORAGE_KEY) return;
  recargar();
  if (selectedId != null && !unidad(selectedId)) selectedId = null;
  renderList();
  if (vista === "machines") showSelected();
  else if (vista === "manage") renderManage();
});

/* ============ INICIO ============ */
search.addEventListener("input", renderList);
renderList();
showSelected();
