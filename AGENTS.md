# Project guidance

## Lessons

- This project uses vanilla TypeScript, Three.js 0.180 and Vite. Run `npm run build` for TypeScript checking and the production build. Browser smoke verification is required for geometry, picking, and export changes.
- Botanical models use Y-up coordinates: roots at local y=0, principal flower heads near y=1.5. Vases have their base at y=0 and mouth at y=1.16; the studio places flower roots at y=0.88. Keep these shared dimensions aligned.
- Radial petal placement needs YXZ Euler order (azimuth around the flower after opening the petal). XYZ order incorrectly aligns the petals along a single direction.
- Ordinary Three.js WebGLRenderTarget rendering does not use the renderer's display tone mapping. Image export uses the screen framebuffer synchronously, restoring its pixel ratio, dimensions, clear state, and studio frame afterward to match the live scene.
- Each botanical model exclusively owns its geometries, materials, and textures; removing or recoloring one flower must not dispose another flower's resources. Batch geometry by material and render only when the scene or camera changes.
- Drafts and saved works are browser-local, versioned localStorage data. Never describe them as server-synced or permanent across browser-data removal.
- Browser launches must use the machine-wide `/root/.omp/bin/heavy-gate`; automation attaches to its explicit CDP endpoint. Stop the owned browser afterward. Long-lived named `bash` services omit `async` and `timeout`; use `ready.timeout` instead.
- Reserve a stable root scrollbar gutter. Dialogs and browser element screenshots can otherwise change the available page width, resize the WebGL canvas, and appear to move an otherwise locked camera.
- Third-party notices are maintained in `public/THIRD_PARTY_NOTICES.txt` and copied unchanged into `dist/` by Vite. Keep them aligned with `package-lock.json` and the Google Fonts families; Vite's modulepreload helper ships in the production bundle even though Vite is a devDependency.
- The footer notices dialog loads the canonical public file on demand through a `%BASE_URL%` URL, preserving GitHub Pages subpath hosting. Bind legal dialogs before WebGL initialization so license access still works when the renderer fails.
