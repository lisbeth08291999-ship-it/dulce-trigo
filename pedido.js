const WHATSAPP_NUMBER = "51935246885";
const parametros = new URLSearchParams(window.location.search);
const pedidoId = parametros.get("id");
const receiptToken = parametros.get("token");
let pedidoCargado = null;

function precioSoles(valor) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(valor);
}

function mostrarError(mensaje) {
  document.getElementById("cargandoPedido").hidden = true;
  document.getElementById("estadoConfirmacion").hidden = true;
  document.getElementById("errorPedido").hidden = false;
  document.getElementById("textoErrorPedido").textContent = mensaje;
}

function agregarLinea(contenedor, nombre, valor) {
  const fila = document.createElement("div");
  fila.className = "fila-item-confirmacion";
  const etiqueta = document.createElement("span");
  etiqueta.textContent = nombre;
  const precio = document.createElement("strong");
  precio.textContent = valor;
  fila.append(etiqueta, precio);
  contenedor.appendChild(fila);
}

function mostrarPedido(pedido) {
  pedidoCargado = pedido;
  document.getElementById("cargandoPedido").hidden = true;
  document.getElementById("detalleConfirmacion").hidden = false;
  document.getElementById("numeroPedido").textContent = pedido.id;
  document.getElementById("clienteConfirmacion").textContent = pedido.customer.fullName;
  document.getElementById("comprobanteConfirmacion").textContent = pedido.comprobante === "factura" ? "Factura · RUC" : "Boleta de venta";
  document.getElementById("totalConfirmacion").textContent = precioSoles(pedido.total);
  document.getElementById("totalItemsConfirmacion").textContent = precioSoles(pedido.total);
  document.getElementById("entregaConfirmacion").textContent = pedido.delivery.type === "recojo" ? "🏪 Recojo en tienda" : "🛵 Delivery";
  document.getElementById("pagoConfirmacion").textContent = {
    tarjeta: "Tarjeta (por coordinar)",
    yape_plin: "Yape / Plin",
    efectivo: "Efectivo"
  }[pedido.paymentMethod] || "Por coordinar";
  document.getElementById("tituloEntrega").textContent = pedido.delivery.type === "recojo" ? "📍 RECOGE EN" : "🛵 ENTREGA A";
  document.getElementById("direccionConfirmacion").textContent = pedido.delivery.address;
  document.getElementById("mapaConfirmacion").hidden = pedido.delivery.type !== "recojo";

  const items = document.getElementById("itemsConfirmacion");
  items.replaceChildren();
  pedido.items.forEach((item) => agregarLinea(items, `${item.quantity} × ${item.name} (${item.unit})`, precioSoles(item.subtotal)));

  const fecha = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima"
  }).format(new Date(pedido.createdAt));
  document.getElementById("estadoConfirmacion").querySelector("p").textContent = `Registramos tu pedido el ${fecha}. Te contactaremos para coordinar los siguientes pasos.`;
}

document.getElementById("botonWhatsappConfirmacion").addEventListener("click", () => {
  if (!pedidoCargado) return;
  const lineas = pedidoCargado.items.map((item) => `• ${item.quantity} x ${item.name} — ${precioSoles(item.subtotal)}`);
  const mensaje = [
    `Hola Dulce Trigo, deseo consultar el pedido ${pedidoCargado.id}.`,
    "",
    ...lineas,
    "",
    `Total del pedido: ${precioSoles(pedidoCargado.total)}`,
    `Cliente: ${pedidoCargado.customer.fullName}`,
    `Entrega: ${pedidoCargado.delivery.type === "recojo" ? "Recojo en tienda" : "Delivery"}`
  ].join("\n");
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener,noreferrer");
});

document.getElementById("botonImprimir").addEventListener("click", () => window.print());

if (!pedidoId || !receiptToken) {
  mostrarError("Falta el enlace del pedido. Abre la página de confirmación desde el formulario.");
} else {
  fetch(`/api/orders/${encodeURIComponent(pedidoId)}?token=${encodeURIComponent(receiptToken)}`)
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No encontramos este pedido.");
      mostrarPedido(result);
    })
    .catch((error) => mostrarError(error.message || "No se pudo cargar el comprobante."));
}
