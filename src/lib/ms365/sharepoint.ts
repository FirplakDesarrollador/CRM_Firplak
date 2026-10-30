import "server-only";
import { createClient } from "@/lib/supabase/server";
import { graph, GraphError, type Connection } from "./graph";

export type SharePointSettings = { site_id: string; site_name: string; site_url?: string; drive_id: string; drive_name: string };
export type DriveItem = { id: string; name: string; size?: number; webUrl?: string; lastModifiedDateTime?: string; file?: object; folder?: { childCount?: number } };

export const FOLDER_ROOT = "CRM";
export const FOLDER_BY_OBJECT = { accounts: "Cuentas", opportunities: "Oportunidades" } as const;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Sitio y biblioteca de documentos elegidos por administración. */
export async function getSharePointSettings(): Promise<SharePointSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("integration_settings").select("value").eq("key", "sharepoint").maybeSingle();
  const v = (data?.value ?? null) as SharePointSettings | null;
  return v?.drive_id ? v : null;
}

export async function getRecordFolder(object: keyof typeof FOLDER_BY_OBJECT, recordId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("record_folders").select("drive_id, item_id, web_url").eq("object", object).eq("record_id", recordId).maybeSingle();
  return data;
}

export async function searchSites(conn: Connection, q: string) {
  const { value } = await graph<{ value: { id: string; displayName: string; webUrl: string }[] }>(conn, `/sites?search=${encodeURIComponent(q)}`);
  return value;
}

export async function listDrives(conn: Connection, siteId: string) {
  const { value } = await graph<{ value: { id: string; name: string; webUrl?: string }[] }>(conn, `/sites/${siteId}/drives`);
  return value;
}

/** Nombre válido en SharePoint: sin " * : < > ? / \ | # %, ni puntos o espacios al final. */
export const safeName = (name: string) =>
  name.replace(/["*:<>?/\\|#%]/g, "-").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").slice(0, 100) || "Sin nombre";

/** Crea (si no existe) cada carpeta del camino y devuelve la última. */
async function ensurePath(conn: Connection, driveId: string, segments: string[]) {
  let parent: DriveItem = { id: "root", name: "" };
  const done: string[] = [];
  for (const segment of segments) {
    done.push(segment);
    try {
      parent = await graph<DriveItem>(conn, `/drives/${driveId}/root:/${done.map(encodeURIComponent).join("/")}`);
    } catch (e) {
      if (!(e instanceof GraphError && e.status === 404)) throw e;
      parent = await graph<DriveItem>(conn, `/drives/${driveId}/items/${parent.id}/children`, {
        method: "POST", body: { name: segment, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
      });
    }
  }
  return parent;
}

/** Carpeta del registro en la biblioteca de la empresa: CRM/Cuentas/<nombre> o CRM/Oportunidades/<nombre>. */
export async function createRecordFolder(conn: Connection, sp: SharePointSettings, object: keyof typeof FOLDER_BY_OBJECT, recordId: string, recordName: string) {
  const folder = await ensurePath(conn, sp.drive_id, [FOLDER_ROOT, FOLDER_BY_OBJECT[object], safeName(recordName)]);
  const supabase = await createClient();
  const { error } = await supabase.from("record_folders").insert({
    object, record_id: recordId, drive_id: sp.drive_id, item_id: folder.id, web_url: folder.webUrl ?? null, created_by: conn.user_id,
  });
  if (error) throw new Error(error.message);
  return folder;
}

export async function listFolder(conn: Connection, driveId: string, itemId: string) {
  const { value } = await graph<{ value: DriveItem[] }>(conn,
    `/drives/${driveId}/items/${itemId}/children?$select=id,name,size,webUrl,lastModifiedDateTime,file,folder&$orderby=name`);
  return value;
}

export async function uploadToFolder(conn: Connection, driveId: string, itemId: string, file: File) {
  return graph<DriveItem>(conn, `/drives/${driveId}/items/${itemId}:/${encodeURIComponent(safeName(file.name))}:/content`, {
    method: "PUT", raw: await file.arrayBuffer(), contentType: file.type || "application/octet-stream",
  });
}
