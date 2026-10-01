---
title: Soporte
description: Cómo obtener ayuda en GoodWorkshop Cloud, a dónde escribir sin iniciar sesión y quién atiende las instalaciones propias.
sidebar:
  order: 5
---

Dónde obtienes ayuda depende de dónde funcione tu GoodWorkshop: en
[GoodWorkshop Cloud](/es/cloud/overview/) o en un servidor que tú o tu organización operáis por
vuestra cuenta.

| Si usas …                                           | Entonces …                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| la Cloud y puedes iniciar sesión                    | escribe a través del formulario de soporte del menú de perfil                        |
| la Cloud y no consigues entrar                      | escribe un correo a [support@goodworkshop.org](mailto:support@goodworkshop.org)      |
| una instalación propia                              | dirígete a la persona que la opera                                                   |
| GoodWorkshop y has encontrado un error en el código | comunícalo como [issue de GitHub](https://github.com/roleALPHA/good-workshop/issues) |

Esta ayuda ya responde a muchas preguntas. Antes, merece la pena echar un vistazo al
[Resumen](/es/troubleshooting/overview/) de la solución de problemas.

## En la Cloud: el formulario de soporte

:::note[Solo en la Cloud]
El formulario de soporte solo existe en GoodWorkshop Cloud. En una instalación propia no aparece la
entrada **Soporte** en el menú de perfil.
:::

1. Abre el menú de perfil, arriba a la derecha.
2. Elige **Soporte**.
3. Escribe un **Asunto** y tu **Mensaje**.
4. Haz clic en **Enviar solicitud**.

Después, la página confirma: «¡Gracias! Tu solicitud nos ha llegado como ticket n.º …. La respuesta
llega por correo.» La respuesta va a la dirección con la que has iniciado sesión.

**Lo que se envía automáticamente:** tu espacio de trabajo, tu rol, la versión de GoodWorkshop y el
idioma en el que usas la app. No hace falta que lo añadas.

**Lo que ayuda:** describe qué hiciste, qué pasó y qué esperabas. Si hay un mensaje de error en la
pantalla, cópialo textualmente. Si un asistente de IA recibió un mensaje con una referencia
(«under the reference …»), incluye esa referencia — con ella encontramos la causa en el registro.

### Si el formulario no funciona

| Mensaje                                                                                                    | Qué hacer                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| «El formulario no está disponible en este momento. Escríbenos directamente a support@goodworkshop.org.»    | Escribe un correo a [support@goodworkshop.org](mailto:support@goodworkshop.org).                     |
| «No se ha podido enviar tu solicitud en este momento. Escríbenos directamente a support@goodworkshop.org.» | Lo mismo: la solicitud no ha llegado, escribe por correo.                                            |
| «Demasiados intentos. Vuelve a intentarlo más tarde.»                                                      | Cada persona solo puede enviar unas pocas solicitudes por hora. Espera un poco o escribe por correo. |

## En la Cloud, sin iniciar sesión

Si no consigues entrar en tu cuenta — no llega ningún enlace de acceso, el passkey se rechaza —,
escribe a [support@goodworkshop.org](mailto:support@goodworkshop.org). Indica la dirección de
correo de tu cuenta y, si lo sabes, el nombre de tu espacio de trabajo. Antes, merece la pena echar
un vistazo a [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/).

## Instalaciones propias

De una instalación propia se encarga quien la opera — normalmente el departamento de TI de tu
organización o la persona que configuró GoodWorkshop. No tenemos acceso a esas instalaciones ni
vemos ningún dato de ellas.

Si operas tú mismo la instalación:

- La ayuda paso a paso está en [Instalación](/es/self-hosting/installation/) y en el README, en
  [Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).
- El registro indica la mayoría de las causas: `docker compose logs app` y `docker compose logs migrate`.
- Lo que todavía no funciona, a propósito, está en [Problemas conocidos](/es/troubleshooting/known-issues/).

## Comunicar errores

Si has encontrado un error en el propio GoodWorkshop, abre un
[issue en GitHub](https://github.com/roleALPHA/good-workshop/issues). Ayudan:

- la versión (aparece en el pie de página de la app y en `/api/health`)
- qué hiciste, qué pasó y qué esperabas
- el fragmento correspondiente del registro

:::caution[Nada secreto en los issues]
Los issues son públicos. Elimina tokens, enlaces de acceso, contraseñas y datos personales de los
fragmentos del registro antes de pegarlos. Con `GW_MAIL_TRANSPORT=console`, el registro contiene
enlaces de acceso válidos.
:::

## Más información

- [Resumen](/es/troubleshooting/overview/)
- [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)
- [GoodWorkshop Cloud](/es/cloud/overview/)
