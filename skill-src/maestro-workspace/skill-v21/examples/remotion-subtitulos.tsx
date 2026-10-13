// Subtítulos estilo redes, palabra a palabra, desde las marcas de tiempo de Whisper (Remotion 4).
// 1) whisper audio.mp3 --language Spanish --word_timestamps True --output_format json   → audio.json
// 2) Copia audio.json y el vídeo a public/ y registra en Root.tsx:
//    <Composition id="Subtitulos" component={Subtitulos} width={1080} height={1920} fps={30} durationInFrames={30 * 30}
//      defaultProps={{ video: 'clip.mp4', whisper: null, acento: '#F2B33D' }} />
//    (lee el JSON con fetch(staticFile('audio.json')) en calculateMetadata y pásalo en props.whisper)
import React from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export type Palabra = { text: string; start: number; end: number };   // segundos
type WhisperJSON = { segments: { words?: { word: string; start: number; end: number }[] }[] };

export const deWhisper = (j: WhisperJSON): Palabra[] =>
  j.segments.flatMap(s => (s.words ?? []).map(w => ({ text: w.word.trim(), start: w.start, end: w.end }))).filter(w => w.text);

// Agrupa en bloques de máx. 3 palabras, cortando en pausas > 0,45 s o tras un signo de puntuación.
export function enBloques(ws: Palabra[], max = 3): Palabra[][] {
  const out: Palabra[][] = []; let cur: Palabra[] = [];
  ws.forEach((w, i) => {
    cur.push(w);
    const pausa = i < ws.length - 1 && ws[i + 1].start - w.end > 0.45;
    if (cur.length >= max || pausa || /[.,!?;:]$/.test(w.text)) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

const DEMO: Palabra[] = [
  { text: 'Este', start: 0.1, end: 0.35 }, { text: 'coche', start: 0.35, end: 0.8 }, { text: 'entró', start: 0.9, end: 1.2 },
  { text: 'sin', start: 1.2, end: 1.4 }, { text: 'frenos.', start: 1.4, end: 2.0 }, { text: 'Y', start: 2.4, end: 2.5 },
  { text: 'salió', start: 2.5, end: 2.9 }, { text: 'así.', start: 2.9, end: 3.6 },
];

export const Subtitulos: React.FC<{ video?: string | null; whisper?: WhisperJSON | null; acento?: string }> = ({ video, whisper, acento = '#F2B33D' }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const t = frame / fps;
  const bloques = enBloques(whisper ? deWhisper(whisper) : DEMO);
  const bloque = bloques.find(b => t >= b[0].start - 0.05 && t <= b[b.length - 1].end + 0.15);

  return (
    <AbsoluteFill style={{ backgroundColor: '#111' }}>
      {video ? <OffthreadVideo src={staticFile(video)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
      {bloque ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * 0.26 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 22px', maxWidth: '86%' }}>
            {bloque.map((w, i) => {
              const activa = t >= w.start && t < w.end + 0.05;
              const entrada = spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 14, stiffness: 220, mass: 0.6 } });
              const escala = activa ? interpolate(entrada, [0, 1], [0.8, 1.1]) : 1;
              const visible = t >= w.start - 0.05;
              return (
                <span key={i} style={{
                  fontFamily: 'Montserrat, Inter, system-ui, sans-serif', fontWeight: 900, fontSize: 92, lineHeight: 1.05,
                  textTransform: 'uppercase', letterSpacing: -1, color: activa ? acento : '#fff',
                  opacity: visible ? 1 : 0.35, transform: `scale(${escala})`, display: 'inline-block',
                  WebkitTextStroke: '10px #000', paintOrder: 'stroke fill',
                  textShadow: '0 8px 24px rgba(0,0,0,.55)',
                }}>{w.text}</span>
              );
            })}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
