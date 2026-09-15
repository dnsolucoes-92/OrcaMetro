import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter(m => !/\bsrc=/.test(m[1])).map(m => m[2]);

function harness(overrides = {}) {
  const nodes = new Map();
  function element(id = '') {
    const classes = new Set();
    let markup = '', value = '';
    return {
      id, style: {}, dataset: {}, checked: false, disabled: false, type: 'password',
      innerText: '', textContent: '', children: [], options: [], selectedIndex: -1,
      classList: {
        add: (...xs) => xs.forEach(x => classes.add(x)),
        remove: (...xs) => xs.forEach(x => classes.delete(x)),
        contains: x => classes.has(x),
        toggle: (x, yes) => (yes ?? !classes.has(x)) ? classes.add(x) : classes.delete(x),
      },
      get value() { return id === 'servico-material' ? this.options[this.selectedIndex]?.value ?? value : value; },
      set value(v) { value = String(v); },
      get innerHTML() { return markup; },
      set innerHTML(v) { markup = v; this.children = []; this.options = []; this.selectedIndex = -1; },
      setAttribute(key, v) { this[key] = v; },
      appendChild(child) {
        this.children.push(child);
        if (id === 'servico-material') { this.options.push(child); if (this.selectedIndex < 0) this.selectedIndex = 0; }
      },
      checkValidity() { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value); },
      addEventListener() {}, click() { calls.push(['download', this.href]); }, remove() {},
    };
  }
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(m[1], element(m[1]));
  const alerts = [], navigations = [], calls = [];
  const profile = { id: 'user-a', empresa: 'Empresa A', status_assinatura: 'teste', limite_gratis: 3,
    orcamentos_gratis_usados: 0, margem_lucro: 0, valor_km: 0, taxa_base: 0, validade: 3,
    fatores_dificuldade: { facil: 0, medio: 40, dificil: 80 } };
  const session = { user: { id: profile.id, email: 'cliente@example.com' } };
  const client = {
    auth: {
      signUp: async args => { calls.push(['signUp', args]); return { data: { session } }; },
      signInWithPassword: async args => { calls.push(['verifyPassword', args]); return { data: { session, user: session.user } }; },
      updateUser: async args => { calls.push(['updateUser', args]); return { data: { user: session.user } }; },
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({ error: null }),
      getSession: async () => ({ data: { session } }), onAuthStateChange() {},
      ...overrides.auth,
    },
    from(table) {
      let deleting = false;
      const result = () => ({ data: deleting ? null : table === 'orcametro_perfis' ? profile
        : table === 'orcametro_materiais' ? [{ id: 'material-a', nome: 'Adesivo', custo: 25 }] : [],
        error: overrides.tableError?.(table, deleting) ?? null });
      const query = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        limit() { return this; }, range() { return this; }, delete() { deleting = true; return this; },
        maybeSingle: async () => result(), then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return overrides.rpc ? overrides.rpc(name, args) : { data: { orcamento_id: 'quote-a', orcamentos_gratis_usados: 1, status_assinatura: profile.status_assinatura } };
    },
    functions: { invoke: async (name, args) => name === 'orcametro-minha-assinatura'
      ? (calls.push(['billing', args.body]), overrides.billing ? overrides.billing(args.body) : { data: { renovacao: 'desconhecida', cobrancas: [] } })
      : overrides.checkout ?? { data: { url: 'https://asaas.com/checkout/test' } } },
  };
  const document = {
    getElementById: id => { if (!nodes.has(id)) throw new Error('Missing DOM ID: ' + id); return nodes.get(id); },
    createElement: () => element(), body: element(), addEventListener() {},
    querySelector: () => element(), querySelectorAll: () => [],
  };
  const context = vm.createContext({ document, tailwind: {},
    window: { supabase: { createClient: () => client }, location: { origin: 'https://orca-metro.pages.dev', assign: url => navigations.push(url) },
      addEventListener() {}, print: () => calls.push(['print']) },
    navigator: { onLine: true }, console: { log() {}, error() {} },
    alert: msg => alerts.push(msg), confirm: () => true, setTimeout() {}, Blob, URL: class extends URL {
      static createObjectURL(blob) { calls.push(['exportBlob', blob]); return 'blob:test'; }
      static revokeObjectURL() {}
    }, URLSearchParams,
  });
  scripts.forEach(source => vm.runInContext(source, context));
  const run = code => vm.runInContext(code, context);
  const node = id => document.getElementById(id);
  const inputs = values => Object.entries(values).forEach(([id, value]) => { node(id).value = value; });
  const signIn = () => run('tratarSessao(' + JSON.stringify(session) + ')');
  const quoteInputs = () => inputs({ 'medida-largura': '2', 'medida-altura': '1', 'medida-distancia': '10', 'cliente-nome': 'Cliente original' });
  return { run, node, inputs, calls, alerts, navigations, profile, signIn, quoteInputs };
}

test('inline JavaScript parses; literal DOM IDs exist; obsolete OTP removed', () => {
  scripts.forEach(source => new vm.Script(source));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  for (const source of scripts) for (const m of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) assert.ok(ids.has(m[1]), m[1]);
  assert.equal(/mostrarPainelConfirmacao|auth-otp|verifyOtp/.test(html), false);
  for (const file of ['redefinir-senha.html', 'vendas/index.html', 'vendas.html']) {
    const page = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
    for (const m of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=/.test(m[1])) new vm.Script(m[2]);
  }
});

test('numbers accept Brazilian decimal and retain zero, reject invalid input', () => {
  const h = harness();
  assert.equal(h.run('parseNumber("1.234,50")'), 1234.5);
  assert.equal(h.run('parseNumber("2,5")'), 2.5);
  assert.equal(h.run('parseNumber("0")'), 0);
  assert.ok(Number.isNaN(h.run('parseNumber("10abc")')));
  assert.ok(Number.isNaN(h.run('parseNumber("1.2,3")')));
  h.inputs({ 'cfg-margem': '0' }); assert.equal(h.run('numeroCampo("cfg-margem",100)'), 0);
});

test('signup opens app immediately; required consent and email prevent API calls', async () => {
  const h = harness(); h.inputs({ 'auth-email': ' cliente@example.com ', 'auth-password': 'senha123' });
  await h.run('fazerCadastro()'); assert.equal(h.calls.length, 0);
  h.node('auth-termos').checked = true; h.node('auth-email').value = 'invalid';
  await h.run('fazerCadastro()'); assert.equal(h.calls.length, 0);
  h.node('auth-email').value = 'cliente@example.com';
  await h.run('fazerCadastro()');
  assert.equal(h.calls[0][0], 'signUp'); assert.equal(h.node('auth-modal').style.display, 'none');
  assert.equal(h.run('authBusy'), false);
});

test('new signup requires eight characters but existing shorter password still reaches login', async () => {
  const h = harness(); h.inputs({ 'auth-email': 'cliente@example.com', 'auth-password': '123456' });
  h.node('auth-termos').checked = true; await h.run('fazerCadastro()');
  assert.equal(h.calls.length, 0); assert.match(h.node('auth-msg').innerText, /8 a 128/);
  await h.run('fazerLogin()'); assert.equal(h.calls[0][0], 'verifyPassword');
});

test('account shows actual expiry, days and canceled renewal without revoking paid access', async () => {
  const h = harness({ billing: () => ({ data: { renovacao: 'cancelada', valor: 29.9, ciclo: 'MONTHLY', cobrancas: [], pode_cancelar: false } }) });
  h.profile.plano = 'mensal'; h.profile.status_assinatura = 'ativo';
  h.profile.vencimento_assinatura = new Date(Date.now() + 10 * 86400000).toISOString();
  await h.signIn(); await h.run('consultarMinhaAssinatura()');
  assert.equal(h.node('account-email').innerText, 'cliente@example.com');
  assert.equal(h.node('account-plan').innerText, 'Mensal'); assert.match(h.node('account-days').innerText, /10 dias/);
  assert.match(h.node('account-renewal').innerText, /cancelada/); assert.equal(h.run('temAcessoPago()'), true);
  assert.equal(h.run('diasRestantesConta("invalid")'), 'Não informado');
  assert.equal(h.run('diasRestantesConta(new Date(Date.now()+1000).toISOString())'), 'Menos de 1 dia');
});

test('cancel requires explicit consent; rapid duplicate clicks send one request; pending is not success', async () => {
  let finish;
  const h = harness({ billing: body => body.acao === 'consultar' ? { data: { pode_cancelar: true, renovacao: 'ativa' } }
    : new Promise(resolve => { finish = resolve; }) });
  await h.signIn(); await h.run('consultarMinhaAssinatura()'); h.run('abrirCancelamento()');
  await h.run('cancelarMinhaRenovacao()'); assert.equal(h.calls.filter(c=>c[0]==='billing').length, 1);
  h.node('account-cancel-confirm').checked = true;
  const pending = h.run('cancelarMinhaRenovacao()'); await h.run('cancelarMinhaRenovacao()');
  assert.equal(h.calls.filter(c=>c[0]==='billing').length, 2);
  finish({ data: { cancelamento_confirmado: false, renovacao: 'cancelamento_pendente' } }); await pending;
  assert.match(h.node('account-msg').innerText, /NÃO está confirmado/);
  assert.notEqual(h.profile.renovacao_status, 'cancelada');
});

test('confirmed cancellation preserves paid deadline, quote history and quota', async () => {
  const h = harness({ billing: body => ({ data: body.acao === 'consultar' ? { pode_cancelar: true, renovacao: 'ativa' }
    : { cancelamento_confirmado: true, renovacao: 'cancelada' } }) });
  h.profile.plano = 'anual'; h.profile.status_assinatura = 'ativo';
  const expiry = new Date(Date.now()+30*86400000).toISOString(); h.profile.vencimento_assinatura = expiry;
  await h.signIn(); await h.run('consultarMinhaAssinatura()'); h.node('account-cancel-confirm').checked = true;
  await h.run('cancelarMinhaRenovacao()');
  assert.equal(h.profile.vencimento_assinatura, expiry); assert.equal(h.profile.status_assinatura, 'ativo');
  assert.equal(h.profile.orcamentos_gratis_usados, 0); assert.equal(h.run('temAcessoPago()'), true);
  assert.match(h.node('account-msg').innerText, /cancelada no Asaas/);
});

test('exhausted trial can access account/export/history without buying or bypassing quote limit', async()=>{
  const h=harness(); h.profile.orcamentos_gratis_usados=3; await h.signIn();
  assert.equal(h.node('paywall-modal').classList.contains('hidden'),false);
  h.run('acessarMinhaConta()');
  assert.equal(h.node('paywall-modal').classList.contains('hidden'),true);
  assert.equal(h.node('view-configurar').classList.contains('hidden'),false);
  h.quoteInputs(); await h.run('calcularOrcamento()');
  assert.equal(h.calls.length,0); assert.equal(h.node('paywall-modal').classList.contains('hidden'),false);
});

test('billing failure and signout cannot display stale personal billing', async () => {
  let finish;
  const h = harness({ billing: () => new Promise(resolve=>{ finish=resolve; }) }); await h.signIn();
  const pending = h.run('consultarMinhaAssinatura()'); await h.run('tratarSessao(null)');
  finish({ data: { renovacao: 'ativa', valor: 297, cobrancas: [{ id:'private' }] } }); await pending;
  assert.equal(h.run('accountBilling'), null); assert.equal(h.node('account-payments').innerHTML, '');
  const failed = harness({ billing:()=>({ error:{}, data:{ error:'cancellation_not_confirmed' } }) });
  await failed.signIn(); await failed.run('consultarMinhaAssinatura()');
  assert.match(failed.node('account-msg').innerText, /NÃO foi confirmado/); assert.equal(failed.run('accountBusy'), false);
});

test('password changes require correct current password, matching owner and matching confirmation', async () => {
  const bad = harness({ auth:{ signInWithPassword:async()=>({ error:{code:'invalid_credentials'} }) } });
  await bad.signIn(); bad.inputs({'account-current-password':'old12345','account-new-password':'new123456','account-confirm-password':'new123456'});
  await bad.run('alterarMinhaSenha()'); assert.equal(bad.calls.some(c=>c[0]==='updateUser'), false);
  assert.match(bad.node('account-password-msg').innerText, /Nenhuma senha foi alterada/);
  const h = harness(); await h.signIn(); h.inputs({'account-current-password':'old12345','account-new-password':'new123456','account-confirm-password':'different'});
  await h.run('alterarMinhaSenha()'); assert.equal(h.calls.length, 0);
  h.node('account-confirm-password').value='new123456'; await h.run('alterarMinhaSenha()');
  assert.equal(h.calls.find(c=>c[0]==='updateUser')[1].current_password, 'old12345');
  assert.equal(h.calls.find(c=>c[0]==='updateUser')[1].email, undefined);
  assert.equal(h.run('currentUser'), null); assert.match(h.node('auth-msg').innerText, /Senha alterada/);
});

test('receipt URLs are allowlisted and export excludes credentials and billing metadata', async () => {
  const h=harness(); await h.signIn();
  assert.equal(h.run('linkAsaasSeguro("https://asaas.com.attacker.invalid/receipt")'), '');
  assert.equal(h.run('linkAsaasSeguro("javascript:alert(1)")'), '');
  assert.equal(h.run('linkAsaasSeguro("https://evil@asaas.com/")'), '');
  assert.equal(h.run('linkAsaasSeguro("https://www.asaas.com/receipt")'), 'https://www.asaas.com/receipt');
  h.profile.asaas_customer_id='private-customer'; await h.run('exportarMeusDados()');
  const exported=JSON.parse(await h.calls.find(c=>c[0]==='exportBlob')[1].text());
  assert.equal(exported.conta.email,'cliente@example.com'); assert.equal(exported.orcamentos.length,0);
  assert.equal(JSON.stringify(exported).includes('private-customer'),false);
  assert.equal(JSON.stringify(exported).includes('publishable'),false);
  assert.equal(h.calls.filter(c=>c[0]==='download').length,1);
});

test('signup without session does not claim email/code delivery', async () => {
  const h = harness({ auth: { signUp: async () => ({ data: { session: null } }) } });
  h.inputs({ 'auth-email': 'cliente@example.com', 'auth-password': 'senha123' }); h.node('auth-termos').checked = true;
  await h.run('fazerCadastro()'); assert.match(h.node('auth-msg').innerText, /acesso imediato não foi liberado/);
  assert.doesNotMatch(h.node('auth-msg').innerText, /código|enviado/);
});

test('bad login and unavailable recovery show truthful messages', async () => {
  const h = harness({ auth: { signInWithPassword: async () => ({ error: { code: 'invalid_credentials' } }),
    resetPasswordForEmail: async () => ({ error: { message: 'smtp unavailable' } }) } });
  h.inputs({ 'auth-email': 'cliente@example.com', 'auth-password': 'senha123' });
  await h.run('fazerLogin()'); assert.match(h.node('auth-msg').innerText, /senha incorretos/);
  await h.run('recuperarSenha()'); assert.match(h.node('auth-msg').innerText, /indisponível/);
  assert.equal(h.run('authBusy'), false);
});

test('quote honors zero costs/margin and saves before displaying success', async () => {
  const h = harness(); await h.signIn(); h.quoteInputs(); await h.run('calcularOrcamento()');
  assert.equal(h.run('lastQuote.total'), 50); assert.equal(h.run('lastQuote.lucro'), 0);
  assert.equal(h.run('lastQuote.frete'), 0); assert.equal(h.node('resultado-valor').innerText, 'R$ 50,00');
  assert.equal(h.calls.filter(c => c[0] === 'rpc').length, 1);
});

test('invalid dimensions do not save and exhausted trial opens paywall', async () => {
  const h = harness(); await h.signIn(); h.quoteInputs(); h.node('medida-largura').value = '-1';
  await h.run('calcularOrcamento()'); assert.equal(h.calls.length, 0);
  h.quoteInputs(); h.profile.orcamentos_gratis_usados = 3;
  await h.run('calcularOrcamento()'); assert.equal(h.calls.length, 0);
  assert.equal(h.node('paywall-modal').classList.contains('hidden'), false);
});

test('vitalicio remains unlimited', async () => {
  const h = harness(); h.profile.status_assinatura = 'vitalicio'; h.profile.orcamentos_gratis_usados = 3;
  await h.signIn(); h.quoteInputs(); await h.run('calcularOrcamento()');
  assert.equal(h.calls.filter(c => c[0] === 'rpc').length, 1);
  assert.equal(h.node('trial-counter').innerText, 'ILIMITADO');
});

test('simultaneous clicks save only one quote', async () => {
  let finish;
  const h = harness({ rpc: () => new Promise(resolve => { finish = resolve; }) });
  await h.signIn(); h.quoteInputs(); const pending = h.run('calcularOrcamento()');
  await h.run('calcularOrcamento()'); assert.equal(h.calls.length, 1);
  finish({ data: { orcamento_id: 'quote-a', status_assinatura: 'teste', orcamentos_gratis_usados: 1 } });
  await pending; assert.equal(h.run('quoteBusy'), false);
});

test('failed persistence retains last successful result', async () => {
  let failed = false;
  const h = harness({ rpc: () => failed ? { error: { message: 'offline' } }
    : { data: { orcamento_id: 'quote-a', status_assinatura: 'teste', orcamentos_gratis_usados: 1 } } });
  await h.signIn(); h.quoteInputs(); await h.run('calcularOrcamento()'); failed = true;
  h.node('medida-largura').value = '10'; await h.run('calcularOrcamento()');
  assert.equal(h.run('lastQuote.total'), 50); assert.match(h.alerts.at(-1), /anterior foi mantido/);
});

test('WhatsApp blank number chooses conversation and sends saved quote snapshot', async () => {
  const h = harness(); await h.signIn(); h.quoteInputs(); await h.run('calcularOrcamento()');
  h.node('cliente-nome').value = 'Novo cliente'; h.run('enviarWhatsApp()');
  const url = new URL(h.navigations.at(-1)); assert.equal(url.searchParams.has('phone'), false);
  assert.match(url.searchParams.get('text'), /Cliente original/); assert.doesNotMatch(url.searchParams.get('text'), /Novo cliente/);
  h.node('cliente-whatsapp').value = '55 99999-1234'; h.run('enviarWhatsApp()');
  assert.equal(new URL(h.navigations.at(-1)).searchParams.get('phone'), '5555999991234');
});

test('PDF escapes customer content and signout clears private state', async () => {
  const h = harness(); await h.signIn(); h.quoteInputs(); h.node('cliente-nome').value = '<img src=x onerror=alert(1)>';
  await h.run('calcularOrcamento()'); h.run('gerarPDFOrcamento()');
  assert.doesNotMatch(h.node('area-impressao-pdf').innerHTML, /<img/);
  assert.match(h.node('area-impressao-pdf').innerHTML, /&lt;img/);
  assert.equal(h.calls.at(-1)[0], 'print');
  await h.run('fazerLogout()'); assert.equal(h.run('lastQuote'), null); assert.equal(h.run('currentProfile'), null);
  assert.equal(h.node('auth-modal').style.display, 'flex'); assert.equal(h.node('lista-historico').innerHTML, '');
});

test('checkout rejects malicious URL and accepts HTTPS Asaas URL', async () => {
  const bad = harness({ checkout: { data: { url: 'https://asaas.com.evil.example/checkout' } } });
  await bad.signIn(); await bad.run('iniciarCheckout("mensal")');
  assert.equal(bad.navigations.length, 0); assert.equal(bad.run('checkoutBusy'), false);
  const good = harness(); await good.signIn(); await good.run('iniciarCheckout("anual")');
  assert.equal(good.navigations.at(-1), 'https://asaas.com/checkout/test');
});

test('history query/deletion errors do not pretend empty/success', async () => {
  const h = harness({ tableError: table => table === 'orcametro_orcamentos' ? { message: 'offline' } : null });
  await h.signIn(); assert.match(h.node('lista-historico').innerHTML, /Não foi possível carregar/);
  await h.run('limparHistorico()'); assert.match(h.alerts.at(-1), /Não foi possível apagar/);
});
