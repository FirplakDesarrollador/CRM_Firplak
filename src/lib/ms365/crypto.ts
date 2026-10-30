import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ms365 } from "./config";

// AES-256-GCM: iv.tag.datos en base64url. La clave (32 bytes en base64) vive solo en el servidor.
function key() {
  const k = Buffer.from(ms365.encryptionKey, "base64");
  if (k.length !== 32) throw new Error("MS365_ENCRYPTION_KEY debe ser de 32 bytes en base64");
  return k;
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string) {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
