---
name: reglas-cfdi
description: Reglas para facturar un ticket con CFDI 4.0 en México (RFC, nombre, régimen fiscal, uso del CFDI, código postal, IVA, estructura del XML y del PDF). Úsala al construir o revisar un portal de facturación, al validar datos fiscales o al facturar la foto de un ticket.
---

# Reglas del CFDI 4.0 para facturar un ticket

Versión para aprender. Sirve para el portal de práctica de OCSO y para revisar cualquier factura de un ticket.

## 1. Datos fiscales de quien recibe la factura

Se copian **tal como vienen en la Constancia de Situación Fiscal**.

| Dato | Regla |
|---|---|
| RFC | Persona física: 13 caracteres (4 letras, 6 números de fecha AAMMDD, 3 de homoclave). Persona moral: 12 (3 letras, 6 números, 3). Siempre en mayúsculas. La fecha debe existir (mes 01 a 12, día 01 a 31). |
| RFC genéricos | `XAXX010101000` (público en general) y `XEXX010101000` (extranjeros) **no** sirven para una factura a nombre de alguien. |
| Nombre o razón social | En mayúsculas, como en la Constancia. Desde el CFDI 4.0 va **sin** el régimen societario: sin "S.A. de C.V.", "S. de R.L.", "S.C.", "A.C." ni similares. |
| Código postal | El del domicilio fiscal: 5 dígitos. |
| Régimen fiscal | Debe corresponder al tipo de RFC (tabla 2). |
| Uso del CFDI | Debe estar permitido para ese régimen (tabla 3). |

## 2. Régimen fiscal

| Clave | Régimen | Física | Moral |
|---|---|:--:|:--:|
| 601 | General de Ley Personas Morales | | ✓ |
| 603 | Personas Morales con Fines no Lucrativos | | ✓ |
| 605 | Sueldos y Salarios e Ingresos Asimilados a Salarios | ✓ | |
| 606 | Arrendamiento | ✓ | |
| 608 | Demás ingresos | ✓ | |
| 611 | Ingresos por Dividendos | ✓ | |
| 612 | Personas Físicas con Actividades Empresariales y Profesionales | ✓ | |
| 614 | Ingresos por intereses | ✓ | |
| 616 | Sin obligaciones fiscales | ✓ | |
| 620 | Sociedades Cooperativas de Producción | | ✓ |
| 621 | Incorporación Fiscal | ✓ | |
| 622 | Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras | | ✓ |
| 623 | Opcional para Grupos de Sociedades | | ✓ |
| 624 | Coordinados | | ✓ |
| 625 | Plataformas Tecnológicas | ✓ | |
| 626 | Régimen Simplificado de Confianza (RESICO) | ✓ | ✓ |

## 3. Uso del CFDI para una compra en tienda

| Clave | Uso | Regímenes que lo pueden usar |
|---|---|---|
| G01 | Adquisición de mercancías | 601, 603, 606, 612, 620, 621, 622, 623, 624, 625, 626 |
| G03 | Gastos en general | 601, 603, 606, 612, 620, 621, 622, 623, 624, 625, 626 |
| S01 | Sin efectos fiscales | Todos |

Quien tiene 605 (sueldos) o 616 (sin obligaciones) **no** puede usar G01 ni G03: usa S01.

## 4. El ticket

- Se factura **dentro del mes** en que se compró. Cada ticket se factura **una sola vez**.
- Los precios del ticket ya traen el IVA 16%. Por concepto: base = importe ÷ 1.16 redondeado a 2 decimales; IVA = importe − base. Así el total de la factura es igual al del ticket.
- En la práctica de OCSO ningún producto lleva IEPS.
- Formas de pago: `01` efectivo, `04` tarjeta de crédito, `28` tarjeta de débito. Método de pago `PUE` (una sola exhibición). Moneda `MXN`.

## 5. El XML (estructura del CFDI 4.0)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!-- FACTURA DE PRACTICA DE UN CURSO. NO TIENE VALIDEZ FISCAL. -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Serie="OCSO" Folio="7" Fecha="2026-10-26T19:40:12" Sello="PRACTICA-SIN-VALIDEZ"
  FormaPago="04" NoCertificado="00000000000000000000" Certificado="PRACTICA" SubTotal="635.35"
  Moneda="MXN" Total="737.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="20127">
  <cfdi:Emisor Rfc="EKU9003173C9" Nombre="OCSO TIENDAS DE PRACTICA" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XOJI740919U48" Nombre="INGRID XODAR JIMENEZ" DomicilioFiscalReceptor="76028"
    RegimenFiscalReceptor="612" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="01010101" Cantidad="1" ClaveUnidad="H87" Unidad="Pieza"
      Descripcion="Batería portátil 10000 mAh" ValorUnitario="343.965517" Importe="343.97" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados>
        <cfdi:Traslado Base="343.97" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="55.03"/>
      </cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="101.65"><cfdi:Traslados>
    <cfdi:Traslado Base="635.35" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="101.65"/>
  </cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="..." FechaTimbrado="..." RfcProvCertif="PRACTICA"
      SelloCFD="PRACTICA-SIN-VALIDEZ" NoCertificadoSAT="00000000000000000000" SelloSAT="PRACTICA-SIN-VALIDEZ"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

En la práctica los sellos y certificados dicen `PRACTICA`: una factura real la sella y la timbra un proveedor autorizado por el SAT con los certificados (CSD) de quien vende.

## 6. El PDF (representación impresa)

Debe llevar: emisor (nombre, RFC, régimen, lugar de expedición), receptor (nombre, RFC, régimen, código postal, uso), serie y folio, fecha, folio fiscal (UUID), forma y método de pago, moneda, tabla de conceptos (cantidad, clave, unidad, descripción, valor unitario, importe), subtotal, IVA 16%, total, **importe con letra** ("QUINIENTOS OCHENTA Y OCHO PESOS 00/100 M.N."), un código QR, los sellos y la cadena original. En la práctica: marca de agua "SIN VALIDEZ FISCAL · PRÁCTICA" y la leyenda "Representación de práctica de un CFDI generada para un curso. No tiene validez fiscal."

## 7. Para revisar una factura

1. RFC, nombre, régimen, uso y código postal cumplen las tablas 1 a 3.
2. La suma de los importes es el subtotal; la suma de los IVA es el IVA; subtotal + IVA = total del ticket.
3. El XML abre sin errores y trae Emisor, Receptor, Conceptos, Impuestos y el Timbre.
4. El PDF trae todo lo de la sección 6.
