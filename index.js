import app from './server/src/app.js';
import { db } from './server/src/db/connection.js';
import { migrar } from './server/src/db/migrate.js';
import { config } from './server/src/config.js';

// Vercel's Express framework entrypoint. Local development still starts src/server.js.
const novas = migrar(db, config.pastaMigracoes);
if (novas.length) console.log('Migrações aplicadas:', novas.join(', '));

export default app;
