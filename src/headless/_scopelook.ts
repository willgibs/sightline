import { openGame } from './browser';
const out = '/Users/gibby/local/ai/sightline/.claude/worktrees/lab-b-shooting-efdb68/shots';
const game = await openGame({ query: 'scene=shooting-range', width: 1280, height: 720 });
try {
  await game.run('sightline.play()');
  await game.page.waitForTimeout(1500);
  await game.page.screenshot({ path: `${out}/range-1-firing-point.png` });
  // Look at the 300 m line, a little left (the walker starts at x=-40).
  await game.run('sightline.look(-3, 0.4)');
  await game.run(`sightline.hold(['KeyF'])`);
  await game.page.waitForTimeout(2500);
  await game.run('sightline.click()');
  await game.page.waitForTimeout(2500);
  await game.page.screenshot({ path: `${out}/range-2-binoculars.png` });
  await game.run(`sightline.hold([])`);
  await game.run('sightline.zoom(true)');
  await game.page.waitForTimeout(3000);
  await game.page.screenshot({ path: `${out}/range-3-scope.png` });
  await game.run('sightline.click()');
  await game.page.waitForTimeout(600);
  await game.page.screenshot({ path: `${out}/range-4-after-shot.png` });
  await game.page.waitForTimeout(1500);
  await game.page.screenshot({ path: `${out}/range-5-later.png` });
  console.log(JSON.stringify({ state: await game.run('sightline.state().tick'), errors: game.errors }));
} finally {
  await game.close();
}
process.exit();
