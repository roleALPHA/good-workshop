---
title: Ejemplos
description: Ejemplos de peticiones a un asistente de IA conectado, desde una jornada completa con breakout hasta la exportación, y lo que hace el asistente en GoodWorkshop.
sidebar:
  order: 4
---

Las siguientes peticiones funcionan con cualquier asistente conectado, sea Claude, ChatGPT o Gemini. Escribes con normalidad, en español o en otro idioma. Debajo de cada petición se indica qué [herramientas](/es/ai/tools/) suele usar el asistente. El procedimiento exacto lo decide el propio modelo.

Requisito: el asistente está [conectado](/es/ai/connect/) y, para todo lo que escribe, tiene el ámbito **Escribir talleres**.

## 1. Planificar una jornada completa con breakout

> Crea un taller «Jornada de equipo Ventas» el 12 de marzo. Empieza a las 9:00. Primero llegada y check-in, luego un aporte sobre la planificación anual y después 60 minutos de grupos pequeños en tres salas (clientes actuales, clientes nuevos y socios), cada uno con una fase de trabajo y un rotafolio de resultados. Después, la comida; por la tarde, puesta en común de resultados en plenario, decisión sobre las tres medidas más importantes y check-out.

Lo que hace el asistente:

1. `list_module_types`: conoce los tipos de bloque de tu espacio de trabajo, por ejemplo Check-in, Aporte / presentación, Sesión en grupo paralelo o Comida.
2. `create_workshop` con título y fecha: crea el taller junto con su primera jornada.
3. `apply_agenda`: escribe la jornada completa en **una sola** llamada. Los grupos pequeños se convierten en un breakout con tres grupos que transcurren al mismo tiempo, cada uno con sus propios bloques.

No tienes que indicar las horas de inicio: GoodWorkshop las calcula a partir del inicio y las duraciones. Más sobre la estructura en [Secciones y breakouts](/es/agenda/clusters-and-breakouts/).

:::tip[Primero ver, luego escribir]
Añade «Enséñame primero el desarrollo antes de crearlo» si quieres revisarlo antes.
:::

## 2. Añadir una segunda jornada

> Añade a la jornada de equipo una segunda jornada el 13 de marzo, empezando a las 8:30, de medio día: repaso de la jornada 1, planificación de medidas por parejas y cierre.

El asistente busca el taller con `list_workshops`, crea la jornada con `create_day` y la rellena con `apply_agenda`.

## 3. Apartar un bloque y recuperarlo más tarde

> En la jornada de equipo, aparta el aporte sobre la planificación anual: necesitamos ese tiempo para los grupos pequeños. Alarga el breakout 20 minutos.

1. `get_workshop`: lee la jornada con todos los ID.
2. `update_modules`: pone `parked: true` en el aporte y cambia las duraciones de los bloques de los grupos, en una sola llamada.

El bloque se conserva en [los apartados](/es/agenda/parking/). Más tarde:

> Pasa el aporte apartado a la jornada 2, justo después del repaso.

El asistente usa `move_module` con `toDayId` y coloca el bloque en el lugar deseado.

## 4. Fijar una pausa a una hora concreta

> La comida tiene que empezar a las 12:30, pase lo que pase antes.

El asistente fija con `update_module` una hora de inicio (`pinnedStartMinute: 750`). Si la mañana se alarga, GoodWorkshop muestra un solapamiento: consulta [Duración y horas de inicio](/es/agenda/timing/).

## 5. Asignar responsables

> Pon a Anna Berger como responsable de todos los bloques de la mañana y, en los grupos pequeños, además a una persona del equipo de clientes en cada uno: el señor Kaya, la señora Lind y la señora Novak.

El asistente cambia todos los bloques afectados con `update_modules` en una sola llamada. GoodWorkshop reconoce a los miembros de tu espacio de trabajo por su **nombre completo exacto**. Quien no coincide (aquí, las personas nombradas solo por el apellido) se registra como persona externa. El asistente no recibe ninguna lista de miembros. Más información en [Responsables](/es/agenda/responsible/).

## 6. Exportar el taller y seguir trabajando con él

> Obtén la jornada de equipo como texto y redacta con ella un breve correo de invitación para los participantes, en inglés. Sin mis notas de facilitación.

El asistente llama a `export_workshop`, con `locale: en` y sin notas, y recibe el taller completo como Markdown, todas las jornadas en orden. Con eso redacta el correo. El mismo documento lo obtienes en la app con la [exportación a Markdown](/es/sharing/export/).

## 7. Ordenar la biblioteca

> Mete todos los talleres que tengan «Ventas» en el título en una carpeta nueva «Ventas 2026» y ponles la etiqueta «interno».

`create_folder`, luego `list_workshops` con búsqueda y, para cada taller, `move_workshop` y `set_workshop_tags`. Los talleres que solo puedes leer, el asistente los deja de lado: nunca puede hacer más que tú.

:::caution[Las etiquetas se sustituyen]
`set_workshop_tags` fija la lista **completa**. Por eso, si solo quieres añadir una, pide expresamente que se mantengan las etiquetas existentes.
:::

## 8. Adoptar un método (solo Cloud)

> Búscame en la colección de métodos una apertura corta para 20 personas, de 15 minutos como máximo. Enséñame dos propuestas, y la que elija, ponla al principio de la jornada 2.

1. `list_discover_entries` con `groupSize` y `maxMinutes`.
2. `get_discover_entry`: te muestra las propuestas con todos sus bloques.
3. Cuando eliges, `adopt_discover_entry` con el taller y la jornada. El bloque llega como copia al **final** de la jornada; después el asistente lo mueve al principio con `move_module`.

Solo en [GoodWorkshop Cloud](/es/cloud/discover/).

## Lo que no se puede hacer

> Comparte la jornada de equipo con mi compañero.

El asistente lo rechaza o te remite a la app: por MCP no hay, a propósito, accesos compartidos, [enlaces de invitación](/es/sharing/share-links/) ni miembros. Compartir lo haces tú en **Acceso**: consulta [Compartir con personas](/es/sharing/share-with-people/).

## Consejos para obtener buenos resultados

- **Indica el marco**: fecha, inicio, tamaño del grupo, salas, horarios fijos como la comida.
- **Di si se sustituye o se añade.** Si hay que reescribir todo el desarrollo, el asistente puede sustituir la jornada (`mode: replace`); si no, añade al final.
- **Pide ver estados intermedios** si la jornada ya está abierta para otras personas: los cambios aparecen al instante en la [edición conjunta](/es/agenda/live-editing/).
- **Eliminación definitiva solo de forma expresa.** Para `purge_workshop` hace falta que lo pidas claramente.

## Véase también

- [Referencia de herramientas](/es/ai/tools/)
- [Planificar con el asistente de IA](/es/ai/introduction/)
- [Conectar un asistente](/es/ai/connect/)
