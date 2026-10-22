# OCSO Facturación · portal de práctica

Material de la **Actividad 2 de la Sesión 7** de *Claude for Business*.

OCSO es una cadena de tiendas **inventada** y este es su portal de facturación **de práctica**: tomas foto del ticket, eliges tus datos fiscales guardados en el celular y obtienes la factura en XML y PDF. Las facturas **no tienen validez fiscal**.

## Qué hay aquí

| Carpeta o archivo | Para qué |
|---|---|
| `CLAUDE.md` | Lo que Claude necesita saber para construir el portal |
| `.claude/skills/reglas-cfdi/` | Skill con las reglas del CFDI 4.0 (RFC, régimen, uso, XML, PDF) |
| `.claude/agents/revisor-fiscal.md` | Subagente que revisa el portal antes del Pull Request; solo puede leer |
| `supabase/esquema.sql` | Tablas, catálogos y funciones de la base |
| `supabase/tickets_practica.sql` | Los 12 tickets de práctica |
| `tickets/` | Las fotos de los 12 tickets, con su código QR, y un PDF con todos |
| `sitio/` | Lo que publica Netlify. Aquí construye Claude el portal |
| `respaldo/sitio/` | Un portal terminado y probado, por si el tuyo no queda |
| `netlify.toml` | Le dice a Netlify que publique la carpeta `sitio/` |
| `claude_facturas/` | La segunda forma de facturar, con Claude: instrucciones del proyecto "Facturas", datos fiscales de ejemplo y la Skill `reglas-cfdi` lista para subir a tu cuenta |

## Los 12 tickets

Diez se pueden facturar. Dos sirven para ver los rechazos: `352-0008720` ya se facturó y `217-0044390` es de septiembre (fuera de plazo). Para volver a empezar, pídele a Claude con el conector de Supabase: "Corre reiniciar_practica() en mi proyecto".

## Regla de oro con Netlify

Cada publicación de `main` gasta créditos del plan gratis. Los cambios se hacen en una rama y se revisan en la vista previa del Pull Request, que es gratis. Se fusiona una sola vez, cuando ya quedó.
