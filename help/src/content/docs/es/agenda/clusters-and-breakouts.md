---
title: Secciones y breakouts
description: Agrupar bloques en secciones, planificar grupos pequeños en paralelo como breakout con grupos, y meter y sacar bloques arrastrando.
sidebar:
  order: 4
---

Una jornada larga se lee mejor por capítulos. Para eso hay dos tipos de contenedores:

|              | **Sección**                   | **Breakout**                          |
| ------------ | ----------------------------- | ------------------------------------- |
| Contiene     | Bloques                       | Grupos, y cada grupo contiene bloques |
| En el tiempo | uno tras otro                 | todos los grupos a la vez             |
| Duración     | suma de los bloques           | duración del grupo más largo          |
| Uso típico   | «Llegada y encuadre», «Tarde» | grupos pequeños en salas separadas    |

## Secciones

Una sección reúne bloques que tienen lugar uno tras otro. Su cabecera muestra el nombre, el número de bloques y la duración total, por ejemplo «3 bloques · 35m». En el móvil, la cabecera se queda fija arriba al desplazarte, para que sepas en qué sección estás leyendo.

### Crear una sección

1. Haz clic en **Añadir sección**, debajo del desarrollo.
2. La sección aparece al final de la jornada como **Nueva sección**. El nombre ya está seleccionado, así que puedes empezar a escribir directamente.
3. Arrastra dentro los bloques que le corresponden (ver más abajo).

### Nombre y color

Haz clic en el nombre para cambiarlo (**Nombre de la sección**). A la derecha de la cabecera eliges en **Color de la sección** un color de la paleta, o **Sin color**. El color solo tiñe la cabecera; los bloques conservan el color de su tipo de bloque.

### Eliminar una sección

El botón de eliminar de la cabecera indica lo que se va con ella, por ejemplo **Eliminar con 3 bloques**.

:::danger
Una sección se elimina _con todos los bloques que contiene_, sin confirmación y sin deshacer. Si quieres conservar los bloques, sácalos antes.
:::

## Breakouts

Un breakout es una sección cuyos _grupos transcurren a la vez_: grupos pequeños en paralelo, cada uno con su propio pequeño desarrollo. Todos los grupos empiezan cuando empieza el breakout. El breakout termina cuando termina el grupo más largo, y después la jornada continúa.

La cabecera lo dice con palabras, por ejemplo **3 grupos, a la vez · grupo más largo 45m**. Cada grupo muestra su posición, su horario y su duración, por ejemplo «Grupo 2 de 3 · 10:00–10:45 · 45m». En pantalla, los grupos aparecen como columnas una junto a otra; en el móvil, uno debajo de otro.

### Crear un breakout

1. Haz clic en **Añadir breakout**, debajo del desarrollo.
2. Aparece al final de la jornada como **Nuevo breakout**, ya con dos grupos, «Nuevo grupo 1» y «Nuevo grupo 2».
3. Cambia el nombre del breakout y de los grupos (**Nombre del breakout**, **Nombre del grupo**).
4. Llena cada grupo con su propio botón **Añadir un bloque**.
5. Añade más grupos con **Añadir grupo**, al final de las columnas.

El breakout y cada grupo tienen su propio color (**Color del breakout**, **Color del grupo**). Un grupo sin bloques muestra **Aún no hay ningún bloque.**

:::tip
Para el trabajo dentro de un grupo existe el tipo de bloque **Sesión en grupo paralelo**, con campos como **Sala** y **Elección libre del grupo**. Consulta [Bloques y tipos de bloque](/es/agenda/blocks/).
:::

### Cómo cuenta un breakout

En el resumen de la jornada (**contenido**, **pausas**, número de bloques) solo entra el grupo que más dura. Así, «contenido más pausas» sigue siendo igual al tiempo entre el inicio y el fin. Por eso, una pausa que solo está en un grupo más corto no aparece en el tiempo de pausas de la jornada. Dentro del grupo sí figura, con su hora.

### Eliminar

Un breakout se elimina con todos sus grupos y bloques (**Eliminar con 3 grupos**). Un grupo suelto se va con sus bloques (**Eliminar con 2 bloques**). Aquí tampoco hay confirmación.

## Meter y sacar arrastrando

Los bloques, las secciones y los breakouts se mueven con el asa a la izquierda de la fila, como se describe en [Bloques y tipos de bloque](/es/agenda/blocks/). Lo que pasa al soltar depende de dónde lo sueltes:

- **Bloque en una sección:** entre dos bloques de una sección, siempre acaba en la sección. Justo debajo del último bloque o debajo de la cabecera de una sección vacía decide la horizontal: arrastrado a la derecha acaba en la sección, a la izquierda en el nivel de la jornada. Con el teclado lo metes y lo sacas con las flechas derecha e izquierda.
- **Bloque en un breakout:** la columna bajo el puntero es el grupo en el que acaba. Si lo sueltas sobre la cabecera del breakout, va al final del primer grupo. Con el teclado cambias de grupo con las flechas izquierda y derecha.
- **Sección en un breakout:** la sección se convierte en un grupo más, con todos sus bloques.
- **Grupo fuera de un breakout:** arrástralo al nivel de la jornada y se convierte en una sección propia, con todos sus bloques.

Un contenedor se lleva al arrastrarlo todo lo que contiene. Las horas se recalculan después de soltar.

:::note[Dos niveles como máximo]
El anidamiento está limitado: una sección contiene bloques, un breakout contiene grupos y un grupo contiene bloques. Una sección no se puede meter en otra sección, un breakout no se puede meter en otro contenedor, y un bloque nunca está directamente en el breakout, sino siempre en un grupo.
:::

## Fijar la hora de inicio

Las secciones y los breakouts se pueden fijar a una hora igual que los bloques, con el candado de la cabecera. Los grupos sueltos no: empiezan siempre con su breakout. Más información en [Duración y horas de inicio](/es/agenda/timing/).

## Páginas relacionadas

- [Bloques y tipos de bloque](/es/agenda/blocks/)
- [Duración y horas de inicio](/es/agenda/timing/)
- [Editar juntos en directo](/es/agenda/live-editing/)
