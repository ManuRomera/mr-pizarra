# MR- Pizarra

![Pizarra de investigación](assets/ui/banner.webp)

[![Descargas](https://raw.githubusercontent.com/ManuRomera/ManuRomera/main/badges/descargas-flat/mr-pizarra.svg)](https://github.com/ManuRomera/mr-pizarra/releases)

Una **pizarra de investigación colaborativa** para Foundry VTT. Funciona en **cualquier sistema** y ambientación: corcho, hilos de colores, fotos, notas, recortes de periódico de formas irregulares y los documentos de tus propios diarios colgados con sus permisos.

> Versión 0.1.0 · Foundry VTT 13 · Idiomas: español e inglés

## Cómo se usa

1. En la pestaña **Diarios**, pulsa **Nueva pizarra** (o clic derecho sobre un diario → *Abrir como pizarra*). Cada pizarra es un diario, así que los permisos de siempre mandan: quien tenga Observador puede trabajar en ella.
2. Cada herramienta de la izquierda abre un desplegable con las variantes de su tipo (y **Aleatorio**): elige una y la pieza aparece lista para **escribir directamente sobre ella** (doble clic para volver a editar). «Editar detalles…» abre la ventana completa. Un clic derecho en una pieza abre su menú; con el derecho mantenido sobre el fondo, arrastras la vista.
3. **Selecciona** una pieza con un clic, varias con Mayús/Ctrl o con un recuadro arrastrando en vacío (Ctrl/Cmd+A, todas). Todo lo seleccionado se mueve junto; las **esquinas** de la caja lo escalan y el **círculo superior** lo gira, y los hilos se adaptan. Una barra sobre la selección ofrece girar, escalar, alinear, duplicar y más.
4. **Arrastra desde la barra lateral** diarios, páginas, actores, escenas u objetos: quedan colgados y respetan los permisos de cada persona.
5. **Quitar**: selecciona y pulsa **Suprimir**. **Ctrl/Cmd+Z** deshace cualquier cambio.
6. **Hilo**: elige color y estilo, pulsa dos piezas y se unen; los hilos pasan por delante de las piezas. Un clic en el hilo permite ponerle etiqueta o quitarlo.
7. **Fondo**: 19 fondos por ambientación (corcho, victoriano, casa maldita, Oeste, sala de guerra, ciberpunk, nave espacial…).
8. **Sujeción por defecto** (barra superior): elige tipo, color y colocación del celo, las chinchetas o los clips para toda la pizarra; cada pieza o selección puede cambiarla desde su barra.
9. **Accesibilidad** (barra superior): tamaño de texto, letra legible, alto contraste, reducir movimiento e interfaz grande; Tab recorre las piezas y los lectores de pantalla reciben avisos.

## Revelar por capas y por caminos (Guardiana)

- **Capas** (botón «Capas»): crea capas («Planteamiento», «Los sospechosos», «El giro»…), mete piezas en ellas con el botón de capas de la barra de selección y **revela una capa entera** con un clic o la siguiente en orden. Lo que está en una capa sin revelar es invisible para los jugadores; lo que no tiene capa, visible desde el principio.
- **Caminos** (pestaña «Caminos»): activa un personaje y sigue las piezas unidas a él por hilos, de la más cercana a la más lejana, revelándolas **una a una**, por niveles o todas.

## La caja de elementos

Un botón del dock abre una **caja** de piezas guardadas, por secciones y con buscador. Los jugadores **las sacan y las colocan como quieran** (arrastrando o pulsando) y pueden devolverlas. La Guardiana controla qué hay disponible (capas y piezas ocultas) y lo va revelando. Se rellena importando en modo caja o con «Guardar en la caja» desde el menú de cualquier pieza.

## Importar una pizarra con una IA

1. En la barra superior (o en el directorio de diarios) pulsa **Importar**.
2. Elige **qué quieres que prepare la IA**: una **pizarra montada** (posiciones e hilos) o una **caja de elementos** (sin estructura, para que los jugadores las usen como quieran). **Copia el prompt** de ese modo, pégalo en tu IA favorita y adjunta la aventura. La IA extrae personas, lugares, pistas, documentos y conexiones, elige cómo representar cada cosa, los reparte en **capas de revelación** y los devuelve en un JSON.
3. **Pega la respuesta**, pulsa **Revisar** (te dice qué se vinculará y qué problemas hay) e **Importa**: a esta pizarra, reemplazándola o en una nueva, y colocando las piezas en la pizarra o guardándolas en la caja.

Las capas que la IA propone arrancan sin revelar (salvo la primera) y las vas **revelando** con un clic. Los actores, escenas y objetos que no existan todavía quedan como **fichas sin vincular**: un aviso en la barra superior las lista para localizarlas, vincularlas o crear el actor. Los documentos se crean como diarios sin permiso para los jugadores. Los prompts también están en [`docs/prompt-ia.md`](docs/prompt-ia.md) (pizarra montada) y [`docs/prompt-ia-caja.md`](docs/prompt-ia-caja.md) (caja de elementos).

## Lo que ven los jugadores

| Permiso sobre el documento | Qué aparece en la pizarra |
|---|---|
| Observador o más | El contenido: el texto como recorte de periódico, las imágenes como foto. |
| Limitado | Solo el título; el texto sale censurado con barras y un sello «RESERVADO». |
| Ninguno | Un sobre con «?», sin nombre. |

Si subes el permiso del diario, la pieza se revela sola. Para **actores, escenas y objetos** hay otra vía: la Guardiana puede **mostrar el nombre y la imagen a todos sin dar permiso** sobre la ficha (se le pregunta al colgarla y se cambia cuando quiera desde el menú de la pieza).

## Para la Guardiana

- **Ocultar** una pieza la quita de la vista de los jugadores hasta que la **reveles** (aparece con una animación).
- **Privada**: solo la ve quien la creó (y la Guardiana).
- **Bloquear** la pizarra la deja en solo lectura para los jugadores.
- Por defecto una pizarra nueva se comparte con los jugadores como Observadores; se puede desmarcar al crearla.

### Límites que conviene conocer

- Las piezas ocultas o privadas se filtran en el cliente: siguen estando en los datos del diario. No cuelgues secretos reales que un jugador avispado pueda leer con la consola.
- Los jugadores sin permiso de Propietario guardan sus cambios a través de la Guardiana: si no hay ninguna conectada, la pizarra solo se puede consultar.
- Los documentos de compendios no se pueden colgar: impórtalos antes al mundo.

## API

```js
const api = game.modules.get("mr-pizarra").api;
await api.createBoard("Caso del Faro", { background: "corcho-noir", share: true });
api.open("Caso del Faro");           // por nombre, id o documento
await api.convertToBoard(journal);   // convierte un diario existente
```

## Instalación

Manifiesto: `https://github.com/ManuRomera/mr-pizarra/releases/latest/download/module.json`

## Créditos y licencia

Código bajo licencia MIT. Las imágenes se generaron para este módulo y se limpiaron con `tools/prepare-assets.py`.
