# @json-editor/json-editor 2.15.2

Vendored for MoFaCTS editor routes so public startup does not depend on jsDelivr.

- Package: `@json-editor/json-editor`
- Version: `2.15.2`
- Vendored file: `dist/jsoneditor.min.js`
- Source URL: `https://cdn.jsdelivr.net/npm/@json-editor/json-editor@2.15.2/dist/jsoneditor.min.js`
- License: MIT
- Update process: replace this directory with the matching file from the pinned npm package or jsDelivr URL, then smoke-test TDF/content editor routes.
- Reason: editor routes need JSONEditor, but public startup routes must render without third-party CDN requests.

This package/version does not publish `dist/css/jsoneditor.min.css` or `dist/jsoneditor.min.css` on jsDelivr. JSONEditor styling in MoFaCTS is provided by the route's `theme: 'bootstrap5'`, same-origin Bootstrap, Font Awesome 4, and app CSS.
