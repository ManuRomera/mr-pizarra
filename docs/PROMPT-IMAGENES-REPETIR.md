# Prompt de repetición · MR- Pizarra (recortes, sellos y ui)

Pégalo en el generador. Sustituye a las carpetas `recortes`, `sellos` y `ui` del zip anterior, que salieron mal.

---

Voy a repetir **48 imágenes** del módulo de Foundry «MR- Pizarra» (pizarra de investigación: corcho, fotos, recortes, hilos). En la entrega anterior hiciste **hojas con muchas piezas juntas y las cortaste a ciegas**: cada archivo traía trozos de sus vecinos, líneas blancas en el borde y objetos cortados por la mitad. Eso es inservible.

## REGLA ABSOLUTA
- **Una imagen = un objeto = un archivo.** Genera **cada imagen por separado**, con una petición de imagen propia por archivo.
- **Prohibido**: collages, hojas de contacto, sprite sheets, cuadrículas, varias piezas en una imagen, y **recortar piezas desde una imagen mayor**.
- El objeto debe estar **entero, centrado, con margen libre alrededor** (≥5 % por cada lado) y **nada más en el encuadre**: ni trozos de otros objetos, ni líneas, ni bordes blancos, ni sombras de mesa.
- **Cero texto legible**: ni letras, ni números, ni logos, ni firmas. Solo grano de tinta ilegible donde se indique.
- Estilo: escaneo/fotografía realista y táctil de objetos físicos; sin ilustración vectorial.
- Tamaños exactos indicados.
- Si la transparencia no es real (canal alfa), entrégalo con **fondo blanco puro #FFFFFF liso y uniforme** y no lo recortes tú: lo recortaré yo. Nunca rellenes la transparencia con grises, cuadros ni sombras.

Generación: de una en una, comprobando cada resultado (que haya UN solo objeto, completo, sin restos) antes de pasar a la siguiente. Rehaz las que fallen.

## A. `recortes/` · 1024×1280 · JPG · 22 archivos
**Una sola hoja/objeto que ocupe TODO el encuadre, vista cenital frontal, sin mesa ni fondo visible** (la textura de papel llega hasta los 4 bordes de la imagen; no se ve nada fuera del papel). Sin texto legible.
- `periodico-1.jpg` … `periodico-4.jpg` — papel de periódico, 4 envejecimientos distintos (blanco roto, amarillo, gris, marrón); solo grano de tinta y medios tonos ilegibles.
- `libreta-cuadros.jpg`, `libreta-rayas.jpg` — hojas de libreta con cuadrícula / rayas.
- `telegrama.jpg` — papel de telegrama vacío, crema con filete fino.
- `ficha-mecanografiada.jpg` — ficha administrativa vacía con casillas sin texto.
- `papel-viejo-1.jpg` … `papel-viejo-3.jpg` — folios envejecidos distintos (pliegues, humedad).
- `cuaderno-arrancado.jpg` — hoja de cuaderno con perforaciones y flecos de espiral.
- `sobre-manila.jpg`, `sobre-carta.jpg` — frente de sobres, vacíos, sin sello ni dirección.
- `etiqueta-prueba.jpg` — etiqueta de bolsa de prueba con cordel, vacía.
- `postit-amarillo.jpg`, `postit-rosa.jpg`, `postit-verde.jpg`, `postit-azul.jpg` — nota adhesiva cuadrada, color liso con ligera sombra de adhesivo arriba.
- `ficha-indice.jpg` — ficha de archivo con filete rojo y líneas azules, vacía.
- `papel-calco.jpg` — papel vegetal semitransparente.
- `fotocopia.jpg` — fotocopia gris con ruido y bordes sucios.

## B. `sellos/` · PNG · 23 archivos
Un solo sello/trazo por imagen, **centrado y entero**, tinta o rotulador sobre fondo blanco puro #FFFFFF (o transparente real). Interior de los marcos **vacío**. Tinta con falta de entintado y bordes irregulares.
- `marco-rect-rojo.png`, `marco-rect-azul.png`, `marco-rect-negro.png` — 800×320, marco rectangular de sello de goma, doble filete.
- `marco-circular-rojo.png`, `marco-circular-azul.png`, `marco-circular-negro.png` — 512×512, sello circular de doble anillo.
- `marco-oval-rojo.png` — 640×400, sello ovalado.
- `marco-doble-rect-rojo.png` — 800×320, marco rectangular de doble borde grueso.
- `tachado-1.png` … `tachado-3.png` — 800×120, UN trazo de rotulador negro grueso para censurar texto, de punta a punta; formas distintas.
- `subrayado-rojo-1.png`, `subrayado-rojo-2.png` — 800×100, un subrayado a mano en rotulador rojo.
- `huella-1.png` … `huella-3.png` — 400×500, UNA huella dactilar entintada completa (dedos distintos).
- `flecha-1.png` … `flecha-3.png` — 400×400, UNA flecha dibujada a mano en rotulador rojo, completa, con la punta visible.
- `circulo-1.png` … `circulo-3.png` — 512×512, UN círculo de rotulador rojo hecho a mano, completo (abierto o con solape), todo dentro del encuadre.
- `aspa-roja.png` — 400×400, UNA X marcada a rotulador, completa.

## C. `ui/` · 3 archivos (cada una es UNA imagen completa, no un collage)
- `icono-modulo.png` — 512×512: primer plano de una chincheta roja con un hilo rojo enrollado sobre corcho, composición cuadrada y centrada, sin texto.
- `banner.jpg` — 1280×400: UNA sola panorámica de pared de corcho con fotos, recortes y hilos rojos que los conectan, con espacio libre a la izquierda; sin texto legible.
- `preview-pizarra.jpg` — 1280×720: UNA sola vista de una pizarra de investigación llena (polaroids, recortes de periódico rasgados, notas, hilos de colores); sin texto legible.

## Entrega
Crea **`mr-pizarra-arte-2.zip`** con esta estructura exacta (sin acentos ni espacios):

```
mr-pizarra/assets/recortes/   (22 .jpg)
mr-pizarra/assets/sellos/     (23 .png)
mr-pizarra/assets/ui/         (3 archivos)
```

Antes de entregar, **abre cada archivo y comprueba** que contiene un solo objeto, completo, sin restos de otros y sin bordes blancos. Dame el enlace y un informe con los que no pudieras generar bien.
