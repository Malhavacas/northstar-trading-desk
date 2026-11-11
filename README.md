# Northstar Trading Desk

Desk autónoma de **paper trading** e investigação determinística de estratégias para ações e ETFs dos EUA. Inclui aplicação full-stack/PWA, ingestão Alpaca, conector oficial X/Twitter, event studies, motores de backtest, validação independente, risco, reconciliação e resultados auditáveis.

**Estado permanente:** paper apenas. Não existe adapter de corretora para ordens reais e live está bloqueado.

## Cópia integral auditada

Os motores, critérios e relatórios essenciais estão diretamente legíveis neste repositório. Para materializar localmente a cópia integral auditada — **200 ficheiros**, incluindo a aplicação completa, o CSV de 1.224 execuções, metadados extensos e os ícones PNG — executa:

```bash
python3 scripts/bootstrap-full-project.py
```

O recuperador usa apenas a biblioteca padrão de Python, descarrega um dos dois espelhos de transferência, valida o SHA-256 do ZIP, os caminhos seguros, o CRC e o hash de cada ficheiro do manifesto, e cria `northstar-full/`. Não executa código do arquivo nem sobrescreve uma diretoria não vazia.

## Estado da investigação

A ronda atual é a **Northstar v7**, orientada a eventos e reação pós-notícia.

- 36.370 artigos únicos Alpaca no snapshot original.
- 45.671 clusters causais.
- 25 símbolos analisados; 24 ações elegíveis.
- 576 configurações em seis famílias.
- 1.152 execuções IS/validação e 72 execuções adicionais de robustez.
- Zero configurações cumpriram os gates de IS.
- Zero candidatos e zero promoções.
- O TEST/holdout não foi aberto.
- Veredito: `NENHUMA_ESTRATEGIA_PROMOVIDA`.
- X permaneceu `UNCONFIGURED`; nenhum evento ou P&L foi atribuído a X.

O resultado negativo é deliberado e auditado: os critérios não foram enfraquecidos para produzir uma estratégia aparentemente lucrativa.

## Começar aqui — para outra IA ou programador

Ler por esta ordem:

1. `docs/Relatorio-eventos-pos-noticia-v7.md` — metodologia, resultados e 16 limitações.
2. `verifier/v7/criteria.md` — critérios de aceitação C7-01…C7-18.
3. `research-v7/config.mts` — universo, constantes e parâmetros temporais.
4. `research-v7/event-core.mts` — alinhamento causal, clusters e event studies.
5. `research-v7/strategy-grid.mts` — seis famílias e 576 configurações.
6. `research-v7/strategy-engine.mts` — entradas, saídas, custos, stops, gaps e risco.
7. `research-v7/research-freeze.json` — grelha e regras congeladas antes do P&L.
8. `research-v7/event-study.json` — 480 agregações estatísticas.
9. `results/Resultados-eventos-pos-noticia-252-sessoes.csv` — 1.224 execuções exportadas.
10. `verifier/v7/latest-verification.json` — verificação final 19/19.

Os itens que não estão diretamente presentes na raiz são recuperados pelo comando da secção **Cópia integral auditada**.

### Brief recomendado para uma IA de pesquisa

> Analisa o motor e os resultados Northstar v7. Propõe hipóteses genuinamente diferentes, com regras causais e executáveis, sem escolher configurações pelo holdout e sem alterar retroativamente a ronda v7. Cria uma ronda v8 separada, com critérios próprios, custos, validação independente, robustez e registos de falhas. Não atives entradas, não uses ordens reais e não apresentes backtests como prova de lucro futuro.

## Estrutura da cópia integral

- `app/` — React, TypeScript, Hono/tRPC, Drizzle, MySQL/TiDB, motor paper e PWA.
- `research-v7/` — código da investigação orientada a eventos, testes, freezes e resultados agregados.
- `results/` — CSV integral de configurações, segmentos e robustez.
- `docs/` — relatório v7 e relatórios de rondas anteriores.
- `verifier/` — índice append-only, critérios e evidência final.

## Executar a aplicação

Requisitos: Node.js 20+ e MySQL/TiDB. Depois de materializar a cópia integral, entra em `northstar-full/`.

```bash
cd app
npm ci
cp .env.example .env
# Configurar a base e os segredos localmente; nunca commitar .env.
npm run db:push
npm run check
npm test
npm run build
npm run dev
```

O build de produção também pode ser executado com `npm start`, após `npm run build`.

## Testes do motor de pesquisa

A partir da raiz da cópia integral:

```bash
npm ci --prefix app
npx --yes tsx --test research-v7/event-core.test.mts research-v7/strategy-engine.test.mts
```

Os 18 testes cobrem causalidade antes/depois do fecho, publicação exatamente no limite da barra, overnight, lacunas, benchmark em falta, long/short, stops ambíguos, gaps, EOD, latência, custos, cooldown e sobreposições.

## Dados não incluídos

Não são publicados:

- Credenciais, `.env`, bases de dados ou logs locais.
- `node_modules`, builds ou caches.
- Snapshots brutos de preços e notícias.
- Headlines ou texto de posts X.
- `event-dataset.json`, `event-study-rows.json` e `development-runs.jsonl` brutos.

Os resultados agregados e o CSV exportado estão incluídos na cópia integral. Os hashes e metadados permitem auditar a ronda original, mas uma nova recolha Alpaca pode diferir, designadamente por edições históricas de notícias.

## Recolher novos dados

As credenciais são lidas apenas do ambiente, de `app/.env` ou do ficheiro indicado por `NORTHSTAR_ALPACA_ENV`.

```bash
export APCA_API_KEY_ID='a-tua-chave'
export APCA_API_SECRET_KEY='o-teu-segredo'
npm ci --prefix app
npx --yes tsx research-v7/fetch-prices.mts
python3 research-v7/fetch-news.py
```

**Não executar uma nova recolha sobre a evidência v7.** Para investigação nova, copiar o motor para `research-v8/`, definir `NORTHSTAR_RESEARCH_DIR` e criar `verifier/v8/`. O holdout v7 não deve ser reaberto para procurar uma configuração melhor.

## Gates resumidos

- IS: pelo menos 30 trades, PF > 1,10, P&L > 0 e DD <= 5%.
- Validação: pelo menos 10 trades, PF > 1 e P&L > 0.
- Stress 1,5× positivo.
- Pelo menos 3/4 subperíodos IS positivos.
- Concentração <= 60% por símbolo, categoria e lado.
- Holdout, apenas para candidatos congelados: pelo menos 10 trades, PF > 1, P&L > 0 e DD <= 5%.
- Promoção máxima: nova validação paper, nunca live direto.

## Segurança

- Não pedir passwords nem seed phrases.
- Não guardar segredos em repositórios ou logs.
- Paper/testnet antes de conta real.
- Não executar ordens reais nesta fase.
- Uma futura integração live exige chaves restritas, sem levantamentos, preferencialmente IP whitelist, certificação e reconciliação externa.

## Proveniência da publicação

- App de origem: commit `41bdc0c5a3b418fb78ce12b012d97d3150c415f7`.
- Snapshot da app: `bigVersion=6`, correspondente à ronda de investigação v7.
- `appVersionId`: `1a1caace-43d2-8f0c-8000-000050d30701`.
- A cópia pública contém adaptações de portabilidade nos collectors/exportador, sem alterar o motor, a grelha ou os resultados congelados.
- A auditoria da cópia encontrou zero credenciais, zero `.env`, zero caminhos locais, zero endpoints externos de ordens e 18/18 testes aprovados.
