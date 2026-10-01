---
title: Inicio de sesión y enlace de acceso
description: Cuando el enlace de acceso no llega o ha caducado, el passkey falla o la configuración de una instalación nueva se atasca.
sidebar:
  order: 2
---

GoodWorkshop no usa contraseñas. Entras con **Iniciar sesión con un passkey** o pides con
**Enviar un enlace de acceso** que te envíen un enlace por correo. Los mensajes de abajo aparecen
exactamente así en la app — busca el texto que ves.

## «Mira en tu bandeja de entrada.» — pero no llega nada

Tras el envío, la página de inicio de sesión muestra **siempre** «Mira en tu bandeja de entrada. Si
existe una cuenta para esa dirección, un enlace de acceso va de camino.» Es intencionado: la página
no revela a nadie qué direcciones tienen cuenta. Por eso tampoco ves ningún error si algo no ha
funcionado.

Revisa por orden:

1. Mira la **carpeta de spam**.
2. **Comprueba la dirección.** Solo se envía un enlace a una dirección que tenga una cuenta activa.
   Las erratas no se notan, porque la página responde lo mismo en todos los casos.
3. **Espera un poco.** Por dirección salen como máximo cinco enlaces cada 15 minutos. Las peticiones
   adicionales se descartan sin aviso.
4. **Instalación propia:** ¿hay algún envío de correo configurado? Consulta más abajo.

### Instalación propia: sin envío de correo

Una instalación nueva no envía correos hasta que alguien configura el envío. Como administrador(a),
comprueba en **Envío de correo** si hay un transporte elegido y usa allí **Enviar un mensaje de
prueba**. Si `GW_MAIL_TRANSPORT` está en el `.env`, manda el `.env`.

Si el envío falla, aparece en el registro de la app como `magic link delivery failed`. Con
Microsoft Graph, `403` o `invalid_client` apuntan a que falta el **permiso de aplicación**
`Mail.Send` con consentimiento de administrador o a un secreto caducado. Con
`GW_MAIL_TRANSPORT=console`, el enlace aparece en `docker compose logs app`.

Sin ningún envío de correo, entras por la línea de comandos. El enlace vale 15 minutos y una sola
vez:

```bash
docker compose exec app node scripts/cli.mjs login-link --email you@example.com
```

## «Este enlace ha caducado o ya se ha usado. Pide uno nuevo.»

Un enlace de acceso vale una sola vez y por poco tiempo — cuánto, lo indican el correo y la página
de inicio de sesión (normalmente 15 minutos). Pide uno nuevo.

El enlace no inicia la sesión de inmediato: abre la página **Confirmar el acceso**, y solo el botón
**Iniciar sesión** lo consume. Así, los filtros de correo como Microsoft Defender Safe Links, que
abren cada enlace por adelantado, no pueden gastarlo antes que tú.

## «El enlace estaba incompleto. Pide uno nuevo.»

La dirección se ha cortado al copiarla, por ejemplo por un salto de línea en el programa de correo.
Haz clic en el enlace directamente en el correo o pide uno nuevo.

## La dirección del enlace no es correcta (instalación propia)

Los enlaces de acceso se construyen a partir de `GW_APP_URL`. Si el enlace apunta a una dirección
distinta de la que usas en el navegador, corrige `GW_APP_URL` en el `.env` y reinicia; consulta
[Configuración](/es/self-hosting/configuration/).

## Passkey

| Mensaje                                                                                                              | Causa y solución                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Los passkeys necesitan HTTPS y no están disponibles en esta dirección. El enlace de acceso por correo sí funciona.» | La instalación funciona sin HTTPS. Los navegadores solo permiten passkeys por HTTPS o en `localhost`. Usa el enlace de acceso; consulta [HTTPS y proxy inverso](/es/self-hosting/tls/).                                                           |
| «Los passkeys necesitan HTTPS. Esta instalación funciona en …»                                                       | La misma causa, al crear un passkey en **Seguridad**.                                                                                                                                                                                             |
| «No se ha podido confirmar el passkey.»                                                                              | Esta cuenta no conoce (o ya no conoce) el passkey — por ejemplo, porque se eliminó —, la cuenta no está activa o el nombre de host de la instalación ha cambiado. Inicia sesión con el enlace de acceso y crea un passkey nuevo en **Seguridad**. |

Si cancelas tú mismo la petición de tu dispositivo, la página no muestra ningún error — simplemente
vuelve a intentarlo.

:::caution[Instalación propia: ¿ha cambiado el nombre de host?]
Los passkeys dependen del nombre de host (`GW_RP_ID`). Tras cambiar el nombre de host, **todos**
los passkeys registrados dejan de ser válidos. Todo el mundo tiene que iniciar sesión una vez con el
enlace de acceso y crear passkeys nuevos.
:::

## «Inicia sesión, por favor.»

Tu sesión ha caducado. Una sesión termina cuando no se ha usado durante un tiempo (instalación
propia: `GW_SESSION_IDLE_DAYS`, 14 días por defecto) y, como muy tarde, tras una duración máxima
fija. Vuelve a iniciar sesión.

## Invitación a un taller

| Mensaje                                                                    | Significado                                                                                  |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| «Eso no coincide. Comprueba la dirección a la que se envió la invitación.» | La dirección introducida no es la invitada.                                                  |
| «Esta invitación ya no es válida»                                          | El enlace se ha retirado, ha caducado o no existe. Quien te invitó puede enviarte una nueva. |
| «Demasiados intentos. Espera un minuto y vuelve a intentarlo.»             | Demasiados intentos en poco tiempo.                                                          |

## Configurar una instalación nueva (instalación propia)

| Problema                                              | Solución                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No hay clave de instalación en el registro            | La clave aparece en el registro de `app`, no en el de `migrate`. Si no está ahí, reinicia `app`: `docker compose restart app` y después `docker compose logs app`. |
| «La clave de instalación no es correcta.»             | La clave cambia con cada reinicio. Usa la **más reciente** del registro.                                                                                           |
| «Demasiados intentos. Vuelve a intentarlo más tarde.» | Espera un minuto.                                                                                                                                                  |
| `/setup` redirige al inicio de sesión                 | Ya hay un(a) administrador(a). Si se definió `GW_BOOTSTRAP_ADMIN_EMAIL`, el enlace de un solo uso está en `docker compose logs migrate`.                           |
| Has iniciado sesión, pero no eres Admin               | `docker compose exec app node scripts/cli.mjs admin promote --email you@example.com`                                                                               |

Encontrarás más detalles en el README, en
[Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).

## Más información

- [Passkeys](/es/account/passkeys/)
- [Envío de correo](/es/account/mail/)
- [Soporte](/es/troubleshooting/support/) — si no consigues entrar en la Cloud
