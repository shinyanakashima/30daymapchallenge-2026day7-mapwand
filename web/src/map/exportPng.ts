// シーンを Canvas に描き直して PNG にする。SVG を画像化しないので、
// 文字は document に読み込んだ Web フォント（同梱）で描かれる。
import type { Prim, Scene } from './scene';

function draw(ctx: CanvasRenderingContext2D, p: Prim) {
  switch (p.t) {
    case 'rect':
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fillRect(p.x, p.y, p.w, p.h);
      }
      if (p.stroke && p.sw) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }
      return;
    case 'path': {
      const path = new Path2D(p.d);
      if (p.fill) {
        ctx.fillStyle = p.fill;
        ctx.fill(path);
      }
      if (p.stroke && p.sw) {
        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = p.sw;
        ctx.lineJoin = p.join ?? 'miter';
        ctx.lineCap = p.join === 'round' ? 'round' : 'butt';
        ctx.stroke(path);
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
      p.children.forEach((c) => draw(ctx, c));
      ctx.restore();
      return;
  }
}

function collectFonts(prims: Prim[], out: Map<string, string>) {
  for (const p of prims) {
    if (p.t === 'text') {
      const f = `${p.weight} ${p.size}px ${p.family}`;
      out.set(f, (out.get(f) ?? '') + p.text);
    } else if (p.t === 'group') collectFonts(p.children, out);
  }
}

/** 使う文字のフォント（unicode-range 分割分を含む）を読み込んでから描く */
export async function ensureFonts(scene: Scene) {
  const fonts = new Map<string, string>();
  collectFonts(scene.prims, fonts);
  await Promise.all([...fonts].map(([font, chars]) => document.fonts.load(font, chars)));
  await document.fonts.ready;
}

export async function sceneToPng(scene: Scene, scale = 1): Promise<Blob> {
  await ensureFonts(scene);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(scene.w * scale);
  canvas.height = Math.round(scene.h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  scene.prims.forEach((p) => draw(ctx, p));
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の生成に失敗しました'))), 'image/png'),
  );
}
