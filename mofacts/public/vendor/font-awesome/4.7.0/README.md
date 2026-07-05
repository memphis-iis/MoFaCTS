# Font Awesome 4.7.0

Vendored so MoFaCTS public startup routes and JSONEditor icon buttons do not depend on cdnjs or use.fontawesome.com.

- Package: `font-awesome`
- Version: `4.7.0`
- Vendored files:
  - `css/font-awesome.min.css`
  - `fonts/FontAwesome.otf`
  - `fonts/fontawesome-webfont.eot`
  - `fonts/fontawesome-webfont.svg`
  - `fonts/fontawesome-webfont.ttf`
  - `fonts/fontawesome-webfont.woff`
  - `fonts/fontawesome-webfont.woff2`
- Source URLs:
  - `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css`
  - `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/fonts/<font-file>`
- License: Font Awesome Free License / SIL OFL 1.1 for fonts, MIT for CSS.
- Update process: replace the CSS and matching font files from the same pinned release or an explicitly approved newer version, preserving the CSS `../fonts/` URL relationship.
- Reason: the app uses `fa fa-*` classes and JSONEditor is configured with `iconlib: 'fontawesome4'`.
