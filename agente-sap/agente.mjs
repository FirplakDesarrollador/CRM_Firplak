#!/usr/bin/env node
// Agente de sincronización SAP Business One → Firplak CRM.
//
// Corre en un equipo DENTRO de la red de Firplak (el Service Layer no responde desde internet).
// Lee de SAP, solo lectura, la cartera, los pedidos abiertos y las facturas de los clientes vinculados
// en el CRM por su Código SAP, y el inventario de los productos activos; lo deja en las tablas sap_*
// del CRM con un usuario técnico que solo puede hacer eso. Nunca escribe en SAP.
//
// Uso:  node agente-sap/agente.mjs <correr|atender|probar|muestra|instalar|desinstalar|estado> [--ahora]
// Guía: agente-sap/LEEME.md
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { homedir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.AGENTE_SAP_CONFIG ?? join(homedir(), ".firplak-crm", "agente-sap.json");
const LLAVERO = "firplak-crm-agente-sap";
const ETIQUETA = "com.firplak.crm.agente-sap";
const REGISTRO = join(homedir(), "Library", "Logs", "Firplak CRM agente SAP.log");
// Lunes a viernes, cada dos horas dentro del horario laboral (7:00 a 17:30, hora del equipo).
const HORAS = [7, 9, 11, 13, 15, 17];

const log = (...a) => console.log(new Date().toISOString(), ...a);

function leerConfig() {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Falta el archivo de configuración ${CONFIG_PATH}. Copia agente-sap/config.ejemplo.json ahí y complétalo.`);
  }
  const c = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  for (const k of ["sapUrl", "sapCompanyDb", "sapUser", "crmUrl", "crmAnonKey", "crmUser"]) {
    if (!c[k]) throw new Error(`Falta «${k}» en ${CONFIG_PATH}`);
  }
  return { ...c, sapUrl: String(c.sapUrl).replace(/\/$/, "") };
}

/** Contraseñas: del Llavero de macOS; nunca de un archivo. (Variables de entorno solo para pruebas.) */
function clave(cuenta, variable) {
  if (process.env[variable]) return process.env[variable];
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", LLAVERO, "-a", cuenta, "-w"], { encoding: "utf8" }).replace(/\n$/, "");
  } catch {
    throw new Error(`No encontré la contraseña «${cuenta}» en el Llavero (servicio ${LLAVERO}). Mira agente-sap/LEEME.md.`);
  }
}

// ---------------------------------------------------------------- SAP (Service Layer)
class Sap {
  constructor(cfg) {
    this.cfg = cfg;
    this.base = new URL(cfg.sapUrl);
    this.cookie = null;
  }

  /** Petición al Service Layer. El certificado autofirmado se acepta solo aquí, para este host. */
  pedir(method, path, body) {
    const url = new URL(path.startsWith("http") ? path : `${this.cfg.sapUrl}/${path.replace(/^\//, "")}`);
    if (url.host !== this.base.host) throw new Error(`Destino inesperado: ${url.host}`);
    const lib = url.protocol === "https:" ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((ok, mal) => {
      const req = lib.request(url, {
        method,
        timeout: 60_000,
        ...(url.protocol === "https:" ? { rejectUnauthorized: this.cfg.sapCertificadoAutofirmado !== true } : {}),
        headers: {
          Prefer: "odata.maxpagesize=500",
          ...(this.cookie ? { Cookie: this.cookie } : {}),
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      }, (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (texto += c));
        res.on("end", () => {
          let json = {};
          try { json = texto ? JSON.parse(texto) : {}; } catch { /* respuesta sin JSON */ }
          ok({ status: res.statusCode ?? 0, json, headers: res.headers });
        });
      });
      req.on("timeout", () => req.destroy(new Error("SAP no respondió a tiempo")));
      req.on("error", mal);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async login() {
    const r = await this.pedir("POST", "Login", { CompanyDB: this.cfg.sapCompanyDb, UserName: this.cfg.sapUser, Password: clave("sap", "AGENTE_SAP_PASSWORD") });
    if (r.status !== 200 || !r.json.SessionId) throw new Error(r.json?.error?.message?.value ?? `SAP no aceptó el inicio de sesión (${r.status})`);
    const ruta = (r.headers["set-cookie"] ?? []).join(";").match(/ROUTEID=([^;]+)/)?.[1];
    this.cookie = `B1SESSION=${r.json.SessionId}${ruta ? `; ROUTEID=${ruta}` : ""}`;
  }

  async logout() {
    if (!this.cookie) return;
    await this.pedir("POST", "Logout").catch(() => {});
    this.cookie = null;
  }

  /** GET con una sola sesión compartida; ante un 401 vuelve a entrar y reintenta una vez. */
  async get(path, reintento = true) {
    if (!this.cookie) await this.login();
    const r = await this.pedir("GET", path);
    if (r.status === 401 && reintento) {
      this.cookie = null;
      return this.get(path, false);
    }
    if (r.status === 404) return null;
    if (r.status < 200 || r.status >= 300) throw new Error(r.json?.error?.message?.value ?? `SAP respondió ${r.status}`);
    return r.json;
  }

  /** Todas las páginas de una lista. */
  async lista(path) {
    const filas = [];
    let siguiente = path;
    while (siguiente) {
      const pagina = await this.get(siguiente);
      filas.push(...(pagina?.value ?? []));
      siguiente = pagina?.["odata.nextLink"] ?? null;
    }
    return filas;
  }
}

const comillas = (v) => `'${String(v).replace(/'/g, "''")}'`;
const lotes = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
const q = (path, params) => `${path}?${Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;

const SOCIO = "CardCode,CardName,FederalTaxID,Phone1,EmailAddress,CurrentAccountBalance,OpenOrdersBalance,OpenDeliveryNotesBalance,CreditLimit";
// «PaidToDate» solo existe en las facturas: SAP rechaza la consulta de pedidos si se le pide.
const CAMPOS_DOC = "DocEntry,DocNum,DocDate,DocDueDate,DocTotal,DocCurrency,DocumentStatus,Cancelled,NumAtCard";
const MAX_DOCS = 500;
const documento = (extra = "") => ({ $select: CAMPOS_DOC + extra, $orderby: "DocDate desc", $top: "10" });
const ARTICULO = "ItemCode,ItemName,QuantityOnStock,QuantityOrderedByCustomers,QuantityOrderedFromVendors,SalesUnit,ItemPrices,ItemWarehouseInfoCollection";

const num = (v) => Number(v) || 0;
const dia = (v) => (v ? String(v).slice(0, 10) : null);

/** Posición de la línea del pedido escrita en el lote de la orden de fabricación (número entre el 1.º y el 2.º guion, menos 1). */
function posicionDeLote(lote) {
  if (!lote) return 0;
  const texto = String(lote);
  const p1 = texto.indexOf("-");
  const n = texto.split("-").length - 1 >= 2
    ? parseInt(texto.slice(p1 + 1, texto.indexOf("-", p1 + 1)), 10)
    : parseInt(texto.slice(p1 >= 0 ? p1 + 1 : 0).slice(0, 2), 10);
  return Number.isFinite(n) ? n - 1 : 0;
}

/**
 * Lo que producción ya entregó a despacho por línea de pedido, como el «Visor OV» de SAP: suma de lo
 * terminado en las órdenes de fabricación del pedido (se emparejan por artículo y posición del lote).
 */
async function terminadoPorLinea(sap, pedidos) {
  const terminado = new Map();
  for (const lote of lotes(pedidos.map((p) => p.DocNum), 20)) {
    const ofs = await sap.lista(q("ProductionOrders", {
      $select: "ItemNo,ProductionOrderStatus,CompletedQuantity,ProductionOrderOriginNumber,U_NumLote",
      $filter: lote.map((n) => `ProductionOrderOriginNumber eq ${n}`).join(" or "),
    }));
    for (const o of ofs) {
      if (o.ProductionOrderStatus === "boposCancelled") continue;
      const clave = `${o.ProductionOrderOriginNumber}|${o.ItemNo}|${posicionDeLote(o.U_NumLote)}`;
      terminado.set(clave, (terminado.get(clave) ?? 0) + num(o.CompletedQuantity));
    }
  }
  return terminado;
}

/** Líneas de un pedido: pedida, facturada, en despacho y fecha plan de despacho. */
function lineasDePedido(pedido, terminado) {
  return (pedido.DocumentLines ?? []).map((ln) => {
    const pos = ln.VisualOrder ?? ln.LineNum ?? 0;
    const pedida = num(ln.Quantity);
    const facturada = pedida - num(ln.RemainingOpenQuantity);
    const bodega = ln.WarehouseCode ?? "";
    const toc = String(ln.U_TipoTOC ?? "").toUpperCase();
    // Igual que el Visor OV: lo fabricado sale de las órdenes de fabricación; lo que no se fabrica contra pedido
    // (otras bodegas) ya está en despacho. Los artículos de compra (PTO) no se calculan aquí.
    let disponible = facturada;
    let calculado = true;
    if (bodega === "PT-02" && (toc.includes("MTO") || toc.includes("MTS"))) disponible = terminado.get(`${pedido.DocNum}|${ln.ItemCode}|${pos}`) ?? facturada;
    else if (bodega === "PT-02" && toc.includes("PTO")) calculado = false;
    else if (bodega !== "PT-02") disponible = pedida;
    return {
      Line: pos + 1, ItemCode: ln.ItemCode, ItemDescription: ln.ItemDescription, Quantity: pedida, Invoiced: facturada,
      InDispatch: calculado ? Math.max(0, disponible - facturada) : null,
      ShipDate: dia(ln.ShipDate), ClientDate: dia(ln.U_Fecha_Plan_Ent_Cli_Linea), Open: ln.LineStatus === "bost_Open", LineTotal: num(ln.LineTotal),
    };
  }).sort((a, b) => a.Line - b.Line);
}

/** Cartera, pedidos abiertos con sus líneas, entregas sin facturar y facturas de un cliente. Nulo si el código no existe en SAP. */
async function cliente(sap, codigo) {
  const partner = await sap.get(`BusinessPartners(${encodeURIComponent(comillas(codigo))})?$select=${SOCIO}`);
  if (!partner) return null;
  const c = comillas(codigo);
  const todos = { $select: `${CAMPOS_DOC},VatSum`, $orderby: "DocDate desc" };
  // Todos los pedidos abiertos, con sus líneas (cada pedido puede despacharse en varias fechas).
  const pedidos = (await sap.lista(q("Orders", { ...todos, $select: `${CAMPOS_DOC},VatSum,DocumentLines`, $filter: `CardCode eq ${c} and DocumentStatus eq 'bost_Open'` }))).slice(0, MAX_DOCS);
  const terminado = await terminadoPorLinea(sap, pedidos);
  const orders = pedidos.map(({ DocumentLines, ...p }) => {
    const Lines = lineasDePedido({ ...p, DocumentLines }, terminado);
    const pendientes = Lines.filter((l) => l.Open && l.ShipDate).map((l) => l.ShipDate).sort();
    return { ...p, NextShipDate: pendientes[0] ?? null, Lines };
  });
  // Entregas hechas que todavía no se facturan.
  const deliveries = await sap.lista(q("DeliveryNotes", { ...todos, $filter: `CardCode eq ${c} and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'` }));
  // Todas las facturas abiertas (para que el vencido sea exacto) y las diez más recientes.
  const abiertas = await sap.lista(q("Invoices", { ...todos, $select: `${CAMPOS_DOC},VatSum,PaidToDate`, $filter: `CardCode eq ${c} and DocumentStatus eq 'bost_Open' and Cancelled eq 'tNO'` }));
  const recientes = await sap.get(q("Invoices", { $filter: `CardCode eq ${c} and Cancelled eq 'tNO'`, ...documento(",VatSum,PaidToDate") }));
  const porEntrada = new Map([...abiertas, ...(recientes?.value ?? [])].map((d) => [d.DocEntry, d]));
  const invoices = [...porEntrada.values()].sort((a, b) => String(b.DocDate).localeCompare(String(a.DocDate)));
  return { partner, orders, deliveries: deliveries.slice(0, MAX_DOCS), invoices: invoices.slice(0, MAX_DOCS) };
}

/** Inventario y precios de un lote de artículos (hasta 20 por consulta: las URL largas fallan). */
async function articulos(sap, codigos) {
  const filas = await sap.lista(q("Items", { $filter: codigos.map((c) => `ItemCode eq ${comillas(c)}`).join(" or "), $select: ARTICULO }));
  const porCodigo = new Map(filas.map((f) => [f.ItemCode, f]));
  // SAP trae todas las bodegas y listas de precios (decenas, casi todas en cero): se guardan solo las que tienen algo.
  const liviano = (f) => ({
    ...f,
    ItemPrices: (f.ItemPrices ?? []).filter((p) => p.Price > 0).map(({ PriceList, PriceListName, Price, Currency }) => ({ PriceList, PriceListName, Price, Currency })),
    ItemWarehouseInfoCollection: (f.ItemWarehouseInfoCollection ?? []).filter((w) => w.InStock || w.Committed || w.Ordered)
      .map(({ WarehouseCode, InStock, Committed, Ordered }) => ({ WarehouseCode, InStock, Committed, Ordered })),
  });
  return codigos.map((code) => ({ code, data: porCodigo.has(code) ? liviano(porCodigo.get(code)) : null }));
}

// ---------------------------------------------------------------- CRM (Supabase)
async function crm(cfg) {
  const db = createClient(cfg.crmUrl, cfg.crmAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword({ email: cfg.crmUser, password: clave("crm", "AGENTE_CRM_PASSWORD") });
  if (error) throw new Error(`El CRM no aceptó al usuario del agente: ${error.message}`);
  const rpc = async (fn, args) => {
    const { data, error: e } = await db.rpc(fn, args);
    if (e) throw new Error(`CRM (${fn}): ${e.message}`);
    return data;
  };
  return { rpc, salir: () => db.auth.signOut().catch(() => {}) };
}

// ---------------------------------------------------------------- Comandos
function enHorario(d = new Date()) {
  const dia = d.getDay();
  const minutos = d.getHours() * 60 + d.getMinutes();
  return dia >= 1 && dia <= 5 && minutos >= 7 * 60 - 5 && minutos <= 17 * 60 + 30;
}

async function correr({ ahora }) {
  if (!ahora && !enHorario()) {
    log("Fuera del horario (lunes a viernes, 7:00 a 17:30): no se sincroniza. Usa --ahora para forzarlo.");
    return 0;
  }
  const cfg = leerConfig();
  const sap = new Sap(cfg);
  const destino = await crm(cfg);
  const errores = [];
  const anotar = (donde, e) => { errores.push({ donde, error: String(e?.message ?? e).slice(0, 300) }); log("ERROR", donde, e?.message ?? e); };
  const corrida = await destino.rpc("sap_agent_start", { p_host: hostname() });
  let nClientes = 0, nArticulos = 0;
  try {
    const { card_codes: clientes = [], item_codes: productos = [] } = await destino.rpc("sap_agent_targets");
    log(`Corrida ${corrida}: ${clientes.length} clientes y ${productos.length} productos por leer`);
    await sap.login();

    for (const lote of lotes(clientes, 25)) {
      const filas = [];
      for (const code of lote) {
        try { filas.push({ code, data: await cliente(sap, code) }); } catch (e) { anotar(`cliente ${code}`, e); }
      }
      if (filas.length) nClientes += await destino.rpc("sap_agent_save", { p_kind: "partners", p_rows: filas });
    }
    for (const lote of lotes(productos, 20)) {
      try {
        nArticulos += await destino.rpc("sap_agent_save", { p_kind: "items", p_rows: await articulos(sap, lote) });
      } catch (e) { anotar(`artículos ${lote[0]}…`, e); }
    }
  } catch (e) {
    anotar("corrida", e);
  } finally {
    await sap.logout();
    await destino.rpc("sap_agent_finish", { p_run: corrida, p_partners: nClientes, p_items: nArticulos, p_errors: errores.slice(0, 50) }).catch((e) => log("ERROR al cerrar la corrida", e.message));
    await destino.salir();
  }
  log(`Listo: ${nClientes} clientes y ${nArticulos} productos actualizados, ${errores.length} errores`);
  return errores.length ? 1 : 0;
}

/** Comprueba las dos conexiones sin guardar nada. */
async function probar() {
  const cfg = leerConfig();
  const sap = new Sap(cfg);
  await sap.login();
  const uno = await sap.get("BusinessPartners?$select=CardCode&$top=1");
  await sap.logout();
  log(`SAP: conexión correcta (${cfg.sapCompanyDb}, usuario ${cfg.sapUser}); lectura de clientes ${uno?.value?.length ? "correcta" : "sin filas"}`);
  const destino = await crm(cfg);
  const { card_codes: clientes, item_codes: productos } = await destino.rpc("sap_agent_targets");
  await destino.salir();
  log(`CRM: conexión correcta; ${clientes.length} clientes con Código SAP y ${productos.length} productos activos`);
  return 0;
}

/** Lee de SAP un cliente y un artículo y dice qué campos llegaron, sin guardar nada ni mostrar valores. */
async function muestra([codigo, articulo]) {
  const sap = new Sap(leerConfig());
  await sap.login();
  try {
    // Sin código: un cliente que tenga un pedido abierto, para ver también los documentos.
    const code = codigo ?? (await sap.get("Orders?$select=CardCode&$filter=DocumentStatus eq 'bost_Open'&$orderby=DocEntry desc&$top=1"))?.value?.[0]?.CardCode;
    const c = code ? await cliente(sap, code) : null;
    if (!c) log(`Cliente ${code ?? "(ninguno)"}: no existe en SAP`);
    else {
      log(`Cliente ${code}: campos ${Object.keys(c.partner).join(", ")}`);
      log(`  pedidos abiertos: ${c.orders.length}${c.orders[0] ? ` (campos ${Object.keys(c.orders[0]).join(", ")})` : ""}`);
      log(`  líneas del primer pedido: ${c.orders[0]?.Lines?.length ?? 0}${c.orders[0]?.Lines?.[0] ? ` (campos ${Object.keys(c.orders[0].Lines[0]).join(", ")})` : ""}`);
      log(`  entregas sin facturar: ${c.deliveries.length}`);
      log(`  facturas: ${c.invoices.length}${c.invoices[0] ? ` (campos ${Object.keys(c.invoices[0]).join(", ")})` : ""}`);
    }
    const item = articulo ?? (await sap.get("Items?$select=ItemCode&$filter=SalesItem eq 'tYES'&$top=1"))?.value?.[0]?.ItemCode;
    const [a] = item ? await articulos(sap, [item]) : [];
    if (!a?.data) log(`Artículo ${item ?? "(ninguno)"}: no existe en SAP`);
    else log(`Artículo ${item}: campos ${Object.keys(a.data).join(", ")} · bodegas ${a.data.ItemWarehouseInfoCollection?.length ?? 0} · listas de precios ${a.data.ItemPrices?.length ?? 0}`);
  } finally {
    await sap.logout();
  }
  return 0;
}

// ---------------------------------------------------------------- Solicitudes a demanda
const CAMPO_SAP = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
const MAX_IMPORTAR = 5000;

/** Valor de SAP convertido al tipo del campo personalizado del CRM. */
function convertir(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (["number", "currency", "percent"].includes(tipo)) return Number.isFinite(Number(valor)) ? Number(valor) : null;
  if (tipo === "checkbox") return valor === true || valor === "tYES" || valor === "Y" || valor === 1;
  return String(valor);
}

/** Artículos de SAP según el filtro de la solicitud (prefijo, solo de venta) con los campos mapeados. */
async function articulosParaImportar(sap, params, limite) {
  const mapeos = (params.mappings ?? []).filter((m) => m?.field && CAMPO_SAP.test(m.sap_field ?? ""));
  const filtros = [
    params.sales_only ? "SalesItem eq 'tYES'" : null,
    String(params.prefix ?? "").trim() ? `startswith(ItemCode,${comillas(String(params.prefix).trim())})` : null,
  ].filter(Boolean);
  const consulta = {
    $select: [...new Set(["ItemCode", "ItemName", ...mapeos.map((m) => m.sap_field)])].join(","),
    ...(filtros.length ? { $filter: filtros.join(" and ") } : {}),
    $orderby: "ItemCode",
    ...(limite < 50 ? { $top: String(limite) } : {}),
  };
  const filas = [];
  let siguiente = q("Items", consulta);
  while (siguiente && filas.length < limite) {
    const pagina = await sap.get(siguiente);
    filas.push(...(pagina?.value ?? []));
    siguiente = pagina?.["odata.nextLink"] ?? null;
  }
  return { filas: filas.slice(0, limite), mapeos };
}

async function atenderUna(sap, destino, solicitud) {
  const { kind, params = {} } = solicitud;
  if (kind === "product_preview") {
    const { filas, mapeos } = await articulosParaImportar(sap, params, 10);
    const columns = ["ItemCode", "ItemName", ...mapeos.map((m) => m.sap_field)];
    return { columns, rows: filas.map((f) => Object.fromEntries(columns.map((c) => [c, f[c] ?? null]))) };
  }
  if (kind === "product_import") {
    const { filas, mapeos } = await articulosParaImportar(sap, params, MAX_IMPORTAR);
    let created = 0, updated = 0;
    const errors = [];
    for (const lote of lotes(filas, 200)) {
      const rows = lote.map((f) => ({ code: f.ItemCode, name: f.ItemName ?? "", custom: Object.fromEntries(mapeos.map((m) => [m.field, convertir(f[m.sap_field], m.type)])) }));
      try {
        const r = await destino.rpc("sap_agent_import_products", { p_rows: rows });
        created += r.created; updated += r.updated;
      } catch (e) { errors.push(`${lote[0].ItemCode}…: ${String(e.message).slice(0, 200)}`); }
    }
    return { total: filas.length, created, updated, errors: errors.slice(0, 10) };
  }
  throw new Error(`Solicitud desconocida: ${kind}`);
}

/** Atiende las solicitudes pendientes del CRM (vista previa e importación de productos) y termina. */
async function atender() {
  const cfg = leerConfig();
  const destino = await crm(cfg);
  const sap = new Sap(cfg);
  let n = 0;
  try {
    for (;;) {
      const solicitud = await destino.rpc("sap_agent_next_request");
      if (!solicitud) break;
      n++;
      log(`Solicitud ${solicitud.id} (${solicitud.kind})`);
      let resultado = null, error = null;
      try { resultado = await atenderUna(sap, destino, solicitud); } catch (e) { error = String(e?.message ?? e); log("ERROR", error); }
      await destino.rpc("sap_agent_finish_request", { p_id: solicitud.id, p_result: resultado, p_error: error });
    }
  } finally {
    await sap.logout();
    await destino.salir();
  }
  if (n) log(`${n} solicitudes atendidas`);
  return 0;
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const launchctl = (...args) => execFileSync("/bin/launchctl", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const dominio = () => `gui/${process.getuid()}`;

const SOLICITUDES = `${ETIQUETA}.solicitudes`;
const plistDe = (etiqueta) => join(homedir(), "Library", "LaunchAgents", `${etiqueta}.plist`);

function plist(etiqueta, comando, programacion) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${etiqueta}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(resolve(AQUI, "agente.mjs"))}</string>
    <string>${comando}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(resolve(AQUI, ".."))}</string>
${programacion}
  <key>StandardOutPath</key><string>${xml(REGISTRO)}</string>
  <key>StandardErrorPath</key><string>${xml(REGISTRO)}</string>
</dict>
</plist>
`;
}

function cargar(etiqueta, contenido) {
  mkdirSync(dirname(plistDe(etiqueta)), { recursive: true });
  writeFileSync(plistDe(etiqueta), contenido);
  try { launchctl("bootout", `${dominio()}/${etiqueta}`); } catch { /* no estaba cargado */ }
  launchctl("bootstrap", dominio(), plistDe(etiqueta));
}

function instalar() {
  if (process.platform !== "darwin") throw new Error("La instalación automática es para macOS.");
  leerConfig();
  const horarios = [1, 2, 3, 4, 5].flatMap((dia) => HORAS.map((hora) => `      <dict><key>Weekday</key><integer>${dia}</integer><key>Hour</key><integer>${hora}</integer><key>Minute</key><integer>0</integer></dict>`)).join("\n");
  // Sincronización de cartera, pedidos e inventario: lunes a viernes, cada dos horas.
  cargar(ETIQUETA, plist(ETIQUETA, "correr", `  <key>StartCalendarInterval</key>\n  <array>\n${horarios}\n  </array>`));
  // Solicitudes del CRM (importar productos): se revisan cada minuto, todos los días.
  cargar(SOLICITUDES, plist(SOLICITUDES, "atender", "  <key>StartInterval</key><integer>60</integer>"));
  log(`Instalado: sincroniza de lunes a viernes a las ${HORAS.join(", ")} horas y revisa las solicitudes del CRM cada minuto. Registro: ${REGISTRO}`);
  return 0;
}

function desinstalar() {
  for (const etiqueta of [ETIQUETA, SOLICITUDES]) {
    try { launchctl("bootout", `${dominio()}/${etiqueta}`); } catch { /* no estaba cargado */ }
    rmSync(plistDe(etiqueta), { force: true });
  }
  log("Desinstalado: ya no corre solo.");
  return 0;
}

function estado() {
  const cargado = (etiqueta) => { try { launchctl("print", `${dominio()}/${etiqueta}`); return true; } catch { return false; } };
  log(cargado(ETIQUETA) ? `Sincronización instalada: lunes a viernes a las ${HORAS.join(", ")} horas.` : "La sincronización no está instalada para correr sola.");
  log(cargado(SOLICITUDES) ? "Solicitudes del CRM: se revisan cada minuto." : "Las solicitudes del CRM no se están revisando (falta instalar).");
  log(`Configuración: ${CONFIG_PATH} ${existsSync(CONFIG_PATH) ? "(existe)" : "(falta)"} · Registro: ${REGISTRO}`);
  return 0;
}

const [comando = "", ...resto] = process.argv.slice(2);
const comandos = { correr: () => correr({ ahora: resto.includes("--ahora") }), probar, muestra: () => muestra(resto), atender, instalar, desinstalar, estado };
if (!comandos[comando]) {
  console.log("Uso: node agente-sap/agente.mjs <correr|atender|probar|muestra|instalar|desinstalar|estado> [--ahora]");
  process.exit(2);
}
try {
  process.exit(await comandos[comando]());
} catch (e) {
  log("ERROR", e.message);
  process.exit(1);
}
