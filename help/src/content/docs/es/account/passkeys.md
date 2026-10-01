---
title: Passkeys
description: Iniciar sesión con la huella, la cara o una llave de seguridad en lugar de con un enlace por correo.
sidebar:
  order: 2
---

GoodWorkshop no tiene contraseña. Inicias sesión con un **enlace de acceso por correo** o con un
**passkey**. Un passkey es una clave que está en tu dispositivo y que desbloqueas con la huella,
la cara, el PIN del dispositivo o una llave de seguridad. La clave en sí nunca sale de tu
dispositivo.

La ventaja: no tienes que esperar a un correo. Sobre todo con el móvil en la sala del taller,
suele ser la forma más rápida de entrar.

## Crear un passkey

1. Abre el menú de la cuenta arriba a la derecha y elige **Seguridad**.
2. En **Nombre (opcional)**, escribe un nombre con el que reconozcas el dispositivo más adelante,
   por ejemplo «MacBook», «iPhone» o «YubiKey». Si dejas el campo vacío, GoodWorkshop le pone uno.
3. Haz clic en **Crear un passkey**. El botón muestra ahora **Esperando al dispositivo …**
4. Confirma en el diálogo de tu navegador o de tu sistema operativo, por ejemplo con la huella.

Después la página se recarga y el passkey aparece en la lista.

:::tip
Crea un passkey en cada dispositivo con el que trabajes a menudo, o usa uno que se sincronice a
través de tu cuenta de Apple, Google o un gestor de contraseñas.
:::

## Leer la lista

Cada passkey aparece en la lista con su nombre y, además:

| Dato                          | Significado                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **sincronizado**              | El passkey se sincroniza entre tus dispositivos, por ejemplo a través de un gestor de contraseñas. |
| **última vez el** y una fecha | Cuándo iniciaste sesión con él por última vez.                                                     |
| **aún sin usar**              | Lo has creado, pero nunca lo has usado para iniciar sesión.                                        |

Si todavía no tienes ningún passkey, aparece: «Todavía no hay ningún passkey. Hasta entonces,
cada acceso pasa por un enlace por correo.»

## Iniciar sesión con un passkey

En la página de inicio de sesión, haz clic en **Iniciar sesión con un passkey** y confirma en tu
dispositivo. Para ello no tienes que escribir ninguna dirección de correo.

El enlace de acceso por correo sigue funcionando aunque tengas passkeys. Es tu forma de entrar
cuando estás en un dispositivo ajeno.

## Eliminar un passkey

En la fila del passkey, haz clic en **Eliminar**. Desaparece al instante, sin pedir
confirmación. Elimina un passkey, por ejemplo, cuando vendas o pierdas un dispositivo.

## Si no se puede crear un passkey

Los navegadores solo permiten passkeys por HTTPS (o en `localhost`). Si una instalación funciona
con una dirección `http://` sin más, la página muestra un aviso y **Crear un passkey** queda
bloqueado. En ese caso, el enlace de acceso por correo sigue siendo la forma de entrar.

:::note
Esto solo afecta a las instalaciones propias. Cómo configurar HTTPS se explica en
[HTTPS y proxy inverso](/es/self-hosting/tls/).
:::

Otros mensajes y lo que significan:

- **No se ha podido confirmar el passkey.** El dispositivo ha respondido, pero el servidor no ha
  podido verificar la respuesta. Inténtalo de nuevo.
- **Este passkey es desconocido.** Al iniciar sesión se ha usado un passkey que GoodWorkshop no
  conoce, por ejemplo porque se eliminó. Inicia sesión con un enlace de acceso y crea uno nuevo.

Si cancelas tú mismo el diálogo del dispositivo, simplemente no pasa nada: no merece un mensaje
de error.

:::tip[Para administradores de instalaciones propias]
Sin [envío de correo](/es/account/mail/) configurado, solo entra quien ya tiene un passkey. Por
eso, un passkey para ti es un buen seguro.
:::

## Véase también

- [Perfil e idioma](/es/account/profile-and-language/)
- [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)
- [Envío de correo](/es/account/mail/)
