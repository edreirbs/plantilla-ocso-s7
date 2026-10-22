/* OCSO Facturación · portal de práctica (Claude for Business, Sesión 7).
   La página funciona sola: lee el QR del ticket en el celular, revisa el ticket en Supabase
   y genera la factura de práctica (XML y PDF) en el navegador. */
(function () {
  "use strict";

  const CFG = window.OCSO_CONFIG || {};
  const $app = document.getElementById("app");
  const FORMAS = { "01": "Efectivo", "04": "Tarjeta de crédito", "28": "Tarjeta de débito" };
  const LS_PERFILES = "ocso_perfiles", LS_FACTURAS = "ocso_facturas";

  // ---------- Guardado en el celular ----------
  function leer(clave) { try { return JSON.parse(localStorage.getItem(clave) || "[]"); } catch (e) { return []; } }
  function guardar(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) { return false; } }
  const perfiles = () => leer(LS_PERFILES);
  const facturas = () => leer(LS_FACTURAS);

  // ---------- Supabase (solo funciones públicas) ----------
  async function rpc(nombre, args) {
    if (!CFG.supabaseUrl || !CFG.supabaseKey || CFG.supabaseUrl.includes("TU-PROYECTO")) {
      throw new Error("Falta conectar el portal con Supabase: llena config.js.");
    }
    const headers = { "Content-Type": "application/json", apikey: CFG.supabaseKey };
    if (!CFG.supabaseKey.startsWith("sb_")) headers.Authorization = "Bearer " + CFG.supabaseKey;
    const r = await fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + nombre, {
      method: "POST", headers, body: JSON.stringify(args || {})
    });
    const txt = await r.text();
    let data = null; try { data = JSON.parse(txt); } catch (e) { data = txt; }
    if (!r.ok) throw new Error((data && data.message) || "El servidor no respondió bien (" + r.status + ").");
    return data;
  }

  let CATALOGOS = null;
  async function catalogos() {
    if (CATALOGOS) return CATALOGOS;
    try { CATALOGOS = await rpc("catalogos_cfdi"); }
    catch (e) {
      CATALOGOS = { regimenes: [
        { clave: "601", descripcion: "General de Ley Personas Morales", fisica: false, moral: true },
        { clave: "605", descripcion: "Sueldos y Salarios", fisica: true, moral: false },
        { clave: "612", descripcion: "Actividades Empresariales y Profesionales", fisica: true, moral: false },
        { clave: "616", descripcion: "Sin obligaciones fiscales", fisica: true, moral: false },
        { clave: "626", descripcion: "Régimen Simplificado de Confianza", fisica: true, moral: true }],
        usos: [
        { clave: "G03", descripcion: "Gastos en general", regimenes: ["601", "612", "626"] },
        { clave: "S01", descripcion: "Sin efectos fiscales", regimenes: ["601", "605", "612", "616", "626"] }] };
    }
    return CATALOGOS;
  }

  // ---------- Utilidades ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pesos = (n) => "$" + Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fechaBonita = (iso) => {
    const d = new Date(iso.length <= 16 ? iso + ":00" : iso);
    return d.toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  const tipoRFC = (rfc) => (rfc || "").trim().length === 13 ? "fisica" : ((rfc || "").trim().length === 12 ? "moral" : "");
  const icono = {
    camara: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="4"/></svg>',
    galeria: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    check: '<svg viewBox="0 0 52 52"><path d="M14 27 l9 9 l16 -18"/></svg>'
  };
  function ir(h) { if (location.hash === h) ruta(); else location.hash = h; }
  function mostrar(html) { $app.innerHTML = html; window.scrollTo(0, 0); $app.focus({ preventScroll: true }); }
  function barraPasos(n) { return '<div class="pasos" aria-label="Paso ' + n + ' de 3">' + [1, 2, 3].map((i) => '<span class="' + (i <= n ? "hecho" : "") + '"></span>').join("") + "</div>"; }

  // ---------- Lectura del QR ----------
  function cargarImagen(file) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => ok({ img, url }); img.onerror = () => mal(new Error("No se pudo abrir la foto.")); img.src = url;
    });
  }
  async function leerQR(img) {
    if ("BarcodeDetector" in window) {
      try {
        const det = new window.BarcodeDetector({ formats: ["qr_code"] });
        const r = await det.detect(img); if (r && r[0] && r[0].rawValue) return r[0].rawValue;
      } catch (e) { /* sigue con jsQR */ }
    }
    if (!window.jsQR) return null;
    const lados = [1600, 1100, 800, 2200];
    for (const max of lados) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
      const datos = cx.getImageData(0, 0, w, h);
      const r = window.jsQR(datos.data, w, h, { inversionAttempts: "attemptBoth" });
      if (r && r.data) return r.data;
    }
    return null;
  }
  function interpretarQR(txt) {
    const m = /^OCSO\|(\d{3}-\d{7})\|([\d\-T:]+)\|([\d.]+)$/.exec((txt || "").trim());
    return m ? { folio: m[1], fecha: m[2], total: m[3] } : null;
  }

  // ---------- Vistas ----------
  const estado = { ticket: null, foto: null };

  function vistaInicio() {
    const np = perfiles().length, nf = facturas().length;
    mostrar(`
      <section class="hero">
        <h1>Factura tu ticket en segundos</h1>
        <p>Tómale foto al ticket, elige tus datos fiscales guardados y listo: tu factura en PDF y XML.</p>
        <a class="btn primario" href="#/ticket">${icono.camara} Facturar un ticket</a>
      </section>
      <div class="accesos">
        <a class="acceso" href="#/perfiles"><strong>Mis datos fiscales</strong><span>${np ? np + (np === 1 ? " guardado" : " guardados") : "Agrega los tuyos"}</span></a>
        <a class="acceso" href="#/facturas"><strong>Mis facturas</strong><span>${nf ? nf + (nf === 1 ? " factura" : " facturas") : "Aún no hay"}</span></a>
      </div>
      <div class="tarjeta mini">
        <strong>¿Cómo funciona?</strong><br>
        1. El ticket trae un código QR con el folio y el total.<br>
        2. El portal revisa que el ticket exista, que sea de este mes y que no se haya facturado.<br>
        3. Tus datos fiscales se guardan en este celular para no volver a escribirlos.
      </div>`);
  }

  function vistaTicket() {
    estado.ticket = null;
    mostrar(`
      ${barraPasos(1)}
      <h1>Tu ticket</h1>
      <p class="lead">Tómale foto al ticket completo, con el código QR a la vista.</p>
      <label class="btn primario">${icono.camara} Tomar foto
        <input id="cam" type="file" accept="image/*" capture="environment" hidden></label>
      <div class="fila">
        <label class="btn claro">${icono.galeria} De la galería
          <input id="gal" type="file" accept="image/*" hidden></label>
        <button class="btn claro" id="mano" type="button">Escribir datos</button>
      </div>
      <div id="foto"></div>
      <form id="datos" hidden>
        <label class="campo">Folio del ticket <small>Viene arriba y abajo del QR, por ejemplo 104-0012457.</small>
          <input id="folio" inputmode="numeric" autocomplete="off" placeholder="000-0000000" required></label>
        <label class="campo">Total del ticket <small>Con centavos y sin el signo de pesos.</small>
          <input id="total" inputmode="decimal" autocomplete="off" placeholder="0.00" required></label>
        <button class="btn oscuro" id="buscar" type="submit">Buscar ticket</button>
      </form>
      <div id="resultado"></div>`);
    const form = document.getElementById("datos");
    document.getElementById("mano").onclick = () => { form.hidden = false; document.getElementById("folio").focus(); };
    const alElegir = (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) procesarFoto(f); ev.target.value = ""; };
    document.getElementById("cam").onchange = alElegir;
    document.getElementById("gal").onchange = alElegir;
    form.onsubmit = (ev) => { ev.preventDefault(); buscarTicket(); };
  }

  async function procesarFoto(file) {
    const zona = document.getElementById("foto"), form = document.getElementById("datos");
    document.getElementById("resultado").innerHTML = "";
    let cargada;
    try { cargada = await cargarImagen(file); } catch (e) { zona.innerHTML = '<div class="alerta error">' + esc(e.message) + "</div>"; return; }
    zona.innerHTML = '<div class="foto escaneo"><img alt="Foto del ticket" src="' + cargada.url + '"><span class="estado">Leyendo el código QR…</span></div>';
    await new Promise((r) => setTimeout(r, 350));
    let txt = null; try { txt = await leerQR(cargada.img); } catch (e) { txt = null; }
    const datos = interpretarQR(txt);
    const caja = zona.querySelector(".foto"); caja.classList.remove("escaneo");
    form.hidden = false;
    if (datos) {
      caja.querySelector(".estado").textContent = "Código leído: " + datos.folio;
      document.getElementById("folio").value = datos.folio;
      document.getElementById("total").value = datos.total;
      buscarTicket();
    } else {
      caja.querySelector(".estado").textContent = "No se leyó el código";
      document.getElementById("resultado").innerHTML = '<div class="alerta info">No pudimos leer el código QR. Acerca la cámara, que no haya reflejos, o escribe el folio y el total del ticket.</div>';
      document.getElementById("folio").focus();
    }
  }

  async function buscarTicket() {
    const folio = document.getElementById("folio").value.trim();
    const total = parseFloat(document.getElementById("total").value.replace(/[$,\s]/g, ""));
    const res = document.getElementById("resultado"), btn = document.getElementById("buscar");
    if (!/^\d{3}-\d{7}$/.test(folio)) { res.innerHTML = '<div class="alerta error">El folio tiene 3 números, un guion y 7 números: 104-0012457.</div>'; return; }
    if (!(total > 0)) { res.innerHTML = '<div class="alerta error">Escribe el total del ticket.</div>'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="cargando"></span> Buscando…';
    try {
      const r = await rpc("buscar_ticket", { p_folio: folio, p_total: total });
      if (!r.ok) { res.innerHTML = '<div class="alerta error">' + esc(r.mensaje) + "</div>"; return; }
      estado.ticket = r.ticket;
      res.innerHTML = htmlTicket(r.ticket) + '<button class="btn primario" id="seguir" type="button">Continuar</button>';
      document.getElementById("seguir").onclick = () => { location.hash = "#/datos"; };
      document.getElementById("seguir").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) {
      res.innerHTML = '<div class="alerta error">' + esc(e.message) + "</div>";
    } finally { btn.disabled = false; btn.textContent = "Buscar ticket"; }
  }

  function htmlTicket(t) {
    const filas = t.conceptos.map((c) => `<div class="t-fila"><span>${c.cantidad} ${esc(c.descripcion)}</span><span>${pesos(c.importe)}</span></div>`).join("");
    return `<div class="ticket" aria-label="Ticket encontrado">
      <div class="t-cab">${esc(t.sucursal)} · Suc ${esc(t.numero_sucursal)}</div>
      <div class="t-fila"><span>Folio ${esc(t.folio)}</span><span>${fechaBonita(t.fecha)}</span></div>
      <div class="t-sep"></div>${filas}<div class="t-sep"></div>
      <div class="t-fila"><span>Subtotal</span><span>${pesos(t.subtotal)}</span></div>
      <div class="t-fila"><span>IVA 16%</span><span>${pesos(t.iva)}</span></div>
      <div class="t-fila t-total"><span>Total</span><span>${pesos(t.total)}</span></div>
      <div class="t-fila mini"><span>${esc(FORMAS[t.forma_pago] || t.forma_pago)}</span><span>Listo para facturar</span></div>
    </div>`;
  }

  function htmlPerfil(p, conRadio, elegido) {
    return `<label class="perfil ${elegido ? "elegido" : ""}" data-id="${esc(p.id)}">
      ${conRadio ? `<input type="radio" name="perfil" value="${esc(p.id)}" ${elegido ? "checked" : ""}>` : ""}
      <div><div class="rfc">${esc(p.rfc)}<span class="chip">${p.tipo === "moral" ? "Moral" : "Física"}</span></div>
        <div>${esc(p.nombre)}</div>
        <div class="det">Régimen ${esc(p.regimen)} · Uso ${esc(p.uso)} · C.P. ${esc(p.cp)}${p.alias ? " · " + esc(p.alias) : ""}</div></div>
      ${conRadio ? "" : `<div class="acciones"><button class="linkbtn" data-editar="${esc(p.id)}" type="button">Editar</button><button class="linkbtn rojo" data-borrar="${esc(p.id)}" type="button">Borrar</button></div>`}
    </label>`;
  }

  function vistaElegirDatos() {
    if (!estado.ticket) { location.hash = "#/ticket"; return; }
    const ps = perfiles();
    if (!ps.length) { vistaFormularioPerfil(null, true); return; }
    mostrar(`
      ${barraPasos(2)}
      <h1>¿A nombre de quién?</h1>
      <p class="lead">Ticket ${esc(estado.ticket.folio)} por ${pesos(estado.ticket.total)}.</p>
      <div id="lista">${ps.map((p, i) => htmlPerfil(p, true, i === 0)).join("")}</div>
      <button class="btn claro" id="nuevo" type="button">+ Agregar otros datos fiscales</button>
      <div id="msg"></div>
      <button class="btn primario" id="facturar" type="button" style="margin-top:14px">Facturar</button>`);
    document.querySelectorAll(".perfil").forEach((el) => el.addEventListener("click", () => {
      document.querySelectorAll(".perfil").forEach((x) => x.classList.remove("elegido")); el.classList.add("elegido");
    }));
    document.getElementById("nuevo").onclick = () => vistaFormularioPerfil(null, true);
    document.getElementById("facturar").onclick = facturar;
  }

  async function facturar() {
    const id = (document.querySelector('input[name="perfil"]:checked') || {}).value;
    const p = perfiles().find((x) => x.id === id), msg = document.getElementById("msg"), btn = document.getElementById("facturar");
    if (!p) { msg.innerHTML = '<div class="alerta error">Elige a nombre de quién va la factura.</div>'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="cargando"></span> Generando tu factura…';
    try {
      const r = await rpc("facturar_ticket", { p_folio: estado.ticket.folio, p_total: Number(estado.ticket.total),
        p_receptor: { rfc: p.rfc, nombre: p.nombre, regimen: p.regimen, uso: p.uso, cp: p.cp, correo: p.correo || "" }, p_canal: "portal" });
      if (!r.ok) {
        msg.innerHTML = '<div class="alerta error">' + esc(r.mensaje) + (r.campo ? ' <button class="linkbtn" id="arreglar" type="button">Corregir mis datos</button>' : "") + "</div>";
        const a = document.getElementById("arreglar"); if (a) a.onclick = () => vistaFormularioPerfil(p, true);
        return;
      }
      const lista = facturas(); lista.unshift(r.factura); guardar(LS_FACTURAS, lista.slice(0, 50));
      estado.ticket = null;
      vistaListo(r.factura);
    } catch (e) { msg.innerHTML = '<div class="alerta error">' + esc(e.message) + "</div>"; }
    finally { if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = "Facturar"; } }
  }

  function vistaListo(f) {
    mostrar(`
      ${barraPasos(3)}
      <section class="listo">
        <div class="palomita">${icono.check}</div>
        <h1>¡Factura lista!</h1>
        <p class="lead">${esc(f.receptor.nombre)} · ${pesos(f.total)}</p>
      </section>
      <div class="tarjeta">
        <div class="mini">Folio fiscal (UUID)</div>
        <div class="uuid">${esc(f.uuid)}</div>
        <div class="mini" style="margin-top:8px">Serie ${esc(f.serie)} · Folio ${esc(f.folio)} · Ticket ${esc(f.folio_ticket)}</div>
      </div>
      ${botonesDescarga()}
      <div class="alerta info">Factura de práctica: no tiene validez fiscal.</div>
      <a class="btn claro" href="#/ticket" style="margin-top:10px">Facturar otro ticket</a>`);
    conectarDescargas(f);
  }

  function botonesDescarga() {
    return `<div class="fila"><button class="btn oscuro" id="pdf" type="button">Descargar PDF</button>
      <button class="btn claro" id="xml" type="button">Descargar XML</button></div>
      <button class="btn claro" id="compartir" type="button" style="margin-top:10px" hidden>Compartir PDF</button>`;
  }
  function conectarDescargas(f) {
    document.getElementById("pdf").onclick = () => descargar(pdfFactura(f), "Factura_" + f.serie + f.folio + ".pdf");
    document.getElementById("xml").onclick = () => descargar(new Blob([xmlFactura(f)], { type: "application/xml" }), "Factura_" + f.serie + f.folio + ".xml");
    const c = document.getElementById("compartir");
    try {
      const prueba = new File([new Blob(["x"])], "a.pdf", { type: "application/pdf" });
      if (navigator.canShare && navigator.canShare({ files: [prueba] })) {
        c.hidden = false;
        c.onclick = async () => { const b = pdfFactura(f); if (!b) return; const file = new File([b], "Factura_" + f.serie + f.folio + ".pdf", { type: "application/pdf" }); try { await navigator.share({ files: [file], title: "Factura OCSO (práctica)" }); } catch (e) { /* cancelado */ } };
      }
    } catch (e) { /* sin compartir */ }
  }
  function descargar(blob, nombre) {
    if (!blob) return;
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  // ---------- Datos fiscales ----------
  async function vistaFormularioPerfil(p, volverAFacturar) {
    const cat = await catalogos();
    p = p || { id: "", rfc: "", nombre: "", regimen: "", uso: "G03", cp: "", correo: "", alias: "" };
    mostrar(`
      ${volverAFacturar ? barraPasos(2) : ""}
      <h1>${p.id ? "Editar" : "Agregar"} datos fiscales</h1>
      <p class="lead">Escríbelos como vienen en tu Constancia de Situación Fiscal. Se guardan solo en este celular.</p>
      <form id="fp" class="tarjeta" novalidate>
        <label class="campo">RFC <small>13 caracteres persona física, 12 persona moral.</small>
          <input id="rfc" class="mayus" maxlength="13" autocomplete="off" value="${esc(p.rfc)}" required></label>
        <label class="campo">Nombre o razón social <small>Sin "S.A. de C.V." ni similares.</small>
          <input id="nombre" class="mayus" autocomplete="off" value="${esc(p.nombre)}" required></label>
        <label class="campo">Código postal del domicilio fiscal
          <input id="cp" inputmode="numeric" maxlength="5" value="${esc(p.cp)}" required></label>
        <label class="campo">Régimen fiscal <select id="regimen"></select></label>
        <label class="campo">Uso del CFDI <select id="uso"></select></label>
        <label class="campo">Correo <small>Opcional.</small>
          <input id="correo" type="email" inputmode="email" value="${esc(p.correo || "")}"></label>
        <label class="campo">¿Cómo lo identificas? <small>Opcional: "Yo", "Mi empresa", "Mamá".</small>
          <input id="alias" maxlength="24" value="${esc(p.alias || "")}"></label>
        <div id="msg"></div>
        <button class="btn primario" id="guardar" type="submit">Guardar${volverAFacturar ? " y continuar" : ""}</button>
      </form>`);
    const $rfc = document.getElementById("rfc"), $reg = document.getElementById("regimen"), $uso = document.getElementById("uso");
    function llenarRegimenes() {
      const tipo = tipoRFC($rfc.value);
      const lista = cat.regimenes.filter((r) => !tipo || (tipo === "fisica" ? r.fisica : r.moral));
      const actual = $reg.value || p.regimen;
      $reg.innerHTML = '<option value="">Elige tu régimen</option>' + lista.map((r) => `<option value="${r.clave}" ${r.clave === actual ? "selected" : ""}>${r.clave} · ${esc(r.descripcion)}</option>`).join("");
      llenarUsos();
    }
    function llenarUsos() {
      const reg = $reg.value; const actual = $uso.value || p.uso;
      const lista = cat.usos.filter((u) => !reg || u.regimenes.includes(reg));
      $uso.innerHTML = lista.map((u) => `<option value="${u.clave}" ${u.clave === actual ? "selected" : ""}>${u.clave} · ${esc(u.descripcion)}</option>`).join("");
    }
    $rfc.addEventListener("input", llenarRegimenes); $reg.addEventListener("change", llenarUsos);
    llenarRegimenes();
    document.getElementById("fp").onsubmit = async (ev) => {
      ev.preventDefault();
      const nuevo = {
        id: p.id || ("p" + Date.now().toString(36)),
        rfc: $rfc.value.trim().toUpperCase(), nombre: document.getElementById("nombre").value.trim().toUpperCase().replace(/\s+/g, " "),
        cp: document.getElementById("cp").value.trim(), regimen: $reg.value, uso: $uso.value,
        correo: document.getElementById("correo").value.trim(), alias: document.getElementById("alias").value.trim()
      };
      nuevo.tipo = tipoRFC(nuevo.rfc);
      const msg = document.getElementById("msg"), btn = document.getElementById("guardar");
      btn.disabled = true;
      try {
        const v = await rpc("validar_receptor", { p: nuevo });
        if (!v.ok) { msg.innerHTML = '<div class="alerta error">' + esc(v.mensaje) + "</div>"; const c = document.getElementById(v.campo); if (c) c.focus(); return; }
        const lista = perfiles().filter((x) => x.id !== nuevo.id); lista.unshift(nuevo);
        if (!guardar(LS_PERFILES, lista)) { msg.innerHTML = '<div class="alerta error">Este navegador no deja guardar datos. Sal del modo privado.</div>'; return; }
        ir(volverAFacturar && estado.ticket ? "#/datos" : "#/perfiles");
      } catch (e) { msg.innerHTML = '<div class="alerta error">' + esc(e.message) + "</div>"; }
      finally { btn.disabled = false; }
    };
  }

  function vistaPerfiles() {
    const ps = perfiles();
    mostrar(`
      <h1>Mis datos fiscales</h1>
      <p class="lead">Guarda los de varias personas físicas o morales. Viven solo en este celular.</p>
      ${ps.length ? ps.map((p) => htmlPerfil(p, false, false)).join("") : '<div class="vacio">Todavía no guardas datos fiscales.</div>'}
      <button class="btn primario" id="nuevo" type="button">+ Agregar datos fiscales</button>`);
    document.getElementById("nuevo").onclick = () => vistaFormularioPerfil(null, false);
    document.querySelectorAll("[data-editar]").forEach((b) => b.onclick = (ev) => { ev.preventDefault(); vistaFormularioPerfil(perfiles().find((x) => x.id === b.dataset.editar), false); });
    document.querySelectorAll("[data-borrar]").forEach((b) => b.onclick = (ev) => {
      ev.preventDefault();
      if (confirm("¿Borrar estos datos fiscales de este celular?")) { guardar(LS_PERFILES, perfiles().filter((x) => x.id !== b.dataset.borrar)); vistaPerfiles(); }
    });
  }

  function vistaFacturas() {
    const fs = facturas();
    mostrar(`
      <h1>Mis facturas</h1>
      <p class="lead">Las que hiciste desde este celular.</p>
      ${fs.length ? fs.map((f) => `<a class="tarjeta factura-item" href="#/factura/${esc(f.uuid)}" style="display:flex;text-decoration:none;color:inherit">
          <div><strong>${pesos(f.total)}</strong> · ${esc(f.receptor.rfc)}<div class="mini">Ticket ${esc(f.folio_ticket)} · ${fechaBonita(f.fecha)}</div></div><span>›</span></a>`).join("")
        : '<div class="vacio">Aún no hay facturas en este celular.</div>'}
      <a class="btn primario" href="#/ticket">Facturar un ticket</a>`);
  }

  async function vistaFactura(uuid) {
    mostrar('<p class="mini">Buscando la factura…</p>');
    let f = facturas().find((x) => x.uuid.toLowerCase() === uuid.toLowerCase());
    if (!f) {
      try { const r = await rpc("ver_factura", { p_uuid: uuid }); if (!r.ok) { mostrar('<div class="alerta error">' + esc(r.mensaje) + "</div>"); return; } f = r.factura; }
      catch (e) { mostrar('<div class="alerta error">' + esc(e.message) + "</div>"); return; }
    }
    mostrar(`
      <h1>Factura ${esc(f.serie)}-${esc(f.folio)}</h1>
      <p class="lead">${esc(f.receptor.nombre)} · ${pesos(f.total)}${f.canal === "claude" ? ' <span class="chip">Hecha por Claude</span>' : ""}</p>
      <div class="tarjeta">
        <div class="mini">Folio fiscal (UUID)</div><div class="uuid">${esc(f.uuid)}</div>
        <div class="mini" style="margin-top:8px">RFC ${esc(f.receptor.rfc)} · Uso ${esc(f.receptor.uso)} · Ticket ${esc(f.folio_ticket)} · ${fechaBonita(f.fecha)}</div>
      </div>
      ${botonesDescarga()}
      <div class="alerta info">Factura de práctica: no tiene validez fiscal.</div>`);
    conectarDescargas(f);
  }

  // ---------- XML con la estructura del CFDI 4.0 ----------
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const d2 = (n) => Number(n).toFixed(2);
  function xmlFactura(f) {
    const conceptos = f.conceptos.map((c) => `
    <cfdi:Concepto ClaveProdServ="${c.clave_prod_serv}" Cantidad="${c.cantidad}" ClaveUnidad="${c.clave_unidad}" Unidad="${c.unidad}" Descripcion="${x(c.descripcion)}" ValorUnitario="${Number(c.valor_unitario).toFixed(6)}" Importe="${d2(c.importe)}" ObjetoImp="${c.objeto_imp}">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${d2(c.importe)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${d2(c.iva)}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- FACTURA DE PRACTICA DE UN CURSO. NO TIENE VALIDEZ FISCAL. -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd" Version="4.0" Serie="${x(f.serie)}" Folio="${f.folio}" Fecha="${f.fecha}" Sello="PRACTICA-SIN-VALIDEZ" FormaPago="${f.forma_pago}" NoCertificado="00000000000000000000" Certificado="PRACTICA" SubTotal="${d2(f.subtotal)}" Moneda="${f.moneda}" Total="${d2(f.total)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${f.metodo_pago}" LugarExpedicion="${f.lugar_expedicion}">
  <cfdi:Emisor Rfc="${x(f.emisor.rfc)}" Nombre="${x(f.emisor.nombre)}" RegimenFiscal="${f.emisor.regimen}"/>
  <cfdi:Receptor Rfc="${x(f.receptor.rfc)}" Nombre="${x(f.receptor.nombre)}" DomicilioFiscalReceptor="${x(f.receptor.cp)}" RegimenFiscalReceptor="${x(f.receptor.regimen)}" UsoCFDI="${x(f.receptor.uso)}"/>
  <cfdi:Conceptos>${conceptos}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${d2(f.iva)}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${d2(f.subtotal)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${d2(f.iva)}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="${f.uuid}" FechaTimbrado="${f.fecha}" RfcProvCertif="PRACTICA" SelloCFD="PRACTICA-SIN-VALIDEZ" NoCertificadoSAT="00000000000000000000" SelloSAT="PRACTICA-SIN-VALIDEZ"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
`;
  }

  // ---------- Importe con letra ----------
  function conLetra(n) {
    const U = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE", "VEINTIÚN", "VEINTIDÓS", "VEINTITRÉS", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
    const D = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
    const C = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
    function cien(k) {
      if (k === 0) return ""; if (k === 100) return "CIEN";
      const c = Math.floor(k / 100), r = k % 100; let s = C[c];
      if (r) s += (s ? " " : "") + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? " Y " + U[r % 10] : ""));
      return s;
    }
    const ent = Math.floor(n), cent = Math.round((n - ent) * 100);
    let s;
    if (ent === 0) s = "CERO";
    else {
      const mil = Math.floor(ent / 1000), resto = ent % 1000;
      s = (mil ? (mil === 1 ? "MIL" : cien(mil) + " MIL") : "") + (resto ? (mil ? " " : "") + cien(resto) : "");
    }
    return s.trim() + (ent === 1 ? " PESO " : " PESOS ") + String(cent).padStart(2, "0") + "/100 M.N.";
  }

  // ---------- PDF ----------
  function pdfFactura(f) {
    if (!window.jspdf) { alert("Todavía se está cargando el generador de PDF. Intenta en unos segundos."); return null; }
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "letter" });
    const W = 216, M = 14; let y = 16;
    const tinta = [19, 33, 60], gris = [107, 114, 128], menta = [25, 195, 167];
    // marca de agua
    try { doc.setGState(new doc.GState({ opacity: 0.08 })); } catch (e) { /* sin transparencia */ }
    doc.setTextColor(19, 33, 60); doc.setFont("helvetica", "bold"); doc.setFontSize(46);
    doc.text("SIN VALIDEZ FISCAL", W / 2, 150, { align: "center", angle: 35 });
    doc.text("PRÁCTICA", W / 2, 185, { align: "center", angle: 35 });
    try { doc.setGState(new doc.GState({ opacity: 1 })); } catch (e) { /* nada */ }
    // encabezado
    doc.setDrawColor(...tinta); doc.setLineWidth(2.2); doc.circle(M + 6, y + 1, 4.5);
    doc.setFillColor(...menta); doc.circle(M + 6, y + 1, 1.8, "F");
    doc.setFontSize(22); doc.setTextColor(...tinta); doc.text("OCSO", M + 14, y + 4);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(...gris);
    doc.text("Portal de práctica de un curso · no es un portal real", M + 14, y + 9);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...tinta);
    doc.text("FACTURA · CFDI 4.0 (PRÁCTICA)", W - M, y + 1, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text("Serie " + f.serie + "  Folio " + f.folio, W - M, y + 6, { align: "right" });
    doc.text("Fecha " + f.fecha.replace("T", " "), W - M, y + 10.5, { align: "right" });
    y += 18; doc.setDrawColor(...menta); doc.setLineWidth(0.8); doc.line(M, y, W - M, y); y += 7;
    // emisor y receptor
    const col = (titulo, lineas, xx) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...gris); doc.text(titulo, xx, y);
      doc.setTextColor(...tinta); doc.setFontSize(9.5);
      lineas.forEach((l, i) => { doc.setFont("helvetica", i === 0 ? "bold" : "normal"); doc.text(doc.splitTextToSize(l, 88), xx, y + 5 + i * 4.6); });
    };
    col("EMISOR", [f.emisor.nombre, "RFC " + f.emisor.rfc, "Régimen " + f.emisor.regimen + " General de Ley Personas Morales", "Lugar de expedición C.P. " + f.lugar_expedicion, f.emisor.sucursal || ""], M);
    col("RECEPTOR", [f.receptor.nombre, "RFC " + f.receptor.rfc, "Régimen fiscal " + f.receptor.regimen, "Domicilio fiscal C.P. " + f.receptor.cp, "Uso del CFDI " + f.receptor.uso], W / 2 + 2);
    y += 32;
    doc.setFillColor(246, 244, 239); doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, "F");
    doc.setFontSize(8.5); doc.setTextColor(...gris); doc.setFont("helvetica", "bold");
    doc.text("FOLIO FISCAL (UUID)", M + 4, y + 5); doc.text("FORMA DE PAGO", M + 100, y + 5); doc.text("MÉTODO", M + 145, y + 5); doc.text("MONEDA", M + 170, y + 5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...tinta); doc.setFontSize(9);
    doc.text(f.uuid, M + 4, y + 10); doc.text(f.forma_pago + " " + (FORMAS[f.forma_pago] || ""), M + 100, y + 10);
    doc.text(f.metodo_pago, M + 145, y + 10); doc.text(f.moneda, M + 170, y + 10);
    y += 21;
    // conceptos
    const cols = [M, M + 14, M + 34, M + 52, W - M - 52, W - M - 26];
    doc.setFillColor(...tinta); doc.rect(M, y, W - 2 * M, 7, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    ["CANT.", "CLAVE", "UNIDAD", "DESCRIPCIÓN", "VALOR UNIT.", "IMPORTE"].forEach((h, i) => doc.text(h, cols[i] + 2, y + 4.8));
    y += 7; doc.setTextColor(...tinta); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    f.conceptos.forEach((c, i) => {
      if (i % 2) { doc.setFillColor(250, 249, 246); doc.rect(M, y, W - 2 * M, 8, "F"); }
      doc.text(String(c.cantidad), cols[0] + 2, y + 5.3); doc.text(c.clave_prod_serv, cols[1] + 2, y + 5.3);
      doc.text(c.clave_unidad + " " + c.unidad, cols[2] + 2, y + 5.3); doc.text(doc.splitTextToSize(c.descripcion, 70)[0], cols[3] + 2, y + 5.3);
      doc.text(Number(c.valor_unitario).toFixed(2), cols[5] - 4, y + 5.3, { align: "right" });
      doc.text(pesos(c.importe), W - M - 2, y + 5.3, { align: "right" });
      y += 8;
    });
    y += 4; doc.setDrawColor(228, 225, 216); doc.setLineWidth(0.3); doc.line(M, y, W - M, y); y += 7;
    // totales
    const tot = (et, v, b) => { doc.setFont("helvetica", b ? "bold" : "normal"); doc.setFontSize(b ? 12 : 10); doc.text(et, W - M - 60, y); doc.text(v, W - M - 2, y, { align: "right" }); y += b ? 8 : 6; };
    const yLetra = y;
    tot("Subtotal", pesos(f.subtotal)); tot("IVA trasladado 16%", pesos(f.iva)); tot("Total", pesos(f.total), true);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...gris); doc.text("IMPORTE CON LETRA", M, yLetra);
    doc.setFont("helvetica", "normal"); doc.setTextColor(...tinta); doc.setFontSize(9); doc.text(doc.splitTextToSize(conLetra(Number(f.total)), 100), M, yLetra + 5);
    y += 6;
    // QR y sellos
    try {
      const q = window.qrcode(0, "M"); q.addData("FACTURA DE PRACTICA SIN VALIDEZ FISCAL|UUID " + f.uuid + "|RFC EMISOR " + f.emisor.rfc + "|RFC RECEPTOR " + f.receptor.rfc + "|TOTAL " + d2(f.total)); q.make();
      doc.addImage(q.createDataURL(6, 2), "GIF", M, y, 34, 34);
    } catch (e) { /* sin QR */ }
    const sx = M + 40; doc.setFontSize(7.5); doc.setTextColor(...gris);
    const sello = (t, v, yy) => { doc.setFont("helvetica", "bold"); doc.text(t, sx, yy); doc.setFont("helvetica", "normal"); doc.text(doc.splitTextToSize(v, W - M - sx), sx, yy + 3.5); };
    sello("SELLO DIGITAL DEL CFDI", "PRACTICA-SIN-VALIDEZ. Esta factura no se timbró ante el SAT ni ante ningún proveedor autorizado.", y + 2);
    sello("SELLO DEL SAT", "PRACTICA-SIN-VALIDEZ", y + 12);
    sello("CADENA ORIGINAL DEL COMPLEMENTO", "||1.1|" + f.uuid + "|" + f.fecha + "|PRACTICA|PRACTICA-SIN-VALIDEZ|00000000000000000000||", y + 20);
    y += 42;
    doc.setFillColor(255, 241, 232); doc.roundedRect(M, y, W - 2 * M, 12, 2, 2, "F"); doc.setTextColor(194, 65, 12); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("Representación de práctica de un CFDI generada para un curso. No tiene validez fiscal.", W / 2, y + 7.5, { align: "center" });
    return doc.output("blob");
  }

  // ---------- Rutas ----------
  function ruta() {
    const h = location.hash || "#/";
    if (h.startsWith("#/factura/")) return vistaFactura(decodeURIComponent(h.slice(10)));
    if (h === "#/ticket") return vistaTicket();
    if (h.startsWith("#/datos")) return vistaElegirDatos();
    if (h === "#/perfiles") return vistaPerfiles();
    if (h === "#/facturas") return vistaFacturas();
    return vistaInicio();
  }
  window.addEventListener("hashchange", ruta);
  ruta();
  catalogos();
})();
