# OCSO Facturación · portal de práctica

Este repositorio es el material de la Actividad 2 de la Sesión 7 de Claude for Business.
OCSO es una cadena de tiendas **inventada**. El portal es de práctica y las facturas **no tienen validez fiscal**.

## Qué se construye

Un portal de facturación para celular, como el de cualquier tienda, que funciona solo (sin Claude):

1. **Mis datos fiscales.** La persona guarda una vez sus datos fiscales, de varias personas físicas o morales: RFC, nombre o razón social, código postal fiscal, régimen, uso del CFDI, correo opcional y un apodo ("Yo", "Mi empresa"). Se guardan **solo en el celular** (`localStorage`), nunca en la base de datos.
2. **Facturar un ticket.** Toma foto del ticket con la cámara (`<input type="file" accept="image/*" capture="environment">`) o lo elige de la galería. La página lee el código QR del ticket y llena el folio y el total. Si el QR no se lee, se escriben a mano.
3. **Revisión.** Llama a `buscar_ticket` y muestra el ticket encontrado (sucursal, fecha, productos, subtotal, IVA y total) o el motivo del rechazo, tal como lo regresa la función.
4. **A nombre de quién.** Elige uno de sus datos fiscales guardados (o agrega otros) y da Facturar: llama a `facturar_ticket`.
5. **Factura lista.** Muestra el folio fiscal (UUID) con una animación de éxito y deja descargar el **XML** (estructura CFDI 4.0) y el **PDF**. Si el navegador lo permite, también compartir el PDF.
6. **Mis facturas.** Lista de las facturas hechas en ese celular. Cada una se abre en `#/factura/<UUID>` y se puede volver a descargar. Esa misma liga sirve para abrir una factura que hizo Claude (llama a `ver_factura`).

## Reglas de la casa

- Todo el sitio vive en la carpeta `sitio/`: `index.html`, `estilos.css`, `app.js`, `config.js`, `manifest.webmanifest` e íconos. Es HTML, CSS y JavaScript sin compilar: Netlify publica la carpeta tal cual.
- **No uses** frameworks, `npm` ni pasos de compilación. Las únicas librerías, desde CDN:
  - Leer QR: `https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js` (prueba primero `BarcodeDetector` si el navegador lo tiene).
  - PDF: `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`
  - QR dentro del PDF: `https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js`
- Para hablar con Supabase usa `fetch` a `https://<proyecto>.supabase.co/rest/v1/rpc/<función>` con el encabezado `apikey`. Con una llave `sb_publishable_...` no mandes `Authorization`. La URL y la llave viven en `sitio/config.js`.
- **Seguridad:** la página solo usa la llave *publishable*. Nunca pongas en el sitio la llave secreta (`sb_secret_...`) ni la `service_role`. Las tablas no se leen desde la página: todo pasa por las funciones públicas.
- Diseño: primero celular (390 px), botones grandes, letra de 17 px o más. Colores propios de OCSO: tinta `#13213C`, menta `#19C3A7`, arena `#F6F4EF`. **No** uses rojo y amarillo ni nada que recuerde a una cadena real.
- Siempre visible, arriba: "Portal de práctica de un curso. No es un portal real ni de ninguna cadena. Las facturas no tienen validez fiscal." El PDF lleva la marca de agua "SIN VALIDEZ FISCAL · PRÁCTICA".
- Textos en español de México, cálidos y cortos. Sin guiones largos.
- Las reglas del CFDI (RFC, régimen, uso, XML, PDF) están en la Skill `reglas-cfdi`. Úsala.

## La base de datos (Supabase)

- `supabase/esquema.sql`: tablas, catálogos y funciones. `supabase/tickets_practica.sql`: los 12 tickets. Se corren en ese orden, con el conector de Supabase, en el proyecto que diga la persona.
- Funciones públicas (las únicas que puede usar la página):
  - `buscar_ticket(p_folio text, p_total numeric)` → `{ok, ticket}` o `{ok:false, codigo, mensaje}`
  - `validar_receptor(p jsonb)` → `{ok, tipo}` o `{ok:false, campo, mensaje}`
  - `facturar_ticket(p_folio text, p_total numeric, p_receptor jsonb, p_canal text)` → `{ok, factura}` o el motivo
  - `ver_factura(p_uuid uuid)` → `{ok, factura}`
  - `catalogos_cfdi()` → `{regimenes, usos}` para llenar las listas
- `reiniciar_practica()` deja los tickets sin facturar. **No** es pública: solo la corre quien administra, con el conector.
- El asesor de seguridad de Supabase avisa que el público puede ejecutar las cinco funciones públicas. Es a propósito: así funciona el portal. Lo que no debe pasar es que el público lea las tablas.
- El QR de cada ticket trae `OCSO|<folio>|<fecha>|<total>`, por ejemplo `OCSO|104-0012457|2026-10-05T08:12|86.00`.
- Las fotos de los tickets están en `tickets/` (no se publican).

## Cómo se trabaja

- Cada cambio va en una rama y se revisa en un Pull Request. **Nunca** directo en `main`: cada publicación de `main` en Netlify gasta créditos.
- Antes de abrir el Pull Request, pide al subagente `revisor-fiscal` que revise el portal.
- `respaldo/sitio/` es un portal terminado y probado. **No** lo copies ni lo leas para construir, salvo que la persona lo pida ("usa el respaldo").
- Si la persona trae otra tienda o su propio negocio, adapta los textos y colores, pero conserva las reglas del CFDI y los avisos de práctica.
