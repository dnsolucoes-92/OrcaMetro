# OrçaMetro — Profissional V3.5.2

Aplicativo: https://orca-metro.pages.dev/

Página de vendas: https://orca-metro.pages.dev/vendas/

## Cloudflare Pages

Use o projeto existente `orca-metro`, preservando o endereço e as implantações anteriores.

| Campo | Valor |
| --- | --- |
| Conta Git | `dnsolucoes-92` |
| Repositório | `OrcaMetro` |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `node scripts/build.mjs` |
| Build output directory | `dist` |
| Root directory | Raiz do repositório; deixe em branco |

O build usa somente Node e copia uma lista explícita dos arquivos públicos para `dist`.

## Verificação da interface

```sh
node --test tests/app.test.mjs
node scripts/build.mjs
```

14 testes de lógica da interface com serviços simulados aprovados. Não substituem verificação visual no celular, cadastro real, recebimento de recuperação de senha ou pagamento real.

## Fluxo preservado

Três orçamentos gratuitos. Planos mensal de R$ 29,90 e anual de R$ 297,00. Abas Orçamento, Histórico e Configurar. WhatsApp opcional e impressão/salvamento em PDF.

Cadastro com entrada imediata depende da configuração do serviço de autenticação. Configure corretamente o e-mail; entrega de recuperação de senha ainda precisa ser comprovada. O retorno da página de pagamento não comprova pagamento.

Antes de divulgação ampla, testar com conta controlada: cadastro, entrada, três orçamentos, quarto bloqueado, configurações, histórico, PDF, WhatsApp, saída/novo login, recuperação de senha e liberação após pagamento.

Este repositório público contém apenas a interface e suas ferramentas de build/teste. Não publique credenciais, cadastros de clientes ou metadados internos do banco aqui.
