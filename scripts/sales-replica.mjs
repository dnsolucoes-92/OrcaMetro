// The sales sample reuses the actual app markup and style, not a redesigned mockup.
// No Auth, database, billing, printing or WhatsApp action is included here.
export function calculatorMarkup(app) {
  const match = app.match(/<main id="view-orcamento"[\s\S]*?<\/main>/);
  if (!match) throw new Error('Tela de orçamento não encontrada no aplicativo');
  return match[0];
}

export const replicaScript = `
function parseNumeroAmostra(value) {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let text = String(value).trim();
  if (text.includes(',')) {
    if (text.includes('.') && !/^[+-]?\\d{1,3}(\\.\\d{3})+(,\\d+)?$/.test(text)) return NaN;
    text = text.replace(/\\./g, '').replace(',', '.');
  }
  return /^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)$/.test(text) ? Number(text) : NaN;
}
function calcularAmostra(values) {
  const parsed = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,parseNumeroAmostra(value)]));
  const required = ['largura','altura','custoM2','distancia','valorKm','taxaBase','fatorPct','margemPct'];
  const invalid = required.filter(key => !Number.isFinite(parsed[key]) || parsed[key] < 0 || (['largura','altura','custoM2'].includes(key) && parsed[key] === 0));
  if (invalid.length) return {error:'Confira os valores: material e medidas devem ser maiores que zero; os demais valores não podem ser negativos.',invalid};
  const area = parsed.largura * parsed.altura;
  const material = area * parsed.custoM2;
  const frete = parsed.distancia * parsed.valorKm;
  const instalacao = parsed.taxaBase * (1 + parsed.fatorPct / 100);
  const custos = material + frete + instalacao;
  const lucro = custos * parsed.margemPct / 100;
  const total = custos + lucro;
  if (![area,material,frete,instalacao,custos,lucro,total].every(Number.isFinite)) return {error:'Os valores são muito grandes. Confira as medidas e os custos.',invalid:required};
  return {area,material,frete,instalacao,custos,lucro,total,...parsed};
}
const replicaNode = id => document.getElementById(id);
const replicaMode = document.body.dataset.replicaMode;
let tipoFatorAtual = 'facil';
const fatores = {facil:0,medio:40,dificil:80};
const money = value => 'R$ ' + value.toFixed(2).replace('.', ',');
function apresentarResultado(result) {
  replicaNode('resultado-valor').innerText = money(result.total);
  replicaNode('resultado-area').innerText = result.area.toFixed(2).replace('.', ',') + 'm²';
  replicaNode('resultado-frete').innerText = money(result.frete);
  replicaNode('resultado-lucro').innerText = money(result.lucro) + ' (' + result.margemPct + '%)';
}
function setFatorTipo(tipo) {
  tipoFatorAtual = tipo;
  ['facil','medio','dificil'].forEach(b => {
    const el = replicaNode('btn-fator-' + b);
    el.setAttribute('aria-pressed',String(b === tipo));
    el.className = b === tipo
      ? 'fator-btn py-3.5 px-2 rounded-2xl border border-accentYellow bg-accentYellow text-darkBg font-bold transition-all flex flex-col items-center'
      : 'fator-btn py-3.5 px-2 rounded-2xl border border-gray-800 bg-black/30 text-gray-400 font-bold transition-all flex flex-col items-center hover:border-gray-700';
  });
}
function atualizarAmostra() {
  const distancia = replicaNode('medida-distancia').value.trim() || '0';
  const result = calcularAmostra({largura:replicaNode('medida-largura').value,altura:replicaNode('medida-altura').value,
    custoM2:replicaNode('servico-material').value,distancia,valorKm:1.50,taxaBase:25,fatorPct:fatores[tipoFatorAtual],margemPct:100});
  if (result.error) {alert(result.error);return result;}
  apresentarResultado(result);
  replicaNode('replica-note').innerText = 'Resultado da demonstração — não foi salvo. No aplicativo, o orçamento é salvo no histórico antes da confirmação.';
  return result;
}
function acessoCompleto() {
  alert('Este botão faz parte do aplicativo real. Nesta demonstração não há envio, PDF nem orçamento salvo. Use Quero o acesso completo na página para criar sua conta.');
}
function informarAltura() {
  parent.postMessage({type:'orcametro-replica-height',height:Math.ceil(document.body.getBoundingClientRect().height)},'*');
}
if (replicaMode === 'calculator') {
  replicaNode('servico-material').innerHTML = '<option value="45" data-nome="Vinil adesivo">Vinil adesivo · R$ 45,00/m²</option>';
  replicaNode('medida-largura').value = '4,00';
  replicaNode('medida-altura').value = '1,20';
  replicaNode('medida-distancia').value = '24';
  ['cliente-nome','cliente-whatsapp','medida-largura','medida-altura','medida-distancia'].forEach(id => replicaNode(id).setAttribute('maxlength','128'));
  document.querySelectorAll('[data-action]').forEach(button => {
    const action = button.dataset.action;
    if (action === 'setFatorTipo') button.addEventListener('click',() => setFatorTipo(button.dataset.tipo));
    if (action === 'calcularOrcamento') button.addEventListener('click',atualizarAmostra);
    if (action === 'enviarWhatsApp' || action === 'gerarPDFOrcamento') button.addEventListener('click',acessoCompleto);
  });
  setFatorTipo('facil');
} else {
  apresentarResultado(calcularAmostra({largura:4,altura:1.2,custoM2:45,distancia:24,valorKm:1.5,taxaBase:25,fatorPct:0,margemPct:100}));
  document.querySelectorAll('button').forEach(button => button.addEventListener('click',acessoCompleto));
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(informarAltura).observe(document.body);
window.addEventListener('load',informarAltura);
`;

export function createReplica(app, mode = 'calculator') {
  if (!['calculator','result'].includes(mode)) throw new Error('Modo de amostra inválido');
  let head = app.match(/<head>([\s\S]*?)<\/head>/)?.[1];
  if (!head) throw new Error('Estilos do aplicativo não encontrados');
  head = head.replace(/\s*<script src="[^"]*supabase[^"]*"><\/script>/g,'')
    .replace(/<title>[\s\S]*?<\/title>/,'<title>Demonstração da tela real do OrçaMetro V3.5.3</title>')
    .replace(/\s*<link rel="canonical"[^>]+>/,'')
    .replace(/\s*<meta name="description"[^>]+>/,'');
  const main = calculatorMarkup(app);
  const result = main.slice(main.indexOf('<section class="glass-card p-6'),main.lastIndexOf('</main>')).trim();
  const markup = mode === 'calculator' ? main : '<main class="max-w-md mx-auto px-5 mt-6 space-y-5">' + result + '</main>';
  return '<!DOCTYPE html><html lang="pt-BR"><head>' + head
    + '<meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'; base-uri \'none\'">'
    + '<style>html,body{margin:0}body{padding-bottom:24px}#replica-note{max-width:448px;margin:16px auto 0;padding:0 20px;font-size:11px;color:#9ca3af;line-height:1.6}</style></head>'
    + '<body class="font-sans antialiased" data-replica-mode="' + mode + '">' + markup
    + '<p id="replica-note" role="status" aria-live="polite">' + (mode === 'calculator' ? 'Demonstração: cálculo local, sem cadastro e sem gravação.' : 'Exemplo ilustrativo do resultado real. Os botões de envio exigem a conta no aplicativo.') + '</p>'
    + '<script id="replica-script">' + replicaScript + '</script></body></html>';
}

export function encodeReplicaAttribute(value) {
  return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'&#10;');
}

export function replicaFrame(app, mode) {
  const id = mode === 'calculator' ? 'demo-frame' : 'hero-replica-frame';
  const title = mode === 'calculator' ? 'Experimente a tela real de cálculo do OrçaMetro' : 'Exemplo do cartão de resultado real do OrçaMetro';
  return '<iframe id="' + id + '" class="replica-frame replica-' + mode + '" title="' + title + '" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" srcdoc="' + encodeReplicaAttribute(createReplica(app,mode)) + '"></iframe>';
}
