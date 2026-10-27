import type { RoadNetwork } from './RoadNetwork';

interface Node {
  road: number;
  s: number;
  edges: { to: number; w: number }[];
}

/**
 * Graph over the road network (nodes at junctions and road ends) for GPS routing.
 */
export class RoadGraph {
  private nodes: Node[] = [];
  private byRoad = new Map<number, number[]>();

  constructor(private net: RoadNetwork) {
    const add = (road: number, s: number) => {
      const list = this.byRoad.get(road) ?? [];
      for (const id of list) if (Math.abs(this.nodes[id].s - s) < 6) return id;
      const id = this.nodes.length;
      this.nodes.push({ road, s, edges: [] });
      list.push(id);
      this.byRoad.set(road, list);
      return id;
    };
    for (const r of net.roads) {
      if (!r.loop) {
        add(r.index, 0);
        add(r.index, r.length);
      } else add(r.index, 0);
      for (const j of r.junctions) {
        const a = add(r.index, j.s);
        const b = add(j.road.index, j.otherS);
        this.link(a, b, 1);
      }
    }
    // connect consecutive nodes along each road
    for (const r of net.roads) {
      const ids = (this.byRoad.get(r.index) ?? []).sort((a, b) => this.nodes[a].s - this.nodes[b].s);
      for (let k = 0; k < ids.length - 1; k++) this.link(ids[k], ids[k + 1], this.nodes[ids[k + 1]].s - this.nodes[ids[k]].s);
      if (r.loop && ids.length > 1) this.link(ids[ids.length - 1], ids[0], r.length - this.nodes[ids[ids.length - 1]].s + this.nodes[ids[0]].s);
    }
  }

  private link(a: number, b: number, w: number) {
    if (a === b) return;
    this.nodes[a].edges.push({ to: b, w });
    this.nodes[b].edges.push({ to: a, w });
  }

  /** Shortest road path between two world points as a polyline. */
  route(fx: number, fz: number, tx: number, tz: number): { x: number[]; z: number[] } | null {
    const fh = this.net.nearest(fx, fz, 80), th = this.net.nearest(tx, tz, 120);
    if (!fh || !th) return null;
    // temporary start/end nodes
    const start = this.nodes.length, end = start + 1;
    const tmp: Node[] = [
      { road: fh.road.index, s: fh.s, edges: [] },
      { road: th.road.index, s: th.s, edges: [] },
    ];
    const all = [...this.nodes, ...tmp];
    const attach = (id: number, road: number, s: number) => {
      const r = this.net.roads[road];
      const ids = this.byRoad.get(road) ?? [];
      let before = -1, after = -1, bs = -Infinity, as = Infinity;
      for (const n of ids) {
        const ns = this.nodes[n].s;
        if (ns <= s && ns > bs) { bs = ns; before = n; }
        if (ns >= s && ns < as) { as = ns; after = n; }
      }
      if (r.loop) {
        if (before < 0) for (const n of ids) if (this.nodes[n].s > bs) { bs = this.nodes[n].s - r.length; before = n; }
        if (after < 0) for (const n of ids) if (this.nodes[n].s + r.length < as) { as = this.nodes[n].s + r.length; after = n; }
      }
      const e: { to: number; w: number }[] = [];
      if (before >= 0) e.push({ to: before, w: s - bs });
      if (after >= 0) e.push({ to: after, w: as - s });
      all[id].edges = e;
      return e;
    };
    const se = attach(start, fh.road.index, fh.s);
    const ee = attach(end, th.road.index, th.s);
    // reverse edges into the end node
    const extraIn = new Map<number, { to: number; w: number }[]>();
    for (const e of ee) extraIn.set(e.to, [...(extraIn.get(e.to) ?? []), { to: end, w: e.w }]);
    if (fh.road.index === th.road.index) se.push({ to: end, w: Math.abs(th.s - fh.s) });
    // Dijkstra
    const dist = new Float64Array(all.length).fill(Infinity);
    const prev = new Int32Array(all.length).fill(-1);
    const done = new Uint8Array(all.length);
    dist[start] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < all.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === end) break;
      done[u] = 1;
      const edges = [...all[u].edges, ...(extraIn.get(u) ?? [])];
      for (const e of edges) {
        const nd = dist[u] + e.w;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
        }
      }
    }
    if (!isFinite(dist[end])) return null;
    const path: number[] = [];
    for (let u = end; u >= 0; u = prev[u]) path.unshift(u);
    // expand into polyline following roads
    const xs: number[] = [], zs: number[] = [];
    const pt = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    for (let k = 0; k < path.length - 1; k++) {
      const a = all[path[k]], b = all[path[k + 1]];
      if (a.road !== b.road) continue;
      const r = this.net.roads[a.road];
      let sa = a.s, sb = b.s;
      if (r.loop && Math.abs(sb - sa) > r.length / 2) {
        if (sb > sa) sa += r.length;
        else sb += r.length;
      }
      const dir = sb >= sa ? 1 : -1;
      for (let s = sa; dir > 0 ? s <= sb : s >= sb; s += dir * 8) {
        r.pointAt(s, pt);
        xs.push(pt.x);
        zs.push(pt.z);
      }
    }
    xs.push(tx);
    zs.push(tz);
    return { x: xs, z: zs };
  }
}
