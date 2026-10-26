import { runDriveTest } from './dev/DriveTest';
import { runShowroom } from './dev/Showroom';

const app = document.getElementById('app')!;
const view = new URLSearchParams(location.search).get('view');
if (view === 'showroom') runShowroom(app);
else if (view === 'drive') runDriveTest(app);
