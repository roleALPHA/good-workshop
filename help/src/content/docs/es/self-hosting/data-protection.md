---
title: Protección de datos
description: Qué guarda una instalación propia de GoodWorkshop, adónde van los datos y qué tienes que regular tú como responsable del tratamiento.
sidebar:
  order: 5
---

:::caution[No es asesoramiento jurídico]
Esta página describe de forma objetiva qué guarda GoodWorkshop y adónde envía datos. Es
un resumen de
[docs/data-protection.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/data-protection.md);
allí están todas las tablas, consultas y justificaciones.
:::

## Quién es responsable

Quien instala GoodWorkshop por su cuenta es **responsable del tratamiento** de todos los datos que contiene. roleALPHA
solo publica el software y no recibe nada de una instalación: ni telemetría, ni
«llamadas a casa», ni comprobación de licencias. En la imagen está definido `NEXT_TELEMETRY_DISABLED=1`,
para que tampoco Next.js envíe nada.

En la [GoodWorkshop Cloud](/es/cloud/overview/) es distinto: allí operamos nosotros la
instalación, con un contrato de encargo del tratamiento conforme al art. 28 del RGPD.

## Qué se guarda y dónde

Todo está en una única base de datos Postgres. Los datos personales no se escriben en ningún segundo
almacenamiento.

| Qué                              | Datos personales                                                 | De dónde                                     |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| Cuentas y membresías             | correo, idioma, nombre y apellido, rol, estado                   | registro o invitación                        |
| Passkeys                         | clave pública, nombre, contador                                  | quien crea un passkey                        |
| Enlaces de acceso e invitaciones | correo, **IP solicitante**, finalidad, caducidad                 | cada enlace de acceso, cada invitación       |
| Sesiones                         | **IP, user agent**, hash del secreto de sesión                   | cada inicio de sesión                        |
| Visitas por enlace de invitación | **IP, user agent**                                               | cada visita mediante un enlace de invitación |
| Registro de auditoría            | quién cambió qué en qué objeto                                   | cambios por web y MCP                        |
| Talleres, secciones, bloques     | lo que escriben los facilitadores: nombres, notas sobre personas | los facilitadores                            |
| Edición en vivo                  | el mismo contenido otra vez, como actualizaciones CRDT           | el editor en vivo                            |
| Tokens                           | hashes de tokens, vinculados a un miembro                        | tokens que crea el miembro                   |

Dos cosas que deberías saber para tu registro de actividades de tratamiento:

- **Las direcciones IP están en tres lugares** (enlaces de acceso, sesiones, visitas por enlace de invitación), y
  ninguna caduca por sí sola.
- **El riesgo real es el contenido de la agenda**, no los datos de las cuentas. Las agendas suelen contener
  nombres de participantes, y las notas de facilitación, observaciones sobre personas: como texto libre y,
  además, en el historial de la edición en vivo.

La separación entre espacios de trabajo la impone la propia base de datos mediante Row-Level Security.

## Por dónde salen los datos de la instalación

Hay exactamente cuatro vías, y tres de ellas están desactivadas hasta que las activas:

1. **Correo.** Los enlaces de acceso y las invitaciones salen por tu relay SMTP o por Microsoft Graph.
   La dirección y el título del taller salen del servidor. Con `console` no se envía nada: en ese caso
   hay un enlace de acceso válido en el log.
2. **Asistentes de IA (MCP).** Los miembros pueden conectar un asistente con sus talleres.
   Su proveedor recibe el contenido de los talleres. Los campos privados, como las notas de facilitación, no
   se incluyen. Aun así, el proveedor de IA pasa a formar parte de tu cadena de tratamiento.
3. **Enlaces de invitación.** Quien tiene el enlace ve la agenda. Los visitantes no se identifican,
   pero se guardan la IP y el user agent.
4. **Let's Encrypt**, si usas el Caddy incluido: tu nombre de host aparece en los
   logs públicos de Certificate Transparency.

Nada más sale a la red: ni fuentes externas, ni CDN, ni analítica, ni servicio de
errores.

## Lo que tienes que borrar tú

:::danger[Sin limpieza automática]
Una instalación Community no tiene ninguna tarea de retención. Las filas caducadas se consideran no válidas al leerlas,
pero nunca se borran. La limitación del plazo de conservación (art. 5.1.e) del RGPD) es
tu obligación como responsable del tratamiento.
:::

Basta con una tarea programada. Ajusta los plazos a la duración de conservación que hayas fijado y
documentado:

```sql
-- Login links and invitations: useless once expired.
DELETE FROM email_token   WHERE expires_at < now() - interval '30 days';

-- Sessions that can no longer be used.
DELETE FROM auth_session  WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';
DELETE FROM share_session WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';

-- The audit trail. Keep it as long as you can justify needing it, not longer.
DELETE FROM audit_event   WHERE created_at < now() - interval '1 year';
```

Ejecuta estas sentencias con el rol owner, no como `gw_app`: Row-Level Security
limita `gw_app` a un espacio de trabajo.

## Acceso a los datos y supresión

- **Borrado por la propia persona:** cada persona elimina su cuenta en **Perfil y ajustes** → **Eliminar
  cuenta**. El último admin activo no puede hacerlo.
- **Por un admin:** en **Administración** → **Miembros**. El diálogo pregunta quién se queda con los talleres
  y las carpetas. Con la última membresía desaparece también la cuenta, junto con
  sesiones, enlaces de acceso y passkeys.

Lo que **no** se incluye y tienes que revisar a mano: nombres en el texto de la agenda y en
las notas de facilitación, esos mismos nombres en el historial de la edición en vivo y citas en el
registro de auditoría. También los nombres del campo **Responsable** se quedan en los bloques, para que la
agenda siga siendo legible. Si una supresión tiene que ser completa, elimina el taller afectado:
primero a la Papelera y después vacía la Papelera. Eso se lleva también el historial de edición.

## Lo que regulas tú como responsable de la instalación

- fijar y documentar los plazos de conservación y programar los borrados de arriba
- un registro de actividades de tratamiento (art. 30 del RGPD)
- contratos de encargo del tratamiento con el relay de correo, el proveedor de alojamiento y, si se usa MCP, el
  proveedor de IA
- una política de privacidad para las personas cuyos nombres acaban en las agendas
- copias de seguridad: los borrados no alcanzan a las copias ya hechas; consulta
  [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/)
- cifrado del disco: Caddy se encarga de HTTPS, pero no del cifrado en reposo

## Más información

- [Miembros](/es/account/members/)
- [Papelera](/es/library/trash/)
- [Planificar con el asistente de IA](/es/ai/introduction/)
- [Enlaces de invitación](/es/sharing/share-links/)
