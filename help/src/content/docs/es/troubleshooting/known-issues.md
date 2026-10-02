---
title: Problemas conocidos
description: Limitaciones actuales de GoodWorkshop que constan como tales en la documentación o en el código.
sidebar:
  order: 4
---

Aquí se recoge lo que GoodWorkshop, a propósito, no puede hacer o todavía no puede hacer. La lista
es corta porque solo incluye lo que el propio proyecto tiene documentado como limitación. Los
errores que no aparecen aquí se comunican a través del [Soporte](/es/troubleshooting/support/).

## Para todos

### Después de iniciar sesión no se vuelve a la página de autorización

Si no has iniciado sesión cuando un cliente te envía a la autorización, inicias sesión y acabas en
la biblioteca en lugar de en **¿Permitir el acceso?**. En ese caso, vuelve a empezar la conexión
desde el cliente. Solución: inicia sesión antes en el mismo navegador.

### Los campos de texto con formato no se pueden editar

Los párrafos sencillos se pueden editar en cualquier campo de texto. Pero si un campo contiene
formato, como listas o negrita, el editor muestra: «Contiene formato. La edición llegará con el
editor de texto — hasta entonces el contenido se queda intacto.» El contenido se conserva completo
en lugar de aplanarse con la primera pulsación de tecla — pero de momento en el editor solo se
puede leer.

### Un nombre borrado sigue en el historial de edición

Si borras un nombre en el editor, desaparece de la agenda actual, pero todavía no del historial de
la edición en directo. Si algo tiene que desaparecer por completo, elimina el taller y vacía la
[Papelera](/es/library/trash/).

## Instalación propia

### Passkeys solo con HTTPS y un nombre de host fijo

Sin HTTPS no hay passkeys, salvo en `localhost`; el enlace de acceso por correo es entonces la única
forma de entrar. Quien cambia el nombre de host después de registrar passkeys los invalida todos.
Consulta [HTTPS y proxy inverso](/es/self-hosting/tls/).

### Los datos antiguos no se borran automáticamente

Una instalación Community no tiene ninguna tarea de retención. Los enlaces de acceso caducados, las
sesiones, las visitas a enlaces de invitación (cada una con su dirección IP) y el registro de
auditoría se quedan ahí hasta que los borres. Las consultas para hacerlo están en
[Protección de datos](/es/self-hosting/data-protection/).

### Las actualizaciones automáticas se saltan la migración

Un actualizador como Watchtower solo sustituye el contenedor de la app; el servicio `migrate` no se
ejecuta. Sin `GW_MIGRATE_ON_START=1` y el archivo override correspondiente, la nueva app arranca
contra el esquema antiguo. Consulta [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/).

### La limitación de peticiones es por proceso

Los límites de las peticiones de passkey y de `/api/mcp` se cuentan en memoria. Si hay varios
contenedores de la app en paralelo, el límite efectivo se multiplica por su número. El límite de
enlaces de acceso por dirección de destino, en cambio, se cuenta en la base de datos y es exacto.

### Sin una dirección de origen adecuada, un contador compartido

Si detrás del proxy no llega ninguna dirección de origen, todas las peticiones caen en el mismo
contador — y entonces `/api/mcp` puede responder con `rate_limited` aunque cada persona haga poco.
Comprueba `X-Forwarded-For` y `GW_TRUSTED_PROXIES`.

### Las credenciales de correo dependen de la clave de la aplicación

Una copia de seguridad sin la clave de la aplicación se restaura con las credenciales de correo
vacías. Todo lo demás se conserva; las credenciales las vuelves a introducir. Guarda también la
clave en la copia; consulta [Actualizar y hacer copias de seguridad](/es/self-hosting/upgrade/).

## Más información

- [Resumen](/es/troubleshooting/overview/)
- [Soporte](/es/troubleshooting/support/)
- [Issues de GitHub](https://github.com/roleALPHA/good-workshop/issues)
