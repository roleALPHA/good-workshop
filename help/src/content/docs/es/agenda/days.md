---
title: Jornadas
description: Crear, nombrar, fechar, reordenar y eliminar jornadas del taller, y qué pasa con los bloques apartados cuando desaparece una jornada.
sidebar:
  order: 1
---

Un taller tiene al menos una jornada, y cada jornada tiene su propio desarrollo. Las jornadas aparecen como pestañas encima de la agenda. Un clic en una pestaña abre esa jornada; el enlace al taller en sí lleva siempre a la primera jornada.

![Una jornada del taller con pestañas, fecha, resumen y los primeros bloques](../../../../assets/es/agenda.png)

Todo lo que se describe en esta página ocurre directamente encima de la agenda, sin diálogo y sin botón de guardar.

## Añadir una jornada

1. Haz clic en **Jornada**, a la derecha de las pestañas.
2. La nueva jornada se añade al final, se llama provisionalmente «Día 2», «Día 3», etc., y se abre de inmediato.

La nueva jornada adopta el **Inicio de la jornada** de la última jornada existente. Si tu taller empieza a las 08:30, la nueva jornada también empieza a las 08:30. La primerísima jornada de un taller empieza a las 09:00.

:::note[¿«Etiqueta» o «Jornada»?]
Debajo del título del taller aparece **+ etiqueta**. Es una etiqueta para la biblioteca y no tiene nada que ver con las jornadas del desarrollo. Por eso los botones para las jornadas dicen expresamente **Jornada**. Más información en [Etiquetas](/es/library/tags/).
:::

## Nombre, fecha e inicio

Debajo de las pestañas hay tres campos para la jornada abierta:

| Campo                    | Qué hace                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Nombre de la jornada** | El texto de la pestaña. Se guarda con Intro o al salir del campo; Esc descarta el cambio. Un nombre vacío no se acepta. |
| **Fecha de la jornada**  | Opcional. Puedes vaciarla en cualquier momento.                                                                         |
| **Inicio de la jornada** | La hora a la que empieza el primer bloque. Todas las horas de inicio de la jornada dependen de ella.                    |

Si cambias el inicio, todos los bloques se desplazan con él, salvo los que tienen la hora de inicio fijada. Cómo encaja todo exactamente se explica en [Duración y horas de inicio](/es/agenda/timing/).

:::tip
La fecha también es útil para los invitados: una invitación a alguien sin cuenta es válida hasta la última jornada de la agenda. Si la agenda aún no tiene fecha, es válida hasta que la revoques. Consulta [Compartir con personas](/es/sharing/share-with-people/).
:::

## Reordenar jornadas

Tienes dos formas:

- **Arrastrar:** arrastra una pestaña con el ratón hacia la izquierda o la derecha. En una pantalla táctil, mantén pulsada la pestaña un momento antes de arrastrar.
- **Flechas:** junto a los campos de la jornada abierta están **Mover la jornada antes** y **Mover la jornada después**. También funcionan con teclado y lector de pantalla.

Si el servidor rechaza un cambio de posición, las pestañas vuelven a su sitio y un mensaje explica el motivo.

## Nota sobre la jornada

Algunas cosas no pertenecen a ningún bloque concreto, sino a toda la jornada: la sala, cómo llegar, quién trae el rotafolio.

1. Haz clic en **Añadir una nota sobre la jornada**, debajo del resumen.
2. Escribe en el campo **Nota sobre la jornada**.
3. Se guarda en cuanto sales del campo.

Quien solo puede leer la jornada ve la nota, pero no puede cambiarla.

## El resumen

Encima del desarrollo hay una línea como **13:00 – 17:30 · 3h 45m de contenido · 1h 15m de pausas · 12 bloques**. Muestra el inicio y el fin de la jornada, cuánto tiempo corresponde a contenido y cuánto a pausas, y cuántos bloques hay en el desarrollo. Los bloques apartados no cuentan. Debajo, una leyenda explica qué color corresponde a cada tipo de bloque, para todos los tipos que aparecen en esa jornada.

## Eliminar una jornada

1. Abre la jornada que quieres eliminar.
2. Haz clic en **Eliminar jornada del taller**.
3. Confirma con **Eliminar definitivamente** o cancela con **Cancelar**.

El desarrollo de la jornada desaparece, con todos sus bloques, secciones y breakouts. Después llegas a la jornada anterior o, si era la primera, a la siguiente.

:::caution
Esto no se puede deshacer. Solo se conservan los bloques _apartados_: pasan a los apartados de la jornada anterior, o de la siguiente si eliminas la primera jornada. Consulta [Apartados](/es/agenda/parking/).
:::

No puedes eliminar la última jornada que queda; un taller siempre tiene al menos una. Por eso el botón solo aparece cuando hay dos o más jornadas.

## Quién puede hacer qué

Crear, nombrar, fechar, reordenar y eliminar jornadas pueden hacerlo los miembros con permiso de escritura en el taller. Los invitados, también los que tienen **Lectura y escritura**, editan el desarrollo de una jornada, pero no ven ni los tres campos debajo de las pestañas ni los botones para crear, mover y eliminar. Por tanto, no pueden cambiar el inicio de una jornada. Quien solo puede leer ve las pestañas únicamente si el taller tiene más de una jornada.

## Páginas relacionadas

- [Bloques y tipos de bloque](/es/agenda/blocks/)
- [Duración y horas de inicio](/es/agenda/timing/)
- [Apartados](/es/agenda/parking/)
- [Cómo está organizado GoodWorkshop](/es/start/how-it-works/)
