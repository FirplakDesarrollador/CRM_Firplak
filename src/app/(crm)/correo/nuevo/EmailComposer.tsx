"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendEmail, type SendState } from "@/lib/email/actions";
import { renderTemplate } from "@/lib/email/merge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";

import { Tr } from "@/components/ui/Tr";
import { Opt } from "@/components/ui/Opt";
type Template = { id: string; name: string; category: string; subject: string; body: string };

export function EmailComposer({ to, related, merge, templates, returnTo, providerReady }: {
  to: string;
  related: Record<string, string | undefined>;
  merge: Record<string, string>;
  templates: Template[];
  returnTo: string;
  providerReady: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(sendEmail, {} as SendState);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(merge["usuario.nombre"] ? `\n\n${merge["usuario.nombre"]}\n${merge["usuario.cargo"] ? `${merge["usuario.cargo"]} · ` : ""}Firplak` : "");
  const opened = useRef(false);

  useEffect(() => {
    if (state.mailto && !opened.current) {
      opened.current = true;
      window.location.href = state.mailto;
      const t = setTimeout(() => router.push(state.returnTo ?? returnTo), 1200);
      return () => clearTimeout(t);
    }
  }, [state, router, returnTo]);

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <form action={action} className="glass space-y-4 p-5">
      {Object.entries(related).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="return_to" value={returnTo} />
      {state.message && <Alert tone={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {!providerReady && (
        <Alert tone="info">
          El envío directo no está configurado: al enviar se registra el correo en el CRM y se abre tu cliente de correo con el mensaje listo.
          Para enviar desde el CRM, configura <code>RESEND_API_KEY</code> y <code>EMAIL_FROM</code>.
        </Alert>
      )}
      {templates.length > 0 && (
        <div>
          <label className="label" htmlFor="tpl"><Tr>Plantilla</Tr></label>
          <select id="tpl" className="select" defaultValue="" onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value);
            if (!t) return;
            setSubject(renderTemplate(t.subject, merge));
            setBody(renderTemplate(t.body, merge));
          }}>
            <Opt value="">— Sin plantilla —</Opt>
            {categories.map((c) => (
              <optgroup key={c} label={c}>{templates.filter((t) => t.category === c).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="to"><Tr>Para</Tr></label>
          <input id="to" name="to" className="input" defaultValue={to} placeholder="correo@empresa.com" aria-invalid={Boolean(state.errors?.to)} />
          {state.errors?.to && <p className="error-text">{state.errors.to}</p>}
        </div>
        <div>
          <label className="label" htmlFor="cc">CC</label>
          <input id="cc" name="cc" className="input" placeholder="Opcional" aria-invalid={Boolean(state.errors?.cc)} />
          {state.errors?.cc && <p className="error-text">{state.errors.cc}</p>}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="subject"><Tr>Asunto</Tr></label>
        <input id="subject" name="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(state.errors?.subject)} />
        {state.errors?.subject && <p className="error-text">{state.errors.subject}</p>}
      </div>
      <div>
        <label className="label" htmlFor="body"><Tr>Mensaje</Tr></label>
        <textarea id="body" name="body" rows={12} className="textarea" value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={Boolean(state.errors?.body)} />
        {state.errors?.body && <p className="error-text">{state.errors.body}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/correo/plantillas" className="link text-sm"><Tr>Gestionar plantillas</Tr></Link>
        <div className="flex gap-2">
          <Link href={returnTo} className="btn"><Tr>Cancelar</Tr></Link>
          <SubmitButton pendingText="Enviando…"><Send size={15} /> <Tr>{providerReady ? "Enviar" : "Registrar y abrir correo"}</Tr></SubmitButton>
        </div>
      </div>
    </form>
  );
}
