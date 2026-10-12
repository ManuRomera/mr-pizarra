# Cambios

## 0.4.0 · Desvelar fichas e importar una pizarra con IA

- **Fichas visibles sin dar permiso:** al colgar un actor, escena u objeto que algún jugador no puede ver, la Guardiana decide si mostrar su nombre e imagen a todos. Puede cambiarlo en cualquier momento desde el menú de la pieza («Mostrar nombre e imagen a todos» / «Dejar de mostrarlo sin permiso»). La Guardiana ve una insignia «Visible para todos». La pieza guarda una instantánea de nombre e imagen, porque quien no tiene permiso ni siquiera recibe el documento.
- **Importar una pizarra** (botón «Importar» de la barra superior y del directorio de diarios): la ventana ofrece **un prompt completo** (copiar o descargar) para dárselo a una IA junto con la aventura. Explica cada tipo de pieza y cuándo usarla, qué se oculta y qué se ve al empezar, el significado de colores y estilos de hilo, cómo componer en el lienzo (3200 × 2000) y el formato JSON exacto, con todas las listas de ids válidas generadas desde el propio catálogo del módulo.
- Se pega la respuesta de la IA (vale con el texto completo y su bloque de código) o se carga un archivo. **Revisar** muestra el resumen, qué fichas se vincularán por nombre y cuáles no, y los errores y avisos por elemento. Lo erróneo se omite; lo que no traiga posición se coloca en una cuadrícula.
- **Destino:** añadir a la pizarra, reemplazar su contenido o crear una pizarra nueva. Opciones: vincular fichas por nombre con actores, escenas y objetos del mundo, **crear un diario por cada documento** (en una carpeta, sin permiso para los jugadores) y aplicar el fondo y la sujeción propuestos.
- **Fichas sin vincular:** lo que no exista todavía en el mundo se coloca igualmente (nombre y silueta). Un **aviso en la barra superior** cuenta las fichas sin vincular y abre una lista donde se pueden localizar, **vincular** a un documento existente (con buscador) o **crear el actor** con ese nombre. También se vinculan con doble clic.
- El prompt también está en `docs/prompt-ia.md`.

## 0.3.2 · Las puntas de los hilos, tras la sujeción

- Los hilos siguen pasando por delante de las piezas, pero ahora las **chinchetas, el celo, los clips y las grapas quedan por encima del hilo**: las puntas se ven sujetas por ellas. Las sujeciones van en una capa propia y siguen a su pieza al moverla, escalarla o girarla (conservan su tamaño fijo).

## 0.3.1 · Vista con el botón derecho e hilos por delante

- **Botón derecho mantenido sobre el fondo y arrastrar** mueve la vista. Sobre una pieza o un hilo, el botón derecho sigue abriendo su menú.
- **Los hilos pasan por delante de las piezas**, de chincheta a chincheta, para que se vea bien la conexión. Si un hilo cruza una pieza, un clic ahí agarra la pieza; el hilo se edita por sus tramos libres.

## 0.3.0 · Edición directa, sujeciones a tu gusto y accesibilidad

- **Escribir sobre la pieza:** doble clic y escribes directamente en notas, titulares, cuerpos, pies de foto y sellos (Intro o clic fuera confirma, Esc cancela). Las piezas nuevas nacen ya listas para escribir. La ventana completa queda para «Editar detalles…».
- **Desplegables en el dock:** cada herramienta abre un panel con las variantes de su tipo (colores de nota, 16 papeles, marcos, sellos, marcas) y **Aleatorio**. Elegir una crea la pieza al momento. «Colgar documento» es una lista con buscador.
- **Sujeción por defecto** (barra superior): tipo (chinchetas, celo, clip, grapa o automático), **color a tu elección** (el celo y las chinchetas se tiñen) y **colocación** (centro, dos esquinas, cuatro esquinas, una esquina, abajo, arriba y abajo, laterales). Vale para todas las piezas, y cada pieza o selección puede tener la suya desde la barra de selección.
- **Chinchetas de tamaño fijo**; el celo se adapta algo a la pieza. Las sujeciones siguen el borde rasgado del papel y el texto se aparta de ellas.
- **Texto legible:** los papeles de periódico traían un titular y un texto fantasma impresos que pisaban el tuyo; ahora son papel limpio. El titular ya no sale casi blanco, una columna salvo textos largos, sin justificar, y la letra se ajusta cuando el papel ya está en pantalla.
- **Fotos sin imagen:** se crean al instante y se rellenan con el selector de archivos (doble clic).
- **Accesibilidad** (botón de la barra superior, se guarda en tu navegador): tamaño de texto del 80 al 200 %, letra legible, alto contraste, reducir movimiento e interfaz grande. Además, anuncios para lectores de pantalla, Tab recorre las piezas, flechas para moverlas, Intro para editar y atributos ARIA en herramientas y piezas.
- **Fondos:** el pergamino es ahora un pergamino continuo propio. Se retira el mapa antiguo: la imagen original solo tiene 1024 px reales y no aguanta un lienzo grande.

## 0.2.0 · Selección múltiple, giro y una interfaz nueva

- **Selección múltiple:** clic con Mayús/Ctrl, recuadro arrastrando en vacío y Ctrl/Cmd+A.
- **Grupo como una sola cosa:** arrastra cualquier pieza seleccionada y se mueve todo con las mismas relaciones. Las esquinas de la caja de selección escalan el grupo entero y el círculo superior lo gira (Mayús: de 15° en 15°); los hilos se adaptan solos porque siguen a sus piezas.
- **Girar cualquier pieza**, también una sola, con el mismo círculo.
- **Alinear y distribuir** (izquierda, centro, derecha, arriba, medio, abajo; repartir en horizontal y vertical).
- **Duplicar** la selección conservando los hilos que unen a sus piezas (Ctrl/Cmd+D).
- **Deshacer** (Ctrl/Cmd+Z) para cualquier cambio: mover, escalar, girar, crear, borrar (con sus hilos), fondo y bloqueo. Flechas del teclado para afinar de 1 en 1 px (Mayús: 10).
- **Interfaz rehecha:** dock de herramientas por grupos con atajos, barra superior con el título y los datos del caso, barra contextual sobre la selección, minimapa navegable, zoom con porcentaje, modo mano (H o Espacio), menús de cristal oscuro, panel de ayuda con los atajos (?) y asas de tamaño constante al hacer zoom.
- El movimiento en directo ahora muestra a la vez todas las piezas de un grupo.

## 0.1.1 · Ajustes tras la primera prueba

- El texto de recortes y documentos ya cae dentro del papel: cada contorno tiene su zona segura medida y la letra se encoge hasta que cabe. El contorno automático solo elige los que dejan hueco.
- Celo, clips y chinchetas se pegan sobre el papel siguiendo su borde rasgado y el texto se aparta de ellos. En fotos y fichas van en una esquina para no tapar la imagen.
- Las chinchetas se ven de frente (solo la cabeza, sin aguja); los clips son más grandes. Se retira la chincheta negra, que salió dañada.
- Fondos a su escala: los ladrillos, la madera y demás motivos ya no son gigantes (cada fondo tiene su tamaño).
- **Suprimir** borra la pieza seleccionada (con sus hilos) sin preguntar y **Ctrl/Cmd+Z** la devuelve.

## 0.1.0 · Primera versión

- Pizarra de investigación colaborativa en una ventana propia con lienzo de 3200×2000 que se desplaza y se acerca. Cada pizarra es un diario (JournalEntry), así que los permisos son los del diario y funciona en cualquier sistema.
- Piezas: notas, recortes de periódico con 18 papeles y 14 contornos irregulares (cada recorte sale distinto y estable), fotos con 6 marcos, sellos con texto, marcas de rotulador, huellas y 9 manchas.
- Documentos colgados desde la barra lateral (diarios, páginas, actores, escenas, objetos) que respetan los permisos de cada persona: lo que no pueden leer aparece censurado o como un sobre «reservado».
- Hilos de 6 colores y 3 estilos con etiqueta. Piezas ocultas hasta que la Guardiana las revela (con animación) y piezas privadas.
- 20 fondos por ambientación. Pizarra bloqueable en solo lectura.
- Trabajo en común sin pisarse: cada pieza se guarda bajo su clave; quien no es propietaria del diario envía sus cambios a la Guardiana conectada, que los valida. Las piezas se ven moverse en directo.
- Español e inglés.
