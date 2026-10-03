# Fuentes de Mercy Studio

Según el comentario C11 de Valentina, el sistema usa **3 tipografías**:

| Uso | Fuente oficial | Respaldo actual (Google Fonts) | Variable CSS |
|-----|---------------|-------------------------------|--------------|
| Textos pequeños, precios, etiquetas | **Lekton** | Lekton (ya es de Google Fonts) | `--font-small` |
| Nombres de prendas, títulos y subtítulos grandes | **Norwester** | Oswald | `--font-title` |
| Toque / palabra clave (una por sección) | **Dafoe** | Kaushan Script | `--font-accent` |

**Norwester** y **Dafoe** no se sirven desde Google Fonts. Mientras no existan los archivos con licencia, el mockup usa los respaldos de arriba.

## Cómo activarlas

1. Copia aquí los archivos (por ejemplo `norwester.woff2` y `dafoe.woff2`).
2. En `css/tokens.css`, dentro de cada `@font-face`, agrega a `src`:

```css
src: local("Norwester"),
     url("../assets/fonts/norwester.woff2") format("woff2");
```

(Si ya están instaladas en el equipo, `local()` las toma sin más pasos.)
