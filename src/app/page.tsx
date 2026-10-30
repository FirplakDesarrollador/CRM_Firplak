import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

const HOME_PAGES = ["/inicio", "/oportunidades/pipeline", "/indicadores", "/actividades", "/cuentas", "/oportunidades"];

export default async function Root() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const home = user.preferences.home_page;
  redirect(HOME_PAGES.includes(home) ? home : "/inicio");
}
