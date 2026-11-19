import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { Presentation } from '../content/types';

type Kind = 'root' | 'part' | 'stop' | 'point';
export interface MapNode { key: string; kind: Kind; label: string; part: number; stop?: string; children: MapNode[]; hidden: number; w: number; h: number; x: number; y: number; side: 1 | -1; parent?: MapNode }
interface Box { x: number; y: number; w: number; h: number }
export interface MapLayout { nodes: MapNode[]; edges: { from: MapNode; to: MapNode }[]; bounds: Box }
/** Which parts of the tree are drawn: parts always; their stops when opened; a stop's key terms when shown. */
export interface Reveal { parts: (part: number) => boolean; points: (stopId: string) => boolean }
export const revealAll: Reveal = { parts: () => true, points: () => true };

// Root and parts are pills; stops and their key terms sit on their branch line, as in markmap.
const FONT: Record<Kind, string> = { root: '700 18px', part: '600 16px', stop: '500 15px', point: '400 13px' };
const PAD: Record<Kind, number> = { root: 48, part: 34, stop: 16, point: 10 };
const HEIGHT: Record<Kind, number> = { root: 54, part: 40, stop: 32, point: 24 };
const HGAP: Record<Kind, number> = { root: 0, part: 52, stop: 40, point: 26 };
const VGAP: Record<Kind, number> = { root: 0, part: 26, stop: 8, point: 0 };

let context: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string, family: string) {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 15 : 8), 0);
  context.font = `${font} ${family}`;
  return context.measureText(text).width;
}
const subtree = (node: MapNode): number => node.children.length
  ? Math.max(node.h, node.children.reduce((sum, child) => sum + subtree(child), 0) + VGAP[node.children[0].kind] * (node.children.length - 1)) : node.h;
const stack = (parts: MapNode[]) => parts.reduce((sum, part) => sum + subtree(part), 0) + VGAP.part * Math.max(0, parts.length - 1);
function place(node: MapNode, top: number, column: Record<Kind, number>, side: 1 | -1, edge: number) {
  const total = subtree(node);
  node.side = side;
  node.x = side === 1 ? edge + column[node.kind] : edge - column[node.kind] - node.w;
  if (!node.children.length) { node.y = top + total / 2; return; }
  const gap = VGAP[node.children[0].kind];
  let y = top + (total - (node.children.reduce((sum, child) => sum + subtree(child), 0) + gap * (node.children.length - 1))) / 2;
  for (const child of node.children) { place(child, y, column, side, edge); y += subtree(child) + gap; }
  node.y = (node.children[0].y + node.children.at(-1)!.y) / 2;
}
function columns(parts: MapNode[]) {
  const widest = (nodes: MapNode[]) => nodes.reduce((max, node) => Math.max(max, node.w), 0);
  const stops = parts.flatMap(part => part.children), points = stops.flatMap(stop => stop.children);
  const part = HGAP.part, stop = part + widest(parts) + HGAP.stop, point = stop + widest(stops) + HGAP.point;
  return { column: { root: 0, part, stop, point } };
}
function tree(talk: Presentation, rootLabel: string, family: string, reveal: Reveal): MapNode {
  const size = (kind: Kind, label: string) => ({ w: Math.ceil(textWidth(label, FONT[kind], family) + PAD[kind]), h: HEIGHT[kind] });
  const parts: MapNode[] = talk.parts.map((part, at) => {
    const stops = part.stops.map(stop => {
      const points = (stop.points ?? []).filter(point => point.key);
      const shown = reveal.points(stop.id);
      return { key: stop.id, kind: 'stop', label: stop.label, part: at, stop: stop.id, x: 0, y: 0, side: 1, hidden: shown ? 0 : points.length, ...size('stop', stop.label),
        children: shown ? points.map((point, order): MapNode => ({ key: `${stop.id}-${order}`, kind: 'point', label: point.key!, part: at, stop: stop.id, children: [], hidden: 0, x: 0, y: 0, side: 1, ...size('point', point.key!) })) : [] } as MapNode;
    });
    const open = reveal.parts(at);
    return { key: part.id, kind: 'part', label: part.title, part: at, x: 0, y: 0, side: 1, hidden: open ? 0 : stops.length, ...size('part', part.title), children: open ? stops : [] };
  });
  return { key: 'root', kind: 'root', label: rootLabel, part: -1, children: parts, hidden: 0, x: 0, y: 0, side: 1, ...size('root', rootLabel) };
}
/** Talk order runs down the right side, then down the left; split where the fully drawn sides are closest in height. */
export function balancedSplit(talk: Presentation, rootLabel: string, family: string) {
  const parts = tree(talk, rootLabel, family, revealAll).children;
  let split = parts.length, best = Infinity;
  for (let at = 1; at < parts.length; at++) { const difference = Math.abs(stack(parts.slice(0, at)) - stack(parts.slice(at))); if (difference < best) { best = difference; split = at; } }
  return split;
}

/** Lay out what is revealed. `split` parts go right and the rest left; it stays fixed so branches never change sides while unfolding. */
export function layoutTalk(talk: Presentation, rootLabel: string, family: string, split: number, reveal: Reveal = revealAll): MapLayout {
  const root = tree(talk, rootLabel, family, reveal), parts = root.children;
  const right = parts.slice(0, split), left = parts.slice(split);
  const rightColumns = columns(right), leftColumns = left.length ? columns(left) : undefined;
  const height = Math.max(stack(right), stack(left), root.h);
  const edgeRight = left.length ? root.w / 2 : root.w, edgeLeft = -root.w / 2;
  let y = (height - stack(right)) / 2;
  for (const part of right) { place(part, y, rightColumns.column, 1, edgeRight); y += subtree(part) + VGAP.part; }
  y = (height - stack(left)) / 2;
  for (const part of left) { place(part, y, leftColumns!.column, -1, edgeLeft); y += subtree(part) + VGAP.part; }
  root.x = left.length ? -root.w / 2 : 0; root.y = height / 2;
  const nodes: MapNode[] = [], edges: MapLayout['edges'] = [];
  (function walk(node: MapNode) { nodes.push(node); for (const child of node.children) { child.parent = node; edges.push({ from: node, to: child }); walk(child); } })(root);
  return { nodes, edges, bounds: boxOf(nodes) };
}

function boxOf(list: MapNode[]): Box {
  // A folded node carries a small count badge beyond its end.
  const reach = (node: MapNode) => node.hidden ? 26 : 0;
  const minX = Math.min(...list.map(node => node.x - (node.side === -1 ? reach(node) : 0))), maxX = Math.max(...list.map(node => node.x + node.w + (node.side === 1 ? reach(node) : 0)));
  const minY = Math.min(...list.map(node => node.y - node.h / 2)), maxY = Math.max(...list.map(node => node.y + node.h / 2));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
function anchor(node: MapNode, side: 1 | -1, outgoing: boolean) {
  const lined = node.kind === 'stop' || node.kind === 'point';
  const y = lined ? node.y + node.h / 2 : node.y;
  if (node.kind === 'root') return { x: node.x + node.w / 2 + side * node.w / 2, y };
  const far = outgoing ? side === 1 : side === -1;
  return { x: far ? node.x + node.w : node.x, y };
}
function edgePath(from: MapNode, to: MapNode) {
  const a = anchor(from, to.side, true), b = anchor(to, to.side, false), bend = (b.x - a.x) * .55;
  return `M${a.x} ${a.y}C${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`;
}

export type MapTarget = { kind: 'root' } | { kind: 'part'; part: number } | { kind: 'stop'; id: string };

function useFrame() {
  const frame = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const node = frame.current!;
    const update = () => setPane({ w: node.clientWidth, h: node.clientHeight });
    update();
    const observer = new ResizeObserver(update); observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { frame, pane };
}

/**
 * The whole talk at the top of the page: every branch, stop and key term at reading size, so the audience sees
 * what is coming. Two-sided when that fits; one-sided before text would shrink; an outline on phones.
 */
export function TalkOverview({ talk, rootLabel, current, onSelect }: { talk: Presentation; rootLabel: string; current?: string; onSelect: (target: MapTarget) => void }) {
  const { frame, pane } = useFrame();
  // Pointing at a branch lights it and fades the others, so the audience can follow what the speaker points at.
  const [hover, setHover] = useState<number>();
  const family = useMemo(() => getComputedStyle(document.body).fontFamily, []);
  const layouts = useMemo(() => ({ two: layoutTalk(talk, rootLabel, family, balancedSplit(talk, rootLabel, family)), one: layoutTalk(talk, rootLabel, family, talk.parts.length) }), [talk, rootLabel, family]);
  const fitOf = (layout: MapLayout) => pane.w ? Math.min(1.15, (pane.w - 8) / layout.bounds.w) : 0;
  const map = fitOf(layouts.two) >= .92 ? layouts.two : layouts.one, scale = fitOf(map);
  if (pane.w && scale < .92) return <div ref={frame} className="talk-map-frame is-outline"><Outline talk={talk} current={current} onSelect={onSelect} /></div>;
  const { bounds } = map;
  const select = (node: MapNode) => onSelect(node.kind === 'root' ? { kind: 'root' } : node.kind === 'part' ? { kind: 'part', part: node.part } : { kind: 'stop', id: node.stop! });
  const keyed = (node: MapNode) => (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node); } };
  const dim = (node: MapNode) => hover !== undefined && node.kind !== 'root' && node.part !== hover;
  const trail = trailOf(map, current);
  return <div ref={frame} className="talk-map-frame is-fit">
    {pane.w > 0 && <svg className="talk-map is-overview" role="group" aria-label="汇报导图" viewBox={`${bounds.x - 4} ${bounds.y - 4} ${bounds.w + 8} ${bounds.h + 8}`} width={(bounds.w + 8) * scale} height={(bounds.h + 8) * scale}>
      <g fill="none">{map.edges.map(({ from, to }) => <path key={to.key} pathLength={1} className={`talk-edge edge-${to.kind}${trail.has(to) ? ' is-trail' : ''}${dim(to) ? ' is-dim' : ''}`} data-part={to.part % 6} d={edgePath(from, to)} />)}</g>
      {map.nodes.map(node => {
        const isCurrent = node.kind === 'stop' && node.stop === current;
        return <Node key={node.key} node={node} className={`${isCurrent ? ' is-current' : ''}${node.kind === 'point' && node.stop === current ? ' is-current-point' : ''}${dim(node) ? ' is-dim' : ''}`}
          onPointerEnter={() => setHover(node.kind === 'root' ? undefined : node.part)} onPointerLeave={() => setHover(undefined)}
          interactive={node.kind === 'point' ? undefined : { tabIndex: 0, role: 'link', 'aria-label': node.kind === 'root' ? `${node.label}：价值与边界` : node.kind === 'part' ? `${node.label}，${node.children.length} 个讲解点` : node.label, 'aria-current': isCurrent ? 'step' : undefined, onClick: () => select(node), onKeyDown: keyed(node) }} />;
      })}
    </svg>}
  </div>;
}

/** Edges from the root to the current stop: the route the speaker has taken to this point. */
function trailOf(map: MapLayout, current?: string) {
  const stop = current ? map.nodes.find(node => node.kind === 'stop' && node.stop === current) : undefined;
  return new Set(stop ? [stop, stop.parent!] : []);
}

function Node({ node, className = '', interactive, onPointerEnter, onPointerLeave }: { node: MapNode; className?: string; interactive?: Record<string, unknown>; onPointerEnter?: () => void; onPointerLeave?: () => void }) {
  const lined = node.kind === 'stop' || node.kind === 'point';
  const end = node.side === 1 ? node.w : 0;
  // A node that appears starts at the end of its parent, so an opened branch grows out of it.
  const parent = node.parent, fromX = parent ? (node.side === 1 ? parent.x + parent.w : parent.x - node.w) : node.x;
  const fromY = parent ? parent.y + (parent.kind === 'stop' ? parent.h / 2 : 0) : node.y;
  const style = { '--to': `translate(${node.x}px, ${node.y}px)`, '--from': `translate(${fromX}px, ${fromY}px)` } as CSSProperties;
  return <g className={`talk-node node-${node.kind}${className}`} data-part={node.part < 0 ? undefined : node.part % 6} style={style} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} {...(interactive ?? { 'aria-hidden': true })}>
    {lined ? <><rect className="node-hit" x={0} y={-node.h / 2} width={node.w} height={node.h} rx={6} /><line x1={0} x2={node.w} y1={node.h / 2} y2={node.h / 2} /></>
      : <rect x={0} y={-node.h / 2} width={node.w} height={node.h} rx={node.h / 2} />}
    <text x={PAD[node.kind] / 2} y={lined ? -1 : 0} dominantBaseline="central">{node.label}</text>
    {node.hidden > 0 && (node.kind === 'part'
      ? <g className="node-fold" style={{ transform: `translate(${end + node.side * 15}px, 0)` }}><circle r={11} /><text dominantBaseline="central" textAnchor="middle">{node.hidden}</text></g>
      : <circle className="node-fold-dot" cx={end + node.side * 6} cy={node.h / 2} r={4} />)}
  </g>;
}

/**
 * The talk as a stage: the map fills a pane and unfolds as the speaker opens branches.
 * Nodes keep their identity, so opening a branch slides the others into place.
 */
export function TalkStage({ talk, rootLabel, reveal, selected, focus, onSelect, outlineBelow = 560, label = '汇报导图', frameFocus = false }: { talk: Presentation; rootLabel: string; reveal: Reveal; selected?: string; /** Branch to keep bright while the others dim. */ focus?: number; onSelect: (target: MapTarget) => void; outlineBelow?: number; label?: string; /** Frame the focused branch instead of everything drawn; the rest stays at the edges, dimmed. */ frameFocus?: boolean }) {
  const { frame, pane } = useFrame();
  const family = useMemo(() => getComputedStyle(document.body).fontFamily, []);
  const split = useMemo(() => balancedSplit(talk, rootLabel, family), [talk, rootLabel, family]);
  // Wide panes use both sides of the root; tall or narrow ones read top to bottom.
  const twoSided = pane.w >= pane.h * 1.2;
  const map = layoutTalk(talk, rootLabel, family, twoSided ? split : talk.parts.length, reveal);
  if (pane.w && pane.w < outlineBelow) return <div ref={frame} className="talk-stage-map is-outline"><Outline talk={talk} current={selected} onSelect={onSelect} /></div>;
  const pad = 36, target = frameFocus && focus !== undefined ? boxOf(map.nodes.filter(node => node.part === focus)) : map.bounds;
  const scale = pane.w ? Math.min(1.6, (pane.w - pad * 2) / target.w, (pane.h - pad * 2) / target.h) : 1;
  const tx = pane.w / 2 - (target.x + target.w / 2) * scale, ty = pane.h / 2 - (target.y + target.h / 2) * scale;
  const current = selected && selected !== 'root' ? map.nodes.find(node => node.kind === 'stop' && node.stop === selected) : undefined;
  const select = (node: MapNode) => onSelect(node.kind === 'root' ? { kind: 'root' } : node.kind === 'part' ? { kind: 'part', part: node.part } : { kind: 'stop', id: node.stop! });
  const keyed = (node: MapNode) => (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node); } };
  const bright = current ? current.part : focus;
  const dim = (node: MapNode) => bright !== undefined && node.kind !== 'root' && node.part !== bright;
  const trail = trailOf(map, current?.stop);
  return <div ref={frame} className="talk-stage-map" style={{ '--map-scale': scale } as CSSProperties}>
    {pane.w > 0 && <svg className="talk-map is-stage" role="group" aria-label={label} width={pane.w} height={pane.h}>
      <g className="map-camera" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
        <g fill="none">{map.edges.map(({ from, to }) => <path key={to.key} pathLength={1} className={`talk-edge edge-${to.kind}${trail.has(to) ? ' is-trail' : ''}${dim(to) ? ' is-dim' : ''}`} data-part={to.part % 6} style={{ d: `path("${edgePath(from, to)}")` } as CSSProperties} />)}</g>
        {map.nodes.map(node => {
          const interactive = node.kind !== 'point';
          const open = node.kind === 'part' ? !node.hidden : node.kind === 'stop' ? reveal.points(node.stop!) : undefined;
          const classes = `${node === current ? ' is-current' : ''}${current && node.kind === 'point' && node.stop === current.stop ? ' is-current-point' : ''}${node.kind === 'root' && selected === 'root' ? ' is-current' : ''}${dim(node) ? ' is-dim' : ''}`;
          const name = node.kind === 'root' ? `${node.label}：论文价值` : node.kind === 'part' ? `${node.label}，${node.hidden ? `${node.hidden} 个讲解点，点开展开` : '点击收起'}` : node.label;
          return <Node key={node.key} node={node} className={classes} interactive={interactive ? { tabIndex: 0, role: 'button', 'aria-label': name, 'aria-expanded': open, 'aria-pressed': node.kind === 'stop' || node.kind === 'root' ? (node === current || (node.kind === 'root' && selected === 'root')) : undefined, onClick: () => select(node), onKeyDown: keyed(node) } : undefined} />;
        })}
      </g>
    </svg>}
  </div>;
}

/** The same structure as an indented tree, for widths where the drawn map would be unreadable. */
export function Outline({ talk, current, onSelect }: { talk: Presentation; current?: string; onSelect?: (target: MapTarget) => void }) {
  return <ol className="talk-outline-tree" aria-label="汇报导图（提纲）">{talk.parts.map((part, at) => <li key={part.id} data-part={at % 6}>
    <p className="outline-part"><strong>{part.title}</strong></p>
    <ol>{part.stops.map(stop => <li key={stop.id}>{onSelect
      ? <button type="button" aria-pressed={current === stop.id} onClick={() => onSelect({ kind: 'stop', id: stop.id })}><span>{stop.label}</span></button>
      : <p className="outline-stop"><span>{stop.label}</span></p>}
      {stop.points?.some(point => point.key) && <p>{stop.points.filter(point => point.key).map(point => point.key).join(' · ')}</p>}</li>)}</ol>
  </li>)}</ol>;
}
