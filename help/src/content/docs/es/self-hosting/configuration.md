---
title: Configuración
description: Las variables de entorno más importantes de una instalación propia de GoodWorkshop, agrupadas por finalidad.
sidebar:
  order: 2
---

Una instalación propia se configura mediante el `.env` situado junto al `compose.yaml`.
Esta página ordena las variables más importantes por finalidad. La tabla completa y de referencia
está en la sección
[Configuration](https://github.com/roleALPHA/good-workshop/blob/main/README.md#configuration) del
README; además, cada variable está comentada en el `.env.example`.

:::note[Sin contraseñas de base de datos en el `.env`]
Las contraseñas de los roles de la base de datos las genera el stack en el primer arranque, en
volúmenes de Docker propios. No hay nada que introducir.
:::

## Valores obligatorios

| Variable      | Obligatoria | Significado                                                                                                     |
| ------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`  | sí          | Dirección en la que se accede a la app. De ella dependen los enlaces de acceso y el origen de los passkeys.     |
| `GW_HOSTNAME` | para `tls`  | Nombre del certificado; se pasa a Caddy.                                                                        |
| `GW_VERSION`  | sí          | Etiqueta de la imagen: `latest` o un número fijo como `0.8.22`. Aparece en el pie de página y en `/api/health`. |

`GW_APP_URL` tiene que ser exactamente la dirección que aparece en el navegador. Si no coincide,
los enlaces de acceso abren la dirección equivocada y el editor en vivo se queda sin conexión.

## Envío de correo

El envío de correo puedes configurarlo en la interfaz, en **Envío de correo**
([Envío de correo](/es/account/mail/)), o en el `.env`. El entorno prevalece campo por campo; la
interfaz marca esos campos con **del entorno**.

| Variable                                                 | Cuándo      | Significado                                                                        |
| -------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                      | opcional    | `smtp`, `graph`, `console` o `none`. Vacío: se aplican los ajustes de la interfaz. |
| `SMTP_URL` / `SMTP_URL_FILE`                             | con `smtp`  | URL del relay, directamente o desde un archivo                                     |
| `SMTP_FROM`                                              | con `smtp`  | Dirección del remitente                                                            |
| `GW_GRAPH_TENANT_ID`                                     | con `graph` | Inquilino de Microsoft 365, como dominio o ID de directorio                        |
| `GW_GRAPH_CLIENT_ID`                                     | con `graph` | ID de aplicación del registro de la app                                            |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | con `graph` | Secreto del registro, directamente o desde un archivo                              |
| `GW_GRAPH_SENDER`                                        | con `graph` | Buzón desde el que se envía                                                        |

Para Microsoft Graph necesitas un registro de aplicación en Entra ID con el
**permiso de aplicación** `Mail.Send` (no el delegado), con consentimiento de administrador.

:::tip[Secretos en archivos]
Si `SMTP_URL` contiene una contraseña, va en un archivo: `SMTP_URL_FILE=/run/secrets/smtp_url`.
Una variable de entorno aparece en `docker inspect`, en `/proc/<pid>/environ` y en cualquier
volcado de memoria. Lo mismo vale para `GW_GRAPH_CLIENT_SECRET_FILE`.
:::

:::caution[`console` es una decisión consciente]
Con `GW_MAIL_TRANSPORT=console`, los enlaces de acceso completos y válidos acaban en el log del contenedor. Quien
puede leer `docker logs` (el grupo de Docker, un recolector de logs, un extracto para soporte)
puede hacerse emitir un enlace para **cualquier** dirección. La app lo advierte al arrancar.
:::

## Acceso y sesiones

| Variable               | Por defecto          | Significado                                                                                            |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `GW_RP_ID`             | Host de `GW_APP_URL` | ID de Relying Party de WebAuthn. Cambiarlo más adelante invalida todos los passkeys.                   |
| `GW_SESSION_IDLE_DAYS` | `14`                 | Tras cuántos días sin uso caduca una sesión                                                            |
| `GW_TRUSTED_PROXIES`   | `1`                  | Número de proxies delante de la app. Solo para limitación de peticiones y logs, nunca para un permiso. |

## Primera cuenta de administración

Solo para instalaciones que monta un script. La vía normal es `/setup`; consulta
[Instalación](/es/self-hosting/installation/).

| Variable                        | Significado                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `GW_BOOTSTRAP_ADMIN_EMAIL`      | Crea un admin en el primerísimo arranque e imprime su enlace |
| `GW_BOOTSTRAP_ADMIN_FIRST_NAME` | Nombre, opcional                                             |
| `GW_BOOTSTRAP_ADMIN_LAST_NAME`  | Apellido, opcional                                           |

## Operación

| Variable                                  | Por defecto     | Significado                                                                                                             |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GW_TIMEZONE`                             | `Europe/Berlin` | Zona horaria para las fechas en la interfaz. Defínela explícitamente para que servidor y navegador formateen igual.     |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`    | se genera       | Cifra las credenciales de correo introducidas en la interfaz. **Debe estar en la copia de seguridad.**                  |
| `GW_OPS_TOKEN`                            | vacío           | Hace que `/api/health` sea detallado con la cabecera `x-ops-token`: versión, estado de migraciones, errores del driver. |
| `GW_MIGRATE_ON_START`                     | desactivado     | `1` hace que `app` migre antes de arrancar, para actualizadores como Watchtower                                         |
| `GW_PORT`, `GW_COLLAB_PORT`               | `3000`, `3001`  | Puertos en `127.0.0.1`, por si los valores por defecto están ocupados                                                   |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL` | vacío           | Solo necesarias si el servicio de colaboración no está en `/collab` en el mismo host                                    |

Sin `GW_OPS_TOKEN`, `/api/health` solo responde con el estado y los nombres de las comprobaciones:
el endpoint es accesible públicamente. Qué hay detrás de `GW_SECRET_KEY` y `GW_MIGRATE_ON_START`
se explica en [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/).

## Aplicar los cambios

Tras un cambio en el `.env`, vuelves a levantar el stack:

```bash
docker compose --profile tls up -d
```

Sin el perfil `tls` (proxy propio, túnel SSH) omites `--profile tls`; consulta
[HTTPS y proxy inverso](/es/self-hosting/tls/).

## Más información

- [Instalación](/es/self-hosting/installation/)
- [HTTPS y proxy inverso](/es/self-hosting/tls/)
- [Envío de correo](/es/account/mail/)
- [Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/)
