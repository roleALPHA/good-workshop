---
title: Facturas
description: Cuándo llega la factura mensual, qué significa su estado y dónde descargarla.
sidebar:
  order: 4
---

:::note
Esta página solo se aplica a GoodWorkshop Cloud. Las facturas solo las ven los administradores.
:::

GoodWorkshop Cloud factura mensualmente, a mes vencido. Cada mes tiene una factura; todas están
reunidas en **Facturación**.

## Cuándo llega la factura

Al terminar un mes natural se factura lo generado en ese mes:

| Modelo      | En la factura                                                                  |
| ----------- | ------------------------------------------------------------------------------ |
| Por usuario | los usuarios-mes, es decir, cada miembro activo de forma proporcional por días |
| Por taller  | el número de talleres creados en ese mes                                       |

Se aplica el precio vigente al comienzo del mes facturado. Un cambio de precio que entra en
vigor más tarde no modifica una factura en curso. Los límites de mes son días naturales en
Viena, donde se emite la factura.

La factura indica el día en que se cobrará el importe mediante tu método de pago. Entre la
factura y el cobro hay al menos dos días. La factura está en alemán si el espacio de trabajo
se registró en alemán; si no, en inglés.

:::tip
Si un mes sale a cero euros (por ejemplo, porque un cupón lo cubre por completo), no hay
factura para ese mes.
:::

## Descargar una factura

1. Abre el menú de la cuenta arriba a la derecha y, en **Administración**, elige
   **Facturación**.
2. Desplázate hasta **Facturas**. Allí aparece cada factura con **Mes**, **Importe** y
   **Estado**.
3. Haz clic en **Descargar factura**. Al lado aparece el número de factura.

Recibes la factura como archivo, exactamente tal como se envió. Si aparece
**Documento pendiente**, la factura está emitida pero el archivo todavía no está disponible;
aparecerá por sí solo.

Si todavía no hay ninguna factura, aparece «Todavía no hay facturas.» Es normal durante la
prueba y en el primer mes después.

## Qué significa el estado

| Estado             | Significado                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **en preparación** | El mes está calculado y la factura se está emitiendo.                                                          |
| **en revisión**    | La factura espera una aclaración antes de emitirse, por ejemplo si no se ha podido confirmar un número de IVA. |
| **emitida**        | La factura está emitida y el cobro es inminente.                                                               |
| **cobrándose**     | Se está cargando el importe.                                                                                   |
| **pagada**         | Listo.                                                                                                         |
| **pago fallido**   | El cobro no ha funcionado. Lo volvemos a intentar y te escribimos.                                             |

## Si falla un cobro

Te escribimos al **Correo de facturación** y lo volvemos a intentar a los tres días y luego a
los siete días siguientes. Mientras tanto, revisa tu tarjeta y cámbiala si hace falta en
**Cambiar método de pago**.

Si también falla el último intento, el espacio de trabajo pasa a solo lectura y recibes un
recordatorio de pago con plazo. Si para entonces no llega nada, se bloquea el acceso. Tus
contenidos se conservan en cualquier caso y se pueden exportar; en cuanto llega el pago, todo
continúa por sí solo. Los detalles están en
[Precios y facturación](/es/cloud/pricing-and-billing/).

## Corregir los datos de facturación

El nombre de la empresa, la dirección, el número de IVA y el correo de facturación los cambias
en **Datos de facturación**, en la misma página. Un cambio se aplica a las siguientes facturas.

:::caution[Empresas de otros países de la UE]
Sin un número de IVA válido no podemos emitirte una factura sin IVA. La facturación del mes
afectado queda entonces **en revisión** hasta que se aclare el número.
:::

## Preguntas sobre una factura

Escríbenos mediante **Soporte** en el menú de la cuenta e indica el mes o el número de factura.
El formulario envía automáticamente el espacio de trabajo, el rol y el idioma.

## Véase también

- [Precios y facturación](/es/cloud/pricing-and-billing/)
- [Cupones](/es/cloud/vouchers/)
- [Soporte](/es/troubleshooting/support/)
