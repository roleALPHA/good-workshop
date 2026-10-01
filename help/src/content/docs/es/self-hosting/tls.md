---
title: HTTPS y proxy inverso
description: HTTPS con el perfil de Caddy incluido o con tu propio proxy inverso, incluida la ruta WebSocket /collab y el streaming.
sidebar:
  order: 3
---

GoodWorkshop debe estar detrás de HTTPS. Sin HTTPS **no hay passkeys**, la cookie de sesión no lleva
`Secure` y, al igual que los enlaces de acceso, viaja por la red en texto plano. Tienes dos vías: el
perfil `tls` incluido o tu propio proxy inverso.

## El contenedor en sí

`app` escucha a propósito solo en `127.0.0.1`: sin un proxy delante, no es accesible desde fuera,
ni siquiera con un cortafuegos mal configurado. En el contenedor funcionan dos servicios:

| Servicio                 | Puerto en `127.0.0.1` | Variable         | Para qué                                    |
| ------------------------ | --------------------- | ---------------- | ------------------------------------------- |
| Aplicación               | `3000`                | `GW_PORT`        | todas las páginas, `/api/…`, `/api/mcp`     |
| Servicio de colaboración | `3001`                | `GW_COLLAB_PORT` | WebSocket para el editor en vivo, `/collab` |

El segundo puerto existe porque Next no puede atender un upgrade de WebSocket desde un route handler.
Ambos salen de la misma imagen.

## Vía 1: el perfil `tls` (recomendado)

```bash
docker compose --profile tls up -d
```

El perfil arranca además un Caddy que se encarga de los puertos 80 y 443 y obtiene automáticamente un
certificado de Let's Encrypt. Para ello necesitas:

- `GW_HOSTNAME` en el `.env`: si falta el valor, Caddy no arranca y muestra
  «GW_HOSTNAME muss gesetzt sein: der Hostname, auf den das TLS-Zertifikat lautet.» (GW_HOSTNAME debe estar definido: el nombre de host al que se emite el certificado TLS).
- un nombre de host que resuelva públicamente a este servidor
- los puertos 80 y 443 libres

El `Caddyfile` incluido se encarga además de:

- la compresión (`encode zstd gzip`)
- la cabecera `Strict-Transport-Security`
- logs de acceso en un volumen propio, que se borran a los 14 días (`roll_keep_for 336h`)
- el reenvío de `/collab` al servicio de colaboración y de todo lo demás a la app

:::note[Nombre de host en el certificado]
Con el Caddy incluido, tu nombre de host se envía a Let's Encrypt para emitir el certificado y
aparece en los logs públicos de Certificate Transparency. Es el nombre de host, no datos de usuarios.
:::

## Vía 2: tu propio proxy inverso

Si ya tienes un proxy en el host (nginx, Traefik, tu propio Caddy), arrancas el stack
**sin** el perfil:

```bash
docker compose up -d
```

Tu proxy tiene que hacer entonces tres cosas.

### 1. `/collab` al puerto 3001, con upgrade de WebSocket

Todo lo que está bajo `/collab` va al servicio de colaboración, y el upgrade de WebSocket tiene que
llegar sin cambios. Si `/collab` acaba en la aplicación del puerto 3000, esta no puede
atenderlo.

### 2. Todo lo demás al puerto 3000, sin búfer

Next.js hace streaming de los componentes de servidor. Un proxy que almacena las respuestas en búfer entrega las páginas solo
de una pieza. Desactiva el búfer para esta ruta.

### 3. Pasar la dirección de origen real

La app lee la dirección de origen de `X-Forwarded-For` y cuenta desde la derecha tantas
entradas como indica `GW_TRUSTED_PROXIES` (por defecto `1`). Si hay dos proxies uno tras otro, pon
`2`. El valor solo sirve para la limitación de peticiones y los logs, nunca para un permiso: un valor erróneo
te cuesta la limitación de peticiones, no la seguridad.

### Plantilla: el Caddyfile incluido

Así se ve en el Caddyfile del repositorio. Allí los destinos se llaman `app:3000` y `app:3001`, porque Caddy
funciona en la misma red de Compose; un proxy directamente en el host llega a los mismos servicios mediante
`127.0.0.1` y los puertos de la tabla de arriba.

```
	handle /collab* {
		reverse_proxy app:3001
	}

	reverse_proxy app:3000 {
		# Next.js streams server components; buffering would make the page appear
		# only in one piece.
		flush_interval -1
	}
```

La app establece ella misma sus cabeceras de seguridad (CSP, `frame-ancestors`, `nosniff`, Referrer- y
Permissions-Policy, HSTS); tu proxy no tiene que añadirlas.

### Otras rutas para el servicio de colaboración

Si el servicio de colaboración no está en `/collab` en el mismo nombre de host, necesitas
`GW_COLLAB_URL` (la dirección para el navegador) y, si procede, `GW_COLLAB_INTERNAL_URL` (la
dirección por la que la propia app llega al servicio cuando un acceso de escritura MCP entra en una
sala). En el caso normal, ambas quedan vacías.

## Sin proxy: túnel SSH

Para probar, también funciona sin ningún proxy, mediante un túnel:

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` tiene que apuntar entonces a la dirección que el navegador usa realmente. Sin HTTPS, los passkeys
solo funcionan en `localhost`.

## Comprobar que todo llega

| Síntoma                                                                                         | Causa                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| El certificado no se emite                                                                      | El nombre de host no resuelve a este servidor, o 80/443 están ocupados                                                                       |
| El editor muestra de forma permanente «Sin conexión. Tus cambios se enviarán en cuanto vuelva.» | `/collab` no se reenvía, o `GW_APP_URL` no coincide con la dirección del navegador: el socket rechaza un origen ajeno y lo escribe en el log |
| Las páginas aparecen con retraso y solo completas                                               | El proxy almacena las respuestas en búfer                                                                                                    |
| No se ofrece ningún passkey                                                                     | No hay HTTPS                                                                                                                                 |
| Claude o ChatGPT no pueden conectarse                                                           | La instalación no es accesible desde internet por HTTPS                                                                                      |

:::caution[No cambies el nombre de host después]
Los passkeys dependen de `GW_RP_ID`, que, sin un valor propio, sigue al host de `GW_APP_URL`. Quien
cambie el nombre de host después de que se hayan registrado passkeys los invalida todos.
:::

## Más información

- [Configuración](/es/self-hosting/configuration/)
- [Passkeys](/es/account/passkeys/)
- [Editar juntos en directo](/es/agenda/live-editing/)
- [Conectar un asistente](/es/ai/connect/)
