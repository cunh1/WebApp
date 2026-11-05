import { config } from './config.js';
import { db } from './db/connection.js';
import { migrar } from './db/migrate.js';
import { app } from './app.js';

const novas = migrar(db, config.pastaMigracoes);
if (novas.length) console.log('Migrações aplicadas:', novas.join(', '));

const servidor = app.listen(config.porta, () => {
  console.log(`Servidor rodando em http://localhost:${config.porta}`);
});

function encerrar(sinal) {
  console.log(`${sinal} recebido, encerrando…`);
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
