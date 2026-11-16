
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
let pool = null;

// Cargar variables del archivo .env
loadLocalEnvironment();

const PORT = Number(process.env.PORT) || 3000;

const { Pool } = require("pg");

// Tipos de archivos
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

// Archivos permitidos
const STATIC_FILES = new Set([
  "index.html",
  "carta.html",
  "historia.html",
  "ubicacion.html",
  "contacto.html",
  "checkout.html",
  "pedido-confirmado.html",
  "style.css",
  "script.js",
  "checkout.js",
  "pedido.js",
  "imagenlogo.jpeg",
  "admin.html",
  "admin.css",
  "admin.js"
]);

// ======================================
// CARGAR ARCHIVO .ENV
// ======================================

function loadLocalEnvironment() {
  const envPath = path.join(ROOT, ".env");

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");

    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function envBoolean(name, fallback) {
  const value = process.env[name];

  if (value === undefined || value === "") return fallback;

  return ["1", "true", "yes", "si", "sí"].includes(
    value.toLowerCase()
  );
}

// ======================================
// BASE DE DATOS POSTGRESQL
// ======================================

const PRODUCTOS_INICIALES = [
  ["croissancitos", "Croissancitos", 40.0, "la docena"],
  ["enrolladitos-durazno", "Enrolladitos de Durazno", 60.0, "la docena"],
  ["encaneladitos", "Encaneladitos", 60.0, "la docena"],
  ["enrolladitos-primavera", "Enrolladitos de Primavera", 65.0, "la docena"],
  ["tubitos-acelga", "Tubitos de Acelga", 45.0, "la docena"],
  ["sandwichitos-florentinos", "Sandwichitos Florentinos", 65.0, "la docena"],
  ["sandwichitos-pollo", "Sandwichitos de Pollo", 45.0, "la docena"],
  ["conitos-pollo", "Conitos con Pollo", 50.0, "la docena"],
  ["super-pullman-blanco", "Super Pullman Blanco", 18.0, "unidad"],
  ["miga-pullman-blanco", "Miga Pullman Blanco", 16.0, "unidad"],
  ["arabecitos-blanco", "Arabecitos Blanco", 20.0, "la docena"],
  ["colizitas", "Colizitas", 17.5, "la docena"],
  ["ciabatittas-blancas", "Ciabatittas Blancas", 27.5, "la docena"]
];

// PostgreSQL pasa a minúsculas los nombres sin comillas (pedidoid, codigopedido...).
// Este mapa los devuelve con las mayúsculas que usa el resto del código.
const NOMBRES_COLUMNAS = new Map(
  [
    "productId", "PedidoId", "CodigoPedido", "FechaRegistro", "Estado",
    "TipoComprobante", "TipoEntrega", "DireccionEntrega", "MetodoPago",
    "Total", "NombreCompleto", "NombreCliente", "TipoDocumentoCliente",
    "NumeroDocumentoCliente", "CelularCliente", "CorreoCliente",
    "Observaciones", "NombreProducto", "Unidad", "PrecioUnitario",
    "Cantidad", "Subtotal", "ClienteId"
  ].map((nombre) => [nombre.toLowerCase(), nombre])
);

function filaConMayusculas(fila) {
  const resultado = {};

  for (const [clave, valor] of Object.entries(fila)) {
    resultado[NOMBRES_COLUMNAS.get(clave) || clave] = valor;
  }

  return resultado;
}

async function consultar(ejecutor, texto, valores = []) {
  const resultado = await ejecutor.query(texto, valores);

  return {
    filas: resultado.rows.map(filaConMayusculas),
    cantidad: resultado.rowCount
  };
}

async function getPool() {
  if (pool) return pool;

  if (!process.env.DATABASE_URL) {
    throw new Error("Falta la variable DATABASE_URL (conexión a PostgreSQL).");
  }

  const nuevo = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: envBoolean("DATABASE_SSL", false)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10
  });

  nuevo.on("error", (error) => {
    console.error("Error en una conexión inactiva:", error.message);
  });

  await nuevo.query(`
    CREATE TABLE IF NOT EXISTS productos (
      productoid SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      precio NUMERIC(10, 2) NOT NULL CHECK (precio >= 0),
      unidad TEXT NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS clientes (
      clienteid SERIAL PRIMARY KEY,
      tipodocumento TEXT NOT NULL,
      numerodocumento TEXT NOT NULL,
      nombrecompleto TEXT NOT NULL,
      celular TEXT NOT NULL,
      correo TEXT NOT NULL,
      fecharegistro TIMESTAMPTZ NOT NULL,
      fechaactualizacion TIMESTAMPTZ,
      UNIQUE (tipodocumento, numerodocumento)
    );

    CREATE TABLE IF NOT EXISTS pedidos (
      pedidoid SERIAL PRIMARY KEY,
      codigopedido TEXT NOT NULL UNIQUE,
      tokenconfirmacion TEXT NOT NULL,
      clienteid INTEGER NOT NULL REFERENCES clientes(clienteid),
      nombrecliente TEXT NOT NULL,
      tipodocumentocliente TEXT NOT NULL,
      numerodocumentocliente TEXT NOT NULL,
      celularcliente TEXT NOT NULL,
      correocliente TEXT NOT NULL,
      tipocomprobante TEXT NOT NULL,
      tipoentrega TEXT NOT NULL,
      direccionentrega TEXT NOT NULL,
      metodopago TEXT NOT NULL,
      observaciones TEXT,
      estado TEXT NOT NULL DEFAULT 'recibido',
      fecharegistro TIMESTAMPTZ NOT NULL,
      total NUMERIC(10, 2) NOT NULL CHECK (total >= 0)
    );

    CREATE TABLE IF NOT EXISTS detallepedido (
      pedidodetalleid SERIAL PRIMARY KEY,
      pedidoid INTEGER NOT NULL REFERENCES pedidos(pedidoid),
      productoid INTEGER NOT NULL REFERENCES productos(productoid),
      codigoproducto TEXT NOT NULL,
      nombreproducto TEXT NOT NULL,
      unidad TEXT NOT NULL,
      preciounitario NUMERIC(10, 2) NOT NULL CHECK (preciounitario >= 0),
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0)
    );
  `);

  // Solo agrega los productos que faltan; no pisa precios que ya cambiaste.
  for (const producto of PRODUCTOS_INICIALES) {
    await nuevo.query(
      `INSERT INTO productos (codigo, nombre, precio, unidad, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (codigo) DO NOTHING`,
      producto
    );
  }

  pool = nuevo;
  return pool;
}

// ======================================
// RESPUESTAS JSON
// ======================================

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });

  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;

    request.setEncoding("utf8");

    request.on("data", (chunk) => {
      if (body.length + chunk.length > 1024 * 1024) {
        tooLarge = true;
      } else if (!tooLarge) {
        body += chunk;
      }
    });

    request.on("end", () => {
      if (tooLarge) {
        return reject(
          Object.assign(
            new Error("El pedido es demasiado grande."),
            { status: 413 }
          )
        );
      }

      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(
          Object.assign(
            new Error("El formato de los datos no es válido."),
            { status: 400 }
          )
        );
      }
    });

    request.on("error", reject);
  });
}

// ======================================
// VALIDACIÓN DE DATOS
// ======================================

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function limaOrderDate(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}${values.month}${values.day}`;
}

// ======================================
// PREPARAR PEDIDO
// ======================================

function normalizeOrder(payload, products) {
  if (!payload || typeof payload !== "object") {
    throw Object.assign(
      new Error("Los datos del pedido no son válidos."),
      { status: 400 }
    );
  }

  const customerInput = payload.customer || {};

  const fullName = cleanText(customerInput.fullName, 100);
  const documentType = cleanText(
    customerInput.documentType,
    10
  ).toUpperCase();

  const documentNumber = cleanText(
    customerInput.documentNumber,
    20
  ).replace(/\s/g, "");

  const phone = cleanText(customerInput.phone, 30);
  const email = cleanText(customerInput.email, 160).toLowerCase();

  const phoneDigits = phone.replace(/\D/g, "");

  const comprobante = cleanText(
    payload.comprobante,
    10
  ).toLowerCase();

  const deliveryType = cleanText(
    payload.entrega,
    20
  ).toLowerCase();

  const deliveryAddress = cleanText(
    payload.direccionEntrega,
    250
  );

  const paymentMethod = cleanText(
    payload.metodoPago,
    20
  ).toLowerCase();

  const notes = cleanText(payload.observaciones, 500);

  function invalid(message) {
    throw Object.assign(new Error(message), { status: 400 });
  }

  if (fullName.length < 3) {
    invalid("Escribe el nombre completo del cliente.");
  }

  if (!["DNI", "RUC", "OTRO"].includes(documentType)) {
    invalid("Selecciona un tipo de documento válido.");
  }

  if (documentType === "DNI" && !/^\d{8}$/.test(documentNumber)) {
    invalid("El DNI debe tener 8 dígitos.");
  }

  if (documentType === "RUC" && !/^\d{11}$/.test(documentNumber)) {
    invalid("El RUC debe tener 11 dígitos.");
  }

  if (
    documentType === "OTRO" &&
    !/^[A-Za-z0-9-]{4,20}$/.test(documentNumber)
  ) {
    invalid("Revisa el número del documento.");
  }

  if (
    !/^\+?[0-9\s().-]{9,20}$/.test(phone) ||
    phoneDigits.length < 9 ||
    phoneDigits.length > 15
  ) {
    invalid("Escribe un celular válido.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("Escribe un correo electrónico válido.");
  }

  if (!["boleta", "factura"].includes(comprobante)) {
    invalid("Selecciona boleta o factura.");
  }

  if (comprobante === "factura" && documentType !== "RUC") {
    invalid("Para solicitar factura, registra un RUC.");
  }

  if (!["recojo", "delivery"].includes(deliveryType)) {
    invalid("Selecciona el tipo de entrega.");
  }

  if (deliveryType === "delivery" && deliveryAddress.length < 8) {
    invalid("Escribe la dirección completa para el delivery.");
  }

  if (!["tarjeta", "yape_plin", "efectivo"].includes(paymentMethod)) {
    invalid("Selecciona un método de pago.");
  }

  if (
    !Array.isArray(payload.items) ||
    payload.items.length === 0 ||
    payload.items.length > 30
  ) {
    invalid("Agrega productos al carrito antes de confirmar.");
  }

  const productByCode = new Map(
    products.map((product) => [product.id, product])
  );

  const quantities = new Map();

  for (const item of payload.items) {
    const id = cleanText(item && item.id, 80);
    const quantity = Number(item && item.quantity);

    if (
      !productByCode.has(id) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 99
    ) {
      invalid("Hay un producto o una cantidad inválida.");
    }

    quantities.set(
      id,
      (quantities.get(id) || 0) + quantity
    );

    if (quantities.get(id) > 99) {
      invalid("La cantidad máxima por producto es 99.");
    }
  }

  const items = [...quantities.entries()].map(
    ([id, quantity]) => {
      const product = productByCode.get(id);
      const price = Number(product.price);

      return {
        id,
        productId: product.productId,
        name: product.name,
        unit: product.unit,
        price,
        quantity,
        subtotal: Math.round(price * quantity * 100) / 100
      };
    }
  );

  const total = Math.round(
    items.reduce((sum, item) => sum + item.subtotal, 0) * 100
  ) / 100;

  const now = new Date();

  const id =
    `DT-${limaOrderDate(now)}-${crypto.randomInt(10000, 100000)}`;

  return {
    id,
    receiptToken: crypto.randomBytes(24).toString("hex"),
    createdAt: now,
    customer: {
      fullName,
      documentType,
      documentNumber,
      phone,
      email
    },
    comprobante,
    deliveryType,
    deliveryAddress:
      deliveryType === "delivery"
        ? deliveryAddress
        : "Carlos Alvear, La Esperanza, Trujillo",
    paymentMethod,
    notes,
    items,
    total
  };
}

// ======================================
// CONSULTAR PRODUCTOS
// ======================================

async function getProducts(database) {
  const { filas } = await consultar(database, `
    SELECT
      productoid AS "productId",
      codigo AS id,
      nombre AS name,
      precio AS price,
      unidad AS unit
    FROM productos
    WHERE activo = TRUE
    ORDER BY productoid
  `);

  return filas.map((product) => ({
    ...product,
    price: Number(product.price)
  }));
}

// ======================================
// GUARDAR PEDIDO Y CLIENTE
// ======================================

async function saveOrder(database, order) {
  const ahora = order.createdAt.toISOString();
  const client = await database.connect();

  try {
    await client.query("BEGIN");

    const existente = await consultar(
      client,
      "SELECT clienteid AS \"ClienteId\" FROM clientes WHERE tipodocumento = $1 AND numerodocumento = $2",
      [order.customer.documentType, order.customer.documentNumber]
    );

    let customerId;

    if (existente.filas.length === 0) {
      const resultado = await client.query(
        `INSERT INTO clientes
           (tipodocumento, numerodocumento, nombrecompleto, celular, correo, fecharegistro)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING clienteid`,
        [
          order.customer.documentType,
          order.customer.documentNumber,
          order.customer.fullName,
          order.customer.phone,
          order.customer.email,
          ahora
        ]
      );

      customerId = resultado.rows[0].clienteid;
    } else {
      customerId = existente.filas[0].ClienteId;

      await client.query(
        `UPDATE clientes
         SET nombrecompleto = $1, celular = $2, correo = $3, fechaactualizacion = $4
         WHERE clienteid = $5`,
        [
          order.customer.fullName,
          order.customer.phone,
          order.customer.email,
          ahora,
          customerId
        ]
      );
    }

    const pedido = await client.query(
      `INSERT INTO pedidos
         (codigopedido, tokenconfirmacion, clienteid, nombrecliente,
          tipodocumentocliente, numerodocumentocliente, celularcliente,
          correocliente, tipocomprobante, tipoentrega, direccionentrega,
          metodopago, observaciones, estado, fecharegistro, total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'recibido', $14, $15)
       RETURNING pedidoid`,
      [
        order.id,
        order.receiptToken,
        customerId,
        order.customer.fullName,
        order.customer.documentType,
        order.customer.documentNumber,
        order.customer.phone,
        order.customer.email,
        order.comprobante,
        order.deliveryType,
        order.deliveryAddress,
        order.paymentMethod,
        order.notes || null,
        ahora,
        order.total
      ]
    );

    const pedidoId = pedido.rows[0].pedidoid;

    for (const item of order.items) {
      await client.query(
        `INSERT INTO detallepedido
           (pedidoid, productoid, codigoproducto, nombreproducto, unidad,
            preciounitario, cantidad, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pedidoId,
          item.productId,
          item.id,
          item.name,
          item.unit,
          item.price,
          item.quantity,
          item.subtotal
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // La transacción quizá ya se cerró.
    }

    throw error;
  } finally {
    client.release();
  }
}

// ======================================
// CONSULTAR PEDIDOS
// ======================================

async function getOrder(database, id, token) {
  const cabecera = await consultar(database, `
    SELECT pedidoid, codigopedido, fecharegistro, estado, tipocomprobante,
           tipoentrega, direccionentrega, metodopago, total,
           nombrecliente AS nombrecompleto
    FROM pedidos
    WHERE codigopedido = $1 AND tokenconfirmacion = $2
    LIMIT 1
  `, [id, token || ""]);

  const header = cabecera.filas[0];

  if (!header) return null;

  const { filas: items } = await consultar(database, `
    SELECT
      codigoproducto AS id,
      nombreproducto AS name,
      unidad AS unit,
      preciounitario AS price,
      cantidad AS quantity,
      subtotal AS subtotal
    FROM detallepedido
    WHERE pedidoid = $1
    ORDER BY pedidodetalleid
  `, [header.PedidoId]);

  return {
    id: header.CodigoPedido,
    createdAt: header.FechaRegistro,
    status: header.Estado,
    customer: {
      fullName: header.NombreCompleto
    },
    comprobante: header.TipoComprobante,
    delivery: {
      type: header.TipoEntrega,
      address: header.DireccionEntrega
    },
    paymentMethod: header.MetodoPago,
    total: Number(header.Total),
    items: items.map((item) => ({
      ...item,
      price: Number(item.price),
      subtotal: Number(item.subtotal)
    }))
  };
}


// ======================================
// MANEJO DE ERRORES
// ======================================

function databaseError(error) {
  if (error && error.status) {
    return {
      status: error.status,
      message: error.message
    };
  }

  console.error(
    "Error en la base de datos:",
    error && error.message ? error.message : "error desconocido"
  );

  return {
    status: 500,
    message:
      "No se pudo usar la base de datos." +
      (error && error.message ? ` Detalle: ${error.message}` : "")
  };
}

// ======================================
// ADMINISTRADOR (panel con contraseña)
// ======================================

const ESTADOS_PEDIDO = ["recibido", "preparando", "listo", "entregado", "cancelado"];
const SESION_ADMIN_MS = 8 * 60 * 60 * 1000;
const adminSesiones = new Map();
const adminIntentos = new Map();

function hashTexto(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest();
}

function claveAdminCorrecta(ingresada) {
  const real = process.env.ADMIN_PASSWORD || "";

  if (!real) return false;

  return crypto.timingSafeEqual(hashTexto(ingresada), hashTexto(real));
}

function adminAutorizado(request) {
  const cabecera = request.headers.authorization || "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  const vence = adminSesiones.get(token);

  if (!vence) return false;

  if (vence < Date.now()) {
    adminSesiones.delete(token);
    return false;
  }

  return true;
}

async function listarPedidosAdmin(database) {
  const { filas: pedidos } = await consultar(database, `
    SELECT pedidoid, codigopedido, fecharegistro, estado, nombrecliente,
           tipodocumentocliente, numerodocumentocliente, celularcliente,
           correocliente, tipocomprobante, tipoentrega, direccionentrega,
           metodopago, observaciones, total
    FROM pedidos
    ORDER BY pedidoid DESC
    LIMIT 200
  `);

  if (pedidos.length === 0) return [];

  const { filas: detalles } = await consultar(database, `
    SELECT pedidoid, nombreproducto, unidad, preciounitario, cantidad, subtotal
    FROM detallepedido
    WHERE pedidoid = ANY($1::int[])
    ORDER BY pedidodetalleid
  `, [pedidos.map((pedido) => pedido.PedidoId)]);

  const porPedido = new Map();

  for (const detalle of detalles) {
    if (!porPedido.has(detalle.PedidoId)) porPedido.set(detalle.PedidoId, []);

    porPedido.get(detalle.PedidoId).push({
      name: detalle.NombreProducto,
      unit: detalle.Unidad,
      price: Number(detalle.PrecioUnitario),
      quantity: Number(detalle.Cantidad),
      subtotal: Number(detalle.Subtotal)
    });
  }

  return pedidos.map((pedido) => ({
    id: pedido.CodigoPedido,
    createdAt: pedido.FechaRegistro,
    status: pedido.Estado,
    customer: {
      fullName: pedido.NombreCliente,
      documentType: pedido.TipoDocumentoCliente,
      documentNumber: pedido.NumeroDocumentoCliente,
      phone: pedido.CelularCliente,
      email: pedido.CorreoCliente
    },
    comprobante: pedido.TipoComprobante,
    delivery: {
      type: pedido.TipoEntrega,
      address: pedido.DireccionEntrega
    },
    paymentMethod: pedido.MetodoPago,
    notes: pedido.Observaciones || "",
    total: Number(pedido.Total),
    items: porPedido.get(pedido.PedidoId) || []
  }));
}

async function manejarAdmin(request, response, pathname) {
  try {
    // Iniciar sesión
    if (request.method === "POST" && pathname === "/api/admin/login") {
      if (!process.env.ADMIN_PASSWORD) {
        return sendJson(response, 503, {
          error: "El administrador no está configurado. Agrega ADMIN_PASSWORD en el archivo .env."
        });
      }

      const ip = request.socket.remoteAddress || "local";
      const registro = adminIntentos.get(ip) || { fallos: 0, hasta: 0 };

      if (registro.hasta > Date.now()) {
        return sendJson(response, 429, {
          error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo."
        });
      }

      const datos = await readJson(request);

      if (!claveAdminCorrecta(datos && datos.password)) {
        registro.fallos += 1;

        if (registro.fallos >= 5) {
          registro.fallos = 0;
          registro.hasta = Date.now() + 60 * 1000;
        }

        adminIntentos.set(ip, registro);

        return sendJson(response, 401, { error: "Contraseña incorrecta." });
      }

      adminIntentos.delete(ip);

      const token = crypto.randomBytes(32).toString("hex");
      adminSesiones.set(token, Date.now() + SESION_ADMIN_MS);

      return sendJson(response, 200, { token });
    }

    // Todo lo demás exige sesión iniciada
    if (!adminAutorizado(request)) {
      return sendJson(response, 401, { error: "Tu sesión terminó. Vuelve a ingresar." });
    }

    // Cerrar sesión
    if (request.method === "POST" && pathname === "/api/admin/logout") {
      const cabecera = request.headers.authorization || "";
      adminSesiones.delete(cabecera.slice(7));

      return sendJson(response, 200, { ok: true });
    }

    // Lista de pedidos
    if (request.method === "GET" && pathname === "/api/admin/orders") {
      const database = await getPool();

      return sendJson(response, 200, await listarPedidosAdmin(database));
    }

    // Cambiar el estado de un pedido
    const cambio = pathname.match(/^\/api\/admin\/orders\/([A-Za-z0-9-]+)\/status$/);

    if (request.method === "POST" && cambio) {
      const datos = await readJson(request);
      const estado = cleanText(datos && datos.status, 20).toLowerCase();

      if (!ESTADOS_PEDIDO.includes(estado)) {
        return sendJson(response, 400, { error: "Estado no válido." });
      }

      const database = await getPool();

      const resultado = await database.query(
        "UPDATE pedidos SET estado = $1 WHERE codigopedido = $2",
        [estado, cambio[1]]
      );

      if (resultado.rowCount === 0) {
        return sendJson(response, 404, { error: "No encontramos este pedido." });
      }

      return sendJson(response, 200, { id: cambio[1], status: estado });
    }

    return sendJson(response, 404, { error: "Ruta no encontrada." });

  } catch (error) {
    const falla = databaseError(error);

    return sendJson(response, falla.status, { error: falla.message });
  }
}

// ======================================
// RUTAS DE LA API
// ======================================

async function handleRequest(request, response) {
  const url = new URL(request.url.replace(/^\/{2,}/, "/"), "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  // Comprobar conexión
  if (
    request.method === "GET" &&
    pathname === "/api/health"
  ) {
    try {
      const pool = await getPool();

      await pool.query("SELECT 1");

      return sendJson(response, 200, {
        ok: true,
        database: "connected"
      });

    } catch (error) {
      const failure = databaseError(error);

      return sendJson(response, failure.status, {
        ok: false,
        database: "disconnected",
        error: failure.message
      });
    }
  }

  // Obtener productos
  if (
    request.method === "GET" &&
    pathname === "/api/products"
  ) {
    try {
      const pool = await getPool();

      const products = await getProducts(pool);

      return sendJson(
        response,
        200,
        products.map(({ productId, ...product }) => product)
      );

    } catch (error) {
      const failure = databaseError(error);

      return sendJson(response, failure.status, {
        error: failure.message
      });
    }
  }

  // Registrar pedido
  if (
    request.method === "POST" &&
    pathname === "/api/orders"
  ) {
    try {
      const payload = await readJson(request);

      const pool = await getPool();

      const products = await getProducts(pool);

      const order = normalizeOrder(payload, products);

      await saveOrder(pool, order);

      return sendJson(response, 201, {
        id: order.id,
        receiptToken: order.receiptToken
      });

    } catch (error) {
      const failure = databaseError(error);

      return sendJson(response, failure.status, {
        error: failure.message
      });
    }
  }

  // Consultar pedido
  const orderMatch = pathname.match(
    /^\/api\/orders\/([A-Za-z0-9-]+)$/
  );

  if (
    request.method === "GET" &&
    orderMatch
  ) {
    try {
      const pool = await getPool();

      const order = await getOrder(
        pool,
        orderMatch[1],
        url.searchParams.get("token")
      );

      if (!order) {
        return sendJson(response, 404, {
          error: "No encontramos este pedido."
        });
      }

      return sendJson(response, 200, order);

    } catch (error) {
      const failure = databaseError(error);

      return sendJson(response, failure.status, {
        error: failure.message
      });
    }
  }

  // Rutas del administrador
  if (pathname.startsWith("/api/admin/")) {
    return manejarAdmin(request, response, pathname);
  }

  // Métodos no permitidos
  if (
    request.method !== "GET" &&
    request.method !== "HEAD"
  ) {
    return sendJson(response, 405, {
      error: "Método no permitido."
    });
  }

  // ======================================
  // MOSTRAR ARCHIVOS HTML, CSS Y JS
  // ======================================

  const requestedPath =
    pathname === "/" ? "/index.html" : pathname;

  const fileName = requestedPath.slice(1);

  if (
    !STATIC_FILES.has(fileName) ||
    fileName.includes("/")
  ) {
    response.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8"
    });

    return response.end("Página no encontrada.");
  }

  const filePath = path.resolve(
    ROOT,
    `.${requestedPath.replaceAll("/", path.sep)}`
  );

  const relativePath = path.relative(ROOT, filePath);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    response.writeHead(403);

    return response.end("Acceso denegado.");
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
      });

      return response.end("Página no encontrada.");
    }

    response.writeHead(200, {
      "Content-Type":
        MIME_TYPES[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });

    if (request.method === "HEAD") {
      return response.end();
    }

    fs.createReadStream(filePath).pipe(response);
  });
}

// ======================================
// INICIAR SERVIDOR
// ======================================

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("Error del servidor:", error.message);

    if (!response.headersSent) {
      sendJson(response, 500, {
        error: "Ocurrió un error al procesar la solicitud."
      });
    } else {
      response.end();
    }
  });
});

server.listen(PORT, () => {
  console.log("-----------------------------------");
  console.log("       PANADERÍA DULCE TRIGO");
  console.log("-----------------------------------");
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log("Base de datos: PostgreSQL");
  getPool()
    .then(() => console.log("Base de datos lista."))
    .catch((error) => {
      console.error("No se pudo conectar a PostgreSQL:", error.message);
    });
});
