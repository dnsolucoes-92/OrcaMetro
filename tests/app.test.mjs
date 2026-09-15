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
      addEventListener() {},
    };
  }
  for (const m of html.matchAll(/\bid="([^"]+)"/g)) nodes.set(m[1], element(m[1]));
  const alerts = [], navigations = [], calls = [];
  const profile = { id: 'user-a', empresa: 'Empresa A', status_assinatura: 'teste', limite_gratis: 3,
    orcamentos_gratis_usados: 0, margem_lucro: 0, valor_km: 0, taxa_base: 0, validade: 3,
    fatores_dificuldade: { facil: 0, medio: 40, dificil: 80 } };
  const session = { user: { id: profile.id } };
  const client = {
    auth: {
      signUp: async args => { calls.push(['signUp', args]); return { data: { session } }; },
      signInWithPassword: async () => ({ data: { session } }),
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
        limit() { return this; }, delete() { deleting = true; return this; },
        maybeSingle: async () => result(), then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return overrides.rpc ? overrides.rpc(name, args) : { data: { orcamento_id: 'quote-a', orcamentos_gratis_usados: 1, status_assinatura: profile.status_assinatura } };
    },
    functions: { invoke: async () => overrides.checkout ?? { data: { url: 'https://asaas.com/checkout/test' } } },
  };
  const document = {
    getElementById: id => { if (!nodes.has(id)) throw new Error('Missing DOM ID: ' + id); return nodes.get(id); },
    createElement: () => element(), addEventListener() {},
    querySelector: () => element(), querySelectorAll: () => [],
  };
  const context = vm.createContext({ document, tailwind: {},
    window: { supabase: { createClient: () => client }, location: { origin: 'https://orca-metro.pages.dev', assign: url => navigations.push(url) },
      addEventListener() {}, print: () => calls.push(['print']) },
    navigator: { onLine: true }, console: { log() {}, error() {} },
    alert: msg => alerts.push(msg), confirm: () => true, setTimeout() {}, URL, URLSearchParams,
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
