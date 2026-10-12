# MR- Pizarra

![Pizarra de investigación](assets/ui/banner.webp)

Una **pizarra de investigación colaborativa** para Foundry VTT. Funciona en **cualquier sistema** y ambientación: corcho, hilos de colores, fotos, notas, recortes de periódico de formas irregulares y los documentos de tus propios diarios colgados con sus permisos.

> Versión 0.1.0 · Foundry VTT 13 · Idiomas: español e inglés

## Cómo se usa

1. En la pestaña **Diarios**, pulsa **Nueva pizarra** (o clic derecho sobre un diario → *Abrir como pizarra*). Cada pizarra es un diario, así que los permisos de siempre mandan: quien tenga Observador puede trabajar en ella.
2. Con las herramientas de la izquierda cuelgas **notas, recortes, fotos, sellos y marcas**. Un clic derecho en una pieza abre su menú (editar, duplicar, ocultar, quitar…). Se arrastra para moverla; con ella seleccionada, el círculo dorado cambia su tamaño.
3. **Arrastra desde la barra lateral** diarios, páginas, actores, escenas u objetos: quedan colgados y respetan los permisos de cada persona.
4. **Hilo**: elige color y estilo, pulsa dos piezas y se unen. Un clic en el hilo permite ponerle etiqueta o quitarlo.
5. **Fondo**: 20 fondos por ambientación (corcho, victoriano, casa maldita, Oeste, sala de guerra, ciberpunk, nave espacial…).

## Lo que ven los jugadores

| Permiso sobre el documento | Qué aparece en la pizarra |
|---|---|
| Observador o más | El contenido: el texto como recorte de periódico, las imágenes como foto. |
| Limitado | Solo el título; el texto sale censurado con barras y un sello «RESERVADO». |
| Ninguno | Un sobre con «?», sin nombre. |

Si subes el permiso del diario, la pieza se revela sola.

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
