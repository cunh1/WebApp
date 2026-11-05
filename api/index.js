import { app } from '../server/src/app.js';
import { db } from '../server/src/db/connection.js';
import { migrar } from '../server/src/db/migrate.js';
import { config } from '../server/src/config.js';

// A Vercel Function accepts an Express app directly; do not call app.listen().
const novas = migrar(db, config.pastaMigracoes);
if (novas.length) console.log('Migrações aplicadas:', novas.join(', '));

export default app;
