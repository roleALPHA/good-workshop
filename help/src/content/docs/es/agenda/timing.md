---
title: Duración y horas de inicio
description: Cómo calcula GoodWorkshop las horas de inicio y fin a partir del inicio de la jornada y las duraciones, cómo fijas una hora y qué pasa cuando hay solapamientos.
sidebar:
  order: 3
---

En GoodWorkshop no escribes horas de inicio. Le das a la jornada un inicio y a cada bloque una duración, y las horas se calculan a partir de ahí: el primer bloque empieza con la jornada y cada uno de los siguientes cuando termina el anterior. Si mueves un bloque, cambias una duración o apartas algo, todas las horas vuelven a cuadrar al instante.

## Fijar el inicio de la jornada

Debajo de las pestañas de las jornadas está el campo **Inicio de la jornada**. Cambia ahí la hora y todos los bloques se desplazan con ella, salvo los que hayas fijado. Una jornada nueva adopta el inicio de la última jornada existente; consulta [Jornadas](/es/agenda/days/).

## Cambiar una duración

La duración aparece en negrita debajo de la hora de inicio. Haz clic en ella y escribe una nueva. El campo entiende muchas formas de escribirla:

| Escribes                            | Resultado                  |
| ----------------------------------- | -------------------------- |
| `45`, `45m`, `45 min`, `45 minutos` | 45 minutos                 |
| `1h30`, `1h 30m`, `1:30`            | 1 hora 30 minutos          |
| `1,5h`, `1.5h`, `1 hora`            | 1 hora 30 minutos o 1 hora |

Las formas cortas funcionan en todos los idiomas de la interfaz; el campo también entiende las palabras del idioma en que usas GoodWorkshop, como `horas` o `minutos`.

Intro o un clic fuera acepta el valor, Esc lo descarta. Lo que el campo no puede leer sin ambigüedad no se adivina: vuelve al valor anterior, y un borde rojo te avisa ya mientras escribes. Una duración está entre 0 minutos y 24 horas.

:::tip[Con las flechas del teclado]
En el campo de duración, la flecha arriba alarga 5 minutos y la flecha abajo acorta 5. Con la tecla Mayús pulsada son 15 minutos. El valor se acepta al instante.
:::

Las secciones y los breakouts no tienen duración propia. La suya resulta de los bloques que contienen; consulta [Secciones y breakouts](/es/agenda/clusters-and-breakouts/).

## Fijar una hora de inicio

A veces una hora está decidida: la comida es a las 12:30, la dirección llega a las 14:00. Entonces fijas el bloque a esa hora.

1. Pasa el ratón por encima del bloque o haz clic en él. Junto a la hora de inicio aparece un candado abierto. En una pantalla táctil está siempre visible.
2. Haz clic en el candado (**Fijar la hora de inicio**). El bloque adopta la hora a la que empieza en ese momento, así que al principio el desarrollo no cambia.
3. Escribe la hora deseada en el campo **Hora de inicio fijada**.

Un bloque fijado muestra un candado cerrado. Se queda en su hora pase lo que pase antes. Los bloques siguientes se calculan a partir de su fin. Con **Quitar la hora fijada**, un nuevo clic en el candado, vuelve a calcularse con normalidad.

También puedes fijar así una sección o un breakout; su candado está en la cabecera, y en el móvil no se muestra ahí. Los grupos de un breakout empiezan siempre a la vez que el breakout.

## Huecos y solapamientos

Como un bloque fijado no cede, el desarrollo anterior no siempre encaja exactamente.

- **Hueco:** si el bloque anterior termina antes, aparece delante del bloque fijado una línea discontinua con **Margen**, por ejemplo «15m Margen». Es solo una indicación, no un bloque.
- **Solapamiento:** si el bloque anterior termina más tarde, el bloque fijado muestra un aviso: **Se solapa con el bloque anterior en 10m**. Los dos bloques transcurren entonces, en el cálculo, al mismo tiempo.

:::note
GoodWorkshop nunca resuelve un solapamiento por su cuenta, no acorta nada ni mueve nada. Es intencionado: a menudo es solo un estado intermedio hasta que acortas un bloque anterior. El aviso se mantiene hasta que las horas vuelven a cuadrar.
:::

## Fin de la jornada

Debajo del último bloque aparece la hora a la que termina la jornada, con la palabra **Fin**. La misma hora figura arriba en el resumen, junto con el **contenido**, las **pausas** y el número de bloques. Las pausas son el tiempo de los tipos **Pausa**, **Comida**, **Margen** y **Nota**; todo lo demás cuenta como contenido. Los bloques apartados no cuentan en absoluto.

Si una jornada pasa de medianoche, detrás de la hora aparece un `(+1)`, por ejemplo `01:30 (+1)`. Por eso una hora fijada anterior al inicio de la jornada se considera una hora del día siguiente: un bloque que fijas a la 01:00 en una jornada que empieza a las 20:00 queda en `01:00 (+1)`.

## Páginas relacionadas

- [Jornadas](/es/agenda/days/)
- [Bloques y tipos de bloque](/es/agenda/blocks/)
- [Secciones y breakouts](/es/agenda/clusters-and-breakouts/)
- [Apartados](/es/agenda/parking/)
