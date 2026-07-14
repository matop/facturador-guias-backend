> **Procedencia**: documento entregado por otra app interna ("Cobranza") como ejemplo portable de su
> integración ya funcionando con Perfilamiento (AC). Se copia sin modificar a este repo para que sea
> accesible desde los tickets del wayfinder map "Evaluar integración con esquema de auth de Perfilamiento (AC)"
> sin depender de una copia local fuera del repo. El código y rutas de archivo referenciados en la sección 8
> pertenecen a la app Cobranza, no a `guias-middleware`.

# Integración con Perfilamiento () — Recepción de sesión vía JWT

> **Propósito de este documento**
> Describir, de forma **portable y reutilizable**, cómo una aplicación recibe la
> identidad y las variables de sesión emitidas por **Perfilamiento** . Está escrito para que **otro desarrollador u otra
> aplicación** puedan replicar la integración **sin depender de la lógica de negocio
> de Cobranza**.
>
> Todo lo que aquí se describe ocurre en el borde de entrada de la app: un único
> endpoint (`/api/setsession`) que recibe un JWT firmado, lo valida y traduce sus
> claims a variables de sesión. Lo que la app haga **después** con esas variables
> (persistencia, cookies, multi-tenant, etc.) es específico de cada app y se marca
> explícitamente como **[Específico de la app]**.

---

## 1. Panorama general

Perfilamiento es la **autoridad de identidad**. No expone una API que la app
consuma; en su lugar, **redirige al usuario** hacia la app entregando un **JWT
firmado (RS256)** que contiene:

- **Quién es el usuario** (holder): RUT, nombre, correo.
- **Con qué rol/perfil entra**: código de perfil, nombre, descripción.
- **Qué alcances tiene** (contexto): p.ej. empresa, ambiente — codificados como
  *paths* + *templates*.
- **Qué atribuciones/permisos tiene**: *paths* de atribución + propiedades.
- **Metadatos del token**: emisor, vigencia (nbf/exp), id único (jti), asignación,
  URL de reingreso.

El flujo de alto nivel:

```
Perfilamiento (AC)
   │  1. Usuario autenticado en AC elige una app/rol
   │  2. AC genera un JWT firmado con su clave privada
   ▼
POST /api/setsession   (JWT en el body o query string)
   │  3. La app carga la CLAVE PÚBLICA de AC
   │  4. Verifica la firma (RS256) y la vigencia (nbf/exp)
   │  5. Extrae los claims y los mapea a "variables de sesión"
   ▼
Variables de sesión disponibles para la app
   (identidad + contexto + permisos)
```

**Punto clave:** la confianza se basa exclusivamente en la **verificación
criptográfica de la firma** con la clave pública de AC. La app nunca comparte
secretos con AC; solo necesita la clave pública.

---

## 2. El contrato de entrada: endpoint `setsession`

### 2.1 Recepción del JWT

Perfilamiento entrega el token a un endpoint (en esta app: `POST /api/setsession`).
El receptor **acepta el JWT desde múltiples fuentes** para ser compatible con la
forma en que AC redirige (formularios, GET con query, AJAX):

| Fuente | Ejemplo | Notas |
|---|---|---|
| Body JSON | `{ "JWT": "<token>", "parametro": "OnBoarding" }` | `Content-Type: application/json` |
| Body form-urlencoded | `JWT=<token>&parametro=OnBoarding` | Forma típica de un POST de AC |
| Query string | `?JWT=<token>&parametro=...` | Fallback |
| Query key sin valor | `?OnBoarding` | Se interpreta como `parametro` (nodo raíz/módulo) |

El nombre del claim se busca de forma tolerante: `JWT`, `jwt`. El segundo dato,
`parametro` (también llamado **nodo raíz** o módulo de entrada), es un string libre
que la app usa para decidir a dónde redirigir tras crear la sesión.

### 2.2 Respuesta del endpoint

El endpoint decide su respuesta según **quién llama** (negociación de contenido):

- **Navegador (acceso directo)** → responde **HTML con redirección** (meta refresh
  + `window.location`), porque una redirección HTTP 302 no arrastra las cookies de
  sesión recién creadas.
- **AJAX / `Accept: application/json` / origen AC** → responde **JSON**:

```jsonc
{
  "success": true,
  "message": "Sesion creada exitosamente",
  "validatedOK": true,   // la firma se verificó
  "periodOK": true,      // el token está vigente
  "sessionId": "sess_...",
  "userRut": "12345678K",
  "empkey": "1234",
  "authSystem": "JWT",
  "redirectUrl": "https://host/dashboard/1234",
  "expiresAt": "2026-01-01T00:00:00.000Z"
}
```

Los dos flags **`validatedOK`** y **`periodOK`** son el corazón del contrato de
respuesta y sirven para diagnosticar fallos:

| `validatedOK` | `periodOK` | Significado | HTTP |
|---|---|---|---|
| `false` | `false` | JWT ausente / firma inválida / token no decodificable | 400/401 |
| `true` | `false` | Firma OK pero token expirado o aún no vigente | 401 |
| `true` | `true` | Sesión válida y creada | 200 |

---

## 3. Estructura del JWT que emite Perfilamiento

### 3.1 Header

```json
{ "alg": "RS256", "typ": "JWT" }
```

Solo se acepta **RS256** (RSA + SHA-256). Cualquier otro algoritmo se rechaza.

### 3.2 Payload (claims)

El payload mezcla **claims estándar (RFC 7519)** con **claims personalizados de AC**.
Nótese que varios claims complejos (`aud`, `Rol`, a veces `iss`) pueden venir como
**objeto JSON o como string JSON** — el receptor debe intentar `JSON.parse` cuando
llegan como string.

```jsonc
{
  // ---- Claims estándar RFC 7519 ----
  "iss": { "Nombre": "AC-Perfilamiento" },   // Emisor (string u objeto)
  "aud": { ... },                            // Audiencia = el "holder"/usuario (ver 3.3)
  "jti": "uuid-...:1234",                     // ID único; puede traer ":<asignacion>" al final
  "iat": 1710000000,                          // Issued At (UNIX segundos)
  "nbf": 1710000000,                          // Not Before (UNIX segundos)
  "exp": 1710086400,                          // Expiration (UNIX segundos)

  // ---- Claims personalizados AC ----
  "Asignacion": 1234,                         // Opcional; clave de asignación
  "ReentryURL": "https://ac/reentry?...",     // Opcional; URL para re-elegir rol
  "Rol": { ... }                              // Rol + perfil + alcances + atribuciones (ver 3.4)
}
```

**Validación mínima del payload** (antes de mapear): deben existir `iss`, `aud`,
`jti` (string), `iat`/`nbf`/`exp` (number) y `Rol`. `Asignacion` y `ReentryURL` son
opcionales.

> **Fechas:** `iat`/`nbf`/`exp` vienen en **UNIX timestamp (segundos, UTC)**. El
> receptor los convierte a ISO 8601 UTC. La validez se comprueba como
> `nbf <= ahora <= exp`, con **1 minuto de tolerancia (grace)** para desajustes de
> reloj.

### 3.3 `aud` — Audience (el holder / usuario)

Describe a la persona que entra. Estructura:

```jsonc
{
  "AgenteKey": 987,            // ID interno del usuario en AC (> 0)
  "AgenteName": "Juan",
  "AgenteLastName": "Pérez",
  "PI": [                       // Identificadores Personales (lista tipo/valor)
    { "PI_Tipo": "RUT",    "PI_Valor": "12.345.678-K" },
    { "PI_Tipo": "CORREO", "PI_Valor": "juan@correo.cl" }
  ],
  "Canal": [                    // Canales de contacto (opcional)
    { "CanalIdL": "WhatsApp", "CanalValor": "+569..." }
  ]
}
```

- **`PI`** (Personal Identifiers) es la fuente del **RUT** y el **CORREO**. Se busca
  por `PI_Tipo` (comparación case-insensitive: `RUT`, `CORREO`).
- El **RUT se normaliza** (se quita formato, se valida, se completa a 9 caracteres:
  8 dígitos + DV). De ahí se derivan: RUT completo, RUT sin DV y DV.
- **`Canal`** son medios de contacto adicionales; su uso es opcional.

### 3.4 `Rol` — Rol, perfil, alcances y atribuciones

Es el claim más rico. Define el **rol** con el que entra el usuario y **el contexto
y los permisos** de ese rol.

```jsonc
{
  "RolName": "Administrador",
  "RolKey": 42,                 // > 0
  "PerfilIdL": "AdminCobru",    // Código estable del perfil (identificador lógico)
  "PerfilName": "Administrador de Cobranza",
  "PerfilDescripcion": "...",

  // Contexto: pares (valor-path, template-path)
  "Alcance": [
    {
      "AlcancePath":         ".Empresa.1234.76543210-9.ACME S.A.",
      "AlcanceTemplatePath": ".Empresa.EmpresaKey.EmpresaRut.EmpresaNombre."
    },
    {
      "AlcancePath":         ".Ambiente.Produccion.",
      "AlcanceTemplatePath": ".Ambiente.TipoAmbiente."
    }
  ],

  // Permisos: pares (path, propiedad)
  "Atribucion": [
    { "AtribucionPath": ".Menu.Deudores.Ver", "Propiedad": "RWXD..." }
  ]
}
```

#### Cómo funcionan los Alcances (mecanismo clave)

Los **alcances** son la forma en que AC transmite el **contexto dinámico** (qué
empresa, qué ambiente, etc.) sin un esquema fijo. Cada alcance viene como **dos
paths paralelos separados por puntos**:

- **`AlcancePath`** = los **valores**.
- **`AlcanceTemplatePath`** = los **nombres de variable** (etiquetas), en las mismas
  posiciones.

Emparejando **posición a posición** se obtiene un diccionario `etiqueta → valor`:

```
AlcancePath:         .Empresa . 1234      . 76543210-9 . ACME S.A.
AlcanceTemplatePath: .Empresa . EmpresaKey . EmpresaRut  . EmpresaNombre
                        │          │            │            │
                        ▼          ▼            ▼            ▼
                     (raíz)   EmpresaKey=1234  EmpresaRut=76543210-9  EmpresaNombre="ACME S.A."
```

Reglas del algoritmo:

1. `alcancepathac` y `alcancetemplatepathac` concatenan **todos** los alcances
   separados por `|`. Ej: `.Empresa.1234.|.Ambiente.Prod.`
2. Se separan por `|`, luego cada path se limpia de puntos inicial/final y se divide
   por `.`.
3. La **posición 1** (raíz, p.ej. `Empresa`) se usa para **encontrar el template**
   que empieza con esa raíz; las posiciones siguientes son valores etiquetados.
4. Para cada valor en posición *i*, su etiqueta es el elemento en posición *i* del
   template con la misma raíz.
5. El resultado (`EmpresaKey`, `EmpresaRut`, `EmpresaNombre`, `TipoAmbiente`, …) se
   agrega como **variables de sesión con el nombre de la etiqueta**.

> Este diseño permite que AC agregue nuevos contextos **sin cambios de código** en
> la app: basta con emitir un nuevo par path/template.

#### Atribuciones (permisos)

`Atribucion` es la lista de permisos. Cada item tiene un `AtribucionPath` (qué
recurso/acción) y una `Propiedad` (los flags de permiso). La interpretación de
`Propiedad` (p.ej. leer/escribir/ejecutar/borrar) es específica del modelo de
permisos de AC ("AtribucionesV25") y se aplica según la necesidad de cada app.

---

## 4. Proceso de validación y extracción (paso a paso)

Este es el pipeline genérico, reutilizable en cualquier app:

1. **Obtener el JWT** del request (body JSON / form / query).
2. **Cargar la clave pública** de AC (ver §6). Se cachea en memoria.
3. **Decodificar** el token (header + payload) sin verificar, para inspección.
4. **Verificar algoritmo** = `RS256`; rechazar cualquier otro.
5. **Verificar la firma** con la clave pública (`jsonwebtoken.verify`).
   → si falla: `validatedOK=false`.
6. **Validar estructura** del payload (claims requeridos presentes).
7. **Mapear** el payload crudo a un modelo tipado (`AuthzJWT`): parsear `iss`/`aud`/
   `Rol` si vienen como string, convertir timestamps UNIX→ISO, extraer `Asignacion`
   del `jti` si trae `:<n>`.
8. **Validar vigencia** `nbf <= ahora(+1min) <= exp`.
   → si falla: `periodOK=false`.
9. **Extraer variables de sesión**:
   - Campos fijos del holder (RUT, nombre, correo, perfil).
   - Alcances → variables etiquetadas (empresa, ambiente, …).
   - Reentry, nodo raíz, normalización de empkey.
10. **Entregar** las variables a la capa de sesión de la app.

Los pasos 1–9 son **agnósticos del negocio**. El paso 10 es donde entra la lógica
propia de cada app.

---

## 5. Diccionario de variables de sesión resultantes

Tras una validación exitosa, el receptor produce este conjunto de variables. Los
nombres provienen de una convención de AC (prefijo `_` para datos del usuario). Las
variables de **alcance** (empresa, ambiente) aparecen con el **nombre de su etiqueta**
del template, por lo que su presencia depende de lo que AC incluya.

### 5.1 Identidad del usuario (holder)

| Variable | Origen (claim/getter) | Descripción |
|---|---|---|
| `_RUTUSU` | `aud.PI[RUT]` normalizado (con DV) | RUT completo del usuario, 9 chars |
| `RUTNODV` | `aud.PI[RUT]` sin DV | RUT sin dígito verificador (8 chars) |
| `_NOMUSU` | `aud.AgenteName + AgenteLastName` | Nombre completo |
| `_CORREO` | `aud.PI[CORREO]` | Correo del usuario |
| `_NOTPERFIL` | `Rol.PerfilIdL` | **Código de perfil** (identificador lógico estable) |
| `_NOTPERFILDES` | `Rol.PerfilDescripcion` | Descripción del perfil |

### 5.2 Contexto (derivado de Alcances — nombres dependientes del template)

| Variable | Ejemplo de template | Descripción |
|---|---|---|
| `EmpresaKey` / `empkey` / `_EmpKey` | `.Empresa.EmpresaKey....` | Clave de la empresa (tenant) |
| `EmpresaRut` | `.Empresa.….EmpresaRut.…` | RUT de la empresa |
| `EmpresaNombre` | `.Empresa.….EmpresaNombre` | Razón social |
| `MANDANTE` / `REPOSITORIO` | (derivadas de `EmpresaNombre`) | Alias de la razón social |
| `TipoAmbiente` (u otros) | `.Ambiente.TipoAmbiente` | Cualquier alcance adicional que AC emita |

> `empkey`, `EmpresaKey` y `_EmpKey` se normalizan al mismo valor. Si el usuario no
> tiene empresa asociada, estas variables quedan vacías (es un caso válido).

### 5.3 Parámetros y metadatos

| Variable | Origen | Descripción |
|---|---|---|
| `_NODORAIZ` / `PARAMETROENTRADA` | `parametro` del request | Nodo raíz / módulo de entrada |
| `CHGROLURI` | `Rol`/`ReentryURL` (claim `reentry`) | URL para re-elegir rol en AC |
| `TipoAmbiente` (metadato) | fijado por el receptor = `"JWT"` | Tipo de autenticación |

### 5.4 Otros claims disponibles (no siempre persistidos)

Además de lo anterior, del `AuthzJWT` se pueden leer bajo demanda: `nombreissuer`
(emisor), `serialnumber` (`jti`), `inijwt`/`finjwt`/`regtimejwt` (fechas),
`nombrerol`/`keyrol`, `keyholder` (`AgenteKey`), `asignacionac`, `atribpathac` /
`atribpropac` (atribuciones), `perfilname`.

**Getter genérico** (dispatcher `GetElemento_JWT`, etiquetas case-insensitive):

| Etiqueta | Devuelve |
|---|---|
| `rutholder` / `rutholdernodv` / `rutholderdv` | RUT completo / sin DV / solo DV |
| `nombreholder` / `correoholder` / `keyholder` | Nombre completo / correo / AgenteKey |
| `perfilidl` / `perfilname` / `perfildes` | Perfil: código / nombre / descripción |
| `nombrerol` / `keyrol` / `asignacionac` | Rol: nombre / key / asignación |
| `alcancepathac` / `alcancetemplatepathac` | Alcances (paths / templates) unidos por `\|` |
| `atribpathac` / `atribpropac` | Atribuciones (paths / propiedades) unidos por `\|` |
| `inijwt` / `finjwt` / `regtimejwt` | Vigencia (nbf / exp / iat) en ISO UTC |
| `nombreissuer` / `serialnumber` / `sigalg` | Emisor / jti / algoritmo |
| `reentry` | ReentryURL |

---

## 6. Requisitos de configuración para recibir de Perfilamiento

Lo mínimo que necesita **cualquier app** para consumir la sesión de AC:

1. **Clave pública de AC (RSA/PEM).** Es lo único imprescindible; con ella se
   verifica la firma. Puede provenir de:
   - Una **URL remota** (recomendado): la app la descarga y cachea (TTL 1 hora). En
     esta app la URL se obtiene de un parámetro central (`PublicKeyPrfURL`).
   - Un **archivo local**, vía variable de entorno `JWT_PUBLIC_KEY_PATH` (fallback).
   - La clave debe estar en formato PEM (`-----BEGIN ... -----END ...`).

2. **Endpoint receptor** que implemente el contrato de §2 (aceptar el JWT por
   body/query y responder JSON o redirección HTML).

3. **Reloj sincronizado** (para la validación `nbf`/`exp`; hay 1 min de tolerancia).

No se requieren secretos compartidos, ni llamadas salientes a AC durante el login
(salvo, opcionalmente, descargar la clave pública).

---

## 7. Qué es genérico vs. específico de la app

Para portar esta integración a otra aplicación, separa claramente:

### Genérico / reutilizable (el "conocimiento" a exportar)
- El **contrato del endpoint** (§2) y los flags `validatedOK`/`periodOK`.
- La **estructura del JWT** de AC (§3): header RS256, claims estándar y `aud`/`Rol`.
- El **mecanismo de alcances** path+template (§3.4).
- El **pipeline de validación y extracción** (§4).
- El **diccionario de variables** y los getters (§5).
- El **requisito de la clave pública** (§6).

### [Específico de la app] — no portar tal cual
- **Dónde y cómo se persiste la sesión** tras extraer las variables. En esta app:
  - Cookie cifrada `ac-session-id` (iron-session, TTL 24h) con las variables
    esenciales.
  - El **JWT crudo** se guarda en base de datos (tabla de sesiones), referenciado
    por un `sesionid` guardado en la cookie.
- **Redirección post-login** (`/dashboard/{empkey}` vs `/onboarding`), decidida por
  el `parametro`/nodo raíz.
- **Efectos secundarios de negocio** al crear sesión (alta/actualización de usuario,
  sincronización de parámetros, transiciones de estado de documentos, etc.).
- La convención de **nombres de variables** (`_RUTUSU`, `empkey`, …) proviene del
  sistema legado (GeneXus) de AC; otra app puede renombrarlas.
- El **modelo de permisos** "AtribucionesV25" y su interpretación de `Propiedad`.

---

## 8. Referencias de código (en la app Cobranza — no en `guias-middleware`)

| Componente | Archivo |
|---|---|
| Endpoint receptor | `src/app/api/setsession/route.ts` |
| Orquestador de validación | `src/lib/ApiJWT/UtilesJWT/ConsumoJWT/ControladorConsumoJWT.ts` |
| Verificación de firma (RS256) | `src/lib/ApiJWT/UtilesJWT/ConsumoJWT/ValidarJWT.ts` |
| Mapeo payload → modelo | `src/lib/ApiJWT/UtilesJWT/ConsumoJWT/JWT2AuthzJWT.ts` |
| Modelo de datos del JWT | `src/lib/ApiJWT/UtilesJWT/ModeloJWT/` (`AuthzJWT`, `JWT_Audience`, `JWT_Rol`, `AlcanceItem`, `AtribucionItem`, `PIItem`, `CanalItem`) |
| Extracción de variables | `src/lib/ApiJWT/UtilesJWT/SetSession.ts` (`ExtractVariablesFromJWT_Core`) |
| Resolución de etiquetas de alcance | `src/lib/ApiJWT/UtilesJWT/SessionUtils/GetEtiquetaAlcance_SetSession.ts` |
| Getters de claims | `src/lib/ApiJWT/UtilesJWT/ConsumoJWT/JWTGetters/` |
| Carga de clave pública | `src/lib/ApiJWT/Utiles/PublicKey/LoadPublicKey.ts` |
| Persistencia de sesión **[Específico]** | `src/lib/iron-session-config.ts`, `src/lib/iron-session-helpers.ts` |

> El módulo `src/lib/ApiJWT/` es una migración desde procedimientos GeneXus de AC
> (`setsessionV2511`, `ControladorConsumoJWT`, `ValidarJWT`, `JWT2AuthzJWT`, …), por
> lo que su terminología refleja la del sistema de origen.
