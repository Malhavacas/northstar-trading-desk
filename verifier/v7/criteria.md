# Northstar — critérios v7: investigação profissional orientada a eventos

Data de criação: 2026-11-10T22:55:00Z
Estado inicial: ACTIVE — conectores, planeamento ou uma matriz parcial não bastam para concluir.
Estado final: COMPLETE — 19/19 checks passaram, incluindo `FILES_PRESENT` e C7-01…C7-18. Veredito: `NENHUMA_ESTRATEGIA_PROMOVIDA`; holdout intacto, nenhuma ativação e live bloqueado.

## Âmbito e invariantes

- Investigação histórica e leitura operacional paper, sem ordens reais, sem ativação automática e sem alteração da estratégia/configuração ativa da desk.
- Fontes oficiais apenas: Alpaca Market Data/News e X API v2. Sem scraping, APIs alternativas silenciosas, notícias/posts inventados ou fixtures apresentados como atividade real.
- Credenciais apenas no servidor e fora do repositório, logs, DTOs, screenshots e entregáveis. X sem `X_BEARER_TOKEN` fica `UNCONFIGURED`; o seu backtest histórico fica `BLOCKED_NO_CREDENTIAL`, não simulado.
- Não pedir passwords nem seed phrases. Quando houver integração live, usar API keys restritas, sem permissão de levantamentos e, quando possível, com IP whitelist. Não guardar segredos em repositórios ou logs. Paper/testnet antes de conta real. Não executar ordens reais nesta fase.
- A reação a uma notícia é uma hipótese histórica, não uma ordem nem uma promessa. Sentimento/categoria de texto isolados nunca geram entrada.
- O histórico de notícias devolve a versão atualmente disponível. `created_at` é o timestamp de publicação usado como proxy causal; não prova o conteúdo originalmente observado após edits. `first_seen_at` e `received_at` só existem de forma verificável na ingestão prospetiva. Esta limitação é manchete.
- Preços Alpaca IEX 5Min split-adjusted, RTH 09:30–16:00 America/New_York. IEX não é SIP consolidado. Eventos fora de RTH são separados; não se inventam preços extended-hours nem fills durante halts.
- Universo atual pré-registado de 25 símbolos: SPY como benchmark e 24 ações líquidas — AAPL, MSFT, NVDA, AMZN, GOOGL, META, AMD, AVGO, JPM, XOM, TSLA, NFLX, PLTR, COIN, MSTR, HOOD, SMCI, MU, INTC, CRM, ORCL, UBER, SHOP e SOFI. Não é point-in-time, não inclui delistings e mantém enviesamento de sobrevivência.
- A inclusão depende exclusivamente de dados/qualidade/cobertura: pelo menos 150 sessões limpas, 10.000 barras e 20 eventos empresariais elegíveis no desenvolvimento. Nenhum ativo é escolhido ou excluído por P&L.
- Capital hipotético de 25.000 US$ por configuração independente. Custos base: 0,0035 US$/ação, mínimo 0,35 US$/ordem, spread 2 bps e slippage 1 bp; stress 1,5× e 2×.
- Split cronológico por sessões 60% IS, 20% validação e 20% teste final. IS seleciona; validação filtra; o teste final permanece intacto até congelar dataset, motores, universo elegível, grelha, gates e candidatos. Não reordenar nem reotimizar após abrir o teste.

## Desenho causal pré-registado

1. Normalizar cada item por `provider + providerEventId`, guardar `created_at`, `updated_at`, `first_seen_at`, `received_at`, símbolos, origem, URL, hash do payload e versão. Deduplicar o mesmo artigo em vários símbolos sem apagar a ligação a cada símbolo.
2. Classificação determinística e auditável por headline: EARNINGS, GUIDANCE, ANALYST, M_AND_A, CAPITAL_RAISE, LEGAL_REGULATORY, PRODUCT_CONTRACT, MACRO e OTHER. Regras e dicionário congelados antes do teste. A classificação não representa verdade fundamental nem sentimento certo.
3. Evento executável RTH: publicação até 14:45 ET, primeira barra completa cujo fecho seja estritamente posterior à publicação; direção da reação só usa essa barra fechada; decisão no fecho e entrada no open da barra seguinte. Latência mínima efetiva de uma barra de sinal mais uma de entrada; nunca entrar no preço anterior à notícia.
4. Evento overnight/extended: coorte separada `NEXT_RTH_OPEN`; sinal apenas com gap/reação observável no open e confirmação da primeira barra RTH, entrada no open seguinte. Não misturar com reação imediata RTH.
5. Deduplicação operacional: um cluster por símbolo/janela de 30 minutos/headline normalizada; uma posição por símbolo; cooldown de 60 minutos; eventos sobrepostos são sinalizados e a robustez exclui clusters com outra notícia na janela de saída.
6. Event study: market model por símbolo estimado apenas em barras anteriores, com 60 barras de estimação e gap mínimo de 12 barras quando disponíveis; SPY como benchmark. AR = retorno do ativo − alfa − beta × retorno SPY; CAR agregado em +1/+3/+6/+12 barras pós-sinal. Robustez com market-adjusted (alfa=0, beta=1), janelas alternativas e clusters sem sobreposição. Reportar N, mediana, média, dispersão, IC bootstrap por dia e limitações de dependência; não alegar causalidade.
7. Seis famílias de execução pós-notícia: continuação da primeira reação; fade da primeira reação extrema; continuação confirmada por volume; fade com rejeição/VWAP; continuação overnight após confirmação RTH; drift de earnings com saída temporal alargada. Variações apenas de thresholds, horizonte, stop/target e filtros pré-registados.
8. Saídas por stop/target/tempo/EOD conforme a família; stop primeiro em barras ambíguas; long/short hipotético com limitações Reg SHO/borrow/locate; sem partial fills/impacto oculto. Bloquear barras/dias com lacunas e qualquer janela sem benchmark válido.

## Critérios de aceitação

- [x] **C7-01 — Fontes e capacidades verificadas.** Registar documentação oficial Alpaca/X e metodologia de event studies; probe Alpaca real read-only com HTTP, schema, paginação e payload hash; limites de IEX/histórico/X explícitos.
- [x] **C7-02 — Snapshot de preços e notícias reproduzível.** Guardar os 25 símbolos pré-registados, reutilizando os 10 snapshots v6 compatíveis e acrescentando 14 ações novas + notícias para todos; hashes individuais/agregados, intervalos, paginação e zero substituição silenciosa.
- [x] **C7-03 — Ingestão profissional e versionada.** Implementar modelo de eventos e versões, timestamps distintos, proveniência, hashes, deduplicação, upsert idempotente e política de edits/deletes; testes cobrem atualização não retroativa, duplicados multi-símbolo e remoção.
- [x] **C7-04 — Conector oficial X fail-closed.** Implementar Recent Search `/2/tweets/search/recent`, campos/expansões e paginação com Bearer apenas no servidor; contas curadas, exclusão de retweets, limites e erro seguro. Sem credencial: `UNCONFIGURED`; sem probe real nem resultado histórico X. Recent Search não é arquivo para backtest anual.
- [x] **C7-05 — Compliance X.** Persistir apenas o necessário, revalidar conteúdo antes de apresentação, marcar/suprimir edits/deletes/protected/withheld, prazo de remoção de 24 horas após pedido e nunca exportar texto de posts em CSV/XLSX/relatórios. Sem scraping, iframes de conteúdo X, publicações ou ações na conta.
- [x] **C7-06 — Qualidade e universo elegível.** Validar OHLCV, duplicados, monotonia, lacunas RTH, barras em formação, calendário e cobertura de notícias. Excluir dias com lacunas por símbolo e símbolos abaixo dos mínimos sem usar P&L; reconciliar contagens e motivos.
- [x] **C7-07 — Dataset causal de eventos.** Criar clusters por ativo, categoria, sessão RTH/extended/overnight, primeira barra observável, barra de decisão e barra de entrada; provar que `publishedAt <= signalClose < entryTime` e que nenhuma feature usa o futuro.
- [x] **C7-08 — Testes do motor.** Cobrir evento antes/depois do fecho, no limite da barra, overnight, updates, duplicados, clusters, sobreposição, benchmark em falta, halts/lacunas, long/short, stops ambíguos, EOD/time exits, custos e determinismo.
- [x] **C7-09 — Event studies antes de estratégias.** Produzir AR/CAR e reação/fading/volume por categoria e coorte, com estimation window causal, benchmark SPY, N, dispersão e bootstrap por dia; benchmarks/janelas alternativas e eventos confundidos visíveis.
- [x] **C7-10 — Matriz de execução alargada.** Executar pelo menos 480 configurações únicas distribuídas pelas seis famílias e todas as amostras necessárias; persistir erros, zero trades e negativos. Pelo menos 14 ações novas têm de ser avaliadas antes da elegibilidade.
- [x] **C7-11 — Seleção e teste independente.** Fixar grelha/gates antes das corridas; reproduzir ranking apenas com IS; validação e custos 1,5× filtram; congelar no máximo cinco candidatos antes do holdout e abrir o teste uma única vez.
- [x] **C7-12 — Robustez.** Custos 1,5×/2×, latência adicional de uma barra, exclusão de eventos sobrepostos, quatro subperíodos, concentração por ativo/categoria/lado, vizinhança de parâmetros e coortes RTH/overnight; divulgar tudo.
- [x] **C7-13 — Veredito disciplinado.** Promoção apenas para nova validação paper se IS >=30 trades/PF>1,10/P&L>0/DD<=5%, validação >=10 trades/PF>1/P&L>0, stress 1,5× positivo, >=3/4 subperíodos positivos e concentração <=60%; holdout >=10 trades/PF>1/P&L>0/DD<=5%. Zero promoções é válido; nunca ativar entradas nem live.
- [x] **C7-14 — Integração operacional na desk.** Nova área Eventos/Notícias com estado real das fontes, últimos eventos persistidos, timestamps, proveniência, qualidade e playbook histórico; X `UNCONFIGURED` quando aplicável. Sem controlos mortos, sem ativação e sem apresentar fixtures como reais.
- [x] **C7-15 — Entregáveis.** CSV integral de configurações/segmentos, workbook com event studies/métricas/bias log/fontes e relatório com playbook pós-notícia, limitações, candidatos e veredito. Exportações não incluem texto de posts X.
- [x] **C7-16 — Segurança e estado.** Zero credenciais em entregáveis/browser/repositório/logs; zero métodos/endpoints de ordens introduzidos no código-fonte; desk `PUBLIC · PAUSED`, configuração inalterada, live bloqueado e nenhuma ordem real.
- [x] **C7-17 — Build e QA.** Typecheck, testes, build e bundle isolado; browser desktop e Android 390 px sem overflow, navegação/estados/fontes verificados, conta Visual QA isolada removida e PWA preservada.
- [x] **C7-18 — Verificação persistente.** Cada execução acrescenta comando, exit code, checks e valores em `verifier/runs/`, incluindo falhas; `verifier/README.md` permanece append-only. Concluir apenas com todos os checks e entregáveis reconciliados.

## Nota sobre X e investigação histórica

O Recent Search cobre apenas os últimos sete dias. O Full-Archive existe, mas o acesso depende do plano e não pode ser presumido. Sem Bearer Token e sem confirmação de acesso ao arquivo, a contribuição de X fica limitada ao conector/testes de contrato e ao estado operacional desconfigurado. Nenhum resultado de rentabilidade pode ser atribuído a X nesta ronda sem dados reais elegíveis.
