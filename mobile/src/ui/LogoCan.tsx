import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

// The Cospray can (assets/icon.png) as pixel art: one Skia path per palette colour, crisp at any cell size.
const SPRITE = [
  '.........................GG.',
  '.........................GG.',
  '.......................GG...',
  '.......................GG...',
  '.......................GG...',
  '.....................GGGGGG.',
  '.....................GGGGGG.',
  '...................GGGGGG...',
  '..........####.....GGGGGG...',
  '.........#lWWl#.GGGGGGGGGGG.',
  '.........##lW##.GGGGGGGGGGG.',
  '.........#h##h#....GGGGGG...',
  '.........#hlWh#...dGGGGGG...',
  '.......l###hh###...d.GGGGGGG',
  '.....pppp##dd..dppp.dGGGGGG.',
  '.....##.Wdd##ppW###ddGGGGGG.',
  '....#llhddd##ppdWWW#d..GG...',
  '...#lpppl......WWWWW#d.GG...',
  '..#lhdpppWWWWWWlWWWWW#...GG.',
  '.#hpddddppphhhllWWWWlW...GG.',
  '.#hpddddpppphhhllllllW......',
  '#dhpdddddppphhhhlllllW......',
  '#l#hdddddpppphhhhlllW#......',
  '#lp##hhhhlllWWWWWWW##h......',
  'h.p..#..#..........ddh......',
  '.#pd.##############pph#.....',
  '.##d.dppllWlWWWWWllpp##.....',
  '.#h##dppllWlWWWWWWl##h#.....',
  '.#lpd##############pph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWllhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.d##########hhpph#.....',
  '.#lpd.##gGWGGWWW##hpph#.....',
  '.#lpd##ggGWGGWWWG##pph#.....',
  '.#lpd#ggg#####WWGG#pph#.....',
  '.#lpd#ggg#Whh##WGG#pph#.....',
  '.#lpd#ggg#WhhW##GG#pph#.....',
  '.#lpd#ggg#WhhWW####pph#.....',
  '.#lpd#ggg#WhhWWWlhhpph#.....',
  '.#lpd#ggg#WhhWWWlhhpph#.....',
  '.#lpd#ggg#WhhWW####pph#.....',
  '.#lpd#ggg#WhhW##GG#pph#.....',
  '.#lpd#ggg#Whh##WGG#pph#.....',
  '.#lpd#ggg#####WWGG#pph#.....',
  '.#lpd##ggGWGGWWWG##pph#.....',
  '.#lpd.##gGWGGWWW##hpph#.....',
  '.#lpd.d##########hhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '.#lpd.ddphWhhWWWlhhpph#.....',
  '#p#pddddphWhhWWWlhhpp#p#....',
  '#pd#ddddphWhhWWWlhhp#pp#....',
  '#pd#ddddphWhhWWWlhhp#hp#....',
  '#pd..#..phWhhWWWld#ddhp#....',
  '.#d...dd########dphhdh#.....',
  '..#...ddhlWllWWWlhhhd#......',
  '....#.ddhlWllWWWlpd###.#....',
  '....#.###########d#####.#...',
];
const PALETTE: Record<string, string> = {
  '#': '#120a33', d: '#3a2580', p: '#5b3fb0', h: '#8e6fe8', l: '#b49bff', W: '#efe8ff', G: '#a9f25c', g: '#78be3c', k: '#285a1e',
};
export const LOGO_CAN_W = 28, LOGO_CAN_H = 62;

/** `puff` false draws just the can (the green spray cloud is left out). */
export function LogoCan({ cell = 2, puff = true }: { cell?: number; puff?: boolean }) {
  const paths = useMemo(() => {
    const m = new Map<string, ReturnType<typeof Skia.Path.Make>>();
    SPRITE.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '.' || (!puff && c === 'G' && y < 24)) continue;
        let p = m.get(c); if (!p) { p = Skia.Path.Make(); m.set(c, p); }
        p.addRect(Skia.XYWHRect(x * cell, y * cell, cell, cell));
      }
    });
    return [...m.entries()];
  }, [cell, puff]);
  return (
    <Canvas style={{ width: LOGO_CAN_W * cell, height: LOGO_CAN_H * cell }} pointerEvents="none">
      {paths.map(([c, p]) => <Path key={c} path={p} color={PALETTE[c]} antiAlias={false} />)}
    </Canvas>
  );
}
