---
title: Instalación
description: Instalar GoodWorkshop con Docker Compose en tu propio servidor y crear la primera cuenta de administración mediante /setup.
sidebar:
  order: 1
---

La edición Community de GoodWorkshop funciona como una imagen de contenedor más Postgres, arrancada con
Docker Compose. Por planificar y llevar a cabo tus talleres no pagas ninguna licencia, tampoco
con uso comercial. Si no quieres mantener un servidor: la
[GoodWorkshop Cloud](/es/cloud/overview/) es el mismo producto, alojado.

Esta página resume la instalación. La referencia es la sección
[Installation (on-premise)](https://github.com/roleALPHA/good-workshop/blob/main/README.md#installation-on-premise)
del README.

## Requisitos

| Qué            | Requisito                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Docker         | Docker con Compose v2 (`docker compose version`), amd64 o arm64                                    |
| Nombre de host | Un nombre que resuelva públicamente a este servidor                                                |
| Puertos        | 80 y 443 libres: Let's Encrypt necesita ambos para el certificado                                  |
| Base de datos  | Nada que hacer: Postgres funciona dentro del stack y no es accesible desde fuera                   |
| Contraseñas    | Nada que hacer: el stack genera él mismo las contraseñas de la base de datos en el primer arranque |

## 1. Obtener los archivos

Necesitas `compose.yaml`, `Caddyfile` y un `.env`:

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

## 2. Elegir la imagen

Las versiones están en GitHub Container Registry. `compose.yaml` descarga la imagen que indica
`GW_VERSION`. `latest` apunta siempre a la versión estable más reciente. Cada versión está
además disponible con su propio número: así te quedas en una versión hasta que actualices tú
mismo. No tienes que compilar nada.

:::caution[Sin «v»]
La etiqueta de la imagen no lleva «v»: la versión `v0.8.22` se llama `0.8.22` como imagen. Con la «v», la
descarga falla con «not found».
:::

## 3. Rellenar el `.env`

Tres valores son obligatorios. Si falta uno, el stack no arranca e indica el valor que falta:

```bash
GW_APP_URL=https://workshop.example.com   # the address the app is reachable at
GW_HOSTNAME=workshop.example.com          # the name in the certificate (profile `tls`)
GW_VERSION=latest                         # the newest stable release, or e.g. 0.8.22 to pin one
```

**El correo puede esperar.** Para el primer arranque no necesitas envío de correo: la
página de configuración muestra ella misma tu enlace de acceso. Después configuras el envío en la
interfaz, en **Envío de correo**; consulta [Envío de correo](/es/account/mail/). Todas las demás
variables están en [Configuración](/es/self-hosting/configuration/).

:::danger[Decide ahora el nombre de host]
Los passkeys dependen del nombre de host. Quien lo cambie más adelante invalida **todos** los
passkeys ya registrados. Decide el nombre antes del primer arranque.
:::

## 4. Arrancar

```bash
docker compose --profile tls up -d
```

Ocurre lo siguiente, por orden:

1. `secrets` genera las contraseñas de la base de datos, una por rol.
2. `db` arranca.
3. `migrate` crea los roles, comprueba los datos existentes, aplica las migraciones y
   configura los tipos de bloque.
4. `app` solo arranca cuando `migrate` ha terminado sin errores.
5. `caddy` se encarga de los puertos 80 y 443 y obtiene el certificado.

Si todo funciona, responde el healthcheck:

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

Un `503` no es un fallo, sino la respuesta honesta «este contenedor no puede
servir». `checks` indica si se debe a la base de datos o al estado de las migraciones.

## 5. Tomar posesión de la instalación en el navegador

Una instalación nueva se anuncia en el log en cada arranque, hasta que alguien toma posesión de ella:

```bash
docker compose logs app
```

```
  This installation has no administrator yet.

    https://workshop.example.com/setup
    Setup key: 7Qb3…

  The key is valid until this process restarts.
```

1. Abre la dirección `/setup` que aparece.
2. Introduce **Nombre**, **Apellido** y **Tu dirección de correo**.
3. Pega la **Clave de instalación** del log.
4. Haz clic en **Configurar esta instalación**.

Si todavía no hay envío de correo configurado, el enlace de acceso aparece directamente en la página. Vale
una sola vez y caduca. Todo lo demás (envío de correo, más personas, branding) lo haces
después en la interfaz.

:::note[La clave es todo el control de acceso]
Quien puede leer `docker compose logs app` es quien opera la instalación. La clave solo está en
memoria: tras reiniciar `app`, vale una nueva. En cuanto hay una persona administradora,
`/setup` desaparece para siempre: no se puede tomar posesión de una instalación por segunda
vez.
:::

### Otras dos vías para el primer admin

**Desde la línea de comandos**, con una shell en el servidor:

```bash
docker compose exec app node scripts/cli.mjs admin create \
  --email you@example.com --first-name Anna --last-name Berger
```

**En el primerísimo arranque:** pon `GW_BOOTSTRAP_ADMIN_EMAIL=you@example.com` en el `.env` antes
de que el stack arranque por primera vez. El enlace aparece entonces en `docker compose logs migrate`, vale una
hora y se imprime exactamente una vez. Está pensado para instalaciones que monta un script en lugar
de una persona.

Si no encuentras la clave o el enlace, te ayudará
[Inicio de sesión y enlace de acceso](/es/troubleshooting/sign-in/).

## Más información

- [Configuración](/es/self-hosting/configuration/): todas las variables importantes
- [HTTPS y proxy inverso](/es/self-hosting/tls/): sin Caddy o detrás de tu propio proxy
- [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/): actualizaciones y copias de seguridad
- [Protección de datos](/es/self-hosting/data-protection/): lo que debes saber como responsable de la instalación
