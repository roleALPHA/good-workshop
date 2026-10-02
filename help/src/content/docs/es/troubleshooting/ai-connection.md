---
title: Conexión IA
description: Cuando Claude, ChatGPT u otro cliente MCP no se conecta, devuelve 401 o 429, o una herramienta se interrumpe con un mensaje de error.
sidebar:
  order: 3
---

Un asistente de IA se conecta con GoodWorkshop a través de MCP, ya sea con un token o por OAuth.
Ambas cosas se configuran en **Conexión IA**, en el menú de perfil; consulta
[Conectar un asistente](/es/ai/connect/). La URL del servidor es siempre la dirección de tu
instalación seguida de `/api/mcp`; la página **Conexión IA** la muestra para copiarla.

Los mensajes de error de las herramientas están en **inglés**, porque van dirigidos al modelo, no a
ti. Por eso los textos de abajo se citan en el original.

## El cliente no se conecta en absoluto

| Lo que ves                                                            | Causa y solución                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (web, escritorio, app) o ChatGPT no llegan al servidor         | Estos clientes se conectan desde la nube de su proveedor. Solo funciona si la URL del servidor es accesible desde internet por HTTPS. A una instalación dentro de la red de la empresa solo llegan clientes que se ejecutan en tu ordenador, como Claude Code o Gemini CLI. |
| La URL del servidor que se muestra es incorrecta (instalación propia) | La URL se construye a partir de `GW_APP_URL`. Corrige el valor; consulta [Configuración](/es/self-hosting/configuration/).                                                                                                                                                  |
| `method_not_allowed`                                                  | El cliente se dirige al servidor con GET. GoodWorkshop solo acepta MCP por POST («Streamable HTTP») y no envía nada por iniciativa propia. Elige en el cliente el transporte HTTP; en Claude Code y Gemini CLI, `--transport http`.                                         |

## HTTP 401: `invalid_token`

El servidor no ha aceptado el token. Posibles motivos:

- **El token se ha revocado** o nunca se copió completo. Un token solo se muestra una vez en texto
  claro, justo después de **Crear un token**. Si lo has perdido, crea uno nuevo.
- **«Bearer» repetido o ausente.** La cabecera es `Authorization: Bearer gwp_…`. Langdock añade la
  palabra «Bearer» por su cuenta — ahí pegas solo el token, sin más.
- **Codex: falta la variable de entorno.** La entrada solo nombra `GW_TOKEN`. Si
  `export GW_TOKEN=…` no está en la configuración de tu shell, Codex solo conoce el token en ese
  terminal concreto.
- **Claude Desktop: espacios en la cabecera.** Claude Desktop separa `args` por los espacios.
  `"Authorization: Bearer …"` se convierte en dos argumentos y la cabecera desaparece sin aviso.
  Copia la configuración exactamente como la muestra la página **Conexión IA**: el token en `env` y
  en el argumento `Authorization:${GW_TOKEN}`, sin espacios.
- **Un acceso OAuth ha caducado o se ha desconectado.** Vuelve a conectar el cliente.
- **La cuenta ya no es miembro** o se ha desactivado. Con la pertenencia desaparecen también sus
  tokens.

## Problemas con OAuth y la página de autorización

Con OAuth inicias sesión en GoodWorkshop en el navegador y confirmas en la página **¿Permitir el
acceso?** lo que puede hacer el cliente.

:::tip[Primero inicia sesión, luego conecta]
Inicia sesión antes en GoodWorkshop en este navegador. Si no, tras iniciar sesión acabarás en la
biblioteca y tendrás que volver a empezar la conexión desde el cliente.
:::

Si la petición falla, la página de autorización muestra el motivo en lugar de un botón:

| Mensaje                                                                  | Significado                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| «Esta instalación no conoce a ese cliente.»                              | El cliente no se ha registrado o se registró en otra instalación.           |
| «Esa dirección de retorno no pertenece a este cliente.»                  | La dirección de retorno tiene que coincidir exactamente con una registrada. |
| «Esta petición nombra un tipo de respuesta que este servidor no ofrece.» | El cliente pide algo distinto del código de autorización.                   |
| «Esta petición llega sin un PKCE válido. Este servidor lo exige.»        | El servidor exige PKCE con S256.                                            |
| «Este acceso se pidió para otro servidor.»                               | El cliente ha pedido un token para otra URL de servidor.                    |

En todos los casos se aplica: «No se concedió nada. Empieza de nuevo desde el cliente; si vuelve a
fallar, el problema está en su configuración.»

## HTTP 429: `rate_limited`

`/api/mcp` acepta como máximo **60 peticiones por minuto** por dirección de origen. Un asistente
que llama a muchas herramientas seguidas puede alcanzar ese límite. Espera un minuto.

Instalación propia: si muchas personas alcanzan el límite a la vez, probablemente no llega la
dirección de origen real — y entonces todas comparten el mismo contador. Comprueba que tu proxy
establece `X-Forwarded-For` y que `GW_TRUSTED_PROXIES` coincide con el número de proxys; consulta
[HTTPS y proxy inverso](/es/self-hosting/tls/).

## Una herramienta se interrumpe con un mensaje

| Mensaje de la herramienta                                                                                                                 | Significado y solución                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `This token does not have the "workshops:write" scope. Create a token with that scope in the settings.`                                   | Al token le falta un ámbito (aquí **Escribir talleres**). Los ámbitos no se pueden cambiar después: crea un token nuevo con los ámbitos necesarios.                               |
| `You do not have permission for that: …`                                                                                                  | El token actúa en tu nombre y nunca puede más que tú — te falta el permiso sobre este taller.                                                                                     |
| `The workshop has changed in the meantime (expected …, found …).`                                                                         | Otra persona ha cambiado el taller mientras tanto. El asistente debería volver a leerlo e intentarlo de nuevo.                                                                    |
| `The collaboration service is unreachable. Nothing can be written without it, because that would mean two write paths onto the same day.` | Solo se puede escribir a través del servicio de colaboración. Instalación propia: comprueba que está en marcha y es accesible (`GW_COLLAB_INTERNAL_URL`).                         |
| `The call failed. The operator can find the cause in the server log under the reference …`                                                | Un error interno. Quien opera la instalación encuentra el motivo en el registro con esa referencia. En la Cloud, indica la referencia al [Soporte](/es/troubleshooting/support/). |

:::note[Lo que un asistente nunca puede hacer]
Ni un token ni un acceso OAuth pueden invitar a miembros, nombrar Admins ni gestionar permisos.
Es intencionado y no se puede habilitar.
:::

## Terminar el acceso

Un token lo revocas en **Conexión IA** con **Revocar**. Un acceso OAuth lo terminas ahí mismo, en
**Clientes conectados**, con **Retirar el acceso**; deja de funcionar con la siguiente petición.

## Más información

- [Conectar un asistente](/es/ai/connect/)
- [Referencia de herramientas](/es/ai/tools/)
- [Resumen](/es/troubleshooting/overview/)
