---
title: Exportar como Markdown
description: Descargar una jornada o el taller entero como archivo Markdown, para pegarlo en una wiki, en notas, en un correo o para pasarlo a otros.
sidebar:
  order: 4
---

Cualquier desarrollo se puede descargar en todo momento como archivo Markdown. Markdown es texto plano con unos pocos signos para títulos y tablas. Puedes pegarlo en una wiki, en una herramienta de notas, en un ticket o en un correo, y una tabla sigue siendo una tabla.

## Exportar en tres pasos

1. Abre una jornada del taller.
2. Arriba a la derecha, con las dos casillas, decide qué se incluye:
   - **Todo el taller**: todas las jornadas en un solo archivo en lugar de solo la abierta.
   - **Con notas de facilitación**: tus notas sobre los bloques.
3. Haz clic en **Markdown**. Tu navegador descarga un archivo `.md` con el nombre del taller.

Las dos casillas valen también para [imprimir](/es/sharing/print/): responden a la misma pregunta, ¿para quién es esta copia?

:::caution[Las notas quedan fuera por defecto]
Los campos que un tipo de bloque marca como privados (hoy, las notas de facilitación) solo están en el archivo con **Con notas de facilitación**. La casilla está desmarcada cada vez que abres la página. No pases a los participantes un archivo con notas.
:::

## Qué contiene el archivo

**Al principio, una cabecera** con datos para herramientas que leen metadatos de Markdown: título, fecha (con varias jornadas, una lista de fechas) y duración total. Con el taller entero se añaden la ruta de carpetas (solo las carpetas a las que tienes acceso), las [etiquetas](/es/library/tags/) y el número de jornadas.

**Después, el título** del taller como encabezado. Con el taller entero, cada jornada va bajo su propio encabezado: su nombre, si no su fecha, y si no «Jornada 1», «Jornada 2»…

**Para cada jornada, un resumen**: nombre, fecha, inicio y fin, y el reparto, por ejemplo «5h 30m de contenido, 1h 15m de pausas».

**Debajo, el desarrollo como tabla** con las columnas Hora, Duración, Bloque e Info:

| Columna  | Contenido                                                                                    |
| -------- | -------------------------------------------------------------------------------------------- |
| Hora     | Hora de inicio; 🔒 si la [hora de inicio es fija](/es/agenda/timing/)                        |
| Duración | Duración del bloque o de la sección                                                          |
| Bloque   | Título; [secciones](/es/agenda/clusters-and-breakouts/) en negrita, entradas sangradas con ↳ |
| Info     | Responsable, tipo de bloque y, si procede, «⚠ Solapamiento»                                  |

En un breakout, la columna Info indica el número de grupos con la nota «en paralelo», y en cada grupo «Grupo 1 de 3». Así queda claro por qué la misma hora aparece varias veces.

**Al final, una sección «Detalles»** con la descripción y los demás campos de cada bloque (material, formato y lo que traiga el tipo de bloque), cada uno con su etiqueta de la app.

Abajo del todo hay una línea que menciona GoodWorkshop.

:::note[Qué no se exporta]
Los bloques [apartados](/es/agenda/parking/) no están en el horario y por eso tampoco en el archivo.
:::

## Una jornada o el taller entero

| Selección              | Resultado                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sin **Todo el taller** | Un archivo con la jornada abierta.                                                                                                                                                                      |
| con **Todo el taller** | Un archivo con todas las jornadas en su orden, no un archivo comprimido con archivos sueltos. Un taller sin jornadas da un archivo con el título y la frase «Este taller aún no tiene ninguna jornada.» |

## Idioma del archivo

El archivo está escrito en el idioma que has configurado en tu [perfil](/es/account/profile-and-language/): nombres de columnas, tipos de bloque y etiquetas de los campos. Tus propios textos (títulos, descripciones) se quedan tal como los escribiste.

:::tip[Exportar para otro idioma]
Si necesitas el desarrollo para participantes en otro idioma, añade a la dirección de la descarga `?locale=en` (o `fr`, `es`, `de`); si ya hay un `?`, entonces `&locale=en`. No hace falta que cambies tu perfil.
:::

## Quién puede exportar

Puede exportar cualquier miembro que pueda ver el taller: con **Leer**, con **Editar** o como propietaria. Los invitados que entran por un [enlace de invitación](/es/sharing/share-links/) no pueden exportar.

La exportación funciona también cuando tu espacio de trabajo está en solo lectura o bloqueado por un pago pendiente. Tu contenido siempre sale.

:::tip[Exportar a través del asistente de IA]
Un [asistente de IA conectado](/es/ai/introduction/) obtiene el mismo texto con la herramienta `export_workshop`: práctico si quieres que resuma el taller, lo traduzca o lo convierta en un correo. Ver [Ejemplos](/es/ai/examples/).
:::

## Ver también

- [Imprimir](/es/sharing/print/): el mismo desarrollo en papel o como PDF
- [Secciones y breakouts](/es/agenda/clusters-and-breakouts/)
- [Responsables](/es/agenda/responsible/)
- [Referencia de herramientas](/es/ai/tools/)
