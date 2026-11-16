/* =========================================================
   DULCE TRIGO — script.js
   1. Carrusel de la página de inicio (flechas, puntitos, automático)
   2. Carta: filtrar por categoría (dulces, salados, ...)
   3. Carta: botones  −  +  y "Agregar"
   4. Carrito de compras (y envío por WhatsApp)
========================================================= */


/* =========================================================
   1. CARRUSEL (solo funciona en index.html)
========================================================= */
const slides = document.querySelectorAll(".hero-slide");

if (slides.length > 0) {
  const contenedorPuntos = document.getElementById("heroControles");
  const flechaAnterior = document.getElementById("flechaAnterior");
  const flechaSiguiente = document.getElementById("flechaSiguiente");

  let posicion = 0;   // número de la imagen que se ve ahora (0 = la primera)
  let temporizador;   // guarda el cambio automático

  // Crear un puntito por cada imagen
  slides.forEach(function (slide, i) {
    const punto = document.createElement("button");
    punto.className = "hero-punto" + (i === 0 ? " activo" : "");
    punto.setAttribute("aria-label", "Ir a la imagen " + (i + 1));
    punto.addEventListener("click", function () { irASlide(i); });
    contenedorPuntos.appendChild(punto);
  });
  const puntos = contenedorPuntos.querySelectorAll(".hero-punto");

  // Mostrar la imagen número "nueva"
  function irASlide(nueva) {
    slides[posicion].classList.remove("activa");
    puntos[posicion].classList.remove("activo");

    // Si pasas de la última vuelves a la primera, y al revés
    posicion = (nueva + slides.length) % slides.length;

    slides[posicion].classList.add("activa");
    puntos[posicion].classList.add("activo");

    reiniciarTemporizador();
  }

  // Cambiar solo cada 5 segundos
  function reiniciarTemporizador() {
    clearInterval(temporizador);
    temporizador = setInterval(function () { irASlide(posicion + 1); }, 5000);
  }

  // Flechas  ‹  y  ›
  flechaSiguiente.addEventListener("click", function () { irASlide(posicion + 1); });
  flechaAnterior.addEventListener("click", function () { irASlide(posicion - 1); });

  reiniciarTemporizador();
}


/* =========================================================
   2. CARTA: FILTRO POR CATEGORÍA (solo funciona en carta.html)

   Cada botón del menú lateral tiene data-categoria="dulces", "salados"...
   Cada tarjeta tiene data-categoria="dulces" y data-grupo="bocaditos".
   Al pulsar un botón mostramos solo las tarjetas que coinciden.
========================================================= */
const botonesCategoria = document.querySelectorAll("#listaCategorias button");
const tarjetas = document.querySelectorAll(".tarjeta-producto");

function filtrarProductos(categoria) {
  tarjetas.forEach(function (tarjeta) {
    const coincide =
      categoria === "todos" ||
      tarjeta.dataset.categoria === categoria ||   // ej: "dulces"
      tarjeta.dataset.grupo === categoria;         // ej: "bocaditos" (dulces + salados)

    tarjeta.style.display = coincide ? "" : "none";
  });
}

botonesCategoria.forEach(function (boton) {
  boton.addEventListener("click", function () {
    // Marcar solo el botón pulsado
    botonesCategoria.forEach(function (b) { b.classList.remove("activo"); });
    boton.classList.add("activo");

    filtrarProductos(boton.dataset.categoria);
  });
});


/* =========================================================
   3. CARTA: BOTONES  −  +  Y "AGREGAR"
   Se recorre cada tarjeta y se programan sus tres botones.
========================================================= */
tarjetas.forEach(function (tarjeta) {
  const botonMenos = tarjeta.querySelector(".btn-menos");
  const botonMas = tarjeta.querySelector(".btn-mas");
  const botonAgregar = tarjeta.querySelector(".boton-agregar");
  const numero = tarjeta.querySelector(".valor-cantidad");

  // Subir la cantidad (máximo 99)
  botonMas.addEventListener("click", function () {
    numero.textContent = Math.min(99, Number(numero.textContent) + 1);
  });

  // Bajar la cantidad (mínimo 1)
  botonMenos.addEventListener("click", function () {
    numero.textContent = Math.max(1, Number(numero.textContent) - 1);
  });

  // Agregar al carrito la cantidad que se ve en el número
  botonAgregar.addEventListener("click", function () {
    const producto = {
      id: tarjeta.dataset.id,
      nombre: tarjeta.dataset.nombre,
      precio: Number(tarjeta.dataset.precio),
      unidad: tarjeta.dataset.unidad,
      imagen: tarjeta.querySelector("img").getAttribute("src")
    };

    agregarAlCarrito(producto, Number(numero.textContent));
    numero.textContent = 1;   // el selector vuelve a 1
  });
});

async function sincronizarCatalogoSql() {
  if (tarjetas.length === 0) return;
  try {
    const response = await fetch("/api/products");
    const products = await response.json();
    if (!response.ok) throw new Error(products.error || "No se pudo cargar el catálogo.");
    const catalogo = new Map(products.map((product) => [product.id, product]));

    tarjetas.forEach(function (tarjeta) {
      const producto = catalogo.get(tarjeta.dataset.id);
      const botonAgregar = tarjeta.querySelector(".boton-agregar");
      if (!producto) {
        botonAgregar.disabled = true;
        botonAgregar.textContent = "No disponible";
        return;
      }

      tarjeta.dataset.nombre = producto.name;
      tarjeta.dataset.precio = String(producto.price);
      tarjeta.dataset.unidad = producto.unit;
      tarjeta.querySelector(".info-producto h4").textContent = producto.name;
      const precio = tarjeta.querySelector(".precio-producto");
      const textoPrecio = Array.from(precio.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (textoPrecio) textoPrecio.textContent = "S/ " + Number(producto.price).toFixed(2) + " ";
      precio.querySelector("small").textContent = producto.unit;
      const imagen = tarjeta.querySelector("img");
      if (imagen) imagen.alt = producto.name;
      botonAgregar.disabled = false;
    });

    const cantidadAnterior = carrito.length;
    carrito = carrito.filter(function (item) { return catalogo.has(item.id); }).map(function (item) {
      const producto = catalogo.get(item.id);
      return { ...item, nombre: producto.name, precio: Number(producto.price), unidad: producto.unit };
    });
    if (carrito.length !== cantidadAnterior) mostrarAviso("Quitamos del carrito productos que ya no están disponibles");
    guardarCarrito();
    mostrarCarrito();
  } catch (error) {
    tarjetas.forEach(function (tarjeta) {
      const boton = tarjeta.querySelector(".boton-agregar");
      boton.title = "Conecta la base de datos para ver precios y comprar";
    });
    mostrarAviso("No se pudo conectar con el catálogo SQL");
  }
}


/* =========================================================
   4. CARRITO DE COMPRAS
========================================================= */
// El carrito es una lista. Se guarda en el navegador para no perderse al cambiar de página.
let carrito = JSON.parse(sessionStorage.getItem("carritoDulceTrigo") || "[]");

const panelCarrito = document.getElementById("panelCarrito");
const fondoCarrito = document.getElementById("fondoCarrito");
const listaCarrito = document.getElementById("listaCarrito");
const totalCarrito = document.getElementById("totalCarrito");
const contadorCarrito = document.getElementById("contadorCarrito");
const botonFinalizarPedido = document.getElementById("botonFinalizarPedido");
const botonSeguirComprando = document.getElementById("botonSeguirComprando");

function formatearPrecio(numero) {
  return "S/ " + numero.toFixed(2);
}

function guardarCarrito() {
  sessionStorage.setItem("carritoDulceTrigo", JSON.stringify(carrito));
}

/* ---------- Abrir y cerrar el panel ---------- */
function abrirCarrito() {
  panelCarrito.classList.add("abierto");
  fondoCarrito.classList.add("abierto");
}

function cerrarCarrito() {
  panelCarrito.classList.remove("abierto");
  fondoCarrito.classList.remove("abierto");
}

document.getElementById("botonCarrito").addEventListener("click", abrirCarrito);
document.getElementById("cerrarCarrito").addEventListener("click", cerrarCarrito);
fondoCarrito.addEventListener("click", cerrarCarrito);
botonSeguirComprando.addEventListener("click", cerrarCarrito);

/* ---------- Agregar, cambiar cantidad y quitar ---------- */
function agregarAlCarrito(producto, cantidad) {
  // ¿Ya está en el carrito?
  const yaEstaba = carrito.find(function (item) { return item.id === producto.id; });

  if (yaEstaba) {
    yaEstaba.cantidad += cantidad;      // solo suma la cantidad
  } else {
    producto.cantidad = cantidad;
    carrito.push(producto);             // lo agrega nuevo
  }

  guardarCarrito();
  mostrarCarrito();
  mostrarAviso("Agregaste " + producto.nombre);
}

function cambiarCantidad(id, cambio) {
  const item = carrito.find(function (i) { return i.id === id; });
  item.cantidad += cambio;

  if (item.cantidad <= 0) {
    quitarDelCarrito(id);
  } else {
    guardarCarrito();
    mostrarCarrito();
  }
}

function quitarDelCarrito(id) {
  carrito = carrito.filter(function (item) { return item.id !== id; });
  guardarCarrito();
  mostrarCarrito();
}

/* ---------- Dibujar el carrito en pantalla ---------- */
function mostrarCarrito() {
  if (carrito.length === 0) {
    listaCarrito.innerHTML =
      '<div class="carrito-vacio"><div class="icono-vacio">🥐</div>' +
      '<p>Tu carrito está vacío.<br>Agrega bocaditos o panes desde la carta.</p></div>';
    botonFinalizarPedido.disabled = true;
  } else {
    listaCarrito.innerHTML = "";
    botonFinalizarPedido.disabled = false;

    carrito.forEach(function (item) {
      const fila = document.createElement("div");
      fila.className = "item-carrito";
      fila.innerHTML = `
        <img src="${item.imagen}" alt="${item.nombre}">
        <div class="detalle-item-carrito">
          <h5>${item.nombre}</h5>
          <div class="fila-item-carrito">
            <div class="selector-cantidad">
              <button type="button" class="restar">−</button>
              <span class="valor-cantidad">${item.cantidad}</span>
              <button type="button" class="sumar">+</button>
            </div>
            <span class="subtotal-item">${formatearPrecio(item.precio * item.cantidad)}</span>
          </div>
          <button type="button" class="quitar-item">Quitar</button>
        </div>`;

      fila.querySelector(".restar").addEventListener("click", function () { cambiarCantidad(item.id, -1); });
      fila.querySelector(".sumar").addEventListener("click", function () { cambiarCantidad(item.id, 1); });
      fila.querySelector(".quitar-item").addEventListener("click", function () { quitarDelCarrito(item.id); });
      listaCarrito.appendChild(fila);
    });
  }

  // Total en soles y cantidad de productos que se ve en el botón del carrito
  let total = 0;
  let unidades = 0;
  carrito.forEach(function (item) {
    total += item.precio * item.cantidad;
    unidades += item.cantidad;
  });
  totalCarrito.textContent = formatearPrecio(total);
  contadorCarrito.textContent = unidades;
}

/* ---------- Aviso "Agregaste ..." ---------- */
let temporizadorAviso;
function mostrarAviso(texto) {
  const aviso = document.getElementById("avisoToast");
  aviso.textContent = "✔ " + texto;
  aviso.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () { aviso.classList.remove("visible"); }, 2200);
}

/* ---------- Continuar al formulario de pedido ---------- */
botonFinalizarPedido.addEventListener("click", function () {
  if (carrito.length === 0) return;
  window.location.href = "checkout.html";
});

// Dibujar el carrito apenas carga la página (por si ya tenía productos)
mostrarCarrito();
sincronizarCatalogoSql();
