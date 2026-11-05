import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Aplica, em ordem, as migrações .sql ainda não rodadas neste banco. Cada uma roda em
 *  transação própria: ou aplica inteira, ou nada. Migrações já aplicadas nunca são reeditadas. */
export function migrar(db, pasta) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migracoes (
      nome        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      aplicada_em TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const aplicadas = new Map(
    db.prepare('SELECT nome, checksum FROM _migracoes').all().map((m) => [m.nome, m.checksum]),
  );

  const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith('.sql')).sort();
  const novas = [];

  for (const arquivo of arquivos) {
    const sql = fs.readFileSync(path.join(pasta, arquivo), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

    if (aplicadas.has(arquivo)) {
      if (aplicadas.get(arquivo) !== checksum) {
        throw new Error(`A migração ${arquivo} já foi aplicada e depois foi alterada. Crie uma nova em vez de editar.`);
      }
      continue;
    }

    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migracoes (nome, checksum) VALUES (?, ?)').run(arquivo, checksum);
      db.exec('COMMIT');
    } catch (erro) {
      db.exec('ROLLBACK');
      throw new Error(`Falha na migração ${arquivo}: ${erro.message}`);
    }
    novas.push(arquivo);
  }

  return novas;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db } = await import('./connection.js');
  const { config } = await import('../config.js');
  const novas = migrar(db, config.pastaMigracoes);
  console.log(novas.length ? `Aplicadas: ${novas.join(', ')}` : 'Banco já está atualizado.');
  db.close();
}
