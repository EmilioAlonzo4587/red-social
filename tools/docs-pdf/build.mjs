// Genera dist/documentacion.pdf a partir de docs/*.md.
// 1. Sincroniza las secciones generadas (historias y backlog) desde docs/plan/backlog.json.
// 2. Convierte el Markdown a HTML, dibuja los diagramas Mermaid en Chromium y exporta a PDF.
//
// Uso: pnpm docs:pdf            (sincroniza y genera el PDF)
//      pnpm docs:sync           (solo sincroniza los .md; útil antes de un commit)
// Variable opcional CHROMIUM_PATH para usar un Chromium ya instalado.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { marked } from 'marked';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = join(ROOT, 'docs');
const OUT_DIR = join(ROOT, 'dist');
const soloSync = process.argv.includes('--solo-sync');

const meta = JSON.parse(readFileSync(join(DOCS, 'documento.json'), 'utf8'));
const backlog = JSON.parse(readFileSync(join(DOCS, 'plan', 'backlog.json'), 'utf8'));

const DEV = { dev1: 'Dev 1 · Frontend', dev2: 'Dev 2 · Datos y contenido', dev3: 'Dev 3 · Plataforma y tiempo real', todos: 'Todos' };
const esc = (s) => s.replace(/\|/g, '\\|');

function historiasMd() {
  const filas = backlog.historias.map((h) => `| ${h.id} | ${esc(h.texto)} | ${h.origen} |`);
  return ['| ID | Historia | Origen |', '|---|---|---|', ...filas].join('\n');
}

function backlogMd() {
  const partes = [];
  for (const s of backlog.semanas) {
    const issues = backlog.issues.filter((i) => i.semana === s.id);
    partes.push(`### ${s.titulo} (${s.dias}): ${s.objetivo}`, '');
    partes.push('| Issue | Asignado | Criterios de aceptación |', '|---|---|---|');
    for (const i of issues) {
      const extra = [i.hu.join(', '), i.depende.length ? `depende de ${i.depende.join(', ')}` : ''].filter(Boolean).join(' · ');
      const titulo = `**${i.id}** ${esc(i.titulo)}${extra ? `<br><small>${extra}</small>` : ''}`;
      const criterios = i.criterios.map((c) => `• ${esc(c)}`).join('<br>');
      partes.push(`| ${titulo} | ${DEV[i.dev]} | ${criterios} |`);
    }
    partes.push('');
  }
  return partes.join('\n').trim();
}

function sincronizar(archivo, marca, contenido) {
  const ruta = join(DOCS, archivo);
  const texto = readFileSync(ruta, 'utf8');
  const re = new RegExp(`(<!-- ${marca}:INICIO[^>]*-->)[\\s\\S]*?(<!-- ${marca}:FIN -->)`);
  if (!re.test(texto)) throw new Error(`No encontré las marcas ${marca} en ${archivo}`);
  const nuevo = texto.replace(re, `$1\n\n${contenido}\n\n$2`);
  if (nuevo !== texto) writeFileSync(ruta, nuevo);
}

sincronizar('02-analisis.md', 'HISTORIAS', historiasMd());
sincronizar('08-plan-de-trabajo.md', 'BACKLOG', backlogMd());
console.log('Secciones generadas sincronizadas.');
if (soloSync) process.exit(0);

// ---------- Markdown a HTML ----------
const capitulos = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const renderer = new marked.Renderer();
const codigoBase = renderer.code.bind(renderer);
renderer.code = (token) => {
  if (token.lang === 'mermaid') {
    // Un diagrama que empieza con "%% pagina-horizontal" se imprime solo en una página apaisada.
    const horizontal = /^%%\s*pagina-horizontal/.test(token.text);
    return `<figure class="diagrama${horizontal ? ' horizontal' : ''}"><pre class="mermaid">${token.text.replace(/</g, '&lt;')}</pre></figure>`;
  }
  return codigoBase(token);
};
marked.use({ renderer, gfm: true });

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const indice = [];
let cuerpo = '';
capitulos.forEach((archivo, n) => {
  let html = marked.parse(readFileSync(join(DOCS, archivo), 'utf8'));
  let sub = 0;
  html = html.replace(/<h([12])>(.*?)<\/h\1>/g, (_, nivel, texto) => {
    const id = `${n + 1}-${slug(texto)}`;
    if (nivel === '1') { indice.push({ nivel: 1, num: `${n + 1}`, texto, id }); return `<h1 id="${id}"><span class="num">${n + 1}</span>${texto}</h1>`; }
    sub += 1; indice.push({ nivel: 2, num: `${n + 1}.${sub}`, texto, id });
    return `<h2 id="${id}"><span class="num">${n + 1}.${sub}</span>${texto}</h2>`;
  });
  cuerpo += `<section class="capitulo">${html}</section>\n`;
});

const fecha = new Date().toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' });
const portada = `
<section class="portada">
  <div class="marca">${meta.institucion}</div>
  <h1 class="titulo">${meta.titulo}</h1>
  <p class="subtitulo">${meta.subtitulo}</p>
  <table class="datos">
    ${meta.integrantes.map((i) => `<tr><td>${i.nombre}</td><td>${i.rol}</td></tr>`).join('')}
  </table>
  <table class="datos urls">
    <tr><td>Frontend</td><td>${meta.urls.frontend}</td></tr>
    <tr><td>Backend</td><td>${meta.urls.backend}</td></tr>
    <tr><td>Documentación de la API</td><td>${meta.urls.documentacionApi}</td></tr>
    <tr><td>Repositorio</td><td>${meta.repositorio}</td></tr>
  </table>
  <p class="version">Versión ${meta.version} · ${fecha}</p>
</section>
<section class="indice">
  <h1 class="sin-num">Contenido</h1>
  <ol>${indice.map((e) => `<li class="n${e.nivel}"><a href="#${e.id}"><span>${e.num}</span> ${e.texto}</a></li>`).join('')}</ol>
</section>`;

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'estilo.css'), 'utf8');
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${meta.titulo}</title><style>${css}</style></head><body>${portada}${cuerpo}</body></html>`;
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'documentacion.html'), html);

// ---------- HTML a PDF ----------
const { chromium } = await import('playwright');
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') });
const errores = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'Helvetica, Arial, sans-serif', flowchart: { useMaxWidth: true }, er: { useMaxWidth: true }, sequence: { useMaxWidth: true } });
  const fallos = [];
  for (const el of document.querySelectorAll('pre.mermaid')) {
    try { await mermaid.run({ nodes: [el] }); } catch (e) { fallos.push(e.message.slice(0, 200)); }
  }
  return fallos;
});
if (errores.length) { console.error('Diagramas con errores:\n' + errores.join('\n')); await browser.close(); process.exit(1); }

const pie = `<div style="font-size:8px;width:100%;padding:0 18mm;color:#666;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif"><span>${meta.titulo} · ${meta.subtitulo}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
await page.pdf({
  path: join(OUT_DIR, 'documentacion.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: pie,
  margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
  outline: true,
  tagged: true,
});
await browser.close();
console.log('PDF generado en dist/documentacion.pdf');
