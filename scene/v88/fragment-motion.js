// Shared scroll-seekable burst: fragments tumble radially, like the hero brain.
export const clamp = x => Math.max(0, Math.min(1, x));
export function easeBetween(x, a=0, b=1) {
  const t=clamp((x-a)/(b-a));
  return clamp(t*t*t*(t*(t*6-15)+10));
}
export function fragmentState(f, exit, delay=0) {
  const joined=easeBetween(f,delay,.98);
  const released=easeBetween(exit,0,.96);
  const scatter=1-joined+released;
  const size=easeBetween(f,delay,delay+.12)*(1-easeBetween(exit,.72,1));
  return {joined,released,scatter,size,visible:size>.001};
}
export function laptopTimeline(w,exit,overview=false) {
  // The brain finishes dissolving at .22. Never put solid laptop geometry inside it.
  const f=clamp((w-.22)/.44), departure=overview?0:exit;
  // Finish the closed enclosure and reveal its badge at .66, then hold it
  // closed for a clear logo beat before the hinge moves. The screen boots last.
  return {f,departure,open:easeBetween(w,.76,.90),hingeLift:0,
    screen:clamp((w-.90)/.06)*(1-easeBetween(departure,0,.045))};
}

export function phoneTimeline(u,exit,overview=false) {
  const leaving=overview?0:clamp(exit);
  // Finish the burgundy back and cameras, hold the finished phone, then turn.
  const f=clamp((u-.24)/.36);
  const turn=easeBetween(u,.72,.88);
  // Power down completely before any geometry separates.
  const departure=clamp((leaving-.12)/.88);
  const screen=clamp((u-.90)/.07)*(1-easeBetween(leaving,0,.08));
  return {f,turn,departure,screen,detail:f===1&&departure===0};
}
