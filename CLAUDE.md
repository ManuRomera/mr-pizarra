# MR- Pizarra · guía de trabajo

Módulo de Foundry VTT (v13+, probado en 13.351) independiente del sistema. Id `mr-pizarra`.

## Mapa
- `scripts/rules.mjs` — reglas **puras** (sin Foundry): catálogo de imágenes, `planOps` (valida y traduce operaciones a un `update`), `look` (giro/contorno/adorno deterministas por id). Es lo que prueba `npm test`.
- `scripts/board-sheet.mjs` — la hoja (`DocumentSheetV2`): lienzo, arrastre, hilos, menús, diálogos, socket.
- `scripts/items.mjs` + `refs.mjs` — pintado de piezas y resolución de documentos colgados según permisos.
- `scripts/main.mjs` — registro de la hoja, botón «Nueva pizarra», opción «Abrir como pizarra», API en `game.modules.get("mr-pizarra").api`.
- `scripts/strings.mjs` — único origen de textos; `npm run lang` genera `lang/*.json` (el inglés se edita a mano en `lang/en.json`).
- `tools/prepare-assets.py` — limpia y convierte a WebP las imágenes del generador (necesita Pillow y numpy). Escribe `assets/manifest.json` (tamaños, huecos de marcos, fondos en mosaico).

## Cómo funciona la selección y el grupo
- `#sel` (ids) + caja `.mrp-sel` con asas. Al mover/escalar/girar se aplica una **vista previa por CSS** (`transform` en cada `.mrp-item`, ver `#setPreview`) y los hilos se recalculan con ese mismo estado (`#anchor`); al soltar, `#commit` envía un lote de operaciones. Escala y giro son alrededor del centro de la caja.
- Historial: `#commit` calcula la inversa (`#inverse`) antes de enviar: valores anteriores, lo creado se quita y lo quitado vuelve **con sus hilos, piezas antes que hilos**. Un campo que la pieza no tenía guardado (`w`, `rot`, `hidden`, `owner`) se restaura con su valor efectivo.
- `requestAnimationFrame` se pausa con la pestaña en segundo plano: lo esencial (hilos, selección, barra) se pinta de forma síncrona; solo el minimapa va por rAF.

## Sujeciones, texto y accesibilidad
- `look(id, item, preset)` (rules.mjs) devuelve `pins[]` ya resueltos desde la pieza y la sujeción por defecto de la pizarra (`board.pinPreset`); `PIN_LAYOUTS` define las colocaciones. `items.mjs` las coloca sobre el **borde real** del contorno (`manifest.edge`: perfiles arriba/abajo/izquierda/derecha) y calcula el hueco que reservan para el texto: los centrados reservan entero, los de esquina solo una franja.
- Capas del lienzo (de abajo arriba): fondo, piezas, hilos (svg), **sujeciones** (`.mrp-pins`, `#buildPins`/`#drawPins`: cada una se coloca desde `data-pins` de su pieza, con la vista previa de mover/escalar/girar), caja de selección. Así el hilo queda entre el papel y la chincheta.
- Tamaño fijo de chinchetas/clips/grapas; el color se tiñe con una capa `mix-blend-mode: color` + máscara sobre la imagen en grises (la URL de la máscara en una variable CSS va **absoluta** con `foundry.utils.getRoute`).
- Edición directa: `contenteditable="plaintext-only"` sobre los `[data-field]`; se guarda con `textContent` (nunca `innerText`: aplica `text-transform`).
- `fitText` solo mide con la ventana en pantalla: se llama en `_onRender` y en el primer `ResizeObserver` (`#fitAll`). El texto de sellos y pies se escala con `--fit`, el resto con `em`.
- Accesibilidad: ajuste de cliente `a11y` (clases `mrp-legible`, `mrp-hc`, `mrp-calm`, `mrp-bigui`, variable `--tscale`). `zoom` CSS en la interfaz grande obliga a dividir posiciones por el zoom (`#place`).
- Fondos: los del generador están reflejados en espejo. El mapa antiguo se retiró (sin resolución); el pergamino se genera con ruido periódico en `prepare-assets.py`; los periódicos también (los del zip traían texto fantasma).

## Fichas sin vincular, desvelar e importar
- `entity` puede ser **sin vincular** (`uuid: ""`, con `name`/`kind`/`img`) y enlazarse después (`uuid` solo se puede poner una vez). `reveal: {name, img}` (solo la Guardiana) es una instantánea para mostrar la ficha a quien no tiene permiso: esa persona no recibe el documento, así que no se puede leer en vivo (`refs.resolveEntity`).
- `scripts/import.mjs` es puro y testeado: `parseImport` (saca el JSON de vallas/texto), `normalizeImport` (valida; errores omiten, avisos corrigen; coloca en cuadrícula lo que no traiga x/y) y `buildPrompt` (se genera desde el catálogo de rules.mjs: añadir un papel/sello nuevo lo incluye solo; hay un test que valida el ejemplo del propio prompt). `import-app.mjs` hace lo que necesita Foundry: vincular por nombre exacto, crear diarios, validar cada operación con `planOps` y enviar por lotes. `npm run prompt` regenera `docs/prompt-ia.md`.

## Datos
`flags.mr-pizarra.board` en un JournalEntry: `{background, locked, items:{id:{type,x,y,z,…}}, links:{id:{from,to,color,style,label}}}`. Una clave por pieza: nunca se reescribe el objeto entero.

## Trampas (aprendidas probando)
- `_replaceHTML` de una hoja V2 corre **antes** de insertar la ventana: no hay tamaño aún. La vista inicial se calcula con `ResizeObserver` en `_onRender`.
- Los fondos del zip original vienen reflejados en espejo (simetría perfecta): solo el cuarto superior izquierdo es real. Tres modos en el manifiesto: `blend` (cuarto real con bordes mezclados), `mirror` (imagen completa, ya es mosaico) y `cover` (mapas). La escala en pantalla es `size` en `BACKGROUNDS` (rules.mjs).
- El texto de recortes y documentos se coloca en la zona segura de su contorno (`manifest.safe` de `bordes/*`, calculada por `prepare-assets.py`) y se aparta del adorno; `fitText` encoge la letra hasta que cabe. `auto` solo elige contornos de `AUTO_MASKS` (los que dejan hueco).
- Las chinchetas son solo la cabeza (de frente no se ve la aguja); en fotos y fichas el adorno va en una esquina para no tapar la imagen.
- `filter` en `.mrp-lift` aísla el modo de mezcla: las manchas y marcas con `multiply` lo llevan en el `.mrp-item`, sin filtro.
- No pisar la fuente de iconos (`<i class="fa-*">`) en el CSS propio.
- Las piezas ocultas y privadas se filtran en el cliente: están en los datos del diario (quien abra la consola las ve). Para secretos de verdad, no colgarlos.
- Un documento que la jugadora no puede ver ni llega a su cliente: se muestra como «reservado».

## Probar de verdad
Servidor aparte (no tocar el mundo real): carpeta de datos propia con `Config/` copiado, mundo mínimo y el módulo enlazado por symlink; `node main.js --dataPath=… --port=30017 --world=…`. Dos sesiones a la vez: `localhost` y `127.0.0.1` tienen cookies distintas. Activar el módulo con `game.settings.set("core","moduleConfiguration",…)` y recargar.

## Publicar
Etiqueta `vX.Y.Z` (debe coincidir con `module.json`); el workflow sube `module.json` y `mr-pizarra.zip`. Añadir sección `## X.Y.Z` al CHANGELOG. Si se actualiza el módulo desde Foundry en esta máquina se pierde el `.git`.
