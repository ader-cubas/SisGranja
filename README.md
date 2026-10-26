# SisGranja v2.5

Aplicación de gestión para galpón cuyícola. El SPA está contenido en `index.html`; los registros se guardan en el `localStorage` del navegador.

## Uso

Abre `index.html` en un navegador moderno. Los datos permanecen en ese navegador y dispositivo; usa las opciones de backup/restauración para trasladarlos.

## GitHub Pages

Publica la rama `main` y configura **Settings > Pages > Deploy from a branch > main > /(root)**. La URL tendrá el formato `https://<usuario>.github.io/SisGranja-NuevaGranja/`.

El HTML carga Tailwind, iconos, Chart.js y QR desde CDN. La persistencia es local, pero la apariencia y algunas funciones requieren conexión si esos recursos no están en caché. El service worker conserva la página de entrada para navegación offline.
