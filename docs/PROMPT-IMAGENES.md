# Prompt de imágenes · MR- Pizarra

Copia todo lo que hay debajo de la línea y pégalo en el generador de imágenes (el que pueda ejecutar código para crear el .zip).

---

Eres el director de arte y generador de imágenes del módulo de Foundry VTT **«MR- Pizarra»**: una pizarra de investigación colaborativa (corcho, hilos, fotos, recortes de periódico, notas) que sirve para cualquier ambientación. Necesito **113 imágenes** que parezcan sacadas del mismo archivo de un detective. Al final debes entregarme **un único .zip** con todas, cada una con el nombre exacto y en la carpeta exacta que indico.

## 1. Reglas generales (valen para TODAS)

- **Cero texto legible**: ni letras, ni números, ni logos, ni marcas de agua, ni firmas. El texto lo pinta el módulo por encima (así se traduce y se lee bien). Si un papel necesita «texto», que sea solo grano de tinta o manchas ilegibles.
- Estilo: **fotografía/escaneo realista y táctil** de objetos físicos (papel, cartón, metal, cera, tinta). Nada de vectorial, dibujo animado ni «arte de videojuego».
- Luz neutra y pareja, **sin sombras proyectadas** salvo que se indique (las sombras las añade el módulo).
- Colores con saturación contenida; envejecido creíble: fibras, grano, bordes gastados, leves manchas.
- **Fondos**: deben ser **sin costuras (seamless/tileable)**: lo que sale por un borde entra por el opuesto, sin viñeteado, sin objeto central, sin gradientes de luz marcados.
- **Objetos con transparencia** (carpetas `bordes`, `fotos`, `adornos`, `sellos`, `manchas`): PNG con **canal alfa real**, recortados limpio, sin halo ni fondo de color. Si no puedes dar alfa real, entrégalos sobre fondo blanco puro y dímelo en el informe final.
- Cada archivo debe ser **distinto de los demás de su serie** (no repetir la misma imagen con ligeras variaciones): las variantes `-1`, `-2`, `-3`… deben tener forma, desgaste y detalles diferentes.

Negativos para todas: `text, letters, words, numbers, watermark, signature, logo, cartoon, anime, 3d render, cgi, neon glow (salvo ciberpunk), perspective distortion, cropped subject, frame, border (salvo que se pida), people, faces, hands`.

## 2. Estructura de carpetas y lista de archivos

Raíz del zip: `mr-pizarra/assets/` (todo lo siguiente cuelga de ahí). Formato: **JPG (calidad 90) para fondos y papeles**, **PNG con alfa para el resto**.

### `fondos/` · 2048×2048 · JPG · seamless · 20 archivos
Superficies sobre las que se cuelga todo. Vista cenital frontal, sin objetos.
1. `corcho-noir.jpg` — corcho oscuro, gastado, con agujeritos de chinchetas viejas.
2. `corcho-claro.jpg` — corcho clásico de oficina, tono miel.
3. `papel-victoriano-verde.jpg` — papel pintado victoriano verde botella con damasco sutil, algo descolorido.
4. `papel-pintado-lovecraft.jpg` — papel pintado de casa maldita: motivo apagado, humedad, desconchones, tonos mostaza y gris.
5. `madera-oeste.jpg` — tablones de madera del Viejo Oeste, secos, clavos, vetas profundas.
6. `pergamino-nautico.jpg` — pergamino marrón de carta náutica con manchas de sal, sin trazos legibles.
7. `mesa-sala-de-guerra.jpg` — tapete verde de mesa de mapas militares, desgastado, con rozaduras.
8. `hormigon-ciberpunk.jpg` — hormigón sucio con pintadas sin letras, óxido y leves reflejos de neón magenta/cian.
9. `panel-sci-fi.jpg` — paneles metálicos grises de nave espacial con remaches y juntas, sutiles luces azules apagadas.
10. `piedra-medieval.jpg` — muro de sillería de castillo, musgo leve, argamasa vieja.
11. `moqueta-anos-80.jpg` — moqueta o tapicería de oficina de los 80, granate/azul marino, motivo geométrico discreto.
12. `cuero-steampunk.jpg` — cuero marrón repujado con costuras y remaches de latón.
13. `carton-archivo-policial.jpg` — cartón de archivador verde oliva/crema, rozado, de comisaría de los 50.
14. `empapelado-hotel-art-deco.jpg` — papel art déco dorado y negro, elegante, algo gastado.
15. `pizarra-escolar-tiza.jpg` — pizarra de tiza verde oscuro con restos borrados de tiza, sin trazos legibles.
16. `lienzo-yute.jpg` — tela de yute/arpillera natural, trama visible.
17. `plano-azul-blueprint.jpg` — papel de planos azul cianotipia con cuadrícula fina, sin cotas ni texto.
18. `mapa-antiguo-mundo.jpg` — papel de mapa antiguo envejecido con líneas de costa muy difuminadas e ilegibles.
19. `ladrillo-industrial.jpg` — pared de ladrillo rojo oscuro, pintura desconchada, almacén o sótano.
20. `papel-washi-oriental.jpg` — papel washi con fibras, crema, ambientación oriental/japonesa.

### `recortes/` · 1024×1280 · JPG · papel liso, sin texto · 22 archivos
Papeles sobre los que el módulo escribe el contenido. Rectángulo completo, bordes rectos (el módulo los recorta).
- `periodico-1.jpg` … `periodico-4.jpg` — papel de periódico: 4 envejecimientos distintos (blanco roto, amarillo, gris, marrón). Solo grano de tinta/medios tonos sin caracteres legibles.
- `libreta-cuadros.jpg`, `libreta-rayas.jpg` — hojas de libreta con cuadrícula/rayas.
- `telegrama.jpg` — papel de telegrama vacío, tono crema con fino filete.
- `ficha-mecanografiada.jpg` — ficha policial/administrativa vacía con casillas sin texto.
- `papel-viejo-1.jpg` … `papel-viejo-3.jpg` — folios envejecidos distintos (pliegues, manchas de humedad).
- `cuaderno-arrancado.jpg` — hoja de cuaderno con perforaciones y flecos de espiral.
- `sobre-manila.jpg`, `sobre-carta.jpg` — sobres (cara frontal, vacíos, sin sello ni dirección).
- `etiqueta-prueba.jpg` — etiqueta de bolsa de prueba con cordel, vacía.
- `postit-amarillo.jpg`, `postit-rosa.jpg`, `postit-verde.jpg`, `postit-azul.jpg` — notas adhesivas cuadradas con leve brillo de adhesivo en el borde superior.
- `ficha-indice.jpg` — ficha de archivo con filete rojo y líneas azules, vacía.
- `papel-calco.jpg` — papel vegetal semitransparente.
- `fotocopia.jpg` — fotocopia gris con ruido y bordes sucios.

### `bordes/` · 1024×1280 · PNG con alfa · 14 archivos
**Máscaras de recorte**: forma de hoja **blanca opaca** sobre transparente, con el contorno irregular. El módulo las usa como `mask-image` para recortar papeles. Sin textura, solo forma limpia, ocupando casi todo el lienzo.
- `rasgado-1.png` … `rasgado-8.png` — hoja rasgada a mano: lados distintos, algunos con borde rasgado fibroso y otros rectos; ninguna igual.
- `tijera-1.png` … `tijera-4.png` — recorte hecho con tijera: lados poligonales ligeramente torcidos, esquinas imperfectas.
- `quemado-1.png`, `quemado-2.png` — hoja con bordes quemados, contorno carbonizado irregular.

### `fotos/` · 800×960 · PNG con alfa · 6 archivos
**Solo el marco**; el centro debe quedar **transparente** (ahí va la imagen del jugador). Con su sombra de contacto muy suave.
- `polaroid.png` — marco de Polaroid con ancho margen inferior.
- `foto-borde-blanco.png` — copia en papel de los 50-60 con borde blanco dentado.
- `foto-sepia-esquinas.png` — foto antigua sepia con esquineras triangulares de álbum.
- `foto-instantanea-80.png` — foto de los 80 con borde blanco fino y esquinas redondeadas.
- `diapositiva.png` — marco de diapositiva de cartón.
- `recorte-foto-dentado.png` — foto de prensa recortada con borde dentado.

### `adornos/` · PNG con alfa · 16 archivos
Objetos individuales, recortados, vistos desde arriba, ligera sombra de contacto.
- `chincheta-roja.png`, `chincheta-azul.png`, `chincheta-verde.png`, `chincheta-amarilla.png`, `chincheta-negra.png`, `chincheta-blanca.png` — 256×256, chinchetas de cabeza redonda brillante.
- `clip-metal.png`, `clip-negro.png` — 256×512, clips de oficina.
- `cinta-washi-rojo.png`, `cinta-washi-azul.png`, `cinta-washi-verde.png`, `cinta-washi-mostaza.png` — 512×160, trozo de cinta washi con puntas rasgadas y patrón sutil (sin texto).
- `cinta-adhesiva-1.png`, `cinta-adhesiva-2.png` — 512×160, cinta transparente amarillenta con extremos cortados irregularmente.
- `grapa.png` — 256×128, grapa metálica.
- `alfiler-dorado.png` — 256×256, alfiler de costura con cabeza dorada.

### `sellos/` · PNG con alfa · 23 archivos
Tinta o rotulador sobre transparente. **Interiores vacíos** (el módulo escribe dentro). Tinta con falta de entintado, bordes irregulares.
- `marco-rect-rojo.png`, `marco-rect-azul.png`, `marco-rect-negro.png` — 800×320, marco rectangular de sello de goma, doble filete.
- `marco-circular-rojo.png`, `marco-circular-azul.png`, `marco-circular-negro.png` — 512×512, sello circular con doble anillo.
- `marco-oval-rojo.png` — 640×400, sello ovalado.
- `marco-doble-rect-rojo.png` — 800×320, marco rectangular con doble borde grueso.
- `tachado-1.png` … `tachado-3.png` — 800×120, trazos de rotulador negro grueso para censurar texto; formas distintas.
- `subrayado-rojo-1.png`, `subrayado-rojo-2.png` — 800×100, subrayados a mano en rotulador rojo.
- `huella-1.png` … `huella-3.png` — 400×500, huellas dactilares entintadas de dedos distintos.
- `flecha-1.png` … `flecha-3.png` — 400×400, flechas dibujadas a mano en rotulador rojo.
- `circulo-1.png` … `circulo-3.png` — 512×512, círculos de rotulador rojo hechos a mano, abiertos o con solape.
- `aspa-roja.png` — 400×400, X marcada a rotulador.

### `manchas/` · 800×800 · PNG con alfa · 9 archivos
Manchas sobre transparente (se superponen en modo multiplicar), semitransparentes.
- `cafe-1.png`, `cafe-2.png`, `cafe-3.png` — marcas de taza de café (anillos y salpicaduras).
- `te-1.png` — mancha de té.
- `tinta-1.png`, `tinta-2.png` — salpicaduras de tinta negra/azul.
- `grasa-1.png` — mancha de grasa translúcida.
- `quemadura-1.png` — quemadura de cigarrillo.
- `humedad-1.png` — mancha de humedad con aureola.

### `ui/` · 3 archivos
- `icono-modulo.png` — 512×512, icono del módulo: una chincheta roja con un hilo rojo enrollado sobre un trozo de corcho, estilo realista; sin texto.
- `banner.jpg` — 1280×400, banner panorámico: pared de corcho con fotos, recortes y hilos rojos conectándolos, composición con aire a la izquierda; sin texto legible.
- `preview-pizarra.jpg` — 1280×720, captura conceptual de una pizarra de investigación llena (fotos polaroid, recortes de periódico rasgados, notas, hilos de colores), sin texto legible.

## 3. Cómo trabajar

1. Genera **por carpetas** y por series, empezando por `fondos`. Si una serie no te cabe en un turno, sigue en el siguiente sin que yo te lo pida.
2. Comprueba que los fondos son realmente seamless (repite el mosaico 2×2 y revisa que no se vean costuras); rehaz los que fallen.
3. Respeta los tamaños indicados (si el generador solo ofrece otros, genera al tamaño más cercano con la misma proporción y reescala al tamaño pedido).

## 4. Entrega final (obligatorio)

Cuando termines TODAS las imágenes:

1. Crea con código un archivo **`mr-pizarra-arte.zip`** cuya raíz sea la carpeta `mr-pizarra/` con esta estructura exacta (sin carpetas extra, sin archivos sueltos fuera de ellas, sin acentos ni espacios en los nombres):

```
mr-pizarra/assets/fondos/        (20 .jpg)
mr-pizarra/assets/recortes/      (22 .jpg)
mr-pizarra/assets/bordes/        (14 .png)
mr-pizarra/assets/fotos/         (6 .png)
mr-pizarra/assets/adornos/       (16 .png)
mr-pizarra/assets/sellos/        (23 .png)
mr-pizarra/assets/manchas/       (9 .png)
mr-pizarra/assets/ui/            (3 archivos)
```

2. Verifica con código que el zip contiene **exactamente 113 archivos**, que cada nombre coincide con esta lista y que los PNG de las carpetas con transparencia tienen canal alfa. Corrige lo que falte.
3. Dame el enlace de descarga del zip y un **informe breve**: nº de archivos por carpeta, y la lista de los que no pudiste generar con alfa real o con el tamaño exacto.
