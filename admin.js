(function () {
  "use strict";

  var CLAVE_SESION = "dulcetrigoAdminToken";
  var ETIQUETA_PAGO = { tarjeta: "Tarjeta", yape_plin: "Yape / Plin", efectivo: "Efectivo" };
  var ETIQUETA_ENTREGA = { recojo: "Recojo en tienda", delivery: "Delivery" };
  var ESTADOS = ["recibido", "preparando", "listo", "entregado", "cancelado"];

  var token = "";
  var pedidos = [];
  var seleccionado = null;
  var temporizador = null;

  var vistaLogin = document.getElementById("vistaLogin");
  var vistaPanel = document.getElementById("vistaPanel");
  var formLogin = document.getElementById("formLogin");
  var errorLogin = document.getElementById("errorLogin");
  var botonEntrar = document.getElementById("botonEntrar");
  var botonSalir = document.getElementById("botonSalir");
  var botonActualizar = document.getElementById("botonActualizar");
  var filtro = document.getElementById("filtroEstado");
  var lista = document.getElementById("listaPedidos");
  var listaVacia = document.getElementById("listaVacia");
  var detalle = document.getElementById("detallePedido");

  try { token = sessionStorage.getItem(CLAVE_SESION) || ""; } catch (e) { token = ""; }

  function esc(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/\x27/g, "&#39;");
  }

  function soles(n) { return "S/ " + Number(n).toFixed(2); }

  function fecha(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("es-PE", {
      timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function mostrarLogin(mensaje) {
    token = "";
    try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {}
    clearInterval(temporizador);
    vistaPanel.hidden = true;
    botonSalir.hidden = true;
    vistaLogin.hidden = false;
    errorLogin.hidden = !mensaje;
    errorLogin.textContent = mensaje || "";
    document.getElementById("claveAdmin").focus();
  }

  function mostrarPanel() {
    vistaLogin.hidden = true;
    vistaPanel.hidden = false;
    botonSalir.hidden = false;
    cargarPedidos();
    clearInterval(temporizador);
    temporizador = setInterval(function () { cargarPedidos(true); }, 30000);
  }

  function api(ruta, opciones) {
    opciones = opciones || {};
    opciones.headers = Object.assign({ "Content-Type": "application/json" }, opciones.headers || {});
    if (token) opciones.headers.Authorization = "Bearer " + token;

    return fetch(ruta, opciones).then(function (respuesta) {
      return respuesta.json().catch(function () { return {}; }).then(function (datos) {
        if (respuesta.status === 401 && token) {
          mostrarLogin("Tu sesión terminó. Vuelve a ingresar.");
          throw new Error("sesion");
        }
        if (!respuesta.ok) throw new Error(datos.error || "No se pudo completar la acción.");
        return datos;
      });
    });
  }

  function cargarPedidos(silencioso) {
    return api("/api/admin/orders").then(function (datos) {
      pedidos = datos;
      var hora = new Date().toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
      document.getElementById("horaActualizacion").textContent = "Actualizado a las " + hora;
      dibujarMetricas();
      dibujarLista();
      var actual = pedidos.find(function (p) { return p.id === seleccionado; });
      var campo = document.getElementById("estadoNuevo");
      var sinCambios = campo && actual && campo.value === actual.status;
      if (!silencioso || sinCambios || !campo) dibujarDetalle();
    }).catch(function (error) {
      if (error.message !== "sesion" && !silencioso) {
        lista.innerHTML = "";
        listaVacia.hidden = false;
        listaVacia.textContent = error.message;
      }
    });
  }

  function dibujarMetricas() {
    var pendientes = 0, ventas = 0;
    pedidos.forEach(function (p) {
      if (p.status === "recibido" || p.status === "preparando") pendientes++;
      if (p.status !== "cancelado") ventas += p.total;
    });
    document.getElementById("metricaPedidos").textContent = pedidos.length;
    document.getElementById("metricaPendientes").textContent = pendientes;
    document.getElementById("metricaVentas").textContent = soles(ventas);
  }

  function visibles() {
    var f = filtro.value;
    return pedidos.filter(function (p) { return f === "todos" || p.status === f; });
  }

  function dibujarLista() {
    var items = visibles();
    listaVacia.hidden = items.length > 0;
    listaVacia.textContent = "Todavía no hay pedidos en esta vista.";
    lista.innerHTML = items.map(function (p) {
      return "<button type=\"button\" class=\"admin-fila" + (p.id === seleccionado ? " activa" : "") + "\" data-id=\"" + esc(p.id) + "\">" +
        "<span><strong>" + esc(p.id) + "</strong><small>" + esc(p.customer.fullName) + "</small></span>" +
        "<span>" + esc(ETIQUETA_ENTREGA[p.delivery.type] || p.delivery.type) + "<small>" + esc(ETIQUETA_PAGO[p.paymentMethod] || p.paymentMethod) + "</small></span>" +
        "<strong>" + soles(p.total) + "</strong>" +
        "<span><span class=\"admin-estado estado-" + esc(p.status) + "\">" + esc(p.status) + "</span><small>" + esc(fecha(p.createdAt)) + "</small></span>" +
        "</button>";
    }).join("");
  }

  function dibujarDetalle() {
    var p = pedidos.find(function (x) { return x.id === seleccionado; });
    if (!p) {
      detalle.innerHTML = "<p class=\"admin-vacio\">Selecciona un pedido para ver su detalle.</p>";
      return;
    }
    var direccion = p.delivery.type === "delivery" ? "<dt>Dirección</dt><dd>" + esc(p.delivery.address) + "</dd>" : "";
    var notas = p.notes ? "<dt>Observaciones</dt><dd>" + esc(p.notes) + "</dd>" : "";
    var productos = p.items.map(function (i) {
      return "<div><span>" + esc(i.quantity) + " × " + esc(i.name) + " <small>(" + esc(i.unit) + ")</small></span><span>" + soles(i.subtotal) + "</span></div>";
    }).join("");
    var opciones = ESTADOS.map(function (e) {
      return "<option value=\"" + e + "\"" + (e === p.status ? " selected" : "") + ">" + e + "</option>";
    }).join("");

    detalle.innerHTML =
      "<h2>" + esc(p.id) + "</h2>" +
      "<p class=\"admin-fecha\">" + esc(fecha(p.createdAt)) + "</p>" +
      "<dl class=\"admin-datos\">" +
        "<dt>Cliente</dt><dd>" + esc(p.customer.fullName) + "</dd>" +
        "<dt>Documento</dt><dd>" + esc(p.customer.documentType) + " " + esc(p.customer.documentNumber) + "</dd>" +
        "<dt>Celular</dt><dd>" + esc(p.customer.phone) + "</dd>" +
        "<dt>Correo</dt><dd>" + esc(p.customer.email) + "</dd>" +
        "<dt>Comprobante</dt><dd>" + (p.comprobante === "factura" ? "Factura" : "Boleta de venta") + "</dd>" +
        "<dt>Entrega</dt><dd>" + esc(ETIQUETA_ENTREGA[p.delivery.type] || p.delivery.type) + "</dd>" +
        direccion +
        "<dt>Pago</dt><dd>" + esc(ETIQUETA_PAGO[p.paymentMethod] || p.paymentMethod) + "</dd>" +
        notas +
      "</dl>" +
      "<div class=\"admin-productos\">" + productos +
        "<div class=\"admin-total\"><span>Total</span><span>" + soles(p.total) + "</span></div></div>" +
      "<div class=\"admin-cambio\"><label for=\"estadoNuevo\">Estado del pedido</label>" +
        "<select id=\"estadoNuevo\">" + opciones + "</select>" +
        "<button type=\"button\" class=\"admin-boton\" id=\"botonEstado\">Actualizar estado</button></div>" +
      "<p class=\"admin-aviso\" id=\"avisoEstado\" role=\"status\"></p>";
  }

  formLogin.addEventListener("submit", function (evento) {
    evento.preventDefault();
    errorLogin.hidden = true;
    botonEntrar.disabled = true;
    fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: document.getElementById("claveAdmin").value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) {
        if (!r.ok) throw new Error(datos.error || "No se pudo ingresar.");
        token = datos.token;
        try { sessionStorage.setItem(CLAVE_SESION, token); } catch (e) {}
        formLogin.reset();
        mostrarPanel();
      });
    }).catch(function (error) {
      errorLogin.textContent = error.message;
      errorLogin.hidden = false;
    }).then(function () { botonEntrar.disabled = false; });
  });

  lista.addEventListener("click", function (evento) {
    var fila = evento.target.closest("[data-id]");
    if (!fila) return;
    seleccionado = fila.getAttribute("data-id");
    dibujarLista();
    dibujarDetalle();
  });

  detalle.addEventListener("click", function (evento) {
    if (!evento.target.closest("#botonEstado")) return;
    var boton = document.getElementById("botonEstado");
    var aviso = document.getElementById("avisoEstado");
    var nuevo = document.getElementById("estadoNuevo").value;
    boton.disabled = true;
    api("/api/admin/orders/" + encodeURIComponent(seleccionado) + "/status", {
      method: "POST", body: JSON.stringify({ status: nuevo })
    }).then(function () {
      var p = pedidos.find(function (x) { return x.id === seleccionado; });
      if (p) p.status = nuevo;
      dibujarMetricas();
      dibujarLista();
      var avisoNuevo = document.getElementById("avisoEstado");
      if (avisoNuevo) avisoNuevo.textContent = "Estado actualizado.";
    }).catch(function (error) {
      if (error.message !== "sesion" && aviso) {
        aviso.style.color = "var(--mermelada)";
        aviso.textContent = error.message;
      }
    }).then(function () { boton.disabled = false; });
  });

  filtro.addEventListener("change", dibujarLista);
  botonActualizar.addEventListener("click", function () { cargarPedidos(); });
  botonSalir.addEventListener("click", function () {
    api("/api/admin/logout", { method: "POST" }).catch(function () {}).then(function () { mostrarLogin(""); });
  });

  if (token) mostrarPanel();
})();
