---
title: Referencia de herramientas
description: Todas las herramientas que el servidor MCP de GoodWorkshop ofrece a un asistente de IA, con su finalidad, los parámetros importantes y el ámbito necesario.
sidebar:
  order: 3
---

Esta página enumera todas las herramientas que GoodWorkshop ofrece a un asistente conectado. No tienes que llamarlas tú: el asistente las elige a partir de tu petición. La referencia te ayuda a valorar qué es posible y a entender una respuesta del asistente.

Los nombres, parámetros y descripciones de las herramientas están en inglés porque están escritos para el modelo. Tus peticiones puedes formularlas en cualquier idioma.

## Cómo leer esta página

**Ámbito** indica qué permiso necesita la herramienta (consulta [Conectar un asistente](/es/ai/connect/)):

| Abreviatura | Ámbito                                         |
| ----------- | ---------------------------------------------- |
| L           | **Leer talleres** (`workshops:read`)           |
| S           | **Escribir talleres** (`workshops:write`)      |
| T           | **Leer tipos de bloque** (`module_types:read`) |

Además, siempre se aplican tus propios permisos sobre el taller: lo que tú solo puedes leer, tampoco lo puede cambiar el asistente.

**Las horas** son minutos desde medianoche: `540` son las 09:00. **Las duraciones** son minutos.

**Los ID** son identificadores largos que el asistente toma de respuestas anteriores, por ejemplo de `list_workshops` o `get_workshop`.

**`expectedVersion`** lo admiten todas las herramientas que cambian el contenido de una jornada. El asistente envía la versión que leyó por última vez. Si el taller ha cambiado desde entonces, por ejemplo porque estás editando a la vez, el cambio se rechaza en lugar de sobrescribir tu trabajo.

## Biblioteca y carpetas

| Herramienta     | Qué hace                                                                                                         | Parámetros importantes                         | Ámbito |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------ |
| `list_folders`  | Devuelve el árbol de carpetas en el orden en que se muestra, solo las carpetas a las que tienes acceso.          | –                                              | L      |
| `create_folder` | Crea una carpeta, en el nivel superior o dentro de otra carpeta. Los nombres son únicos entre carpetas hermanas. | `name`, `parentId`                             | S      |
| `move_folder`   | Mueve una carpeta con todo su contenido. Solo para administradores del espacio de trabajo.                       | `folderId`, `parentId` (null = nivel superior) | S      |
| `delete_folder` | Elimina una carpeta. Las subcarpetas y los talleres que contiene suben un nivel. Solo para administradores.      | `folderId`                                     | S      |
| `list_tags`     | Devuelve todas las [etiquetas](/es/library/tags/) en uso, con su número.                                         | –                                              | L      |

## Talleres

| Herramienta         | Qué hace                                                                                                                                                                                          | Parámetros importantes                                                                                             | Ámbito |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| `list_workshops`    | Devuelve los talleres que puedes abrir, los modificados más recientemente primero, por páginas.                                                                                                   | `folderId`, `tagId`, `search` (parte del título), `cursor`, `limit` (1–100)                                        | L      |
| `create_workshop`   | Crea un taller con su primera jornada.                                                                                                                                                            | `title`, `folderId`, `date` (fecha de la primera jornada, AAAA-MM-DD)                                              | S      |
| `rename_workshop`   | Cambia el título.                                                                                                                                                                                 | `workshopId`, `title`                                                                                              | S      |
| `move_workshop`     | Mete un taller en una carpeta o lo saca de ella.                                                                                                                                                  | `workshopId`, `folderId` (null = sin carpeta)                                                                      | S      |
| `set_workshop_tags` | Sustituye las etiquetas por la lista completa indicada. Las etiquetas nuevas se crean al hacerlo; una lista vacía las quita todas.                                                                | `workshopId`, `tags` (hasta 24)                                                                                    | S      |
| `export_workshop`   | Devuelve el taller completo como un único documento Markdown, todas las jornadas en orden: lo mismo que la [exportación a Markdown](/es/sharing/export/). Notas de facilitación solo si se piden. | `workshopId`, `flavor` (`agenda` = tabla, `outline` = títulos y texto), `locale` (`de`, `en`, `fr`, `es`), `notes` | L      |

`move_workshop`, `rename_workshop` y `set_workshop_tags` necesitan al menos **Editar** sobre el taller.

Solo sirve como destino (`folderId`, `parentId`) una carpeta a la que tienes acceso; cualquier otra cuenta como inexistente. Afecta a `create_folder`, `create_workshop` y `move_workshop`.

## Papelera

Estas herramientas solo puede usarlas la persona propietaria del taller o un administrador del espacio de trabajo, igual que en la app (consulta [Papelera](/es/library/trash/)).

| Herramienta        | Qué hace                                                                                                                 | Parámetros importantes | Ámbito |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------ |
| `trash_workshop`   | Envía un taller a la papelera. No se pierde nada.                                                                        | `workshopId`           | S      |
| `list_trash`       | Devuelve los talleres de la papelera, los eliminados más recientemente primero.                                          | –                      | L      |
| `restore_workshop` | Recupera un taller con su carpeta y sus etiquetas.                                                                       | `workshopId`           | S      |
| `purge_workshop`   | Elimina un taller **definitivamente**, con todas sus jornadas y bloques. Solo para talleres que ya están en la papelera. | `workshopId`           | S      |

:::danger[`purge_workshop` no se puede deshacer]
El asistente tiene instrucciones de usar esta herramienta solo si pides expresamente la eliminación definitiva.
:::

## Jornadas

| Herramienta     | Qué hace                                                                                                                                                                                      | Parámetros importantes                                        | Ámbito |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------ |
| `list_days`     | Devuelve las jornadas de un taller en orden.                                                                                                                                                  | `workshopId`                                                  | L      |
| `create_day`    | Añade una jornada al final. Sin hora de inicio, toma la de la última jornada.                                                                                                                 | `workshopId`, `title`, `date`, `startMinute`                  | S      |
| `update_day`    | Cambia el nombre, la fecha, el inicio o la nota de una jornada; lo que se omite se mantiene. `date: null` quita la fecha y un `note` vacío, la nota.                                          | `workshopId`, `dayId`, `title`, `date`, `startMinute`, `note` | S      |
| `set_day_start` | Fija solo el inicio de una jornada.                                                                                                                                                           | `workshopId`, `dayId`, `startMinute`                          | S      |
| `move_day`      | Cambia el orden de las jornadas.                                                                                                                                                              | `workshopId`, `dayId`, `afterId` (null = al principio)        | S      |
| `delete_day`    | Elimina una jornada con su desarrollo. Los bloques apartados se conservan y pasan a la jornada anterior (si es la primera, a la siguiente). La última jornada que queda no se puede eliminar. | `workshopId`, `dayId`                                         | S      |

Más sobre las jornadas en [Jornadas](/es/agenda/days/).

## Lectura

| Herramienta         | Qué hace                                                                                                                                                                          | Parámetros importantes                                                                                            | Ámbito |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| `list_module_types` | Devuelve todos los [tipos de bloque](/es/agenda/blocks/) disponibles con su identificador, su duración predeterminada y sus campos. El asistente la llama antes de crear bloques. | –                                                                                                                 | T      |
| `get_workshop`      | Lee una jornada: horas de inicio calculadas, todos los ID, secciones y breakouts, bloques apartados de esta jornada y de las demás, y además la versión actual.                   | `workshopId`, `dayId` (si se omite: primera jornada), `view` (`outline` o `markdown`), `locale` (para `markdown`) | L      |

## Agenda completa

| Herramienta      | Qué hace                                                                                                                                                                                                                                          | Parámetros importantes                                                                                                | Ámbito |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| `apply_agenda`   | Escribe el desarrollo completo de una jornada de una sola vez, cada bloque con todos sus campos. **Todo o nada**: si un bloque indica un tipo desconocido o sus campos no encajan, no se escribe nada y se informan todos los problemas a la vez. | `workshopId`, `dayId`, `mode` (`append` = añadir al final, predeterminado; `replace` = sustituir la jornada), `items` | S      |
| `update_modules` | Cambia campos de muchos bloques y secciones de una jornada en una sola llamada; los ID se mantienen. También es todo o nada.                                                                                                                      | `workshopId`, `dayId`, `updates` (1–500 entradas, cada una con `moduleId` y campos como en `update_module`)           | S      |

### Estructura de `items`

Cada entrada de `items` tiene un tipo (`kind`):

| `kind`     | Significado                                                                                             | Contenido                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `module`   | un bloque                                                                                               | `typeKey` (de `list_module_types`) y los campos de bloque de abajo                                                  |
| `cluster`  | una [sección](/es/agenda/clusters-and-breakouts/) cuyos bloques van uno tras otro                       | `title`, `color`, `pinnedStartMinute`, `children` (bloques)                                                         |
| `breakout` | un breakout: grupos que transcurren **al mismo tiempo**, por ejemplo grupos pequeños en salas separadas | `title`, `color`, `pinnedStartMinute`, `children` (grupos con `title`, `color` y sus propios bloques en `children`) |

Todos los grupos de un breakout empiezan con él; termina cuando termina el grupo más largo. Los bloques siempre cuelgan de un grupo, nunca directamente del breakout. Un breakout siempre está en el nivel de la jornada, nunca dentro de otro.

### Campos de bloque

| Campo               | Significado                                                                                                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`             | título del bloque                                                                                                                                                                                                   |
| `durationMinutes`   | duración en minutos                                                                                                                                                                                                 |
| `pinnedStartMinute` | hora de inicio fija (consulta [Duración y horas de inicio](/es/agenda/timing/)); `null` la quita                                                                                                                    |
| `desc`              | los campos del tipo de bloque, por ejemplo descripción, material o ponente; se validan contra su esquema                                                                                                            |
| `parked`            | `true` lleva el bloque a [los apartados](/es/agenda/parking/)                                                                                                                                                       |
| `responsible`       | quién es responsable del bloque, hasta 20 personas: un miembro por `memberId` o por su nombre completo exacto, los demás solo por su nombre; `[]` vacía la lista (consulta [Responsables](/es/agenda/responsible/)) |
| `color`             | solo para secciones: `rose`, `red`, `orange`, `amber`, `emerald`, `teal`, `cyan`, `blue`, `violet`, `slate`                                                                                                         |

## Bloques individuales

| Herramienta     | Qué hace                                                                                                                                                                                   | Parámetros importantes                                                                            | Ámbito |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ |
| `add_module`    | Añade un único bloque al final de la jornada o de una sección o un grupo.                                                                                                                  | `workshopId`, `dayId`, `typeKey`, `title`, `durationMinutes`, `clusterId`                         | S      |
| `add_cluster`   | Añade una sección al final de la jornada. Con `mode: parallel` se convierte en un breakout; un grupo es una sección con `parentClusterId` = breakout.                                      | `workshopId`, `dayId`, `title`, `color`, `mode` (`sequential` o `parallel`), `parentClusterId`    | S      |
| `update_module` | Cambia campos de un bloque o una sección; lo que se omite se mantiene. `desc` sustituye la descripción completa.                                                                           | `workshopId`, `dayId`, `moduleId` y los campos de bloque                                          | S      |
| `move_module`   | Mueve un bloque o una sección dentro de la jornada o, con `toDayId`, lleva un bloque al final de otra jornada del mismo taller. Allí recibe un ID nuevo.                                   | `workshopId`, `moduleId`, `dayId` (donde está ahora), `clusterId`, `afterId`, `toDayId`, `parked` | S      |
| `delete_module` | Elimina un bloque definitivamente. Una sección eliminada se lleva sus bloques del desarrollo; un breakout eliminado, sus grupos con todo su contenido; los bloques apartados se conservan. | `workshopId`, `dayId`, `moduleId`                                                                 | S      |

Todas las herramientas para jornadas y bloques necesitan al menos **Editar** sobre el taller.

:::tip[Apartar en lugar de eliminar]
Con `update_module` y `parked: true`, el asistente saca un bloque del horario sin eliminarlo. [Los apartados](/es/agenda/parking/) pertenecen a todo el taller: `get_workshop` también muestra lo que está apartado en otras jornadas, y `move_module` con `toDayId` trae un bloque de allí a otra jornada.
:::

## Descubrir métodos (solo Cloud)

:::note[Solo en GoodWorkshop Cloud]
Estas cuatro herramientas solo existen en [GoodWorkshop Cloud](/es/cloud/overview/). Una instalación propia ni siquiera las ofrece. Más información en [Descubrir métodos](/es/cloud/discover/).
:::

| Herramienta             | Qué hace                                                                                                                                                                                                                                                                                                                                  | Parámetros importantes                                                                                                        | Ámbito |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ |
| `list_discover_filters` | Devuelve los filtros de la colección de métodos con sus valores actuales.                                                                                                                                                                                                                                                                 | `locale`                                                                                                                      | L      |
| `list_discover_entries` | Busca en la colección de métodos, lo más reciente primero. Una entrada tiene una jornada o varias: un único bloque o un programa completo.                                                                                                                                                                                                | `facets` (valores de `list_discover_filters`; deben cumplirse todos), `groupSize`, `maxMinutes`, `search`, `cursor`, `locale` | L      |
| `get_discover_entry`    | Muestra una entrada jornada por jornada con todos sus bloques y duraciones. El asistente debe enseñártela antes de adoptar nada.                                                                                                                                                                                                          | `entryId`, `locale`                                                                                                           | L      |
| `adopt_discover_entry`  | Adopta una entrada como copia: sin `workshopId`, como taller nuevo; con `workshopId`, como jornadas adicionales al final; con `workshopId` y `dayId`, los bloques al final de esa jornada (solo en entradas de una jornada). El nombre y el inicio de la jornada no cambian. Un bloque cuyo tipo no existe en tu espacio llega como nota. | `entryId`, `workshopId`, `dayId`, `title`, `folderId`, `locale`                                                               | S      |

## Lo que no existe

Ninguna herramienta gestiona miembros, accesos compartidos, enlaces de invitación ni tokens. Tampoco hay ninguna que liste los miembros de tu espacio de trabajo. Es intencionado: consulta [Planificar con el asistente de IA](/es/ai/introduction/).

## Véase también

- [Ejemplos](/es/ai/examples/)
- [Conectar un asistente](/es/ai/connect/)
- [Secciones y breakouts](/es/agenda/clusters-and-breakouts/)
- [Bloques y tipos de bloque](/es/agenda/blocks/)
