#!/usr/bin/env node
// Agente de sincronización SAP Business One → Firplak CRM.
//
// Corre en un equipo DENTRO de la red de Firplak (el Service Layer no responde desde internet).
// Lee de SAP, solo lectura, la cartera, los pedidos abiertos y las facturas de los clientes vinculados
// en el CRM por su Código SAP, y el inventario de los productos activos; lo deja en las tablas sap_*
// del CRM con un usuario técnico que solo puede hacer eso. Nunca escribe en SAP.
//
// Uso:  node agente-sap/agente.mjs <correr|probar|instalar|desinstalar|estado> [--ahora]
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
const PLIST = join(homedir(), "Library", "LaunchAgents", `${ETIQUETA}.plist`);
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
const DOCUMENTO = { $select: "DocEntry,DocNum,DocDate,DocDueDate,DocTotal,PaidToDate,DocCurrency,DocumentStatus,Cancelled,NumAtCard", $orderby: "DocDate desc", $top: "10" };
const ARTICULO = "ItemCode,ItemName,QuantityOnStock,QuantityOrderedByCustomers,QuantityOrderedFromVendors,SalesUnit,ItemPrices,ItemWarehouseInfoCollection";

/** Cartera, pedidos abiertos y facturas recientes de un cliente. Nulo si el código no existe en SAP. */
async function cliente(sap, codigo) {
  const partner = await sap.get(`BusinessPartners(${encodeURIComponent(comillas(codigo))})?$select=${SOCIO}`);
  if (!partner) return null;
  const c = comillas(codigo);
  const orders = await sap.get(q("Orders", { $filter: `CardCode eq ${c} and DocumentStatus eq 'bost_Open'`, ...DOCUMENTO }));
  const invoices = await sap.get(q("Invoices", { $filter: `CardCode eq ${c} and Cancelled eq 'tNO'`, ...DOCUMENTO }));
  return { partner, orders: orders?.value ?? [], invoices: invoices?.value ?? [] };
}

/** Inventario y precios de un lote de artículos (hasta 20 por consulta: las URL largas fallan). */
async function articulos(sap, codigos) {
  const filas = await sap.lista(q("Items", { $filter: codigos.map((c) => `ItemCode eq ${comillas(c)}`).join(" or "), $select: ARTICULO }));
  const porCodigo = new Map(filas.map((f) => [f.ItemCode, f]));
  return codigos.map((code) => ({ code, data: porCodigo.get(code) ?? null }));
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

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const launchctl = (...args) => execFileSync("/bin/launchctl", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
const dominio = () => `gui/${process.getuid()}`;

function instalar() {
  if (process.platform !== "darwin") throw new Error("La instalación automática es para macOS.");
  leerConfig();
  const horarios = [1, 2, 3, 4, 5].flatMap((dia) => HORAS.map((hora) => `      <dict><key>Weekday</key><integer>${dia}</integer><key>Hour</key><integer>${hora}</integer><key>Minute</key><integer>0</integer></dict>`)).join("\n");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${ETIQUETA}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(resolve(AQUI, "agente.mjs"))}</string>
    <string>correr</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(resolve(AQUI, ".."))}</string>
  <key>StartCalendarInterval</key>
  <array>
${horarios}
  </array>
  <key>StandardOutPath</key><string>${xml(REGISTRO)}</string>
  <key>StandardErrorPath</key><string>${xml(REGISTRO)}</string>
</dict>
</plist>
`;
  mkdirSync(dirname(PLIST), { recursive: true });
  writeFileSync(PLIST, plist);
  try { launchctl("bootout", `${dominio()}/${ETIQUETA}`); } catch { /* no estaba cargado */ }
  launchctl("bootstrap", dominio(), PLIST);
  log(`Instalado: correrá de lunes a viernes a las ${HORAS.join(", ")} horas. Registro: ${REGISTRO}`);
  return 0;
}

function desinstalar() {
  try { launchctl("bootout", `${dominio()}/${ETIQUETA}`); } catch { /* no estaba cargado */ }
  rmSync(PLIST, { force: true });
  log("Desinstalado: ya no corre solo.");
  return 0;
}

function estado() {
  let cargado = false;
  try { launchctl("print", `${dominio()}/${ETIQUETA}`); cargado = true; } catch { /* no cargado */ }
  log(cargado ? `Instalado: lunes a viernes a las ${HORAS.join(", ")} horas.` : "No está instalado para correr solo.");
  log(`Configuración: ${CONFIG_PATH} ${existsSync(CONFIG_PATH) ? "(existe)" : "(falta)"} · Registro: ${REGISTRO}`);
  return 0;
}

const [comando = "", ...resto] = process.argv.slice(2);
const comandos = { correr: () => correr({ ahora: resto.includes("--ahora") }), probar, instalar, desinstalar, estado };
if (!comandos[comando]) {
  console.log("Uso: node agente-sap/agente.mjs <correr|probar|instalar|desinstalar|estado> [--ahora]");
  process.exit(2);
}
try {
  process.exit(await comandos[comando]());
} catch (e) {
  log("ERROR", e.message);
  process.exit(1);
}
