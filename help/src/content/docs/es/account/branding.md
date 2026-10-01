---
title: Identidad visual
description: Definir el logotipo, el nombre y el color de acento del espacio de trabajo, y qué límites se aplican.
sidebar:
  order: 4
---

Con la identidad visual, GoodWorkshop adopta la imagen de tu organización: un logotipo y un color
de acento. Nada más, y es a propósito. El pie de página se queda como está y los colores de los
tipos de bloque no se tocan.

Abre el menú de la cuenta arriba a la derecha y, en **Administración**, elige
**Identidad visual**.

:::note
Solo los administradores cambian la identidad visual. Se aplica a todo el espacio de trabajo.
:::

## Subir un logotipo

1. En **Logotipo**, haz clic en **Subir un logotipo** (o en **Sustituir el logotipo** si ya hay
   uno).
2. Elige el archivo.

El logotipo aparece en la cabecera. Con **Eliminar** lo quitas de nuevo.

| Límite   | Valor              |
| -------- | ------------------ |
| Formatos | SVG, PNG o WebP    |
| Tamaño   | como máximo 256 KB |

:::tip
Un SVG se ve nítido a cualquier tamaño y suele ser el más pequeño. Al exportarlo, fíjate en tres
cosas o GoodWorkshop rechazará el archivo:

- sin scripts ni interactividad: muchos programas lo llaman «SVG plano»,
- sin referencias externas: fuentes e imágenes incrustadas,
- sin DTD ni entidades.
  :::

Dónde más aparece el logotipo depende de la instalación: quien aloja GoodWorkshop por su cuenta
también lo ve en la página de inicio de sesión. En GoodWorkshop Cloud, la página de inicio de
sesión no muestra ningún logotipo de espacio de trabajo, porque allí, antes de iniciar sesión,
todavía no se sabe a qué espacio de trabajo pertenece cada persona.

## Un nombre en lugar de un logotipo

Si no tienes logotipo, escribe en **Nombre (si no hay logotipo)** el nombre que debe aparecer en
la cabecera. Si hay un logotipo, la cabecera muestra el logotipo.

## Definir el color de acento

El color de acento colorea los botones y las superficies destacadas de la interfaz.

1. En **Color de acento**, escribe un **Valor hexadecimal**, por ejemplo `#7c3aed`.
2. Pulsa Intro o sal del campo. GoodWorkshop guarda al instante y muestra **Guardado.**

Aquí no hay un botón de guardar propio; lo mismo vale para el nombre.

A partir de ese único valor de color, el servidor construye todos los matices para el modo claro
y el modo oscuro. Al hacerlo comprueba el contraste. Rechaza un color con el que el texto sería
ilegible y te dice por qué:

| Mensaje                                                 | Qué hacer                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| «El gris no tiene un tono …»                            | Elige un tono con color. Con gris, negro o blanco no se puede construir un color de acento.         |
| «En modo claro (u oscuro) este tono solo alcanza …:1 …» | El contraste está por debajo de 4,5:1. Elige un tono algo más oscuro o más intenso del mismo color. |
| «Indica un color en hexadecimal …»                      | El valor no es hexadecimal. Escríbelo con `#` y seis cifras.                                        |

GoodWorkshop atenúa ligeramente, sin preguntar, los colores muy intensos para que funcionen como
acento y no deslumbren. Aun así, lo que escribes sigue siendo la base.

:::note[Por qué los tipos de bloque conservan sus colores]
Los colores de los tipos de bloque significan algo: una pausa parece una pausa. Si el color
corporativo pintara encima de todos los tipos, la agenda dejaría de leerse. Por eso los colores
pertenecen al tipo de bloque y no se cambian aquí; qué papel tiene cada tipo se explica en
[Bloques y tipos de bloque](/es/agenda/blocks/).
:::

## Véase también

- [Miembros](/es/account/members/)
- [Envío de correo](/es/account/mail/)
- [Imprimir](/es/sharing/print/)
