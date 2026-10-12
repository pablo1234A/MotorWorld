# Remotion: vídeo con código (React → MP4)

Ideal para: plantillas de marca reutilizables, subtítulos animados palabra a palabra, vídeos con datos (resultados, rankings, precios), intros y anuncios en muchas versiones.

## Arranque
```bash
npx create-video@latest mi-video     # plantilla "Hello World" o "Blank"
cd mi-video && npm run dev           # Remotion Studio en el navegador (previsualización y ajuste de props)
npx remotion render MiComposicion out/video.mp4 --codec=h264 --crf=18
```
Registra cada composición en `src/Root.tsx` con `<Composition id width height fps durationInFrames component defaultProps />`. Usa `calculateMetadata` cuando la duración dependa de los datos (por ejemplo, de la longitud del audio).

## Primitivas clave
- `useCurrentFrame()`, `useVideoConfig()` → frame actual, fps, tamaño.
- `interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1) })`.
- `spring({ frame, fps, config: { damping: 200 } })` para entradas naturales (damping alto = sin rebote).
- `<Sequence from={30} durationInFrames={60}>` y `<Series>` para encadenar escenas; `@remotion/transitions` (`<TransitionSeries>` con `fade()`, `slide()`, `wipe()`).
- `<OffthreadVideo src={staticFile('clip.mp4')} />` para vídeo (más fiable que `<Video>` al renderizar), `<Audio>`, `<Img>`.
- Fuentes: `@remotion/google-fonts/Montserrat` → `loadFont()`; nunca dependas de fuentes del sistema.
- Recursos en `public/` y `staticFile('logo.svg')`.

## Patrones profesionales
- **Props con esquema Zod** (`schema` en `<Composition>`): el cliente cambia textos y colores en el Studio sin tocar código.
- **Subtítulos palabra a palabra** desde JSON de Whisper (`@remotion/install-whisper-cpp` o el JSON de `whisper --word_timestamps True`): ver `examples/remotion-subtitulos.tsx`.
- **Una composición por formato** (9:16, 1:1, 16:9) reutilizando los mismos componentes con diseño adaptativo (`width > height`).
- **Datos externos**: `calculateMetadata` hace `fetch` antes de renderizar; vídeos personalizados por cliente en bucle con `renderMedia()` desde Node.
- **Render a escala**: `@remotion/lambda` (AWS) para cientos de vídeos en paralelo.

## Calidad
- 30 fps para redes, 60 fps para pantallas con mucho movimiento; 1080×1920 vertical.
- Easing coherente en todo el vídeo; entradas 8–15 frames, salidas más rápidas.
- Renderiza un fotograma de prueba con `npx remotion still MiComposicion --frame=45 out/f.png` y míralo antes del render completo (ahorra tiempo).
- Licencia: Remotion es gratis para personas y empresas pequeñas; las empresas de más de 3 personas necesitan licencia de empresa (consulta remotion.pro).
