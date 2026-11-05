export const paraSql = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
export const deSql = (texto) => Date.parse(`${texto.replace(' ', 'T')}Z`);
