// Intro de marca de 4 s en Remotion (1080x1920, 30 fps).
// Uso: npx create-video@latest → pega este componente → regístralo en Root.tsx:
// <Composition id="Intro" component={Intro} durationInFrames={120} fps={30} width={1080} height={1920}
//   defaultProps={{ titulo: 'Atelier Norte', claim: 'Casas que envejecen bien' }} />
import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';

export const Intro: React.FC<{ titulo: string; claim: string }> = ({ titulo, claim }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Entrada con muelle para el título, palabra a palabra
  const palabras = titulo.split(' ');
  // Línea que se dibuja
  const linea = interpolate(frame, [18, 48], [0, 1], { extrapolateRight: 'clamp', easing: Easing.bezier(0.22, 1, 0.36, 1) });
  // Claim con fundido + subida
  const claimIn = interpolate(frame, [40, 62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // Salida global en los últimos 12 frames
  const salida = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#F4F1EA', color: '#16140F', justifyContent: 'center', padding: 96, opacity: salida }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontFamily: 'Georgia, serif', fontSize: 150, lineHeight: 0.95, letterSpacing: -4 }}>
        {palabras.map((p, i) => {
          const s = spring({ frame: frame - i * 6, fps, config: { damping: 200 } });
          return (
            <span key={i} style={{ overflow: 'hidden', display: 'inline-block' }}>
              <span style={{ display: 'inline-block', transform: `translateY(${(1 - s) * 110}%)` }}>{p}</span>
            </span>
          );
        })}
      </div>
      <div style={{ height: 3, background: '#B4532A', width: `${linea * 100}%`, margin: '48px 0' }} />
      <div style={{ fontFamily: 'system-ui', fontSize: 48, opacity: claimIn, transform: `translateY(${(1 - claimIn) * 24}px)` }}>
        {claim}
      </div>
    </AbsoluteFill>
  );
};
