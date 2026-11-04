// シーンを Canvas に描き直して PNG にする。SVG を画像化しないので、
// 文字は document に読み込んだ Web フォント（同梱）で描かれる。
// 地理院タイルは CORS（Access-Control-Allow-Origin: *）で読み込み、Canvas を汚さずに書き出す。
import type { Prim, Scene } from './scene';

type Images = Map<string, HTMLImageElement | null>;

function draw(ctx: CanvasRenderingContext2D, p: Prim, images: Images) {
  switch (p.t) {
    case 'rect':
      if (p.fill) {
        ctx.globalAlpha = p.fo ?? 1;
        ctx.fillStyle = p.fill;
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.globalAlpha = 1;
      }
      if (p.stroke && p.sw) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }
      return;
    case 'circle': {
      ctx.beginPath();
      ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
      if (p.fill) {
        ctx.globalAlpha = p.fo ?? 1;
        ctx.fillStyle = p.fill;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p.stroke && p.sw) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.stroke();
      }
      return;
    }
    case 'image': {
      const img = images.get(p.href);
      if (!img) return; // 読み込めなかったタイルは描かない（画面と同じ）
      ctx.save();
      ctx.globalAlpha = p.opacity ?? 1;
      if (p.blend) ctx.globalCompositeOperation = p.blend;
      ctx.drawImage(img, p.x, p.y, p.w, p.h);
      ctx.restore();
      return;
    }
    case 'path': {
      const path = new Path2D(p.d);
      if (p.fill) {
        ctx.globalAlpha = p.fo ?? 1;
        ctx.fillStyle = p.fill;
        ctx.fill(path);
        ctx.globalAlpha = 1;
      }
      if (p.stroke && p.sw) {
        ctx.globalAlpha = p.so ?? 1;
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.lineJoin = p.join ?? 'miter';
        ctx.lineCap = p.join === 'round' ? 'round' : 'butt';
        ctx.stroke(path);
        ctx.globalAlpha = 1;
      }
      return;
    }
    case 'text':
      ctx.font = `${p.weight} ${p.size}px ${p.family}`;
      ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
      ctx.textBaseline = 'alphabetic';
      if (p.halo && p.haloW) {
        ctx.strokeStyle = p.halo;
        ctx.lineWidth = p.haloW;
        ctx.lineJoin = 'round';
        ctx.strokeText(p.text, p.x, p.y);
      }
      ctx.fillStyle = p.fill;
      ctx.fillText(p.text, p.x, p.y);
      return;
    case 'group':
      ctx.save();
      if (p.clip) {
        ctx.beginPath();
        ctx.rect(p.clip.x, p.clip.y, p.clip.w, p.clip.h);
        ctx.clip();
      }
      p.children.forEach((c) => draw(ctx, c, images));
      ctx.restore();
      return;
  }
}

function walk(prims: Prim[], fn: (p: Prim) => void) {
  for (const p of prims) {
    fn(p);
    if (p.t === 'group') walk(p.children, fn);
  }
}

/** 使う文字のフォント（unicode-range 分割分を含む）を読み込んでから描く */
export async function ensureFonts(scene: Scene) {
  const fonts = new Map<string, string>();
  walk(scene.prims, (p) => {
    if (p.t === 'text') {
      const f = `${p.weight} ${p.size}px ${p.family}`;
      fonts.set(f, (fonts.get(f) ?? '') + p.text);
    }
  });
  await Promise.all([...fonts].map(([font, chars]) => document.fonts.load(font, chars)));
  await document.fonts.ready;
}

/** タイル画像を CORS で読み込む。失敗したものは null（書き出しは続ける） */
export async function loadImages(scene: Scene): Promise<{ images: Images; failed: number }> {
  const urls = new Set<string>();
  walk(scene.prims, (p) => {
    if (p.t === 'image') urls.add(p.href);
  });
  const images: Images = new Map();
  let failed = 0;
  await Promise.all(
    [...urls].map(
      (u) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            images.set(u, img);
            resolve();
          };
          img.onerror = () => {
            images.set(u, null);
            failed++;
            resolve();
          };
          img.src = u;
        }),
    ),
  );
  return { images, failed };
}

export async function sceneToPng(scene: Scene, scale = 1): Promise<{ blob: Blob; failedTiles: number }> {
  const [, { images, failed }] = await Promise.all([ensureFonts(scene), loadImages(scene)]);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.w * scale);
  canvas.height = Math.round(scene.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  scene.prims.forEach((p) => draw(ctx, p, images));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の生成に失敗しました'))), 'image/png'),
  );
  return { blob, failedTiles: failed };
}
