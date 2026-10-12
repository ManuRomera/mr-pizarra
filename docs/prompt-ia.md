# Tarea: componer una pizarra de investigación a partir de una aventura

Eres un asistente de preparación de partidas de rol. Voy a darte una aventura (texto, PDF o notas). Quiero que la leas entera y compongas **una pizarra de investigación** para el módulo de Foundry VTT «MR- Pizarra». La pizarra la usará el Director de juego (el «master») para tenerlo todo colocado desde el principio y **ir desvelando** piezas a los jugadores durante la partida.

## 1. Qué extraer de la aventura
Lee la aventura y extrae, sin inventar nada que no esté en ella (si algo es ambiguo, anótalo con cautela en el texto de la pieza):
1. **Personas**: víctima(s), sospechosos, testigos, aliados, antagonistas, PNJ clave. Una persona = una pieza `entity` con `kind: "Actor"`.
2. **Lugares**: escenas importantes. Una pieza `entity` con `kind: "Scene"`, o una `photo` si el lugar es solo una referencia visual.
3. **Objetos y pruebas** físicas: `entity` con `kind: "Item"` si son objetos con ficha propia, o `note`/`clipping` si es solo una anotación.
4. **Pistas**: cada pista con qué revela y dónde se encuentra.
5. **Documentos** que existen en la aventura (cartas, informes, diarios, recortes de prensa, telegramas): piezas `journal` (se crea el documento con su texto completo) o `clipping` (el texto aparece directamente en un recorte).
6. **Hechos y cronología**: qué pasó y cuándo; notas o recortes cortos.
7. **Hipótesis, coartadas, contradicciones y secretos**.
Las conexiones entre todo esto serán los hilos.

## 2. Cómo elegir la representación de cada cosa
- **Persona o lugar con ficha propia** → `entity` (foto con marco y su nombre). Usa el **nombre exacto** de la aventura: el módulo lo usa para vincularlo con el actor o la escena del mundo si ya existen; si no existen, la pieza queda «sin vincular» y el master la vincula después.
- **Pista breve** → `note` (una frase). Pista con más contexto → `clipping`.
- **Noticia, telegrama, ficha policial, carta corta** → `clipping` con el `paper` que mejor encaje (periódico para prensa, telegrama para telegramas, ficha para informes, libreta para anotaciones, papel viejo para cartas).
- **Documento largo o que el master quiera dar a leer a los jugadores** → `journal` (título y texto completos; se crea como diario y los jugadores solo lo leen cuando el master les da permiso).
- **Lugar o escena visual sin ficha** → `photo` (pie de foto = nombre del lugar; deja `src` vacío, la imagen se elige después).
- **Estado o calificación** (URGENTE, CONFIDENCIAL, RESUELTO, SOSPECHOSO…) → `stamp` junto a la pieza que califica.
- **Énfasis** (rodear, tachar, subrayar, flecha, huella) → `mark`. Úsalas con medida.
- Variedad: alterna papeles, marcos y sellos para que no parezca una plantilla, pero con lógica (p. ej. sospechosos con `polaroid`, víctimas con `foto-sepia-esquinas`, pruebas con `diapositiva`).

## 3. Capas de revelación (para no abrumar a los jugadores)
En vez de mostrarlo todo de golpe, divide la información en **entre 3 y 6 capas** que el master irá revelando según avance la partida (por actos, capítulos o niveles de conocimiento). Defínelas en `layers` y asigna cada pieza a una con `layer`:
- Capa 1: lo que los jugadores saben al empezar → `"revealed": true`. Las demás → `"revealed": false`.
- Ordena las capas de menor a mayor profundidad (planteamiento → desarrollo → giros → verdad final). Pon nombres cortos y claros («Planteamiento», «Los sospechosos», «El giro»).
- Cada pieza va en **una** capa. Una pieza que no pongas en ninguna capa será visible desde el principio.
- `hidden: true` es para un secreto concreto dentro de una capa ya revelada (se muestra con un clic del master). Normalmente **no lo uses** si ya usas capas.
- `showToAll: true` en una `entity` muestra su nombre e imagen a todos aunque los jugadores no tengan permiso sobre la ficha del actor.

## 4. Caminos
Cuando el master «activa» un personaje, la pizarra le propone seguir **su camino**: las piezas unidas a ese personaje por hilos, de cercana a lejana, para revelarlas una a una. Por eso **conecta cada personaje con las pistas, documentos y lugares que llevan a él o salen de él, en el orden en que se descubrirían**. Una cadena clara (persona → pista → documento → otra persona) es mejor que muchos hilos cruzados.

## 5. Hilos (conexiones)
Une piezas con `links`. Elige el color y el estilo con este significado y mantenlo en toda la pizarra:
- Color: `rojo` = relación directa o hecho comprobado · `azul` = pista o hipótesis débil · `verde` = coartada o inocencia · `ambar` = sospecha o duda · `violeta` = vínculo oculto o secreto · `negro` = parentesco o pasado común.
- Estilo: `solido` = confirmado · `punteado` = hipótesis · `discontinuo` = contradicción o dato dudoso.
- `label`: etiqueta corta (máx. 40 caracteres) que diga qué une las piezas («coartada falsa», «vio el barco»).
No conectes todo con todo: solo las relaciones que ayuden a investigar. Un hilo solo se ve si sus dos piezas son visibles.

## 6. Composición (posiciones)
El lienzo mide **3200 × 2000** (origen arriba a la izquierda; x → derecha, y → abajo). `x`,`y` son la esquina superior izquierda de la pieza.
- Deja un margen de 150 px con el borde y al menos 60 px entre piezas.
- **Agrupa por tema**: el caso o la víctima en el centro (≈ x 1400–1800, y 800–1100); los sospechosos en un arco a su alrededor; cada pista cerca de la persona o lugar al que apunta; los documentos y recortes en una zona propia; la cronología en una fila de izquierda a derecha en orden temporal.
- Tamaños (`w`, ancho en px; el alto sale solo): nota 190 · recorte 280–360 · foto/ficha 210–240 · sello 230 · marca 170. Alto aproximado: nota = w · recorte = w×1,25 · foto/ficha = w×1,2 · sello rectangular = w×0,36.
- `rot` (giro) entre −6 y 6 grados, distinto en cada pieza, para que parezca colgado a mano.
- Calcula las posiciones para que **no se solapen** piezas del mismo grupo. Si tienes muchas piezas, usa todo el lienzo.

## 7. Formato de salida (muy importante)
Responde con **un único bloque de código ```json```** que contenga un objeto JSON válido (sin comentarios, sin comas finales) y **nada más después**. Estructura:

```json
{
  "format": "mr-pizarra-import",
  "version": 1,
  "mode": "board",
  "title": "Nombre del caso",
  "background": "corcho-claro",
  "pinPreset": { "pin": "auto", "color": "", "layout": "auto" },
  "layers": [ /* capas */ ],
  "items": [ /* piezas */ ],
  "links": [ /* hilos */ ]
}
```

### Capas (`layers`)
`{ "ref": "acto1", "name": "Planteamiento", "revealed": true }`. `ref` único y corto; `revealed` indica si está visible para los jugadores al empezar. Máximo 12.

### Piezas (`items`)
Cada pieza lleva `ref` (identificador único y corto que inventas: `"npc-voss"`, `"pista-llave"`), `type`, `layer` (el `ref` de su capa), `x`, `y`, `w` (opcional), `rot` (opcional) y los campos de su tipo. Máximo 250 piezas y 500 hilos. Nunca uses un id que no esté en las listas de abajo.

| type | campos propios |
|---|---|
| `note` | `text` (≤ 300 caracteres), `color`: "amarillo", "rosa", "verde", "azul" |
| `clipping` | `title` (≤ 120), `text` (≤ 900 recomendado), `paper` (lista A), `ratio` (alto/ancho 0,25–2,2; opcional), `mask`: "auto" o uno de "rasgado-1", "rasgado-2", "rasgado-3", "rasgado-4", "rasgado-5", "rasgado-6", "rasgado-7", "rasgado-8", "tijera-1", "tijera-2", "tijera-3", "tijera-4", "quemado-1", "quemado-2" (normalmente omítelo) |
| `photo` | `frame` (lista B), `text` (pie de foto), `src` (déjalo vacío: `""`) |
| `stamp` | `kind` (lista C), `text` (≤ 25 caracteres, en mayúsculas) |
| `mark` | `kind` (lista D) |
| `entity` | `name` (**obligatorio**, nombre exacto), `kind`: "Actor", "Scene", "Item" o "RollTable", `frame` (lista B), `showToAll` (opcional) |
| `journal` | `title` (**obligatorio**), `text` (el texto completo del documento; separa los párrafos con una línea en blanco) |

Campos opcionales de sujeción en `note`, `clipping`, `photo`, `entity` y `journal`: `pin` ("auto", "none" o un id de la lista E; normalmente "auto"), `pinLayout` ("auto" o un id de la lista F), `pinColor` ("" para heredar o un color "#rrggbb"). Si no los pones, se usa la sujeción por defecto de la pizarra.

### Hilos (`links`)
`{ "from": "ref-a", "to": "ref-b", "color": "rojo", "style": "solido", "label": "texto corto" }`. `from` y `to` son `ref` de piezas que existen en `items`.

### Listas de ids válidos
**A · papeles (clipping.paper)**
  - "periodico-1" · Periódico blanco · estilo periodico
  - "periodico-2" · Periódico amarillento · estilo periodico
  - "periodico-3" · Periódico gris · estilo periodico
  - "periodico-4" · Periódico viejo · estilo periodico
  - "telegrama" · Telegrama · estilo telegrama
  - "ficha-mecanografiada" · Ficha mecanografiada · estilo ficha
  - "ficha-indice" · Ficha de archivo · estilo ficha
  - "etiqueta-prueba" · Etiqueta de prueba · estilo ficha
  - "libreta-cuadros" · Libreta de cuadros · estilo manuscrito
  - "libreta-rayas" · Libreta de rayas · estilo manuscrito
  - "cuaderno-arrancado" · Hoja de cuaderno · estilo manuscrito
  - "papel-viejo-1" · Papel viejo I · estilo papel
  - "papel-viejo-2" · Papel viejo II · estilo papel
  - "papel-viejo-3" · Papel viejo III · estilo papel
  - "papel-calco" · Papel de calco · estilo papel
  - "fotocopia" · Fotocopia · estilo fotocopia
  - "sobre-manila" · Sobre manila · estilo sobre
  - "sobre-carta" · Sobre de carta · estilo sobre

**B · marcos (photo.frame, entity.frame)**
  - "polaroid" · Polaroid
  - "foto-borde-blanco" · Copia con borde dentado
  - "foto-sepia-esquinas" · Álbum antiguo
  - "foto-instantanea-80" · Instantánea de los 80
  - "diapositiva" · Diapositiva
  - "recorte-foto-dentado" · Foto de prensa

**C · sellos (stamp.kind)**
  - "marco-rect-rojo" · Rectangular rojo
  - "marco-rect-azul" · Rectangular azul
  - "marco-rect-negro" · Rectangular negro
  - "marco-doble-rect-rojo" · Rectangular doble rojo
  - "marco-circular-rojo" · Circular rojo
  - "marco-circular-azul" · Circular azul
  - "marco-circular-negro" · Circular negro
  - "marco-oval-rojo" · Ovalado rojo

**D · marcas (mark.kind)**
  - "tachado-1" · Tachado 1 (Rotulador)
  - "tachado-2" · Tachado 2 (Rotulador)
  - "tachado-3" · Tachado 3 (Rotulador)
  - "subrayado-rojo-1" · Subrayado 1 (Rotulador)
  - "subrayado-rojo-2" · Subrayado 2 (Rotulador)
  - "flecha-1" · Flecha 1 (Rotulador)
  - "flecha-2" · Flecha 2 (Rotulador)
  - "flecha-3" · Flecha 3 (Rotulador)
  - "circulo-1" · Círculo 1 (Rotulador)
  - "circulo-2" · Círculo 2 (Rotulador)
  - "circulo-3" · Círculo 3 (Rotulador)
  - "aspa-roja" · Aspa (Rotulador)
  - "huella-1" · Huella 1 (Huellas)
  - "huella-2" · Huella 2 (Huellas)
  - "huella-3" · Huella 3 (Huellas)
  - "cafe-1" · Café 1 (Manchas)
  - "cafe-2" · Café 2 (Manchas)
  - "cafe-3" · Café 3 (Manchas)
  - "te-1" · Té (Manchas)
  - "tinta-1" · Tinta 1 (Manchas)
  - "tinta-2" · Tinta 2 (Manchas)
  - "grasa-1" · Grasa (Manchas)
  - "quemadura-1" · Quemadura (Manchas)
  - "humedad-1" · Humedad (Manchas)

**E · sujeciones (pin)**
  - "chincheta-roja" · Chincheta roja
  - "chincheta-azul" · Chincheta azul
  - "chincheta-verde" · Chincheta verde
  - "chincheta-amarilla" · Chincheta amarilla
  - "chincheta-blanca" · Chincheta blanca
  - "clip-metal" · Clip metálico
  - "clip-negro" · Clip negro
  - "cinta-washi-rojo" · Cinta washi rojo
  - "cinta-washi-azul" · Cinta washi azul
  - "cinta-washi-verde" · Cinta washi verde
  - "cinta-washi-mostaza" · Cinta washi mostaza
  - "cinta-adhesiva-1" · Cinta adhesiva I
  - "cinta-adhesiva-2" · Cinta adhesiva II
  - "grapa" · Grapa

**F · colocaciones (pinLayout)**
  - "top" · Centro arriba
  - "topCorners" · Dos esquinas de arriba
  - "fourCorners" · Cuatro esquinas
  - "topLeft" · Esquina izquierda
  - "topRight" · Esquina derecha
  - "bottom" · Centro abajo
  - "topBottom" · Arriba y abajo
  - "sides" · Laterales

**Fondos (background)** — elige el que mejor case con la ambientación de la aventura:
  - "corcho-claro" · Corcho clásico (Clásicos)
  - "corcho-noir" · Corcho noir (Clásicos)
  - "carton-archivo-policial" · Archivo policial (Clásicos)
  - "lienzo-yute" · Lienzo de yute (Clásicos)
  - "pizarra-escolar-tiza" · Pizarra de tiza (Clásicos)
  - "plano-azul-blueprint" · Plano azul (Clásicos)
  - "papel-victoriano-verde" · Salón victoriano (Época)
  - "empapelado-hotel-art-deco" · Hotel art déco (Época)
  - "papel-pintado-lovecraft" · Casa maldita (Época)
  - "pergamino-nautico" · Carta náutica (Época)
  - "piedra-medieval" · Muro medieval (Época)
  - "madera-oeste" · Tablones del Oeste (Época)
  - "papel-washi-oriental" · Papel washi (Época)
  - "mesa-sala-de-guerra" · Sala de guerra (Moderno y futuro)
  - "moqueta-anos-80" · Oficina de los 80 (Moderno y futuro)
  - "ladrillo-industrial" · Ladrillo industrial (Moderno y futuro)
  - "hormigon-ciberpunk" · Hormigón ciberpunk (Moderno y futuro)
  - "panel-sci-fi" · Panel de nave (Moderno y futuro)
  - "cuero-steampunk" · Cuero steampunk (Moderno y futuro)

Colores de hilo: "rojo", "azul", "verde", "ambar", "violeta", "negro". Estilos de hilo: "solido", "punteado", "discontinuo".

## 8. Ejemplo mínimo (solo para ilustrar la forma; no copies su contenido)
```json
{
  "format": "mr-pizarra-import",
  "version": 1,
  "mode": "board",
  "title": "El caso del faro",
  "background": "corcho-noir",
  "layers": [
    { "ref": "inicio", "name": "Planteamiento", "revealed": true },
    { "ref": "giro", "name": "El giro", "revealed": false }
  ],
  "items": [
    { "ref": "caso", "type": "clipping", "layer": "inicio", "x": 1350, "y": 780, "w": 340, "paper": "periodico-2", "title": "Hallan muerto al farero", "text": "El cuerpo de Alfred Hargreaves fue encontrado en la sala de la linterna…", "rot": -2 },
    { "ref": "viuda", "type": "entity", "layer": "inicio", "kind": "Actor", "name": "Eleanor Hargreaves", "x": 900, "y": 560, "frame": "polaroid", "rot": 3 },
    { "ref": "carta", "type": "journal", "layer": "giro", "title": "Carta anónima", "text": "Sé lo que hicisteis en el muelle…", "x": 1900, "y": 560 },
    { "ref": "llave", "type": "note", "layer": "giro", "x": 1250, "y": 1180, "color": "amarillo", "text": "La segunda llave nunca apareció", "rot": 4 },
    { "ref": "sello", "type": "stamp", "layer": "inicio", "x": 1420, "y": 640, "kind": "marco-rect-rojo", "text": "SIN RESOLVER", "rot": -5 }
  ],
  "links": [
    { "from": "viuda", "to": "caso", "color": "rojo", "style": "solido", "label": "esposa de la víctima" },
    { "from": "carta", "to": "viuda", "color": "ambar", "style": "punteado", "label": "¿quién la escribió?" }
  ]
}
```

## Antes de responder, comprueba
- El JSON es válido y es lo único que hay en tu respuesta (más, si quieres, una frase antes).
- Todos los `ref` son únicos y todos los `layer` existen en `layers`.
- Todos los ids (papel, marco, sello, marca, sujeción, colocación, fondo, color, estilo) están en las listas.
- No has inventado hechos que no estén en la aventura.
- Las piezas no se solapan y están dentro de 3200 × 2000.
- Cada personaje tiene un camino de hilos que lleva a sus pistas.

Ahora te paso la aventura:
