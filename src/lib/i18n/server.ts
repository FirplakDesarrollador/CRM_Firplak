import "server-only";
import { cache } from "react";
import { getCurrentUser } from "@/lib/session";
import { makeT, type Locale } from "./index";

export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser();
  return user?.preferences.language === "en" ? "en" : "es";
});

export async function getT() {
  return makeT(await getLocale());
}
