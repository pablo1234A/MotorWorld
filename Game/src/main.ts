import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './ui/styles.css';

const app = document.getElementById('app')!;
const view = new URLSearchParams(location.search).get('view');

async function main() {
  if (view === 'showroom') (await import('./dev/Showroom')).runShowroom(app);
  else if (view === 'drive') (await import('./dev/DriveTest')).runDriveTest(app);
  else {
    const { Game } = await import('./game/Game');
    const game = new Game();
    await game.boot(app);
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:' && !view) navigator.serviceWorker.register('./sw.js').catch(() => {});

main().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;color:#fff;background:#200;padding:20px;white-space:pre-wrap;z-index:99">${String(e?.stack ?? e)}</pre>`);
});
