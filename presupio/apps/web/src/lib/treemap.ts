// Treemap "squarified" (Bruls, Huizing y van Wijk, 2000): reparte un rectángulo en
// parcelas cuya área es proporcional al valor, buscando proporciones cercanas al cuadrado.

export interface TreemapInput<T> {
  value: number;
  item: T;
}

export interface Parcel<T> {
  item: T;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worstRatio(row: number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  const s2 = side * side;
  const sum2 = sum * sum;
  return Math.max((s2 * max) / sum2, sum2 / (s2 * min));
}

/**
 * @param inputs valores positivos (se ignoran los <= 0)
 * @param width  ancho del área
 * @param height alto del área
 */
export function squarify<T>(inputs: TreemapInput<T>[], width: number, height: number): Parcel<T>[] {
  const items = inputs.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (!items.length || width <= 0 || height <= 0) return [];
  const total = items.reduce((a, b) => a + b.value, 0);
  const scale = (width * height) / total;
  const areas = items.map((i) => i.value * scale);

  const out: Parcel<T>[] = [];
  let rect: Rect = { x: 0, y: 0, w: width, h: height };
  let i = 0;

  while (i < areas.length) {
    const side = Math.min(rect.w, rect.h);
    const row: number[] = [areas[i]!];
    let j = i + 1;
    while (j < areas.length && worstRatio([...row, areas[j]!], side) <= worstRatio(row, side)) {
      row.push(areas[j]!);
      j++;
    }

    const rowSum = row.reduce((a, b) => a + b, 0);
    if (rect.w >= rect.h) {
      // Columna a la izquierda.
      const colW = rowSum / rect.h;
      let y = rect.y;
      row.forEach((area, k) => {
        const h = area / colW;
        out.push({ item: items[i + k]!.item, value: items[i + k]!.value, x: rect.x, y, w: colW, h });
        y += h;
      });
      rect = { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h };
    } else {
      // Fila arriba.
      const rowH = rowSum / rect.w;
      let x = rect.x;
      row.forEach((area, k) => {
        const w = area / rowH;
        out.push({ item: items[i + k]!.item, value: items[i + k]!.value, x, y: rect.y, w, h: rowH });
        x += w;
      });
      rect = { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH };
    }
    i = j;
  }
  return out;
}
