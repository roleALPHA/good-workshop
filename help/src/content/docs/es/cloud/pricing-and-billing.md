---
title: Precios y facturación
description: Los dos modelos de facturación de la nube, el método de pago, el cambio de plan, la rescisión y qué significan los estados de un espacio de trabajo.
sidebar:
  order: 3
---

:::note
Esta página solo se aplica a GoodWorkshop Cloud. La facturación solo la ven los administradores.
:::

Todo lo relacionado con el dinero está en una sola página: abre el menú de la cuenta arriba a
la derecha y, en **Administración**, elige **Facturación**.

## Dos modelos de facturación

Cada espacio de trabajo tiene un modelo. Lo eliges al registrarte y puedes cambiarlo cada mes.

| Modelo          | Se factura                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| **Por usuario** | cada miembro activo por mes, de forma proporcional por días                                  |
| **Por taller**  | cada taller creado, una sola vez, en el mes de su creación, con cualquier número de miembros |

Los importes actuales están en la [página de precios](https://goodworkshop.org/es/precios) y en
la selección de **Modelo de facturación**. Todos los precios son netos, IVA no incluido:

- Las empresas de Austria pagan un 20 % de IVA.
- Las empresas de otros países de la UE con un número de IVA válido pagan el importe neto
  (inversión del sujeto pasivo).
- Las empresas de fuera de la UE no pagan IVA austriaco.

### Quién cuenta en el modelo «Por usuario»

Se cuenta cada miembro por cada día en que su estado fue **Activa**. Las personas invitadas que
nunca han iniciado sesión, los miembros desactivados y los invitados sin cuenta no cuentan. En
**Este mes hasta ahora** ves la situación, por ejemplo «3,5 usuarios-mes», y el importe neto
hasta hoy.

Los días de la prueba y los talleres creados durante la prueba no se facturan.

## Cambiar de modelo

1. En **Modelo de facturación**, elige el otro modelo.
2. Haz clic en **Aplicar**.

Un cambio se aplica a partir del día 1 del mes siguiente. Hasta entonces aparece «A partir del
mes que viene: …»; el mes en curso sigue con el modelo anterior.

## El método de pago

Se paga con tarjeta, cobrada por el proveedor de pagos. Los datos de la tarjeta los introduces
en su página; GoodWorkshop nunca los ve ni los guarda.

1. En **Método de pago**, haz clic en **Añadir método de pago** (o más adelante en
   **Cambiar método de pago**).
2. Introduce tu tarjeta en la página del proveedor de pagos.
3. Vuelves a la facturación. Allí aparece «Hay un método de pago registrado.»

Justo debajo canjeas un [cupón](/es/cloud/vouchers/).

## Los datos de facturación

En **Datos de facturación** están **Nombre de la empresa**, la dirección, el **Número de IVA** y
el **Correo de facturación**, al que se envían las facturas y los avisos sobre pagos. Los
cambios se guardan con **Guardar**; GoodWorkshop comprueba los números de IVA en el registro
europeo VIES.

Se factura mensualmente a mes vencido, y el cobro se hace como pronto dos días después de la
factura. Más detalles en [Facturas](/es/cloud/invoices/).

## Los estados de un espacio de trabajo

En **Facturación** aparece el estado; debajo de la barra superior, todos ven un aviso al
respecto.

| Estado                | Aviso debajo de la barra superior                | Qué significa                                                                                           | Cómo continuar                                                                                                              |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Prueba hasta el …** | «Prueba: quedan … días.»                         | Todo funciona, gratis.                                                                                  | Al terminar, con método de pago **Activo**; sin él, **Solo lectura**.                                                       |
| **Activo**            | ninguno                                          | Todo funciona.                                                                                          | –                                                                                                                           |
| **Solo lectura**      | «se puede leer y exportar, pero no modificar.»   | La prueba terminó sin método de pago, o una factura no se pudo cobrar ni siquiera tras los reintentos.  | Tras la prueba: añadir un método de pago. Con una factura pendiente: resolver el pago; recibirás un recordatorio con plazo. |
| bloqueado             | «… bloqueado por una factura pendiente.»         | Tras el recordatorio de pago no llegó ningún pago en 14 días. Exportar sigue siendo posible.            | En cuanto llega el pago, todo continúa por sí solo.                                                                         |
| **En pausa**          | «El contenido se puede leer, pero no modificar.» | Hemos detenido el espacio de trabajo.                                                                   | Escribe al [soporte](/es/troubleshooting/support/).                                                                         |
| **Se eliminará el …** | «… se eliminará el …»                            | Se ha solicitado la eliminación o el contrato ha terminado. Leer y exportar es posible hasta esa fecha. | Una eliminación solicitada se puede anular hasta entonces.                                                                  |

:::tip
También en solo lectura, bloqueado o antes de la eliminación puedes
[exportar tus talleres como Markdown](/es/sharing/export/).
:::

## Rescindir el contrato

El contrato se puede rescindir al final de cada mes natural.

1. En **Rescindir el contrato**, haz clic en **Rescindir el contrato**.
2. Lee el aviso y haz clic en **Rescindir a fin de mes**.

Hasta fin de mes seguís trabajando con normalidad, y el último mes se factura de forma
habitual. Después el espacio de trabajo pasa a solo lectura (estado **Se eliminará el …**);
durante 30 días todos los talleres se pueden seguir exportando y luego se eliminan los
contenidos. Hasta fin de mes puedes retirar la rescisión con **Retirar la rescisión**.

## Eliminar el espacio de trabajo de inmediato

**Eliminar espacio de trabajo** no espera a fin de mes. Para confirmar, escribe el nombre del
espacio de trabajo y haz clic en **Solicitar eliminación**. El espacio de trabajo pasa de
inmediato a solo lectura y se elimina definitivamente tras 30 días, con todos los talleres,
miembros y accesos compartidos. El mes en curso se factura de forma proporcional. Hasta
entonces puedes cancelarlo con **Anular eliminación**.

:::danger
Pasados los 30 días, los contenidos desaparecen. Exporta antes lo que quieras conservar.
:::

## Cambios de precio

Te enteras de los nuevos precios con al menos seis semanas de antelación, por correo y debajo
de la barra superior («Desde el … se aplican nuevos precios.»). Se aplican a partir del día 1
de un mes; si suben, puedes rescindir el contrato hasta esa fecha.

## Véase también

- [Facturas](/es/cloud/invoices/)
- [Cupones](/es/cloud/vouchers/)
- [Miembros](/es/account/members/)
- [Precios](https://goodworkshop.org/es/precios) y [condiciones](https://goodworkshop.org/es/condiciones)
