# Fuentes de Mercy Studio

Según el comentario C11 de Valentina, el sistema usa **3 tipografías**:

| Uso | Fuente oficial | Cómo se carga | Variable CSS |
|-----|---------------|---------------|--------------|
| Textos pequeños, precios, etiquetas | **Lekton** | Google Fonts | `--font-small` |
| Nombres de prendas, títulos y subtítulos grandes | **Norwester** | `mercy-titulo.woff2` (este directorio) | `--font-title` |
| Toque / palabra clave (una por sección) | **Dafoe** | `local()` si está instalada · respaldo Kaushan Script (Google Fonts) | `--font-accent` |

## Norwester → `mercy-titulo.woff2`

La Norwester gratuita (licencia SIL OFL 1.1, de Jamie Wilson) **no trae letras con tilde ni Ñ**: el navegador las tomaba de otra fuente y la Ó, la É, la Ñ… se veían distintas (retro C9). Tampoco se veía en celulares, porque solo se usaba si estaba instalada en el equipo.

`mercy-titulo.woff2` es Norwester con estas letras agregadas: **Á É Í Ó Ú Ü Ñ á é í ó ú ü ñ ¿ ¡ ·**. Se sirve desde el sitio, así que se ve igual en todos los dispositivos. La OFL permite modificar la fuente siempre que la versión modificada no se llame "Norwester"; por eso su nombre es **Mercy Titulo** (licencia en `OFL.txt`).

Para regenerarla: `tools/build_mercy_titulo.py` (instrucciones dentro del archivo). Si se compra **Norwester Pro** (trae acentos de fábrica), basta con poner su `.woff2` aquí y cambiar la ruta del `@font-face` "Mercy Titulo" en `css/tokens.css`.

## Dafoe

No está en Google Fonts y no tenemos el archivo: en los computadores donde está instalada se usa con `local()`; en los demás (p. ej. celulares) se ve Kaushan Script. Para que todos la vean, copia aquí `dafoe.woff2` (con su licencia) y agrega a la regla `@font-face` "Dafoe" de `css/tokens.css`:

```css
src: local("Dafoe"), url("../assets/fonts/dafoe.woff2") format("woff2");
```
