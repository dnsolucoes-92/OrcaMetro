import { mkdir, copyFile, access, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const files = ['index.html', 'termos.html', 'privacidade.html', 'redefinir-senha.html', 'vendas.html', 'vendas/index.html', '_headers'];
for (const file of files) await access(resolve(root, file));
await mkdir(output, { recursive: true });
for (const file of files) {
  await mkdir(dirname(resolve(output, file)), { recursive: true });
  await copyFile(resolve(root, file), resolve(output, file));
}
async function list(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await list(resolve(dir, entry.name), path + '/'));
    else result.push(path);
  }
  return result;
}
const unexpected = (await list(output)).filter(file => !files.includes(file));
if (unexpected.length) throw new Error('Arquivos inesperados no pacote público: ' + unexpected.join(', '));
console.log('Pacote público validado: ' + files.length + ' arquivos em dist.');
