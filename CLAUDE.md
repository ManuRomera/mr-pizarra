# MR- Pizarra · guía de trabajo

Módulo de Foundry VTT (v13+, probado en 13.351) independiente del sistema. Id `mr-pizarra`.

## Mapa
- `scripts/rules.mjs` — reglas **puras** (sin Foundry): catálogo de imágenes, `planOps` (valida y traduce operaciones a un `update`), `look` (giro/contorno/adorno deterministas por id). Es lo que prueba `npm test`.
- `scripts/board-sheet.mjs` — la hoja (`DocumentSheetV2`): lienzo, arrastre, hilos, menús, diálogos, socket.
- `scripts/items.mjs` + `refs.mjs` — pintado de piezas y resolución de documentos colgados según permisos.
- `scripts/main.mjs` — registro de la hoja, botón «Nueva pizarra», opción «Abrir como pizarra», API en `game.modules.get("mr-pizarra").api`.
- `scripts/strings.mjs` — único origen de textos; `npm run lang` genera `lang/*.json` (el inglés se edita a mano en `lang/en.json`).
- `tools/prepare-assets.py` — limpia y convierte a WebP las imágenes del generador (necesita Pillow y numpy). Escribe `assets/manifest.json` (tamaños, huecos de marcos, fondos en mosaico).

## Datos
`flags.mr-pizarra.board` en un JournalEntry: `{background, locked, items:{id:{type,x,y,z,…}}, links:{id:{from,to,color,style,label}}}`. Una clave por pieza: nunca se reescribe el objeto entero.

## Trampas (aprendidas probando)
- `_replaceHTML` de una hoja V2 corre **antes** de insertar la ventana: no hay tamaño aún. La vista inicial se calcula con `ResizeObserver` en `_onRender`.
- Los fondos del zip original vienen reflejados en espejo (simetría perfecta): solo el cuarto superior izquierdo es real. Las texturas finas van en mosaico mezclado, el resto extendido (`tile` en el manifiesto).
- `filter` en `.mrp-lift` aísla el modo de mezcla: las manchas y marcas con `multiply` lo llevan en el `.mrp-item`, sin filtro.
- No pisar la fuente de iconos (`<i class="fa-*">`) en el CSS propio.
- Las piezas ocultas y privadas se filtran en el cliente: están en los datos del diario (quien abra la consola las ve). Para secretos de verdad, no colgarlos.
- Un documento que la jugadora no puede ver ni llega a su cliente: se muestra como «reservado».

## Probar de verdad
Servidor aparte (no tocar el mundo real): carpeta de datos propia con `Config/` copiado, mundo mínimo y el módulo enlazado por symlink; `node main.js --dataPath=… --port=30017 --world=…`. Dos sesiones a la vez: `localhost` y `127.0.0.1` tienen cookies distintas. Activar el módulo con `game.settings.set("core","moduleConfiguration",…)` y recargar.

## Publicar
Etiqueta `vX.Y.Z` (debe coincidir con `module.json`); el workflow sube `module.json` y `mr-pizarra.zip`. Añadir sección `## X.Y.Z` al CHANGELOG. Si se actualiza el módulo desde Foundry en esta máquina se pierde el `.git`.
