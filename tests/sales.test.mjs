import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {calculatorMarkup,createReplica,replicaFrame,replicaScript} from '../scripts/sales-replica.mjs';
const html=readFileSync(new URL('../vendas.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const defaults={largura:'4,00',altura:'1,20',custoM2:'45',distancia:'24',valorKm:'1,50',taxaBase:'25',fatorPct:'0',margemPct:'100'};
const decode=value=>value.replace(/&#10;/g,'\n').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function harness(mode='calculator'){
  const replica=createReplica(app,mode),nodes=new Map(),actions=[],alerts=[],messages=[];
  for(const m of replica.matchAll(/\bid="([^"]+)"/g)){
    const attributes={},listeners={};nodes.set(m[1],{value:'',innerText:'',innerHTML:'',className:'',dataset:{},listeners,attributes,
      setAttribute:(k,v)=>{attributes[k]=v;},addEventListener:(k,f)=>{listeners[k]=f;}});
  }
  for(const m of replica.matchAll(/<(button|select)\b([^>]*)>/g)){
    const id=m[2].match(/id="([^"]+)"/)?.[1],node=nodes.get(id)??{listeners:{},dataset:{},addEventListener(k,f){this.listeners[k]=f;}};
    node.dataset={action:m[2].match(/data-action="([^"]+)"/)?.[1],tipo:m[2].match(/data-tipo="([^"]+)"/)?.[1]};
    if(m[1]==='button'||node.dataset.action)actions.push(node);
  }
  if(nodes.has('servico-material'))nodes.get('servico-material').value='45';
  for(const [id,text] of Object.entries({'resultado-valor':'R$ 0,00','resultado-area':'0,00m²','resultado-frete':'R$ 0,00','resultado-lucro':'R$ 0,00 (0%)'}))nodes.get(id).innerText=text;
  const context=vm.createContext({document:{body:{dataset:{replicaMode:mode},getBoundingClientRect:()=>({height:1234})},
    getElementById:id=>{assert.ok(nodes.has(id),'Missing ID '+id);return nodes.get(id);},querySelectorAll:selector=>actions.filter(n=>selector==='button'||n.dataset.action)},
    window:{addEventListener(){}},parent:{postMessage:data=>messages.push(data)},alert:message=>alerts.push(message)});
  vm.runInContext(replicaScript,context);
  return{nodes,actions,alerts,messages,run:code=>vm.runInContext(code,context),calculate:values=>vm.runInContext('calcularAmostra('+JSON.stringify({...defaults,...values})+')',context)};
}
test('sales copies agree; scripts, IDs and anchors resolve',()=>{
  assert.equal(html,readFileSync(new URL('../vendas/index.html',import.meta.url),'utf8'));
  for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const m of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(m[1]));
  assert.ok(!/orca-metro\.vercel\.app|chatgpt\.site/.test(html));
});
test('replica contains the exact actual calculator markup, classes, labels and buttons',()=>{
  const embedded=decode(html.match(/id="demo-frame"[^>]*srcdoc="([^"]+)"/)[1]);
  assert.equal(embedded,createReplica(app));assert.equal(calculatorMarkup(embedded),calculatorMarkup(app));
  for(const mode of ['calculator','result'])assert.ok(html.includes(replicaFrame(app,mode)));
  for(const text of ['Nome do Cliente (Opcional)','WhatsApp do Cliente (Opcional)','Tipo de Adesivo / Serviço','Dimensões e Logística','Largura (Metros)','Altura (Metros)','Grau de Instalação','Calcular Orçamento Justo','Valor Total ao Cliente','Área Realizada:','Adicional Frete/Rodagem:','Lucro Líquido Previsto:','Compartilhar no WhatsApp','Baixar Proposta em PDF'])assert.ok(embedded.includes(text),text);
  assert.ok(!/demo-breakdown|id="demo-profit"|id="demo-base"|id="demo-km"|Custos somados/.test(embedded));
});
test('replica preserves app fonts, Tailwind configuration and styles, safely isolated',()=>{
  const replica=createReplica(app);
  assert.ok(replica.includes(app.match(/<script>\s*tailwind.config[\s\S]*?<\/script>/)[0]));
  assert.ok(replica.includes(app.match(/<style>[\s\S]*?<\/style>/)[0]));
  for(const url of ['https://cdn.tailwindcss.com/3.4.17','https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css','Outfit:wght@400;600;700;800'])assert.ok(replica.includes(url));
  for(const m of html.matchAll(/<iframe\b[^>]+>/g)){assert.match(m[0],/sandbox="allow-scripts"/);assert.match(m[0],/referrerpolicy="no-referrer"/);assert.ok(!/allow-same-origin|allow-forms|allow-top-navigation|allow-downloads/.test(m[0]));}
  assert.match(replica,/connect-src 'none'; form-action 'none'/);
});
test('result starts at zero, computes on click and preserves exact real app formatting',()=>{
  const h=harness();assert.equal(h.nodes.get('resultado-valor').innerText,'R$ 0,00');
  h.nodes.get('medida-largura').value='2';assert.equal(h.nodes.get('resultado-valor').innerText,'R$ 0,00');
  h.actions.find(n=>n.dataset.action==='calcularOrcamento').listeners.click();
  assert.equal(h.nodes.get('resultado-valor').innerText,'R$ 338,00');assert.equal(h.nodes.get('resultado-area').innerText,'2,40m²');
  assert.equal(h.nodes.get('resultado-frete').innerText,'R$ 36,00');assert.equal(h.nodes.get('resultado-lucro').innerText,'R$ 169,00 (100%)');
  assert.match(h.nodes.get('replica-note').innerText,/não foi salvo/);
});
test('difficulty buttons reproduce actual selection styling and values',()=>{
  const h=harness();
  for(const [tipo,total,gain] of [['facil',554,277],['medio',574,287],['dificil',594,297]]){
    h.nodes.get('btn-fator-'+tipo).listeners.click();h.run('atualizarAmostra()');
    assert.equal(h.nodes.get('resultado-valor').innerText,'R$ '+total+',00');assert.equal(h.nodes.get('resultado-lucro').innerText,'R$ '+gain+',00 (100%)');
    for(const t of ['facil','medio','dificil'])assert.equal(h.nodes.get('btn-fator-'+t).attributes['aria-pressed'],String(t===tipo));
    assert.match(h.nodes.get('btn-fator-'+tipo).className,/bg-accentYellow text-darkBg/);
  }
});
test('sample formula matches actual app for varied inputs and permitted zeros',()=>{
  const formula=app.match(/const area = largura \* altura;([\s\S]*?)const total = custoTotal \+ lucro;/)[0],h=harness();
  for(const values of [{},{largura:'1,5',altura:'1',distancia:'0'},{largura:'2,3',altura:'4,5',taxaBase:'35',margemPct:'70',fatorPct:'80'},{valorKm:'0',taxaBase:'0',margemPct:'0'}]){
    const r=h.calculate(values),real=vm.runInNewContext(formula+';({area,custoMaterial,frete,instalacao,lucro,total});',{
      largura:r.largura,altura:r.altura,custoM2:r.custoM2,distancia:r.distancia,valorKm:r.valorKm,taxaBase:r.taxaBase,fatorPct:r.fatorPct,margemPct:r.margemPct});
    for(const [k,v] of Object.entries({area:'area',material:'custoMaterial',frete:'frete',instalacao:'instalacao',lucro:'lucro',total:'total'}))assert.equal(r[k],real[v]);
  }
});
test('Brazilian input, blank trip and invalid values follow a non-saving flow',()=>{
  const h=harness();assert.equal(h.run('parseNumeroAmostra("1.234,50")'),1234.5);
  assert.equal(h.calculate({margemPct:'0',valorKm:'0',taxaBase:'0'}).total,216);
  h.nodes.get('medida-distancia').value='';assert.equal(h.run('atualizarAmostra()').frete,0);
  const last=h.nodes.get('resultado-valor').innerText;h.nodes.get('medida-largura').value='';h.run('atualizarAmostra()');
  assert.equal(h.nodes.get('resultado-valor').innerText,last);assert.equal(h.alerts.length,1);
  for(const values of [{largura:'0'},{altura:'-1'},{custoM2:'0'},{distancia:'-1'},{margemPct:''},{valorKm:'10abc'},{largura:'1.2,3'},{largura:'9'.repeat(310),altura:'9'.repeat(310)}])assert.ok(h.calculate(values).error);
});
test('hero reuses the actual result card, without fabricated cost panels',()=>{
  const embedded=decode(html.match(/id="hero-replica-frame"[^>]*srcdoc="([^"]+)"/)[1]);assert.equal(embedded,createReplica(app,'result'));
  const card=calculatorMarkup(app).match(/<section class="glass-card p-6[\s\S]*?<\/section>/)[0];assert.ok(embedded.includes(card));
  const h=harness('result');assert.equal(h.nodes.get('resultado-valor').innerText,'R$ 554,00');assert.equal(h.nodes.get('resultado-lucro').innerText,'R$ 277,00 (100%)');
  assert.ok(!/class="app-card"|class="demo-breakdown"|Valor total calculado/.test(html));
});
test('sending and PDF disclose demo limits, no personal data leaves the replica',()=>{
  const h=harness();for(const action of ['enviarWhatsApp','gerarPDFOrcamento'])h.actions.find(n=>n.dataset.action===action).listeners.click();
  assert.equal(h.alerts.length,2);for(const msg of h.alerts)assert.match(msg,/não há envio, PDF nem orçamento salvo/);
  assert.equal(/fetch\(|XMLHttpRequest|supabase|\.rpc\(|localStorage|sessionStorage|sendBeacon|window\.location|window\.open|\.print\(/.test(replicaScript),false);
  assert.ok(!/<script src="[^"]*supabase/.test(createReplica(app)));
  h.nodes.get('cliente-nome').value='<img src=x onerror=alert(1)>';h.nodes.get('cliente-whatsapp').value='11999999999';
  h.run('atualizarAmostra(); informarAltura()');assert.equal(JSON.stringify(h.messages),JSON.stringify([{type:'orcametro-replica-height',height:1234}]));
});
test('resize validates sandbox origin, frame source and bounded finite height',()=>{
  const script=html.match(/<script id="demo-script">([\s\S]*?)<\/script>/)[1];
  const frame={contentWindow:{},style:{}},other={contentWindow:{},style:{}};let listener;
  vm.runInNewContext(script,{document:{getElementById:id=>id==='demo-frame'?frame:other},window:{addEventListener:(k,fn)=>{listener=fn;}}});
  for(const event of [{source:{},origin:'null',data:{height:1000}},{source:frame.contentWindow,origin:'https://example.com',data:{height:1000}}])listener({...event,data:{...event.data,type:'orcametro-replica-height'}});
  for(const height of [NaN,Infinity,'1000'])listener({source:frame.contentWindow,origin:'null',data:{type:'orcametro-replica-height',height}});
  assert.equal(frame.style.height,undefined);
  for(const [height,result] of [[1000,'1000px'],[99999,'2400px'],[-1,'320px']]){listener({source:frame.contentWindow,origin:'null',data:{type:'orcametro-replica-height',height}});assert.equal(frame.style.height,result);}
});
test('experiment stays in the page, full app links and free quotes remain unchanged',()=>{
  const anchors=[...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>({attributes:m[1],text:m[2].replace(/<[^>]+>/g,'').trim(),href:m[1].match(/href="([^"]+)"/)?.[1]}));
  const demos=anchors.filter(a=>/\bdata-demo-link\b/.test(a.attributes));assert.ok(demos.length>=6);for(const a of demos)assert.equal(a.href,'#demonstracao');
  for(const a of anchors.filter(a=>/experimentar|testar/i.test(a.text)))assert.equal(a.href,'#demonstracao',a.text);
  const complete=anchors.filter(a=>a.text==='Quero o acesso completo');assert.ok(complete.length>=4);for(const a of complete)assert.equal(a.href,'https://orca-metro.pages.dev/');
  for(const text of ['sem consumir os 3 orçamentos','não são enviados ao banco','Os 3 orçamentos gratuitos continuam disponíveis lá','Cancelar renovação','aguarde a confirmação','JSON','senha atual','boletos e comprovantes'])assert.ok(html.includes(text),text);
  assert.match(html,/cobrança anual de R\$ 297,00, não mensal de R\$ 24,75/i);
});
