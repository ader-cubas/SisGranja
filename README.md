# SisGranja v2.6

Aplicación de gestión para galpón cuyícola. El SPA está contenido en `index.html`; los registros se guardan en el `localStorage` del navegador.

## Uso

Abre `index.html` en un navegador moderno. Los datos permanecen en ese navegador y dispositivo; usa las opciones de backup/restauración para trasladarlos.

## GitHub Pages

Publica la rama `main` y configura **Settings > Pages > Deploy from a branch > main > /(root)**. La URL tendrá el formato `https://<usuario>.github.io/SisGranja-NuevaGranja/`.

El HTML no solicita recursos externos ni usa `fetch`, service workers o un servidor de aplicación. Los datos se guardan solo en el navegador actual; descarga backups para transferirlos. Los gráficos usan canvas local. Las etiquetas imprimibles muestran el identificador textual de la poza, no un QR escaneable.
