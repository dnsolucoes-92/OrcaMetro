# OrçaMetro — Profissional V3.5.3

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

Os testes de lógica da interface usam serviços simulados. Não substituem verificação visual no celular, cadastro real, recebimento de recuperação de senha, pagamento real ou cancelamento real no provedor.

## Fluxo preservado

Três orçamentos gratuitos. Planos mensal de R$ 29,90 e anual de R$ 297,00. Abas Orçamento, Histórico e Configurar. WhatsApp opcional e impressão/salvamento em PDF.

Cadastro com entrada imediata depende da configuração do serviço de autenticação. Configure corretamente o e-mail; entrega de recuperação de senha ainda precisa ser comprovada. O retorno da página de pagamento não comprova pagamento.

## Minha conta e assinatura

Dentro da aba Configurar: e-mail de acesso, plano, situação, vencimento, dias restantes, renovação, consulta de cobranças/comprovantes, cancelamento com confirmação, troca de senha mediante verificação da senha atual, exportação dos próprios dados em JSON e suporte.

O backend de cobrança deve estar implantado antes de publicar esta interface. O cancelamento só é anunciado como concluído após confirmação do provedor. Cancela próximas renovações, preservando o prazo já pago e o histórico. Troca de e-mail e exclusão da conta dependem do suporte e de verificação de titularidade. CAPTCHA e entrega profissional de e-mails não estão anunciados como configurados.

Para o projeto atual de upload direto: gere `dist`, compacte apenas o seu conteúdo público e envie o ZIP pelo botão Create deployment → Production no projeto existente. Não envie pacotes privados do backend para a hospedagem pública. Não é necessário conectar GitHub para esse procedimento.

Antes de divulgação ampla, testar com conta controlada: cadastro, entrada, três orçamentos, quarto bloqueado, configurações, histórico, PDF, WhatsApp, saída/novo login, recuperação de senha e liberação após pagamento.

Este repositório público contém apenas a interface e suas ferramentas de build/teste. Não publique credenciais, cadastros de clientes ou metadados internos do banco aqui.
