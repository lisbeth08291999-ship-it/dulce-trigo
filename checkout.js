const CART_KEY = "carritoDulceTrigo";
const formularioPedido = document.getElementById("formularioPedido");
const botonConfirmarPedido = document.getElementById("botonConfirmarPedido");
const mensajeFormulario = document.getElementById("mensajeFormulario");
const itemsCarrito = JSON.parse(sessionStorage.getItem(CART_KEY) || "[]");
let catalogo = new Map();

function precioSoles(valor) {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(valor);
}

function mostrarMensaje(texto) {
  mensajeFormulario.textContent = texto;
  mensajeFormulario.hidden = false;
  mensajeFormulario.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderResumen() {
  const contenedor = document.getElementById("productosResumen");
  contenedor.replaceChildren();
  let subtotal = 0;

  for (const item of itemsCarrito) {
    const producto = catalogo.get(item.id);
    const cantidad = Number(item.cantidad);
    if (!producto || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) continue;
    const fila = document.createElement("div");
    fila.className = "producto-resumen";
    const nombre = document.createElement("span");
    nombre.textContent = `${cantidad} × ${producto.name} (${producto.unit})`;
    const precio = document.createElement("strong");
    precio.textContent = precioSoles(producto.price * cantidad);
    fila.append(nombre, precio);
    contenedor.appendChild(fila);
    subtotal += producto.price * cantidad;
  }

  document.getElementById("subtotalResumen").textContent = precioSoles(subtotal);
  document.getElementById("totalResumen").textContent = precioSoles(subtotal);
  document.getElementById("entregaResumen").textContent = document.querySelector('input[name="entrega"]:checked').value === "recojo" ? "Recojo en tienda" : "Por coordinar";
  if (!contenedor.children.length) {
    mostrarMensaje("Tu carrito está vacío. Vuelve a la carta y agrega productos para continuar.");
    botonConfirmarPedido.disabled = true;
  }
}

function actualizarDocumento() {
  const tipo = document.getElementById("tipoDocumento");
  const numero = document.getElementById("documento");
  const ayuda = document.getElementById("ayudaDocumento");
  const esFactura = document.querySelector('input[name="comprobante"]:checked').value === "factura";

  if (esFactura) tipo.value = "RUC";
  tipo.disabled = esFactura;
  const reglas = {
    DNI: { pattern: "[0-9]{8}", max: "8", texto: "DNI: 8 dígitos." },
    RUC: { pattern: "[0-9]{11}", max: "11", texto: "RUC: 11 dígitos." },
    OTRO: { pattern: "[A-Za-z0-9-]{4,20}", max: "20", texto: "Ingresa entre 4 y 20 letras o números." }
  };
  const regla = reglas[tipo.value];
  numero.pattern = regla.pattern;
  numero.maxLength = Number(regla.max);
  numero.inputMode = tipo.value === "OTRO" ? "text" : "numeric";
  ayuda.textContent = esFactura ? "La factura requiere un RUC de 11 dígitos." : regla.texto;
}

function actualizarEntrega() {
  const esDelivery = document.querySelector('input[name="entrega"]:checked').value === "delivery";
  const campoDireccion = document.getElementById("campoDireccion");
  const entradaDireccion = document.getElementById("direccionEntrega");
  campoDireccion.hidden = !esDelivery;
  entradaDireccion.required = esDelivery;
  document.getElementById("detalleRecojo").hidden = esDelivery;
  document.getElementById("entregaResumen").textContent = esDelivery ? "Por coordinar" : "Recojo en tienda";
}

async function cargarCatalogo() {
  try {
    const response = await fetch("/api/products");
    const products = await response.json();
    if (!response.ok) throw new Error(products.error || "No se pudo cargar el catálogo.");
    catalogo = new Map(products.map((product) => [product.id, product]));
    renderResumen();
  } catch (error) {
    mostrarMensaje(error.message || "No se pudo conectar con SQL Server. Revisa la configuración.");
    botonConfirmarPedido.disabled = true;
  }
}

document.querySelectorAll('input[name="comprobante"]').forEach((input) => input.addEventListener("change", actualizarDocumento));
document.getElementById("tipoDocumento").addEventListener("change", actualizarDocumento);
document.querySelectorAll('input[name="entrega"]').forEach((input) => input.addEventListener("change", actualizarEntrega));

formularioPedido.addEventListener("submit", async (event) => {
  event.preventDefault();
  mensajeFormulario.hidden = true;
  if (!formularioPedido.reportValidity()) return;
  if (!itemsCarrito.length) return mostrarMensaje("Tu carrito está vacío. Vuelve a la carta y agrega productos.");

  const datos = new FormData(formularioPedido);
  const entrega = formularioPedido.querySelector('input[name="entrega"]:checked').value;
  const payload = {
    customer: {
      documentType: document.getElementById("tipoDocumento").value,
      documentNumber: datos.get("documento"),
      fullName: datos.get("nombreCliente"),
      phone: datos.get("celularCliente"),
      email: datos.get("correoCliente")
    },
    comprobante: formularioPedido.querySelector('input[name="comprobante"]:checked').value,
    entrega,
    direccionEntrega: entrega === "delivery" ? datos.get("direccionEntrega") : "",
    metodoPago: formularioPedido.querySelector('input[name="metodoPago"]:checked').value,
    observaciones: datos.get("observaciones"),
    items: itemsCarrito.map((item) => ({ id: item.id, quantity: Number(item.cantidad) }))
  };

  botonConfirmarPedido.disabled = true;
  botonConfirmarPedido.textContent = "Registrando pedido…";
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo guardar el pedido.");
    sessionStorage.removeItem(CART_KEY);
    window.location.href = `pedido-confirmado.html?id=${encodeURIComponent(result.id)}&token=${encodeURIComponent(result.receiptToken)}`;
  } catch (error) {
    mostrarMensaje(error.message || "No se pudo guardar el pedido. Inténtalo nuevamente.");
    botonConfirmarPedido.disabled = false;
    botonConfirmarPedido.innerHTML = 'Confirmar pedido <span aria-hidden="true">→</span>';
  }
});

actualizarDocumento();
actualizarEntrega();
cargarCatalogo();
