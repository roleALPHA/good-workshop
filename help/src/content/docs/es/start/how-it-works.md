---
title: Cómo está organizado GoodWorkshop
description: Biblioteca, carpetas, talleres, jornadas y bloques; cómo encajan las piezas y por qué nunca escribes una hora de inicio.
sidebar:
  order: 3
---

Quien conoce el modelo una vez se orienta en todas partes. Tiene cinco niveles, y cada uno está
dentro del de encima.

```text
Biblioteca                 todo lo de tu espacio de trabajo
└─ Carpeta                 opcional, anidada a cualquier profundidad
   └─ Taller               título, etiquetas, apartados, acceso
      └─ Jornada           nombre, fecha, comienzo, nota sobre la jornada
         ├─ Bloque         tipo, título, duración, descripción …
         ├─ Sección        agrupa bloques que van uno tras otro
         │  └─ Bloque
         └─ Breakout       grupos que transcurren a la vez
            └─ Grupo
               └─ Bloque
```

## Los niveles

| Nivel          | Qué es                                                                                                                                       | Dónde lo editas                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Biblioteca** | Todos los talleres que puedes ver. Los administradores ven todos los del espacio de trabajo.                                                 | [Carpetas y talleres](/es/library/folders-and-workshops/) |
| **Carpeta**    | Para ordenar, no para poseer: las carpetas pertenecen al espacio de trabajo, no a una persona. Un taller está como mucho en una.             | Columna **Carpetas** de la biblioteca                     |
| **Taller**     | Lo que planificas. Pertenece a la persona que lo creó, lleva etiquetas y tiene sus apartados.                                                | Cabecera de la página del taller                          |
| **Jornada**    | Una jornada de taller con su propio comienzo, su propia fecha y su propia agenda. Un taller siempre tiene al menos una.                      | [Jornadas](/es/agenda/days/)                              |
| **Bloque**     | Un punto del programa: check-in, aporte, trabajo en grupo, pausa. El tipo determina el color, la duración habitual y los campos adicionales. | [Bloques y tipos de bloque](/es/agenda/blocks/)           |

:::caution[Jornadas y etiquetas]
En la interfaz alemana, la misma palabra («Tag») significa tanto una jornada de taller como una
palabra clave del taller (el campo **+ etiqueta** bajo el título). Por eso los botones de las
jornadas se llaman **Jornada** y **Eliminar jornada del taller**. Más sobre las palabras clave en
[Etiquetas](/es/library/tags/).
:::

## Secciones y breakouts

Una **sección** agrupa bajo un encabezado bloques que van uno tras otro, por ejemplo
«Llegada y marco» con check-in, agenda y energizer. La fila de la sección muestra cuántos bloques
contiene y cuánto duran juntos.

Un **breakout** es una sección cuyos **grupos** transcurren a la vez: subgrupos en paralelo en
salas distintas, cada uno con su propia pequeña agenda. Todos los grupos empiezan cuando empieza
el breakout, y el breakout termina cuando termina el grupo más largo. Los bloques cuelgan siempre
de un grupo, nunca directamente del breakout. No existe un breakout dentro de otro breakout.
Detalles en [Secciones y breakouts](/es/agenda/clusters-and-breakouts/).

## Los apartados pertenecen al taller

Un bloque que apartas con **Apartar** desaparece del desarrollo, pero conserva la descripción, el
material y las notas. Ya no cuenta para el tiempo y aparece debajo de la agenda, en **Apartados**.
Como los apartados pertenecen a todo el taller, puedes recuperar con **Volver al desarrollo** en
la segunda jornada un ejercicio que no tuvo sitio en la primera. Aunque elimines una jornada, sus
bloques apartados se conservan. Más en [Apartados](/es/agenda/parking/).

## Las horas de inicio se calculan

Nunca escribes la hora de inicio de un bloque. GoodWorkshop la calcula:

> Comienzo de la jornada + duración de todos los bloques anteriores = hora de inicio del bloque

Si cambia una duración o el orden, todas las horas siguientes se desplazan con ella. La cabecera
de la jornada muestra el comienzo y el fin, cuánto es contenido y cuánto pausa, y cuántos bloques
tiene la jornada.

La única excepción es una **hora de inicio fijada**: un bloque que clavas a una hora se queda ahí.
Si el bloque anterior termina antes, queda un hueco que se muestra como **Margen**. Si termina
después, la fila dice por ejemplo «Se solapa con el bloque anterior en 20m»: GoodWorkshop no
recorta nada a escondidas. Más en [Duración y horas de inicio](/es/agenda/timing/).

## Siguiente

- [Planificar el primer taller](/es/start/quickstart/)
- [Orientarse](/es/start/finding-your-way/)
- [Duración y horas de inicio](/es/agenda/timing/)
