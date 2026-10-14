// Crea en GitHub las etiquetas, los milestones y las issues de docs/plan/backlog.json.
// Requiere la CLI de GitHub autenticada (gh auth login) y ejecutarse dentro del repo clonado.
//
// Uso:
//   node scripts/crear_issues.mjs --dry-run      muestra lo que haría, sin crear nada
//   node scripts/crear_issues.mjs                crea todo
//   PROJECT_OWNER=<usuario-u-org> PROJECT_NUMBER=<n> node scripts/crear_issues.mjs
//                                                además agrega cada issue al tablero de GitHub Projects
//                                                (requiere: gh auth refresh -s project)
//
// Ejecutar una sola vez: si ya existe una issue con el mismo título, el script la omite.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { semanas, issues } = JSON.parse(readFileSync(join(ROOT, 'docs', 'plan', 'backlog.json'), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const { PROJECT_OWNER, PROJECT_NUMBER } = process.env;

const DEV = { dev1: 'Dev 1 · Frontend', dev2: 'Dev 2 · Datos y contenido', dev3: 'Dev 3 · Plataforma y tiempo real', todos: 'Todos' };
const COLOR = { dev1: '1d76db', dev2: '0e8a16', dev3: 'd93f0b', todos: '5319e7' };
const DOD = [
  'PR aprobado con CI en verde y desplegado en producción',
  'Endpoints nuevos documentados en Swagger con sus errores',
  'Prueba del caso feliz y del caso prohibido cuando aplica',
  'Variables nuevas en .env.example',
];

function gh(args, { permitirFallo = false } = {}) {
  if (dryRun) { console.log('  gh ' + args.map((a) => (a.includes(' ') || a.includes('\n') ? JSON.stringify(a.length > 60 ? a.slice(0, 60) + '…' : a) : a)).join(' ')); return ''; }
  try { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) { if (permitirFallo) return ''; throw new Error(`Falló: gh ${args.slice(0, 3).join(' ')}…\n${e.stderr || e.message}`); }
}

const tituloMilestone = (s) => `${s.titulo} (${s.dias})`;
const tituloIssue = (i) => `[${i.id}] ${i.titulo}`;

const repo = dryRun ? '<owner>/<repo>' : gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
console.log(`Repositorio: ${repo}${dryRun ? ' (simulación)' : ''}`);

console.log('Etiquetas');
for (const [nombre, color] of Object.entries(COLOR)) gh(['label', 'create', nombre, '--color', color, '--description', DEV[nombre], '--force']);
for (const area of [...new Set(issues.map((i) => i.area))]) gh(['label', 'create', area, '--color', 'c5def5', '--force']);

console.log('Milestones');
for (const s of semanas) gh(['api', `repos/${repo}/milestones`, '-f', `title=${tituloMilestone(s)}`, '-f', `description=${s.objetivo}`], { permitirFallo: true });

const existentes = new Map();
if (!dryRun) {
  const lista = JSON.parse(gh(['issue', 'list', '--state', 'all', '--limit', '500', '--json', 'number,title']) || '[]');
  for (const it of lista) existentes.set(it.title, it.number);
}

console.log('Issues');
const numero = new Map(); // id del backlog -> número de issue en GitHub
for (const i of issues) {
  const semana = semanas.find((s) => s.id === i.semana);
  if (existentes.has(tituloIssue(i))) { numero.set(i.id, existentes.get(tituloIssue(i))); console.log(`  omitida (ya existe): ${tituloIssue(i)}`); continue; }
  const deps = i.depende.map((d) => (numero.has(d) ? `#${numero.get(d)} (${d})` : d));
  const cuerpo = [
    `**Asignado:** ${DEV[i.dev]}`,
    i.hu.length ? `**Historias:** ${i.hu.join(', ')}` : '',
    deps.length ? `**Depende de:** ${deps.join(', ')}` : '',
    '', '### Criterios de aceptación', ...i.criterios.map((c) => `- [ ] ${c}`),
    '', '### Definición de terminado', ...DOD.map((c) => `- [ ] ${c}`),
  ].filter((l, k, arr) => l !== '' || arr[k - 1] !== '').join('\n');
  const url = gh(['issue', 'create', '--title', tituloIssue(i), '--body', cuerpo, '--label', `${i.dev},${i.area}`, '--milestone', tituloMilestone(semana)]);
  const n = Number((url.match(/\/issues\/(\d+)/) || [])[1]);
  if (n) numero.set(i.id, n);
  if (PROJECT_OWNER && PROJECT_NUMBER) gh(['project', 'item-add', PROJECT_NUMBER, '--owner', PROJECT_OWNER, '--url', url || '<url>']);
  if (!dryRun) console.log(`  #${n} ${tituloIssue(i)}`);
}
console.log(dryRun ? `Simulación terminada: ${issues.length} issues.` : 'Listo.');
