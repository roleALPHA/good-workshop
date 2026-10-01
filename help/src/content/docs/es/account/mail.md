---
title: Envío de correo
description: Definir cómo envía GoodWorkshop los enlaces de acceso y las invitaciones, por SMTP o Microsoft 365, y probar el envío.
sidebar:
  order: 5
---

GoodWorkshop envía los enlaces de acceso y las invitaciones por correo. Sin envío de correo, solo
entra quien ya tiene un [passkey](/es/account/passkeys/). Necesitarás esta página sobre todo si
alojas GoodWorkshop por tu cuenta.

Abre el menú de la cuenta arriba a la derecha y, en **Administración**, elige
**Envío de correo**.

:::note
Solo los administradores configuran el envío de correo.
:::

## Elegir la vía

En **¿Cómo se debe enviar el correo?** hay cuatro opciones:

| Vía                                      | Para qué                                                             |
| ---------------------------------------- | -------------------------------------------------------------------- |
| **Microsoft Graph**                      | Para Microsoft 365 sin SMTP AUTH.                                    |
| **SMTP**                                 | Un relé de correo clásico.                                           |
| **Escribir en el registro del servidor** | Sin envío. Los enlaces de acceso acaban en el registro del servidor. |
| **Sin envío**                            | Los enlaces de acceso solo se obtienen por línea de comandos.        |

:::caution
**Escribir en el registro del servidor** está pensado para empezar o para una instalación de
prueba. Quien pueda leer el registro entra en cualquier cuenta.
:::

## Configurar SMTP

1. Elige **SMTP**.
2. En **URL de SMTP**, escribe la dirección de tu relé con las credenciales, por ejemplo
   `smtps://usuario:clave@relay.example.com:465`.
3. En **Dirección del remitente**, escribe la dirección desde la que deben llegar los correos.
4. Haz clic en **Guardar**.

## Configurar Microsoft 365 con Graph

Muchas organizaciones de Microsoft 365 tienen SMTP AUTH desactivado. En ese caso queda la vía de
Microsoft Graph.

Para ello necesitas un registro de aplicación en Entra ID con el **permiso de aplicación**
`Mail.Send` y el consentimiento del administrador. De él tomas:

| Campo                               | De dónde                                     |
| ----------------------------------- | -------------------------------------------- |
| **ID de directorio o de inquilino** | el ID de tu directorio de Entra              |
| **ID de aplicación**                | el ID del registro de aplicación             |
| **Secreto de cliente**              | una clave secreta del registro de aplicación |
| **Buzón remitente**                 | el buzón desde el que se envía               |

Elige **Microsoft Graph**, rellena los cuatro campos y haz clic en **Guardar**.

## Los secretos siguen siendo secretos

La contraseña de la URL de SMTP y el secreto de cliente se guardan cifrados y no se vuelven a
mostrar nunca. Si hay uno guardado, el campo indica «guardado — déjalo vacío para conservarlo».
Si lo dejas vacío, se conserva el valor guardado.

## Valores del entorno

Quien aloja GoodWorkshop por su cuenta también puede definir el envío de correo en el `.env` de
la instalación. Esos valores tienen prioridad. La página muestra esos campos bloqueados y con la
indicación **del entorno**; solo se pueden cambiar en el servidor.

| Variable                                                                                | Campo                                        |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                                                     | la vía: `smtp`, `graph`, `console` o `none`  |
| `SMTP_URL`, `SMTP_FROM`                                                                 | **URL de SMTP**, **Dirección del remitente** |
| `GW_GRAPH_TENANT_ID`, `GW_GRAPH_CLIENT_ID`, `GW_GRAPH_CLIENT_SECRET`, `GW_GRAPH_SENDER` | los cuatro campos de Graph                   |

Más sobre estas variables en [Configuración](/es/self-hosting/configuration/).

## Enviar un mensaje de prueba

Si un relé funciona solo se ve al enviar. Sin prueba, el primer intento es el enlace de acceso de
alguien, y un fallo parece entonces una cuenta rota.

1. Guarda primero tu configuración. La prueba usa lo que está guardado.
2. En **Enviar un mensaje de prueba**, escribe una dirección en el campo **Para**.
3. Haz clic en **Enviar**.

Si funciona, aparece «Enviado a … Si no llega nada: carpeta de spam.» Si el envío falla, la
página muestra literalmente la respuesta del servidor de correo, por ejemplo
`535 authentication failed`. Justo ese mensaje es el que necesitas para encontrar el fallo.

:::tip
Si el mensaje de prueba llega, los enlaces de acceso y las invitaciones irán a partir de ahora
por el mismo camino.
:::

## Trabajar sin envío de correo

Incluso sin ningún envío de correo puedes traer a gente al espacio de trabajo: al
[invitar](/es/account/members/), GoodWorkshop muestra entonces el enlace de acceso directamente y
tú lo pasas en persona. Con un passkey, después todos entran sin correo.

## Véase también

- [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)
- [Configuración](/es/self-hosting/configuration/)
- [Passkeys](/es/account/passkeys/)
- [Miembros](/es/account/members/)
