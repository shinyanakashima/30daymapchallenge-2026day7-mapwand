import { memo } from 'react';
import type { Prim, Scene } from './scene';

let clipSeq = 0;

function renderPrim(p: Prim, key: number | string): React.ReactNode {
  switch (p.t) {
    case 'rect':
      return (
        <rect key={key} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.sw} />
      );
    case 'path':
      return (
        <path
          key={key}
          d={p.d}
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.sw}
          strokeLinejoin={p.join}
          strokeLinecap={p.join === 'round' ? 'round' : undefined}
          data-code={p.id}
        />
      );
    case 'text':
      return (
        <text
          key={key}
          x={p.x}
          y={p.y}
          fontSize={p.size}
          fontWeight={p.weight}
          fontFamily={p.family}
          fill={p.fill}
          textAnchor={p.anchor}
          stroke={p.halo}
          strokeWidth={p.halo ? p.haloW : undefined}
          strokeLinejoin="round"
          paintOrder={p.halo ? 'stroke' : undefined}
        >
          {p.text}
        </text>
      );
    case 'group': {
      const id = `mw-clip-${++clipSeq}`;
      return (
        <g key={key}>
          {p.clip && (
            <clipPath id={id}>
              <rect x={p.clip.x} y={p.clip.y} width={p.clip.w} height={p.clip.h} />
            </clipPath>
          )}
          <g clipPath={p.clip ? `url(#${id})` : undefined}>{p.children.map((c, i) => renderPrim(c, i))}</g>
        </g>
      );
    }
  }
}

export const SceneSvg = memo(function SceneSvg({ scene }: { scene: Scene }) {
  return (
    <svg
      viewBox={`0 0 ${scene.w} ${scene.h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="都道府県別人口密度の地図"
      style={{ display: 'block' }}
    >
      {scene.prims.map((p, i) => renderPrim(p, i))}
    </svg>
  );
});
