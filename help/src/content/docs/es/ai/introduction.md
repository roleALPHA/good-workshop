---
title: Planificar con el asistente de IA
description: Qué es MCP, qué puede hacer en GoodWorkshop un asistente de IA conectado como Claude o ChatGPT y qué no puede hacer a propósito.
sidebar:
  order: 1
---

GoodWorkshop tiene un **servidor MCP** integrado. Con él puedes conectar un asistente de IA como Claude, ChatGPT o Gemini con tus talleres y pedirle que diseñe, reorganice o resuma una agenda. Lo que escribe llega directamente a tu biblioteca: sin copiar ni transcribir nada.

## ¿Qué es MCP?

MCP (Model Context Protocol) es un estándar abierto que permite a los asistentes de IA trabajar con otros programas. Un programa ofrece al asistente **herramientas**: en GoodWorkshop, por ejemplo, «crear un taller», «leer una jornada» o «escribir una agenda completa». El asistente decide a partir de tu petición qué herramientas usa.

Conectas el asistente una sola vez con la dirección de tu instalación, por ejemplo `https://goodworkshop.org/api/mcp` en GoodWorkshop Cloud. Cómo se hace lo explica [Conectar un asistente](/es/ai/connect/).

## Qué puede hacer el asistente

Un asistente conectado puede hacer lo mismo que tú en la biblioteca y en el editor de jornadas:

| Área              | Ejemplos                                                                               |
| ----------------- | -------------------------------------------------------------------------------------- |
| Biblioteca        | crear carpetas, crear talleres, renombrarlos, meterlos en carpetas, ponerles etiquetas |
| Papelera          | enviar talleres a la papelera, restaurarlos, eliminarlos definitivamente               |
| Jornadas          | crear jornadas, reordenarlas, eliminarlas; cambiar nombre, fecha, inicio y nota        |
| Agenda            | escribir una jornada completa de una sola vez, con secciones y breakouts               |
| Bloques           | cambiar, mover, apartar o eliminar uno o muchos bloques; asignar responsables          |
| Lectura           | leer una jornada con todas sus horas, obtener el taller completo como Markdown         |
| Descubrir métodos | buscar en la colección de métodos y adoptar entradas (solo Cloud)                      |

La lista completa con todos los parámetros está en la [Referencia de herramientas](/es/ai/tools/), y tienes ideas de peticiones en [Ejemplos](/es/ai/examples/).

Algunas cosas el asistente las hace igual que GoodWorkshop:

- **GoodWorkshop calcula las horas de inicio** a partir del inicio de la jornada y las duraciones. El asistente no las fija, pero puede anclar un bloque a una hora concreta: consulta [Duración y horas de inicio](/es/agenda/timing/).
- **Escribe agendas completas en una sola llamada.** Es todo o nada: si un bloque no encaja, no se escribe nada y el asistente se entera de qué tiene que corregir.
- **Escribe en directo.** Si tienes la jornada abierta, ves sus cambios al instante, y en la [edición conjunta](/es/agenda/live-editing/) aparece como **Asistente de IA**. Para no sobrescribir lo que acabas de cambiar, puede enviar con cada cambio la versión que leyó por última vez. Si el taller ha cambiado entretanto, GoodWorkshop rechaza el cambio y el asistente tiene que volver a leer.

## Qué no puede hacer el asistente

:::caution[Excluido a propósito]
Por MCP **no** hay herramientas para:

- **Miembros**: no puede invitar, eliminar ni nombrar Admin a nadie,
- **Accesos compartidos**: no puede [compartir con personas](/es/sharing/share-with-people/) ningún taller ni ninguna carpeta,
- **Enlaces de invitación**: no puede [invitar a invitados](/es/sharing/share-links/) ni retirar enlaces,
- **Tokens**: no puede crear ni revocar claves de acceso.

Dar a otros acceso a tus datos es un paso que das tú en la app: ningún modelo debe poder hacerlo en tu nombre.
:::

Además:

- **El asistente actúa como tú.** Nunca puede hacer más que tú. Un taller que solo puedes leer, no lo puede cambiar; solo puede mover o eliminar carpetas si eres administrador(a) del espacio de trabajo. Y solo ve los talleres que ves tú en tu biblioteca.
- **Lo que puede hacer lo decides al conectarlo**, mediante los ámbitos que permites (por ejemplo, solo leer o también escribir). Consulta [Conectar un asistente](/es/ai/connect/).
- **No cambia los tipos de bloque.** Los lee para saber qué campos tiene un bloque.
- **No ve la lista de miembros.** Nombra a los responsables por su nombre completo; si un nombre no coincide con nadie del espacio de trabajo, la persona se registra como externa: consulta [Responsables](/es/agenda/responsible/).

:::note[Eliminación definitiva]
El asistente solo puede eliminar definitivamente un taller que ya esté en la [Papelera](/es/library/trash/), y tiene instrucciones de hacerlo solo si se lo pides expresamente. Si es lo que quieres, dilo con claridad; y si no, mejor no lo menciones.
:::

## Dónde está la conexión

En GoodWorkshop encontrarás todo lo relativo a la conexión en el menú de perfil, arriba a la derecha, en **Conexión IA**: la URL del servidor, instrucciones para cada cliente y tus tokens personales.

## Véase también

- [Conectar un asistente](/es/ai/connect/)
- [Referencia de herramientas](/es/ai/tools/)
- [Ejemplos](/es/ai/examples/)
- [Conexión IA – Solución de problemas](/es/troubleshooting/ai-connection/)
