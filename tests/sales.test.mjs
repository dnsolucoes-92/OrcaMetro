import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../vendas.html', import.meta.url), 'utf8');
const script = html.match(/<script id="demo-script">([\s\S]*?)<\/script>/)[1];
const app = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const defaults = { largura:'4,00', altura:'1,20', custoM2:'45,00', distancia:'24', valorKm:'1,50', taxaBase:'25,00', fatorPct:'40', margemPct:'100' };

function harness() {
  const nodes = new Map();
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const attributes = {}, listeners = {};
    nodes.set(match[1], { value:'', textContent:'', hidden:true, disabled:true,
      setAttribute:(key,value)=>{attributes[key]=value;}, attributes,
      addEventListener:(key,callback)=>{listeners[key]=callback;}, listeners });
  }
  const ids = { largura:'demo-width', altura:'demo-height', custoM2:'demo-material', distancia:'demo-distance', valorKm:'demo-km', taxaBase:'demo-base', fatorPct:'demo-difficulty', margemPct:'demo-profit' };
  const reset = () => Object.entries(ids).forEach(([key,id])=>{nodes.get(id).value=defaults[key];});
  reset(); nodes.get('demo-form').reset=reset;
  const context=vm.createContext({document:{getElementById:id=>{assert.ok(nodes.has(id),'Missing DOM ID: '+id);return nodes.get(id);}},Intl});
  vm.runInContext(script,context);
  return {nodes,run:source=>vm.runInContext(source,context),calculate:values=>vm.runInContext('calcularAmostra('+JSON.stringify({...defaults,...values})+')',context)};
}

test('sales routes are identical; scripts parse and labels/anchors resolve',()=>{
  assert.equal(html,readFileSync(new URL('../vendas/index.html',import.meta.url),'utf8'));
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const match of html.matchAll(/\bfor="([^"]+)"/g))for(const id of match[1].split(' '))assert.ok(ids.includes(id),id);
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(match[1]),match[1]);
  assert.ok(!/orca-metro\.vercel\.app|chatgpt\.site/.test(html));
});

test('default sample and static hero accurately show R$574 and R$287 profit',()=>{
  const h=harness(),r=h.calculate({});
  assert.equal(r.total,574);assert.equal(r.lucro,287);assert.equal(r.instalacao,35);assert.equal(r.area,4.8);
  assert.match(h.nodes.get('demo-total').textContent,/574,00/);
  assert.match(html,/R\$ 574,00/);assert.match(html,/R\$ 287,00/);
});

test('sample matches the actual app formula for varied dimensions and factors',()=>{
  const formula=app.match(/const area = largura \* altura;([\s\S]*?)const total = custoTotal \+ lucro;/)[0];
  for(const values of [{},{largura:'1,5',altura:'1',distancia:'0',fatorPct:'0'},{largura:'2,3',altura:'4,5',taxaBase:'35',margemPct:'70',fatorPct:'80'},{valorKm:'0',taxaBase:'0',margemPct:'0'}]){
    const r=harness().calculate(values);
    const live=vm.runInNewContext(formula+';({area,custoMaterial,frete,instalacao,lucro,total});',{
      largura:r.largura,altura:r.altura,custoM2:r.custoM2,distancia:r.distancia,valorKm:r.valorKm,taxaBase:r.taxaBase,fatorPct:r.fatorPct,margemPct:r.margemPct});
    assert.equal(r.area,live.area);assert.equal(r.material,live.custoMaterial);assert.equal(r.frete,live.frete);assert.equal(r.instalacao,live.instalacao);assert.equal(r.lucro,live.lucro);assert.equal(r.total,live.total);
  }
});

test('Brazilian decimals and zero settings work; malformed, missing, negative and overflowing inputs fail',()=>{
  const h=harness();assert.equal(h.run('parseNumeroAmostra("1.234,50")'),1234.5);
  assert.equal(h.calculate({margemPct:'0',valorKm:'0',taxaBase:'0'}).total,216);
  for(const values of [{largura:'0'},{altura:'-1'},{custoM2:'0'},{distancia:'-1'},{margemPct:''},{valorKm:'10abc'},{largura:'1.2,3'},{largura:'9'.repeat(310),altura:'9'.repeat(310)}])assert.ok(h.calculate(values).error,JSON.stringify(values));
});

test('invalid live edit clears stale result; reset restores default and submit prevents navigation',()=>{
  const h=harness();h.nodes.get('demo-width').value='';h.nodes.get('demo-width').listeners.input();
  assert.equal(h.nodes.get('demo-output').hidden,true);assert.equal(h.nodes.get('demo-total').textContent,'');
  assert.equal(h.nodes.get('demo-width').attributes['aria-invalid'],'true');
  h.nodes.get('demo-reset').listeners.click();assert.equal(h.nodes.get('demo-output').hidden,false);
  assert.match(h.nodes.get('demo-total').textContent,/574,00/);assert.equal(h.nodes.get('demo-width').attributes['aria-invalid'],'false');
  let prevented=false;h.nodes.get('demo-form').listeners.submit({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  assert.equal(h.nodes.get('demo-calculate').disabled,false);
});

test('sample never calls Auth, payment or storage and page separates demo from full free trial',()=>{
  assert.equal(/fetch\(|XMLHttpRequest|supabase|\.rpc\(|localStorage|sessionStorage|sendBeacon|window\.location/.test(script),false);
  for(const text of ['sem consumir os 3 orçamentos','não são enviados ao banco','Minha conta e assinatura','dias restantes','Cancelar renovação','aguarde a confirmação','JSON','senha atual','boletos e comprovantes'])assert.ok(html.toLowerCase().includes(text.toLowerCase()),text);
  assert.match(html,/cobrança anual de R\$ 297,00, não mensal de R\$ 24,75/i);
});
