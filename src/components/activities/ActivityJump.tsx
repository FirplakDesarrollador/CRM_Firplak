import { CalendarPlus } from "lucide-react";
import { Tr } from "@/components/ui/Tr";

/**
 * En el celular y la tableta el panel de actividad queda al final de la ficha: este enlace lleva directo a
 * registrar una visita, llamada o tarea sin recorrer las listas relacionadas. En escritorio el panel ya está
 * a la vista a la derecha.
 */
export function ActivityJump() {
  return (
    <a href="#actividad" className="btn w-full justify-center xl:hidden">
      <CalendarPlus size={15} /> <Tr>Registrar actividad</Tr>
    </a>
  );
}
