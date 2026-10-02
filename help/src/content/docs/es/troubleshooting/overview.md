---
title: Resumen
description: Del síntoma a la página de ayuda adecuada — para el inicio de sesión, la conexión IA, el editor en directo y tu propia instalación.
sidebar:
  order: 1
---

Busca tu síntoma en las tablas y salta a la página correspondiente. Muchos mensajes de
GoodWorkshop son frases completas; las páginas de ayuda los citan textualmente para que la búsqueda
de arriba los encuentre. Copia sin más el texto que ves en la búsqueda.

## Iniciar sesión

| Síntoma                                                                               | Página                                                              |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Después de **Enviar un enlace de acceso** no llega ningún correo                      | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| «Este enlace ha caducado o ya se ha usado. Pide uno nuevo.»                           | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| «El enlace estaba incompleto. Pide uno nuevo.»                                        | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| No hay botón **Iniciar sesión con un passkey**, sino «Los passkeys necesitan HTTPS …» | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| «No se ha podido confirmar el passkey.»                                               | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| «Esta invitación ya no es válida»                                                     | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |
| «Inicia sesión, por favor.» en mitad del trabajo                                      | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/) |

## Asistente de IA

| Síntoma                                                                | Página                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------- |
| Claude o ChatGPT no llegan al servidor                                 | [Conexión IA](/es/troubleshooting/ai-connection/) |
| HTTP 401 con `invalid_token`                                           | [Conexión IA](/es/troubleshooting/ai-connection/) |
| HTTP 429 con `rate_limited`                                            | [Conexión IA](/es/troubleshooting/ai-connection/) |
| Error en la página **¿Permitir el acceso?**                            | [Conexión IA](/es/troubleshooting/ai-connection/) |
| `This token does not have the "…" scope.`                              | [Conexión IA](/es/troubleshooting/ai-connection/) |
| `The call failed. The operator can find the cause in the server log …` | [Conexión IA](/es/troubleshooting/ai-connection/) |
| Revocar un acceso OAuth                                                | [Conexión IA](/es/troubleshooting/ai-connection/) |

## Trabajar en la agenda

| Síntoma                                                         | Página                                                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| «Sin conexión. Tus cambios se enviarán en cuanto vuelva.»       | [Editar juntos en directo](/es/agenda/live-editing/); instalación propia: [HTTPS y proxy inverso](/es/self-hosting/tls/) |
| «Otra persona ha cambiado este taller mientras tanto.»          | [Editar juntos en directo](/es/agenda/live-editing/)                                                                     |
| «Contiene formato. La edición llegará con el editor de texto …» | [Problemas conocidos](/es/troubleshooting/known-issues/)                                                                 |
| «Este espacio de trabajo es de solo lectura.» (Cloud)           | [Precios y facturación](/es/cloud/pricing-and-billing/)                                                                  |

## Instalación propia

| Síntoma                                                                                 | Página                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL must be set` al arrancar                                                    | [Instalación](/es/self-hosting/installation/)                                                                                            |
| Caddy no arranca, «GW_HOSTNAME muss gesetzt sein …»                                     | [HTTPS y proxy inverso](/es/self-hosting/tls/)                                                                                           |
| No se emite el certificado                                                              | [HTTPS y proxy inverso](/es/self-hosting/tls/)                                                                                           |
| No hay clave de instalación en el registro, o «La clave de instalación no es correcta.» | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)                                                                      |
| `/api/health` responde 503 con `database`                                               | La base de datos no está accesible o todavía está arrancando — espera un momento, consulta [Instalación](/es/self-hosting/installation/) |
| `/api/health` responde 503 con `migrations`                                             | [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/)                                                                      |
| `migrate` se detiene con «MIGRATION STOPPED»                                            | [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/)                                                                      |
| Graph responde `403` o `invalid_client`                                                 | [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)                                                                      |
| Restaurar una copia de seguridad: las credenciales de correo están vacías               | [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/)                                                                      |
| La interfaz está en el idioma equivocado                                                | [Perfil e idioma](/es/account/profile-and-language/)                                                                                     |

:::tip[Primero, mira el registro]
En una instalación propia, el registro casi siempre indica la causa:
`docker compose logs app` para la aplicación, `docker compose logs migrate` para el arranque y la actualización.
:::

## ¿Nada encaja?

- Lo que todavía no funciona, a propósito, está en [Problemas conocidos](/es/troubleshooting/known-issues/).
- Cómo contactar con nosotros o con quien opera tu instalación está en
  [Soporte](/es/troubleshooting/support/).
