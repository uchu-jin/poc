// ADR-0001 検証用: flat-miter x（太さ 52、幅 0.8）で D と E の差を、paper.js でも測り直して描く
import fs from 'node:fs';
import paper from 'paper/dist/paper-core.js';
import { buildPolys, variants } from './spike2.mjs';
import { D, E } from './spike5.mjs';
paper.setup(new paper.Size(1, 1));
const polys = buildPolys('x', { weight: 52, width: 0.8, slant: 0, ...variants['flat-miter'] });
const d = D(polys), e = E(polys);
const toPaper = (rings) => { const c = new paper.CompoundPath({ children: rings.map((r) => new paper.Path({ segments: r, closed: true })), insert: false }); c.fillRule = 'nonzero'; return c; };
const pd = toPaper(d), pe = toPaper(e);
console.log('D の点:', JSON.stringify(d.map((r) => r.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]))));
console.log('E の点:', JSON.stringify(e.map((r) => r.map(([x, y]) => [+x.toFixed(1), +y.toFixed(1)]))));
console.log('paper.js で測った面積 D:', Math.abs(pd.area).toFixed(1), ' E:', Math.abs(pe.area).toFixed(1), ' XOR:', Math.abs(pd.exclude(pe, { insert: false }).area).toFixed(1));
const dd = (rings) => rings.map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z').join('');
fs.writeFileSync('out2/x5.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="360"><rect width="100%" height="100%" fill="#fff"/><text x="20" y="20" font-size="13">左=D（clipper2-js）、右=E（clipper-lib）、青=合成前</text><g transform="translate(20,320) scale(0.55,-0.55)"><path d="${dd(d)}" fill="#bbb"/><path d="${dd(polys.flat())}" fill="none" stroke="blue"/></g><g transform="translate(360,320) scale(0.55,-0.55)"><path d="${dd(e)}" fill="#bbb"/><path d="${dd(polys.flat())}" fill="none" stroke="blue"/></g></svg>`);
