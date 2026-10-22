-- =====================================================================
-- OCSO · Portal de facturación de práctica (Claude for Business, Sesión 7)
-- Todo es ficticio. Las facturas NO tienen validez fiscal.
-- Se corre una sola vez en un proyecto nuevo de Supabase.
-- Después se corre tickets_practica.sql para cargar los 12 tickets.
-- =====================================================================

-- ---------- Configuración ----------
create table if not exists public.ocso_config (
  clave text primary key,
  valor text not null
);
insert into public.ocso_config (clave, valor) values
  ('rfc_emisor', 'EKU9003173C9'),
  ('nombre_emisor', 'OCSO TIENDAS DE PRACTICA'),
  ('regimen_emisor', '601'),
  ('hoy_practica', '2026-10-26')   -- "hoy" para la regla del mes; bórralo para usar la fecha real
on conflict (clave) do nothing;

-- ---------- Catálogos (versión corta para la práctica) ----------
create table if not exists public.regimenes (
  clave text primary key,
  descripcion text not null,
  fisica boolean not null,
  moral boolean not null
);
insert into public.regimenes (clave, descripcion, fisica, moral) values
  ('601', 'General de Ley Personas Morales', false, true),
  ('603', 'Personas Morales con Fines no Lucrativos', false, true),
  ('605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', true, false),
  ('606', 'Arrendamiento', true, false),
  ('608', 'Demás ingresos', true, false),
  ('611', 'Ingresos por Dividendos (socios y accionistas)', true, false),
  ('612', 'Personas Físicas con Actividades Empresariales y Profesionales', true, false),
  ('614', 'Ingresos por intereses', true, false),
  ('616', 'Sin obligaciones fiscales', true, false),
  ('620', 'Sociedades Cooperativas de Producción', false, true),
  ('621', 'Incorporación Fiscal', true, false),
  ('622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', false, true),
  ('623', 'Opcional para Grupos de Sociedades', false, true),
  ('624', 'Coordinados', false, true),
  ('625', 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', true, false),
  ('626', 'Régimen Simplificado de Confianza', true, true)
on conflict (clave) do nothing;

create table if not exists public.usos_cfdi (
  clave text primary key,
  descripcion text not null,
  regimenes text[] not null
);
insert into public.usos_cfdi (clave, descripcion, regimenes) values
  ('G01', 'Adquisición de mercancías', array['601','603','606','612','620','621','622','623','624','625','626']),
  ('G03', 'Gastos en general', array['601','603','606','612','620','621','622','623','624','625','626']),
  ('S01', 'Sin efectos fiscales', array['601','603','605','606','608','611','612','614','616','620','621','622','623','624','625','626'])
on conflict (clave) do nothing;

-- ---------- Tickets y facturas ----------
create table if not exists public.tickets (
  folio text primary key,
  numero_sucursal text not null,
  sucursal text not null,
  direccion text not null,
  ciudad text not null,
  cp text not null,
  fecha timestamp not null,              -- hora local de la tienda
  forma_pago text not null,              -- 01 efectivo, 04 crédito, 28 débito
  cajero text not null,
  conceptos jsonb not null,              -- [{descripcion, cantidad, precio, importe}] con IVA incluido
  subtotal numeric(12,2) not null,
  iva numeric(12,2) not null,
  total numeric(12,2) not null,
  facturado boolean not null default false,
  factura_uuid uuid
);

create table if not exists public.facturas (
  uuid uuid primary key default gen_random_uuid(),
  serie text not null default 'OCSO',
  folio bigint generated always as identity,
  folio_ticket text not null references public.tickets(folio),
  fecha timestamptz not null default now(),
  emisor jsonb not null,
  receptor jsonb not null,
  conceptos jsonb not null,
  subtotal numeric(12,2) not null,
  iva numeric(12,2) not null,
  total numeric(12,2) not null,
  forma_pago text not null,
  metodo_pago text not null default 'PUE',
  moneda text not null default 'MXN',
  lugar_expedicion text not null,
  canal text not null default 'portal' check (canal in ('portal', 'claude'))
);

-- Nadie de afuera lee ni escribe las tablas directamente: todo pasa por las funciones de abajo.
alter table public.ocso_config enable row level security;
alter table public.regimenes enable row level security;
alter table public.usos_cfdi enable row level security;
alter table public.tickets enable row level security;
alter table public.facturas enable row level security;
revoke all on public.ocso_config, public.regimenes, public.usos_cfdi, public.tickets, public.facturas from anon, authenticated;

-- ---------- Funciones internas ----------
create or replace function public._ocso_hoy() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select valor::date from public.ocso_config where clave = 'hoy_practica'),
                  (now() at time zone 'America/Mexico_City')::date);
$$;

create or replace function public._ocso_revisar_ticket(p_folio text, p_total numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.tickets; hoy date := public._ocso_hoy();
begin
  select * into t from public.tickets where folio = upper(trim(p_folio));
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'no_existe',
      'mensaje', 'No encontramos ese folio. Revisa que esté completo, con el guion: 104-0012457.');
  end if;
  if p_total is null or abs(t.total - p_total) > 0.009 then
    return jsonb_build_object('ok', false, 'codigo', 'total_distinto',
      'mensaje', 'El total no coincide con el del ticket. Escríbelo con centavos, sin el signo de pesos.');
  end if;
  if t.facturado then
    return jsonb_build_object('ok', false, 'codigo', 'ya_facturado',
      'mensaje', 'Este ticket ya se facturó. Cada ticket se factura una sola vez.');
  end if;
  if date_trunc('month', t.fecha)::date <> date_trunc('month', hoy)::date then
    return jsonb_build_object('ok', false, 'codigo', 'fuera_de_plazo',
      'mensaje', 'Ya pasó el plazo: los tickets se facturan dentro del mes en que se compró.');
  end if;
  return jsonb_build_object('ok', true, 'ticket', jsonb_build_object(
    'folio', t.folio, 'sucursal', t.sucursal, 'numero_sucursal', t.numero_sucursal,
    'direccion', t.direccion, 'ciudad', t.ciudad, 'fecha', to_char(t.fecha, 'YYYY-MM-DD"T"HH24:MI'),
    'forma_pago', t.forma_pago, 'conceptos', t.conceptos,
    'subtotal', t.subtotal, 'iva', t.iva, 'total', t.total));
end $$;

-- ---------- Funciones que usa el portal ----------

-- Revisa un ticket antes de facturar.
create or replace function public.buscar_ticket(p_folio text, p_total numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._ocso_revisar_ticket(p_folio, p_total);
$$;

-- Revisa los datos fiscales del cliente. Regresa {ok:true} o el campo y el motivo.
create or replace function public.validar_receptor(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  rfc text := upper(trim(coalesce(p->>'rfc', '')));
  nombre text := upper(trim(coalesce(p->>'nombre', '')));
  regimen text := trim(coalesce(p->>'regimen', ''));
  uso text := upper(trim(coalesce(p->>'uso', '')));
  cp text := trim(coalesce(p->>'cp', ''));
  correo text := trim(coalesce(p->>'correo', ''));
  es_fisica boolean; r public.regimenes; u public.usos_cfdi; mes int; dia int;
  err text := null; campo text := null;
begin
  if rfc in ('XAXX010101000', 'XEXX010101000') then
    err := 'Ese es el RFC genérico de público en general o de extranjeros. Para una factura a tu nombre usa tu propio RFC.'; campo := 'rfc';
  elsif rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$' then es_fisica := true;
  elsif rfc ~ '^[A-ZÑ&]{3}[0-9]{6}[A-Z0-9]{3}$' then es_fisica := false;
  else
    err := 'El RFC no tiene el formato correcto: 13 caracteres para persona física o 12 para persona moral.'; campo := 'rfc';
  end if;
  if err is null then
    mes := substring(rfc from length(rfc) - 6 for 2)::int;
    dia := substring(rfc from length(rfc) - 4 for 2)::int;
    if mes not between 1 and 12 or dia not between 1 and 31 then
      err := 'La fecha dentro del RFC no es válida. Revísalo contra tu Constancia de Situación Fiscal.'; campo := 'rfc';
    end if;
  end if;
  if err is null and length(nombre) < 3 then
    err := 'Escribe el nombre o la razón social tal como aparece en tu Constancia de Situación Fiscal.'; campo := 'nombre';
  end if;
  if err is null and nombre ~ '(\s|,)(S\.?\s?A\.?|S\.?\s?C\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?A\.?\s?P\.?\s?I\.?|A\.?\s?C\.?)(\s+DE\s+C\.?\s?V\.?)?\.?$' then
    err := 'En el CFDI 4.0 la razón social va sin el régimen societario: quita "S.A. de C.V." o similar.'; campo := 'nombre';
  end if;
  if err is null then
    select * into r from public.regimenes where clave = regimen;
    if not found then
      err := 'Elige tu régimen fiscal de la lista.'; campo := 'regimen';
    elsif (es_fisica and not r.fisica) or (not es_fisica and not r.moral) then
      err := 'Ese régimen no corresponde al tipo de RFC: ' || case when es_fisica then 'tu RFC es de persona física.' else 'tu RFC es de persona moral.' end; campo := 'regimen';
    end if;
  end if;
  if err is null then
    select * into u from public.usos_cfdi where clave = uso;
    if not found then
      err := 'Elige el uso del CFDI de la lista.'; campo := 'uso';
    elsif not (regimen = any(u.regimenes)) then
      err := 'Con el régimen ' || regimen || ' no se puede usar ' || uso || '. Usa S01, Sin efectos fiscales.'; campo := 'uso';
    end if;
  end if;
  if err is null and cp !~ '^[0-9]{5}$' then
    err := 'El código postal de tu domicilio fiscal tiene 5 dígitos.'; campo := 'cp';
  end if;
  if err is null and correo <> '' and correo !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    err := 'El correo no parece válido.'; campo := 'correo';
  end if;
  if err is null then
    return jsonb_build_object('ok', true, 'tipo', case when es_fisica then 'fisica' else 'moral' end);
  end if;
  return jsonb_build_object('ok', false, 'campo', campo, 'mensaje', err);
end $$;

-- Factura un ticket. Revisa todo otra vez, guarda la factura y marca el ticket.
create or replace function public.facturar_ticket(p_folio text, p_total numeric, p_receptor jsonb, p_canal text default 'portal')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  rev jsonb; val jsonb; t public.tickets; f public.facturas; cs jsonb := '[]'::jsonb; c jsonb;
  base numeric(12,2); imp numeric(12,2); sub numeric(12,2) := 0; iva numeric(12,2) := 0;
  emisor jsonb; receptor jsonb;
begin
  perform 1 from public.tickets where folio = upper(trim(p_folio)) for update;
  rev := public._ocso_revisar_ticket(p_folio, p_total);
  if not (rev->>'ok')::boolean then return rev; end if;
  val := public.validar_receptor(p_receptor);
  if not (val->>'ok')::boolean then return val; end if;

  select * into t from public.tickets where folio = upper(trim(p_folio));
  for c in select * from jsonb_array_elements(t.conceptos) loop
    imp := (c->>'importe')::numeric;
    base := round(imp / 1.16, 2);
    sub := sub + base; iva := iva + (imp - base);
    cs := cs || jsonb_build_object(
      'clave_prod_serv', '01010101', 'clave_unidad', 'H87', 'unidad', 'Pieza', 'objeto_imp', '02',
      'descripcion', c->>'descripcion', 'cantidad', (c->>'cantidad')::int,
      'valor_unitario', round((c->>'precio')::numeric / 1.16, 6), 'importe', base,
      'iva', imp - base, 'tasa', 0.16);
  end loop;

  emisor := jsonb_build_object(
    'rfc', (select valor from public.ocso_config where clave = 'rfc_emisor'),
    'nombre', (select valor from public.ocso_config where clave = 'nombre_emisor'),
    'regimen', (select valor from public.ocso_config where clave = 'regimen_emisor'),
    'sucursal', t.sucursal);
  receptor := jsonb_build_object(
    'rfc', upper(trim(p_receptor->>'rfc')), 'nombre', upper(trim(p_receptor->>'nombre')),
    'regimen', trim(p_receptor->>'regimen'), 'uso', upper(trim(p_receptor->>'uso')),
    'cp', trim(p_receptor->>'cp'), 'correo', nullif(trim(coalesce(p_receptor->>'correo', '')), ''));

  insert into public.facturas (folio_ticket, emisor, receptor, conceptos, subtotal, iva, total, forma_pago, lugar_expedicion, canal)
  values (t.folio, emisor, receptor, cs, sub, iva, t.total, t.forma_pago, t.cp,
          case when p_canal = 'claude' then 'claude' else 'portal' end)
  returning * into f;
  update public.tickets set facturado = true, factura_uuid = f.uuid where folio = t.folio;
  return jsonb_build_object('ok', true, 'factura', public._ocso_factura_json(f));
end $$;

create or replace function public._ocso_factura_json(f public.facturas)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'uuid', upper(f.uuid::text), 'serie', f.serie, 'folio', f.folio, 'folio_ticket', f.folio_ticket,
    'fecha', to_char(f.fecha at time zone 'America/Mexico_City', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'emisor', f.emisor, 'receptor', f.receptor, 'conceptos', f.conceptos,
    'subtotal', f.subtotal, 'iva', f.iva, 'total', f.total, 'forma_pago', f.forma_pago,
    'metodo_pago', f.metodo_pago, 'moneda', f.moneda, 'lugar_expedicion', f.lugar_expedicion,
    'canal', f.canal, 'validez', 'SIN VALIDEZ FISCAL · PRÁCTICA');
$$;

-- Regresa una factura por su folio fiscal (uuid). Sirve para volver a descargarla.
create or replace function public.ver_factura(p_uuid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.facturas;
begin
  select * into f from public.facturas where uuid = p_uuid;
  if not found then
    return jsonb_build_object('ok', false, 'mensaje', 'No encontramos esa factura.');
  end if;
  return jsonb_build_object('ok', true, 'factura', public._ocso_factura_json(f));
end $$;

-- Catálogos para llenar las listas del portal.
create or replace function public.catalogos_cfdi()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'regimenes', (select jsonb_agg(jsonb_build_object('clave', clave, 'descripcion', descripcion, 'fisica', fisica, 'moral', moral) order by clave) from public.regimenes),
    'usos', (select jsonb_agg(jsonb_build_object('clave', clave, 'descripcion', descripcion, 'regimenes', regimenes) order by clave) from public.usos_cfdi));
$$;

-- Solo para quien administra la práctica (no para el público): deja los tickets como nuevos.
create or replace function public.reiniciar_practica()
returns text language plpgsql volatile security definer set search_path = public as $$
begin
  -- Las facturas anteriores se quedan como historial; solo se liberan los tickets.
  update public.tickets set facturado = false, factura_uuid = null where folio <> '352-0008720';
  return 'Listo: los tickets de práctica quedaron sin facturar.';
end $$;

-- ---------- Permisos ----------
-- Solo estas funciones; nunca "all functions", para no tocar otras cosas del proyecto.
revoke execute on function public._ocso_hoy() from public, anon, authenticated;
revoke execute on function public._ocso_revisar_ticket(text, numeric) from public, anon, authenticated;
revoke execute on function public._ocso_factura_json(public.facturas) from public, anon, authenticated;
revoke execute on function public.reiniciar_practica() from public, anon, authenticated;
revoke execute on function public.buscar_ticket(text, numeric) from public;
revoke execute on function public.validar_receptor(jsonb) from public;
revoke execute on function public.facturar_ticket(text, numeric, jsonb, text) from public;
revoke execute on function public.ver_factura(uuid) from public;
revoke execute on function public.catalogos_cfdi() from public;
grant execute on function public.buscar_ticket(text, numeric) to anon, authenticated;
grant execute on function public.validar_receptor(jsonb) to anon, authenticated;
grant execute on function public.facturar_ticket(text, numeric, jsonb, text) to anon, authenticated;
grant execute on function public.ver_factura(uuid) to anon, authenticated;
grant execute on function public.catalogos_cfdi() to anon, authenticated;
