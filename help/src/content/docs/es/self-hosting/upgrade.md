---
title: Actualizar y hacer copias de seguridad
description: Llevar una instalación propia a una nueva versión, entender las migraciones y hacer copia de seguridad de la base de datos.
sidebar:
  order: 4
---

En GoodWorkshop, una actualización es el mismo proceso que la instalación: en cada arranque se ejecuta
la misma cadena de comprobación y migración. Antes va siempre una copia de seguridad. Los detalles están en
el README, en
[Updating](https://github.com/roleALPHA/good-workshop/blob/main/README.md#updating) y
[Backing up](https://github.com/roleALPHA/good-workshop/blob/main/README.md#backing-up), así como en
[docs/installation-and-upgrade.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/installation-and-upgrade.md).

## Actualizar a una nueva versión

Las versiones disponibles están en la
[página de versiones](https://github.com/roleALPHA/good-workshop/releases). Desde el directorio con el
`compose.yaml`:

```bash
# 1. Back up. An upgrade without a backup is a bet.
scripts/backup.sh before-upgrade-$(date +%F).sql.gz

# 2. Fetch the new image. With GW_VERSION=latest that is all;
#    with a pinned version, point GW_VERSION in the .env at the new tag first.
docker compose pull

# 3. Bring it up.
docker compose --profile tls up -d
```

Con una versión fija, antes del paso 2 escribes el nuevo número en `GW_VERSION`, sin «v».
Sin el perfil `tls`, omites `--profile tls`.

## Qué pasa con la base de datos al arrancar

`migrate` se ejecuta en cada arranque, y `app` lo espera. Así, un contenedor que funcionaría contra un esquema
que no entiende ni siquiera llega a arrancar.

| Paso               | Qué hace                                                          |
| ------------------ | ----------------------------------------------------------------- |
| `db-bootstrap.mjs` | crea los roles y establece sus contraseñas                        |
| `preflight.mjs`    | **solo lee** y comprueba si los datos encajan con las migraciones |
| `migrate.mjs`      | aplica las migraciones pendientes                                 |
| `provision.mjs`    | configura los tipos de bloque                                     |

### Si la comprobación previa se detiene

Si la comprobación previa encuentra filas que impiden una migración, `migrate` se interrumpe con
«MIGRATION STOPPED». La base de datos queda entonces **sin cambios**: no hay nada que revertir.
El mensaje indica las filas afectadas, la consulta con la que puedes verlas y la
decisión que hay que tomar. Después vuelves a arrancar con el mismo comando.

Lo que encontraría una actualización lo ves también sin actualizar:

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

:::caution[Si una migración falla a medias]
Entonces la referencia es el estado de `drizzle.__drizzle_migrations`: indica qué se ha aplicado.
El camino de vuelta parte de ahí y pasa por la copia de seguridad. El motivo lo indica `docker compose logs migrate`.
:::

### Actualizaciones automáticas (Watchtower)

Un actualizador como Watchtower sustituye **solo** el contenedor que vigila. El servicio `migrate`
no se ejecuta nunca, y la nueva app funcionaría contra el esquema antiguo. Para eso existe
`GW_MIGRATE_ON_START=1` junto con un `compose.override.yaml` del README
([Automatic updates](https://github.com/roleALPHA/good-workshop/blob/main/README.md#automatic-updates)).
El precio: `app` guarda entonces también las contraseñas del superusuario y de `gw_owner`, y la
separación de roles queda anulada para ese contenedor. Decídelo de forma consciente.

## Hacer copias de seguridad

La base de datos es el conjunto completo de datos, logotipos incluidos: son filas, no archivos.
Basta con un volcado:

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

Usa el script en lugar de una línea de `pg_dump` escrita a mano. La línea crea un archivo
incluso cuando no se ha guardado nada. El script escribe primero en un archivo aparte, comprueba si el volcado ha llegado
hasta su línea final y solo entonces le da el nombre definitivo.

### La clave de la aplicación también forma parte

La clave de la aplicación descifra las credenciales de correo que se introdujeron en la interfaz.
No está en el volcado:

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

Si se pierde, la copia de seguridad vuelve con las credenciales de correo **vacías**. Todo lo demás
(talleres, miembros, branding) lo supera; las credenciales las vuelves a introducir una vez.

### Qué debe ir en la copia de seguridad nocturna

Exactamente tres cosas: el volcado, la clave de la aplicación y el `.env`. Las contraseñas de la base de datos
no: el stack las genera de nuevo cuando hace falta. Comprueba qué contiene el archivo, no solo que exista.
Un volcado fallido puede dejar un archivo gzip válido pero vacío:

```bash
gzip -dc goodworkshop.sql.gz | tail -c 400 | grep -c 'dump complete'
```

Para copias de seguridad externas hay tres scripts en el repositorio, pensados como temporizadores de systemd:

| Script                        | Qué responde                                         | Dónde se ejecuta             |
| ----------------------------- | ---------------------------------------------------- | ---------------------------- |
| `scripts/backup-offsite.sh`   | ¿Está el estado de hoy cifrado en otro lugar?        | en el servidor, a diario     |
| `scripts/backup-verify.sh`    | ¿Se puede restaurar realmente la copia de seguridad? | en el servidor, semanalmente |
| `scripts/backup-freshness.sh` | ¿Se sigue haciendo copia de seguridad?               | **en otro equipo**, a diario |

La configuración y las unidades de systemd están en el README.

## Restaurar

Las contraseñas de la base de datos no están en el volcado, y una restauración en un servidor nuevo
tampoco las necesita: `secrets` genera otras nuevas y `migrate` las asigna a los roles. Los
roles en sí no están en ningún volcado; los crea `db-bootstrap.mjs`. Para volver necesitas,
por tanto, el volcado, la clave de la aplicación y el `.env`.

El repositorio no documenta un comando de restauración listo para la instalación en marcha.
Cómo se vuelve a cargar un volcado en un Postgres nuevo lo muestra `scripts/backup-verify.sh`:
hace exactamente eso en contenedores desechables, sin tocar el stack de producción. Prueba la
restauración antes de necesitarla.

:::note[La retención es una promesa]
La copia de seguridad externa conserva 14 estados diarios, 8 semanales y 12 mensuales. Lo que
configures debe figurar también en tu política de privacidad; consulta [Protección de datos](/es/self-hosting/data-protection/).
:::

## Más información

- [Instalación](/es/self-hosting/installation/)
- [Configuración](/es/self-hosting/configuration/)
- [Problemas conocidos](/es/troubleshooting/known-issues/)
