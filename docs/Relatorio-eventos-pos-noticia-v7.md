# Northstar v7 — investigação orientada a eventos e reação pós-notícia

**Data de fecho:** 11 de novembro de 2026  
**Âmbito:** 252 sessões, 24 ações elegíveis e SPY como benchmark  
**Estado da investigação:** concluída, sem ativação  
**Veredito:** `NENHUMA_ESTRATEGIA_PROMOVIDA`  
**Teste final/holdout:** `NÃO_ABERTO_SEM_CANDIDATOS`  
**Backtest histórico de X/Twitter:** `BLOCKED_NO_CREDENTIAL`

## 1. Decisão executiva

A ronda v7 mudou o desenho da investigação para notícias e reação pós-notícia, alargou o universo, tornou a causalidade temporal explícita e introduziu uma área operacional de Eventos & Notícias na desk. Foram executadas **576 configurações únicas**, distribuídas igualmente por seis famílias, com **1.152 execuções base** entre in-sample e validação. Não houve erros de simulação.

**Nenhuma configuração cumpriu os gates de in-sample.** Em consequência:

- zero configurações pré-filtradas;
- zero candidatos congelados;
- zero promoções, incluindo para nova validação paper;
- nenhuma execução de P&L no teste final;
- nenhuma alteração da estratégia ativa da desk;
- nenhuma entrada ativada e nenhuma ordem real.

Houve **29 aprovações isoladas nos gates mínimos da validação**, mas nenhuma é elegível sem primeiro passar o IS. Estas ocorrências não foram usadas para reordenar a grelha, escolher uma narrativa favorável ou abrir o holdout.

O resultado dos event studies também não justifica uma recomendação operacional. Algumas médias agregadas são estatisticamente diferentes de zero nos intervalos bootstrap apresentados, mas a força reduz-se quando se excluem sobreposições e não se converte em execução lucrativa depois de custos, latência e gates de risco. **A ação profissional resultante desta ronda é monitorizar e não entrar.**

Este documento apresenta resultados hipotéticos e associações históricas. Não demonstra causalidade, capacidade de execução, lucro futuro nem prontidão para capital real.

## 2. Fontes, snapshot e reprodutibilidade

### 2.1 Fontes oficiais

- **Preços:** Alpaca Market Data, barras `5Min`, feed **IEX**, ajuste `split`, apenas RTH 09:30–16:00 `America/New_York`.
- **Notícias:** `GET https://data.alpaca.markets/v1beta1/news`, paginação ascendente e snapshot imutável. O probe read-only devolveu HTTP 200, schema e `next_page_token`; o contrato e o hash ficaram registados.
- **X/Twitter:** apenas conector oficial X API v2. Recent Search usa `/2/tweets/search/recent` e lookup `/2/tweets` para revalidação. Sem `X_BEARER_TOKEN`, a fonte fica `UNCONFIGURED`; não foi feito probe real, scraping, importação de posts de exemplo ou simulação de P&L atribuído a X.
- **Metodologia:** event studies com market model causal, bibliografia e decisões registadas em `verifier/v7/sources.md`.

O snapshot de notícias contém **36.370 artigos únicos**, sem duplicados: 35.510 `benzinga` e 860 `fiscal.ai`. O primeiro `created_at` é `2025-09-12T11:02:59Z` e o último `2026-11-10T19:13:23Z`. A janela solicitada para o estudo foi `2025-11-10T19:15:35Z` a `2026-11-10T19:15:35Z`.

### 2.2 Hashes principais

| Artefacto | SHA-256 |
|---|---|
| Snapshot agregado de preços, 25 símbolos | `cf11e27b4ae4779c4692734be55d949a6f6109bb21f1087ca28ad0bb6d4df0fd` |
| Artigos do snapshot de notícias | `e805e9ff56b853df0fba4ff55581b76e8d124c0583217344e0a338c1f7be5583` |
| Snapshot de notícias | `bc7e5054c953d81c04493d03923d87963a5bc69da24d7200a51bae8ba233e7ac` |
| Dataset causal | `e9615a9c66cfe6358a4c6c7c69b7383cde2ff18aca061b17ce174630fd99cae2` |
| Conteúdo dos eventos | `9e5279a9dc7aeef7bf5f7e61d5916b9b8f8d7de464dd19d84e72754f706c65be` |
| Linhas de event study | `d6669c8cc79be26a535839f39fbcbc0f60407cfb866beccda0f7c550f02a26da` |
| Event studies agregados | `e7c755766d25c753444b912d6c0d2da182b8aaef14b90f157b6bb21f75e1e2d1` |
| Freeze da investigação | `7295dc003ceb731f5c1c0b1caf6c384ea5772e064f01235e3f40d17a916862f1` |
| Motor de estratégia | `19d38f2b049881d66a0e7f2f09197e0d84befe5d3412be0243033e950cc5d159` |
| Digest canónico da grelha | `f2e7dd50b591723b4f9898483bc468ee56bed73b50b51c2d41d8fb1a4bd87924` |
| Matriz de desenvolvimento final | `998b86b29f3a4edfa6ad4c8bc55ebfe3cc6a9377d411ae3611220bd788547dc2` |
| Freeze de candidatos vazio | `aefb027d28915ee93bba44fe88d6340ae7a3c03e21a0db12d48b7b0cc82d014a` |
| Robustez diagnóstica | `314cf820210b56d131192bdfc71a155892ec6c03ba36510aefb45f467f9bbf0f` |

A grelha, o motor, o universo elegível, os splits e os gates foram congelados antes do P&L. O ficheiro de freeze regista `testOpened=false`, `xIncludedInBacktest=false`, `credentialsIncluded=false`, `liveTradingAllowed=false` e `realOrdersSubmitted=false`.

## 3. Universo, qualidade e separação temporal

### 3.1 Universo pré-registado

Foram avaliados 25 símbolos: **SPY** como benchmark e as ações **AAPL, MSFT, NVDA, AMZN, GOOGL, META, AMD, AVGO, JPM, XOM, TSLA, NFLX, PLTR, COIN, MSTR, HOOD, SMCI, MU, INTC, CRM, ORCL, UBER, SHOP e SOFI**.

TSLA, NFLX, PLTR, COIN, MSTR, HOOD, SMCI, MU, INTC, CRM, ORCL, UBER, SHOP e SOFI são os 14 novos ativos avaliados antes da elegibilidade. A inclusão dependeu apenas de dados e cobertura:

- pelo menos 150 sessões limpas;
- pelo menos 10.000 barras;
- pelo menos 20 eventos empresariais elegíveis no desenvolvimento;
- nenhuma inclusão ou exclusão por P&L.

**As 24 ações cumpriram os mínimos e ficaram elegíveis.** O workbook apresenta, por símbolo, barras limpas, sessões, eventos empresariais, lacunas e estado. O universo é atual, não point-in-time, não inclui delistings e conserva enviesamento de sobrevivência.

### 3.2 Splits cronológicos

| Amostra | Sessões | Início | Fim | Utilização |
|---|---:|---|---|---|
| IS | 151 | 2025-11-10 | 2026-06-17 | Seleção e gates iniciais |
| Validação | 50 | 2026-06-18 | 2026-08-28 | Filtro independente do IS |
| TEST | 51 | 2026-08-31 | 2026-11-10 | Permaneceu fechado |

Os event studies foram limitados a IS e validação. Qualquer outcome `+12` que tocasse o TEST foi bloqueado. Não foram calculados outcomes nem P&L de holdout.

### 3.3 Qualidade e clusters

Foram criados **45.671 clusters** e **69.811 linhas de event study**, agregados em **480 grupos estatísticos**. Um artigo ligado a vários símbolos permanece um único evento de origem com relações por ativo. A deduplicação operacional usa símbolo, headline normalizada e janela rolling de 30 minutos.

Exclusões do dataset:

| Motivo | Contagem |
|---|---:|
| `SYMBOL_DAY_GAP_EXCLUDED` | 467 |
| `NO_SAME_SESSION_SIGNAL` | 5 |
| `ENTRY_NOT_NEXT_COMPLETE_RTH_BAR` | 1 |
| `NO_NEXT_RTH_SESSION` | 1 |
| `NO_ENTRY_BAR` | 2 |

Exclusões dos event studies:

| Motivo | Contagem |
|---|---:|
| `INSUFFICIENT_CAUSAL_MARKET_MODEL` | 313 |
| `MARKET_ADJUSTED_BENCHMARK_OR_OUTCOME_INVALID` | 25 |
| `MARKET_MODEL_BENCHMARK_OR_OUTCOME_INVALID` | 23 |
| `OUTSIDE_DEVELOPMENT_OR_HOLDOUT_UNTOUCHED` | 10.585 |

Dias com lacunas foram excluídos por símbolo, sem deslocar o evento para outra sessão. Não se inventaram preços extended-hours, fills durante halts ou benchmarks em falta.

## 4. Convenção causal e execução hipotética

### 4.1 Tempos e proveniência

`created_at`/`publishedAt`, `sourceUpdatedAt`, `firstSeenAt`, `receivedAt` e `lastVerifiedAt` são timestamps distintos. O histórico Alpaca devolve a versão atualmente disponível: **`created_at` é uma proxy de publicação e não prova qual era o texto original antes de uma edição**. A ingestão prospetiva preserva a primeira observação, cria novas versões para edits e guarda hashes. Deletes/removals eliminam o payload e mantêm apenas o tombstone técnico mínimo.

### 4.2 Sinal e entrada

- **RTH:** publicação até 14:45 ET; usa-se a primeira barra completa cujo fecho seja estritamente posterior à publicação. Publicação exatamente no fecho usa a barra seguinte, implementada com `upperBound`, sem epsilon de floating point.
- A direção da reação usa apenas essa barra fechada. A entrada simulada ocorre no open da barra seguinte, nunca no preço anterior à notícia.
- Para respeitar `publishedAt <= signalClose < entryTime`, a ordem hipotética recebe timestamp `entryBarOpenTime + 1 segundo`; o preço de referência continua a ser apenas o open, com custos.
- **Overnight/extended:** coorte separada `NEXT_RTH_OPEN`, confirmação na primeira barra RTH e entrada na barra seguinte.
- Uma posição por símbolo, cooldown de 60 minutos após saída e eventos sobrepostos sinalizados; a robustez pode excluí-los.

O timestamp `+1s` é uma convenção de auditoria, **não prova que um fill ao open seria obtido com esse atraso**. O cenário de latência adicional de uma barra e os custos modelados não eliminam esta limitação.

### 4.3 Risco e custos pré-registados

Capital hipotético independente de 25.000 US$ por configuração/amostra; 20% do equity por entrada; máximo de cinco posições; sem alavancagem. Comissão de 0,0035 US$/ação, mínimo de 0,35 US$/ordem, spread de 2 bps por lado e slippage de 1 bp por lado. Foram medidos stress de 1,5× e 2×.

Stop primeiro em barras ambíguas; gaps através de stop/target recebem o open; drawdown é mark-to-market barra a barra. As cinco famílias intradiárias fecham EOD; earnings drift pode atravessar sessões usando apenas barras RTH. Shorts são hipotéticos e não presumem borrow, locate ou Reg SHO. SEC/TAF, borrow, impacto de mercado, partial fills e fila de execução não são modelados integralmente.

## 5. Event studies antes das estratégias

### 5.1 Método

O market model usa 60 retornos de barras alinhados com SPY e termina a estimação 12 barras antes do sinal. Os pares ativo/SPY exigem timestamps atuais e anteriores exatamente alinhados:

`AR = retorno do ativo − alfa − beta × retorno SPY`

O CAR é a soma aritmética dos AR em `+1/+3/+6/+12` barras. Foram também calculados market-adjusted (`alfa=0`, `beta=1`), janelas alternativas e uma coorte `NON_OVERLAPPING`. Os intervalos são bootstrap determinístico de dias inteiros, com 1.000 reamostragens, preservando dependência dentro do dia.

**Continuação** é o retorno raw multiplicado pela direção da reação; **fading** é o seu simétrico. Nenhuma das duas é CAR. A tabela seguinte usa o market model; valores e limites em bps. Medianas, desvios-padrão, raw returns, reaction, fading, volume e todos os 480 grupos estão no workbook.

| Recorte/coorte | Janela | N / dias | CAR médio | IC95 CAR | Continuação média | IC95 continuação |
|---|---:|---:|---:|---|---:|---|
| Todos os eventos | +1 | 34.750 / 200 | −1,2210 | [−3,3864; +0,8011] | −3,3261 | [−5,7467; −0,9774] |
| Todos os eventos | +12 | 34.750 / 200 | −5,3913 | [−9,9260; −0,9538] | −1,5727 | [−8,0023; +4,8109] |
| `NON_OVERLAPPING` | +1 | 8.400 / 200 | −0,4691 | [−1,4459; +0,6306] | +0,2851 | [−1,0528; +1,5666] |
| `NON_OVERLAPPING` | +12 | 8.400 / 200 | −1,5590 | [−4,3819; +1,2123] | +2,2977 | [−1,0379; +5,7759] |
| RTH | +1 | 13.830 / 200 | −0,1467 | [−0,6987; +0,4156] | +0,1993 | [−0,3427; +0,7437] |
| RTH | +12 | 13.830 / 200 | −1,0404 | [−4,4950; +2,1398] | +1,5684 | [−0,2245; +3,5469] |
| `NEXT_RTH_OPEN` | +1 | 20.920 / 199 | −1,9312 | [−5,2033; +1,6108] | −5,6568 | [−9,7723; −1,6818] |
| `NEXT_RTH_OPEN` | +12 | 20.920 / 199 | −8,2677 | [−16,7102; −0,0893] | −3,6492 | [−14,0501; +7,7436] |
| EARNINGS | +12 | 2.276 / 181 | −7,9768 | [−22,7267; +5,7172] | −7,5220 | [−24,0655; +8,6403] |

A reação média da coorte `NEXT_RTH_OPEN` foi **+20,1686 bps**. O volume ratio mediano foi 1,6889 no conjunto agregado, 0,7632 em RTH e 2,7031 em `NEXT_RTH_OPEN`; estas medidas descrevem o contexto e não constituem, por si, um sinal executável.

### 5.2 Leitura disciplinada

1. **RTH não mostra continuação média robusta.** Os intervalos de CAR e continuação apresentados cruzam zero.
2. **O fading overnight agregado não é recomendação operacional.** A continuação negativa descreve uma associação média condicionada pelo desenho; não inclui automaticamente uma execução lucrável, capacidade, borrow ou confirmação independente.
3. **Sobreposição é decisiva.** No recorte `NON_OVERLAPPING`, os intervalos das métricas apresentadas cruzam zero e a amostra cai para 8.400 eventos.
4. **Earnings não demonstra PEAD executável.** CAR e continuação são negativos em +12, mas ambos os intervalos cruzam zero.
5. **CAR não prova causalidade.** Clusters, categorias determinísticas, notícias confundidas, latência de publicação e múltiplas comparações limitam a inferência.

## 6. Matriz de execução e gates

### 6.1 Famílias e cobertura

Foram testadas 96 configurações por família, totalizando 576 configurações únicas:

| Família | Configurações | P&L IS positivo | P&L validação positivo | Pré-filtradas | Candidatos |
|---|---:|---:|---:|---:|---:|
| `REACTION_CONTINUATION` | 96 | 0 | 14 | 0 | 0 |
| `EXTREME_REACTION_FADE` | 96 | 0 | 0 | 0 | 0 |
| `VOLUME_CONFIRMED_CONTINUATION` | 96 | 0 | 9 | 0 | 0 |
| `VWAP_REJECTION_FADE` | 96 | 11 | 13 | 0 | 0 |
| `OVERNIGHT_CONFIRMED_CONTINUATION` | 96 | 0 | 6 | 0 | 0 |
| `EARNINGS_DRIFT` | 96 | 0 | 0 | 0 | 0 |

Nas 1.152 execuções base houve zero erros, zero execuções IS sem trades e 24 execuções de validação sem trades. O P&L foi negativo em 565 execuções IS e 510 execuções de validação. P&L positivo isolado não equivale a passar os gates.

### 6.2 Gates aplicados

Uma eventual promoção destinava-se exclusivamente a **nova validação paper**, nunca a live. Os gates pré-registados foram:

- **IS:** pelo menos 30 trades, profit factor > 1,10, P&L > 0 e drawdown máximo <= 5%;
- **validação:** pelo menos 10 trades, profit factor > 1 e P&L > 0;
- stress de custos 1,5× positivo;
- pelo menos três dos quatro subperíodos IS positivos;
- concentração <= 60% por símbolo, categoria e lado;
- no máximo cinco candidatos congelados antes do TEST;
- **holdout:** pelo menos 10 trades, profit factor > 1, P&L > 0 e drawdown máximo <= 5%.

Resultado da seleção:

| Etapa | Resultado |
|---|---:|
| Configurações que cumprem os gates IS | 0 |
| Configurações que cumprem isoladamente os gates mínimos da validação | 29 |
| Configurações que cumprem IS e validação | 0 |
| Pré-filtradas | 0 |
| Candidatos congelados | 0 |
| Corridas TEST | 0 |
| Promoções | 0 |

Como não houve candidatos, o holdout não foi aberto. Não se calculou um “melhor” resultado TEST, não se ajustaram thresholds depois do P&L e não se reotimizou a grelha.

## 7. Robustez diagnóstica, sem seleção por P&L

Na ausência de candidatos, foram usadas seis **âncoras estruturais `variant=0`**, uma por família. Não são vencedoras, recomendações nem um ranking. Cada âncora foi submetida a quatro cenários em IS e validação — `COST_1_5`, `COST_2`, `LATENCY_PLUS_1_BAR` e `EXCLUDE_OVERLAPS` — e a quatro subperíodos IS. Isto acrescentou **48 execuções de cenários e 24 de subperíodos**, totalizando 72 execuções diagnósticas e zero erros.

| Âncora estrutural | P&L base IS, US$ | P&L base validação, US$ | Subperíodos IS positivos | Vizinhos com P&L IS positivo | Vizinhos com P&L validação positivo |
|---|---:|---:|---:|---:|---:|
| `REACTION_CONTINUATION` | −4.200,294692 | −1.504,005065 | 0/4 | 0/8 | 0/8 |
| `EXTREME_REACTION_FADE` | −2.383,440072 | −962,557288 | 0/4 | 0/8 | 0/8 |
| `VOLUME_CONFIRMED_CONTINUATION` | −926,151481 | −338,173618 | 0/4 | 0/8 | 0/8 |
| `VWAP_REJECTION_FADE` | −748,494355 | −275,829226 | 0/4 | 0/8 | 0/8 |
| `OVERNIGHT_CONFIRMED_CONTINUATION` | −3.373,018526 | −1.222,798212 | 0/4 | 0/8 | 0/8 |
| `EARNINGS_DRIFT` | −3.691,971180 | −1.821,832222 | 0/4 | 0/8 | 0/8 |

Todas as âncoras permaneceram negativas no IS e na validação em todos os cenários. Os oito vizinhos por âncora — 48 configurações vizinhas — foram lidos da matriz congelada, sem criar uma seleção posterior. Nenhum teve P&L positivo no IS ou na validação.

Na concentração base, cinco âncoras passaram o gate no IS; `EARNINGS_DRIFT` falhou por categoria a 100%, como seria estruturalmente expectável. Na validação, `EARNINGS_DRIFT` voltou a falhar por categoria a 100% e `OVERNIGHT_CONFIRMED_CONTINUATION` falhou por lado, com 67,693625% do P&L positivo concentrado num lado. Estas medidas estão divulgadas no workbook e não transformam as âncoras em candidatos.

O diagnóstico preserva `selectionChanged=false`, `promotionAllowed=false`, `testComputed=false` e `testOpened=false`.

## 8. Playbook pós-notícia: o que fazer agora

O playbook operacional é **observação, classificação e validação — sem entrada**. Não há nesta ronda uma regra de compra ou venda promovida.

1. **Confirmar a proveniência.** Verificar fonte, ID, versão, publicação, atualização, primeira observação e receção. Não agir sobre uma headline sem timestamp ou origem.
2. **Esperar o sinal fechado.** Em RTH, usar apenas a primeira barra completa estritamente posterior à publicação. Nunca assumir fill no preço anterior à notícia.
3. **Separar RTH de overnight.** Não aplicar a mesma reação a horários diferentes; overnight exige confirmação RTH e tem custos/riscos próprios.
4. **Descontar o mercado e medir volume.** Observar SPY, AR/CAR, reação raw e volume; categoria ou sentimento isolado não gera entrada.
5. **Procurar confundimentos.** Outra notícia na janela, edit histórico, lacuna, halt ou benchmark ausente pode invalidar a leitura.
6. **Exigir execução líquida de custos.** Spread, slippage, comissão, latência, gaps, borrow e concentração podem eliminar um padrão estatístico.
7. **Não promover sem gates independentes.** Uma futura hipótese terá de passar IS, validação, stress, subperíodos, concentração e um holdout ainda intacto; depois disso, a promoção máxima seria nova validação paper.

Leitura por família:

- **Continuação da reação:** sem evidência RTH robusta e zero configurações com P&L IS positivo; não perseguir o movimento.
- **Fade da reação extrema:** não presumir que todo o excesso reverte; a família não teve P&L positivo no IS nem na validação.
- **Continuação com volume:** volume é contexto, não confirmação suficiente; nenhuma configuração passou os gates IS.
- **Rejeição/VWAP:** existem 11 resultados IS positivos, mas nenhum cumpre o conjunto de gates; não selecionar o mais conveniente.
- **Confirmação overnight:** a média agregada de fading não autoriza short; sobreposição, borrow, gaps e execução continuam por resolver.
- **Drift de resultados:** os intervalos de CAR e continuação cruzam zero e a concentração por categoria é estrutural; não há PEAD executável demonstrado.

## 9. Ingestão operacional Alpaca e X

A área **Eventos & Notícias** apresenta fontes, últimos eventos persistidos, filtros por fonte/símbolo/categoria, pesquisa local, proveniência, qualidade e o playbook histórico. Não contém controlos de ativação nem ordens.

A ingestão normaliza por `provider + providerEventId`, preserva timestamps e hashes, faz upsert idempotente e mantém uma única origem ligada a vários símbolos. Atualizações prospetivas criam versões sem reescrever `firstSeenAt`. Remoções apagam payloads e preservam apenas evidência técnica mínima.

O conector X implementa Recent Search de sete dias, contas curadas, `lang:en -is:retweet`, paginação e lookup em lotes de 100 IDs. Edits são consolidados pela raiz de `edit_history_tweet_ids`; `withheld` e protected com evidência explícita geram supressão/tombstone. Ausência numa pesquisa não é interpretada como delete; erros ambíguos bloqueiam remoções automáticas. Conteúdo X com mais de 24 horas sem revalidação é ocultado e uma falha de revalidação mantém a supressão.

Sem credencial, o estado final verificado foi `UNCONFIGURED`, zero ativos e botão de sincronização desativado. **Nenhum post, timestamp, evento ou P&L histórico de X foi inventado.** O Recent Search não é arquivo anual; Full-Archive depende de plano e de confirmação de acesso. Texto de posts X não é exportado em CSV, XLSX ou neste relatório.

## 10. Integridade da matriz e recuperação de persistência

A escrita por `append` mostrou-se não fiável neste armazenamento para o JSONL de desenvolvimento. O primeiro ficheiro corrompido foi preservado, com SHA-256 `67b5863074253750922bc3bbfa2c7fe73447e4fc91b95a5f0db46c6dc174535f`, 170.073 bytes nulos, 527 registos válidos únicos, 37 linhas inválidas/vazias e 49 configurações ausentes.

Os registos válidos foram deduplicados e validados contra o freeze; apenas as configurações ausentes foram repetidas com o motor e a grelha inalterados. Uma segunda tentativa por `append` voltou a produzir cinco linhas inválidas e também ficou registada. A camada final substituiu esse método por escrita temporária, renomeação atómica, releitura e validação de contagens/IDs.

O resultado reconciliado contém **576 linhas e 576 configurações únicas**, zero bytes nulos e `testComputed=false` em todos os registos. O resumo final é semanticamente equivalente ao estado válido anterior: nenhuma recuperação alterou a seleção, criou candidatos ou abriu o TEST. Os ficheiros corrompidos, inputs de recuperação e logs permanecem em `verifier/runs/`.

## 11. Entregáveis reconciliados

### 11.1 CSV integral

`Resultados-eventos-pos-noticia-252-sessoes.csv`

- 1.224 linhas de dados, mais cabeçalho;
- 1.152 execuções base e 72 execuções de robustez;
- 1.224 `runId` únicos e zero erros;
- métricas, parâmetros, rejeições, concentração, segmentos e proveniência;
- nenhum texto de posts X;
- SHA-256 `e7dee6e11c11c8c1b2803fa73386fe400ae44c2c19cb0d6066b6c82de6815ed0`.

### 11.2 Workbook

`Resultados-eventos-pos-noticia-252-sessoes.xlsx`

Contém 14 folhas: `Sumário`, `Corridas`, `Configurações`, `Event Studies`, `Eventos Principais`, `Diagnóstico`, `Robustez`, `Vizinhança`, `Universo`, `Exclusões`, `Bias Log`, `Fontes e Hashes`, `Gates` e `Veredito`.

Inclui três gráficos com dados reais, fórmulas de síntese e veredito, event studies completos, métricas, concentração, vizinhança, universo, exclusões, fontes, hashes e 16 limitações. O recálculo final verificou **12.127 fórmulas**, zero caches em falta, zero erros e zero warnings. Os valores recalculados foram relidos independentemente: 576 configurações, 1.152 corridas base, 72 corridas de robustez, zero candidatos, zero pré-filtradas, 29 aprovações isoladas na validação, 480 grupos, 36.370 artigos, 45.671 clusters, 24 ações elegíveis e 252 sessões.

SHA-256 final: `1bbf93d2bd177fae967f0d4bc7b343c6b941f9a2f445cc5cbff5360600ea748a`.

## 12. Build, browser, PWA e estado da desk

### 12.1 Verificações técnicas

- Typecheck concluído sem erros.
- Testes isolados da aplicação: **32/32 ativos passaram**, dois testes opcionais skipped; seis ficheiros passaram e dois foram skipped.
- Testes causais e do motor de investigação: **18/18 passaram**.
- Build de produção concluído. Os avisos de chunk size e comentários Rollup não foram erros.
- Bundle isolado sem `node_modules`: página, manifest, service worker, dois ícones e asset principal devolveram HTTP 200; `desk.snapshot` e `news.overview` sem autenticação devolveram HTTP 401.
- PWA `standalone`, service worker ativo, fallback de navegação e bypass de `/api/` preservados.

A primeira execução agregada dos testes paper sofreu interferência de um worker de QA ainda ativo, que criou um equity snapshot adicional. O servidor foi parado e toda a suite foi repetida isoladamente; o resultado final acima é o válido. Ambas as execuções ficaram registadas.

### 12.2 QA visual final

A sessão isolada Visual QA foi autenticada através de `auth.me`, sem usar a conta pessoal. O browser validou:

- 100 eventos reais no fluxo carregado e sincronização oficial Alpaca concluída;
- X `UNCONFIGURED`, sem posts nem sincronização disponível;
- investigação **Concluída**, sem o estado “Em curso”;
- zero candidatos, holdout intacto e nenhuma entrada ativa;
- filtros, pesquisa, seis famílias, sequência causal, qualidade e proveniência;
- ausência de fixtures apresentadas como notícias reais;
- desktop e Android a 390 px, com `documentWidth=390`, `bodyWidth=390`, playbook a 390 px e cinco áreas de navegação móvel;
- zero erros de consola ou `pageerror`;
- quatro screenshots finais sem toasts, preservadas em `verifier/runs/`.

O browser foi fechado e a conta Visual QA removida. A limpeza confirmou zero utilizadores Visual QA restantes e eliminou a desk isolada por cascata.

### 12.3 Segurança e desk principal

A auditoria de segurança percorreu fonte, build, artefactos de investigação, logs e entregáveis, sem omissões por tamanho. O resultado final máquina-legível em `verifier/v7/security-scan.json` é `pass=true`: zero ocorrências das credenciais conhecidas, zero `.env` tracked ou no histórico Git, zero referências a métodos/endpoints de ordens no código-fonte e zero referências desses endpoints no bundle browser.

A leitura final, somente de dados e depois da limpeza, encontrou uma única desk:

- `PUBLIC · PAUSED · PULLBACK`;
- configuração SHA-256 `55ac061b55d83bd4b6e4aa33c354e0fb22e6e486dcb76c2962f483de9bff37b2`, igual ao baseline v6;
- estratégia inalterada e zero eventos de configuração, estratégia, reset ou ativação desde a leitura v6;
- zero ordens paper no ledger principal, zero posições abertas e 25.000 US$ em cash;
- nenhum conector externo de ordens;
- `liveTradingAllowed=false` e `realOrdersSubmitted=false`.

### 12.4 Verificação final C7

O verificador independente concluiu **19/19 checks**: `FILES_PRESENT` e C7-01…C7-18. Recalculou hashes, releu os 45.671 eventos e a matriz integral, confirmou zero candidatos/TEST fechado, validou as 1.224 linhas do CSV e as 12.127 fórmulas/caches do workbook, e reconciliou QA, PWA, segurança, desk e registos de execução. O resultado mais recente está em `verifier/v7/latest-verification.json`; as tentativas falhadas do próprio verificador e as respetivas correções de leitura também permanecem em `verifier/runs/`.

## 13. Registo de limitações e enviesamentos

1. **Edição histórica.** O histórico devolve a versão atualmente disponível; `created_at` não reconstrói a primeira versão de artigos editados. Primeira observação e versões são verificáveis apenas prospetivamente.
2. **IEX não é SIP consolidado.** Barras, spread, volume e liquidez podem diferir do mercado consolidado e de um broker real.
3. **Sobrevivência.** O universo atual não é point-in-time e não inclui delistings; a elegibilidade por cobertura não elimina este enviesamento.
4. **Sobreposição e dependência.** Notícias e ativos partilham choques; clusters e bootstrap por dia não eliminam toda a dependência. Excluir sobreposições reduz materialmente a força dos resultados.
5. **Multiplicidade.** Foram testadas 576 configurações e 480 agregações estatísticas. Resultados isolados favoráveis podem ocorrer por acaso e não foram tratados como confirmação.
6. **Holdout não aberto.** Não existe uma estimativa TEST final para estas famílias. Isto preserva a amostra, mas impede alegar validação final.
7. **Classificação.** Categorias por headline são determinísticas e auditáveis, não verdade fundamental, sentimento certo nem relevância garantida.
8. **Causalidade.** AR/CAR mede associação histórica condicionada pelo modelo; não identifica causalidade, capacidade ou lucro futuro.
9. **Custos e capacidade.** SEC/TAF, borrow, impacto, profundidade, partial fills e fila não são integralmente modelados; custos adversos não provam executabilidade.
10. **Shorts.** Não se presume borrow, locate, disponibilidade ou Reg SHO. Um fade hipotético não equivale a um short executável.
11. **Gaps e halts.** A convenção stop primeiro e fills ao open em gaps não reproduz todas as suspensões, leilões, filas ou condições extremas.
12. **Latência de publicação.** `created_at` pode não representar o instante em que uma máquina Northstar teria recebido o item; a ingestão prospetiva é necessária para medir essa latência.
13. **X indisponível.** Sem Bearer Token e sem acesso confirmado ao arquivo, X não contribui com eventos ou resultados; a cobertura histórica de notícias sociais permanece ausente.
14. **Recuperação JSONL.** A matriz exigiu reconciliação após corrupção de escrita. O ficheiro final foi validado, mas os incidentes permanecem divulgados e não devem ser ocultados.
15. **Resultados hipotéticos.** Backtests e paper não garantem resultados futuros e não constituem aconselhamento financeiro.
16. **Timestamp/fill ao open.** O timestamp `entryBarOpenTime + 1s` garante ordenação causal contabilística, mas não demonstra que o open seria obtido após esse segundo; latência e custos não eliminam o risco de fill irrealista.

## 14. Regras permanentes de segurança

- “Não pedir passwords nem seed phrases.”
- “Quando houver integração live, usar API keys restritas, sem permissão de levantamentos e, quando possível, com IP whitelist.”
- “Não guardar segredos em repositórios ou logs.”
- “Paper/testnet antes de conta real.”
- “Não executar ordens reais nesta fase.”

## 15. Conclusão

A ronda v7 concluiu a infraestrutura e a investigação previstas: ingestão versionada, conector X fail-closed, 25 snapshots, dataset causal, event studies, seis famílias, 576 configurações, robustez, exportações e integração operacional. A desk está mais capaz de **ler e auditar eventos**, mas isso não deve ser confundido com ter encontrado uma estratégia lucrável.

O resultado profissional é manter a disciplina: **nenhuma estratégia promovida, holdout intacto, X fora do backtest, desk principal pausada e live bloqueado**. A leitura pós-notícia permanece em monitorização; qualquer nova ronda terá de produzir evidência independente antes de uma eventual validação paper.
