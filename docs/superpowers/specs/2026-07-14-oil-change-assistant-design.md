# Assistente de atendimento para troca de oleo

## Contexto

Lucas opera uma troca de oleo em um posto de combustivel junto com o pai. O negocio nao possui uma fonte digital confiavel de estoque, precos ou aplicacoes de lubrificantes. O conhecimento tecnico esta principalmente na experiencia dos responsaveis, que nem sempre conseguem responder imediatamente enquanto executam os servicos.

O projeto existente recebe mensagens de texto e audio pelo WhatsApp via Twilio, mantem memoria por numero e envia as mensagens a um agente LangChain. O prompt atual e generico, e as ferramentas demonstrativas de clima e horario nao atendem ao negocio.

O primeiro objetivo e responder clientes enquanto os responsaveis estiverem ocupados. O agente deve resolver perguntas comerciais simples, coletar os dados necessarios do veiculo e consultar somente informacoes tecnicas e precos que tenham sido cadastrados e validados. A recomendacao de um lubrificante incorreto e um risco operacional; por isso, o agente nao pode completar lacunas com conhecimento probabilistico do modelo de linguagem.

## Objetivos

- Atender clientes pelo WhatsApp em portugues brasileiro, com respostas curtas, educadas e naturais.
- Responder perguntas sobre produtos, precos, formas de pagamento, endereco, horario e servicos quando os dados estiverem cadastrados.
- Identificar o veiculo com granularidade suficiente antes de recomendar lubrificante.
- Construir uma base tecnica propria, focada na frota brasileira e sustentada por fontes rastreaveis.
- Relacionar requisitos tecnicos dos motores aos produtos realmente vendidos no posto.
- Calcular orcamentos a partir de quantidade de oleo, filtro, mao de obra e regra de pagamento, sem duplicar precos por veiculo.
- Encaminhar casos ausentes ou ambiguos para confirmacao humana sem inventar respostas.
- Permitir que a cobertura tecnica cresca de forma controlada apos uma validacao inicial em pequena escala.

## Fora de escopo inicial

- Agendamento de horarios.
- Geracao de QR Code Pix ou cobranca automatica.
- Integracao com um sistema legado de estoque ou caixa.
- Compra de uma base automotiva comercial antes de validar cobertura brasileira, licenca e custo.
- Extracao automatizada em massa de seletores publicos sem permissao dos proprietarios.
- Cobertura imediata de toda a frota brasileira.
- Diagnostico mecanico, avaliacao de defeitos ou garantia de condicao do motor.
- Recomendacao baseada apenas na marca do veiculo ou na viscosidade do produto.

## Principios de seguranca

1. O manual oficial do veiculo e a fonte primaria para requisitos tecnicos.
2. Seletores oficiais de fabricantes de lubrificantes podem ser usados como conferencia manual, nao como autorizacao implicita para copiar ou redistribuir suas bases.
3. Uma viscosidade SAE, como `5W40`, nao comprova sozinha a compatibilidade. API, ACEA, aprovacao ou norma da montadora e demais condicoes registradas devem ser consideradas.
4. Marca, modelo e ano podem ser insuficientes. O agente deve solicitar motor, versao, combustivel ou outra caracteristica quando o catalogo indicar ambiguidade.
5. Toda aplicacao publicada deve apontar para a fonte, edicao e pagina que a sustentam.
6. Dados extraidos com IA permanecem como rascunho ate revisao humana.
7. Preco, estoque, desconto e prazo nunca podem ser inferidos pelo modelo.
8. Quando nao houver uma unica resposta validada, o agente deve informar que o responsavel precisa confirmar.

## Arquitetura

O sistema sera hibrido e tera quatro responsabilidades separadas:

- O agente conduz a conversa e decide quais consultas deterministicas precisa realizar.
- Um banco PostgreSQL armazena o catalogo tecnico, produtos, precos, regras comerciais e evidencias.
- Uma camada de consulta estruturada resolve compatibilidade e orcamento sem depender da interpretacao livre do modelo.
- Uma base documental recupera trechos dos manuais para apoiar pesquisa, auditoria e explicacoes, mas nao publica automaticamente uma recomendacao.

PostgreSQL sera a fonte de verdade. A recuperacao documental pode usar `pgvector` no mesmo banco quando for implementada, evitando um segundo servico de dados no inicio. A resposta comercial sempre usa registros estruturados aprovados; um trecho recuperado por RAG nao substitui essa aprovacao.

### Persistencia e migrations

O acesso aos dados da aplicacao usara Drizzle ORM com o driver `node-postgres`. O schema TypeScript sera a fonte de verdade para tabelas, constraints, indices e relacoes. `drizzle-kit generate` produz migrations SQL revisaveis e versionadas; `drizzle-kit migrate` aplica somente migrations ja geradas.

Migrations nao devem executar no startup de cada replica. Em Kubernetes, elas serao uma etapa unica e observavel anterior ao rollout, implementada futuramente como um `Job`. Mudancas de schema devem seguir expand-contract para permitir a convivencia temporaria de versoes durante rolling updates.

O PostgreSQL sera implantado futuramente com CloudNativePG em uma entrega de infraestrutura separada. A aplicacao continuara recebendo uma unica `DATABASE_URL`; no cluster, ela apontara para o servico de escrita `<cluster>-rw`, sem dependencia direta do nome de um Pod. Operador, cluster, roles, backups e recovery nao fazem parte da primeira entrega do assistente.

## Modelo de dados

### Identificacao do veiculo

O catalogo deve representar separadamente:

- fabricante;
- modelo e geracao;
- intervalo de ano-modelo;
- versao, quando relevante;
- codigo ou nome do motor;
- cilindrada;
- combustivel;
- aspiracao ou turbo;
- observacoes necessarias para desambiguacao.

Intervalos de ano devem ser usados somente quando a mesma evidencia comprovar que o requisito permaneceu igual durante todo o periodo.

### Requisito de lubrificacao

Um requisito pertence a uma combinacao validada de veiculo e motor e contem:

- viscosidades SAE permitidas e suas condicoes;
- classificacao API minima ou exata;
- classificacao ACEA, quando aplicavel;
- norma ou aprovacao da montadora;
- capacidade com troca do filtro;
- capacidade sem troca do filtro, quando documentada;
- intervalo de troca e condicoes severas, quando necessarios ao atendimento;
- observacoes do manual;
- status `draft`, `reviewed`, `published` ou `retired`.

O modelo deve aceitar mais de uma alternativa permitida pelo fabricante sem transformar alternativas condicionais em equivalentes universais.

### Produto

O produto representa o item comercial real, e nao apenas uma viscosidade:

- fabricante;
- linha e nome comercial;
- viscosidade SAE;
- classificacoes API e ACEA;
- aprovacoes e normas declaradas;
- volume da embalagem ou modalidade a granel;
- codigo interno opcional;
- status ativo ou inativo.

### Compatibilidade

A relacao entre requisito e produto e muitos-para-muitos. Um produto pode atender varios motores, e um motor pode possuir varios produtos compativeis.

A compatibilidade deve registrar o metodo de validacao e seu status. O primeiro sistema nao deve considerar um produto compativel somente porque a viscosidade coincide. A publicacao exige comparacao das especificacoes aplicaveis e revisao humana.

### Oferta e preco

O preco pertence ao produto ou ao servico, nunca ao veiculo. Cada registro contem:

- produto ou servico;
- unidade comercial, como litro a granel, embalagem ou pacote;
- valor;
- periodo de validade;
- data e autor da ultima atualizacao;
- status ativo ou inativo.

O historico nao deve ser sobrescrito. Uma atualizacao encerra a vigencia anterior e cria uma nova oferta, permitindo identificar qual preco sustentou uma resposta.

### Filtros e servicos

Filtros devem ser itens proprios relacionados as aplicacoes de veiculo compativeis. Mao de obra e pacotes tambem sao itens comerciais independentes. Um orcamento pode combinar:

- quantidade de oleo requerida;
- modalidade de venda do produto;
- filtro de oleo;
- outros filtros solicitados;
- mao de obra;
- desconto permitido para a forma de pagamento.

O calculo deve falhar de forma explicita quando faltar preco, capacidade, filtro ou regra comercial necessaria. O agente nao deve preencher a lacuna com uma estimativa.

### Evidencia

Cada requisito tecnico deve registrar:

- organizacao proprietaria da fonte;
- titulo do documento;
- URL oficial;
- edicao ou revisao;
- pagina;
- trecho relevante;
- data de acesso;
- pessoa que revisou o registro.

Os documentos originais permanecem protegidos pelos respectivos direitos. A base propria armazena os fatos necessarios e referencias para auditoria, sem presumir direito de redistribuir integralmente o conteudo.

## Fontes tecnicas

As fontes iniciais de manuais brasileiros sao:

- Volkswagen Brasil: `https://www.vw.com.br/pt/servicos-e-acessorios/servicos-e-produtos/manuais-e-garantia/manuais.html`
- Fiat Brasil: `https://servicos.fiat.com.br/manuais.html`
- Chevrolet Brasil: `https://www.chevrolet.com.br/servicos/manuais-veiculos`
- Renault Brasil: `https://www.renault.com.br/manuais.html`

Os seletores Shell LubeMatch Brasil, Lubrax, Castrol Brasil e Motul Frota Brasileira podem apoiar conferencia manual. Eles nao oferecem uma API publica documentada nem uma licenca publica confirmada para extracao e redistribuicao da base.

O Database Atlas nao sera usado como fonte inicial. Sua base Ravenol e paga, foi formada a partir de um seletor comercial, nao confirma cobertura completa da frota brasileira e recomenda produtos de uma marca que pode nao corresponder ao estoque do posto.

Olyslager, Autodata, OATS e TecRMI permanecem alternativas futuras. Antes de contratar, uma amostra deve ser comparada com o catalogo validado para medir cobertura brasileira, qualidade, granularidade, rastreabilidade e direitos de exibicao em WhatsApp.

## Processo de construcao da base

1. Escolher uma unica montadora para o piloto.
2. Selecionar uma familia de veiculo com manual oficial acessivel e variacoes conhecidas de motor e ano.
3. Baixar e identificar a edicao correta dos manuais.
4. Extrair os candidatos a requisitos e suas evidencias.
5. Revisar manualmente cada registro antes de mudar seu status para `published`.
6. Cadastrar produtos reais do posto e suas fichas tecnicas.
7. Validar as relacoes entre requisitos e produtos.
8. Executar consultas de atendimento conhecidas e casos ambiguos.
9. Medir tempo de extracao, revisao, taxa de cobertura e erros encontrados.
10. Aumentar somente o conjunto de veiculos depois que o fluxo completo estiver validado.

A priorizacao posterior deve considerar a frota circulante brasileira e as consultas reais recebidas pelo posto. Popularidade de vendas novas, isoladamente, nao representa os carros que procuram troca de oleo.

### Execucao da ingestao

O extrator sera um executavel independente do agendamento. Durante o piloto, ele rodara localmente ou como `Job` manual para uma fonte e uma familia de veiculo. Somente depois de medir duracao, falhas, custo e idempotencia ele podera ser agendado como `CronJob`.

O pipeline identifica o documento pela URL canonica e pelo hash SHA-256 do conteudo. Cada extracao tambem registra versoes do extrator, modelo e prompt. As etapas persistidas sao `discovered`, `downloaded`, `text_extracted`, `ai_completed`, `pending_review`, `approved` e `published`. A resposta bruta da IA deve ser salva antes das transformacoes posteriores para evitar repetir chamadas pagas depois de uma falha.

O `CronJob` futuro serve apenas para descobrir e preparar candidatos ate `pending_review`. Revisao humana nao bloqueia um Job: ela ocorre sobre estado persistido no PostgreSQL. Publicacao e uma operacao separada, transacional e auditada, que confirma a versao aprovada. A configuracao inicial usara `concurrencyPolicy: Forbid`, mas idempotencia continua sendo responsabilidade do banco e da aplicacao.

## Fluxo de atendimento

### Pergunta comercial direta

Quando o cliente pedir o preco de um produto identificado, o agente consulta a oferta ativa. Se houver mais de uma marca, linha ou embalagem, pede a informacao minima para desambiguar. A resposta informa unidade e condicoes sem prometer estoque quando este nao estiver cadastrado.

### Pergunta sobre o oleo correto

O agente coleta marca, modelo, ano e motor. Outros campos sao solicitados somente quando a consulta estruturada indicar mais de uma aplicacao possivel. O agente responde apenas quando existir um requisito publicado e pelo menos um produto compativel ativo.

### Pedido de orcamento

O agente identifica o veiculo, consulta capacidade, produtos compativeis, filtros e regras comerciais. O sistema calcula as alternativas completas. Se algum componente obrigatorio estiver ausente, o agente solicita confirmacao humana em vez de apresentar um total parcial como definitivo.

### Caso desconhecido ou ambiguo

O agente explica de forma curta que precisa confirmar com o responsavel. A conversa e os dados ja coletados sao registrados para evitar que Lucas repita as mesmas perguntas. O sistema nao promete prazo de resposta se nao houver um mecanismo de notificacao e acompanhamento configurado.

## Personalidade e regras do agente

- Falar em portugues brasileiro.
- Ser educado e cordial, sem parecer formal ou burocratico.
- Preferir uma ou duas mensagens curtas adequadas ao WhatsApp.
- Responder primeiro o que foi perguntado; nao transformar cada resposta em uma explicacao tecnica.
- Fazer uma pergunta por vez quando precisar identificar o veiculo.
- Nao usar jargao sem necessidade.
- Nao afirmar que um produto esta disponivel sem dado de estoque ou confirmacao equivalente.
- Nao inventar precos, descontos, horarios, enderecos, capacidades ou compatibilidades.
- Nao substituir a recomendacao do fabricante por regras genericas como "Volkswagen usa 5W40".
- Nao diagnosticar problemas mecanicos. Orientar avaliacao presencial quando houver ruido, vazamento, luz de oleo, superaquecimento ou outro sinal de risco.
- Informar que o responsavel precisa confirmar quando os dados forem insuficientes.

## Administracao de precos

A primeira carga de produtos e precos sera obtida diretamente de Lucas. Fotos de embalagens, notas de compra, lista escrita ou audio podem servir como entrada, mas os dados estruturados devem ser confirmados antes da publicacao. E necessario identificar se o valor se refere a litro a granel, embalagem, filtro, mao de obra ou pacote de troca.

A manutencao preferencial sera feita por comandos administrativos no WhatsApp, protegidos por uma lista explicita de numeros autorizados. Uma alteracao de preco deve:

1. identificar inequivocamente o produto e a unidade;
2. mostrar o valor anterior e o novo;
3. pedir confirmacao;
4. registrar autor e horario;
5. criar uma nova vigencia sem apagar o historico.

Uma planilha ou painel administrativo pode ser adicionado se o uso real demonstrar necessidade. Comandos de clientes comuns nunca podem alterar dados.

## Ferramentas do agente

As interfaces previstas sao:

- `buscar_aplicacoes_veiculo`: encontra as combinacoes possiveis e informa quais dados faltam.
- `buscar_requisito_lubrificacao`: retorna somente requisitos tecnicos publicados e suas evidencias.
- `buscar_produtos_compativeis`: retorna produtos ativos com compatibilidade aprovada.
- `consultar_preco`: retorna oferta, unidade, vigencia e horario da ultima atualizacao.
- `consultar_filtros`: encontra filtros aprovados para a aplicacao.
- `calcular_orcamento`: calcula componentes e informa lacunas sem estimar valores.
- `consultar_informacoes_estabelecimento`: retorna endereco, horario, servicos e formas de pagamento cadastrados.
- `registrar_caso_nao_resolvido`: salva contexto e dados do veiculo para acompanhamento.
- `solicitar_atendimento_humano`: notifica um responsavel quando o mecanismo estiver configurado.
- `atualizar_preco`: operacao administrativa com autorizacao e confirmacao.

As ferramentas demonstrativas de clima e horario externo existentes devem ser removidas da configuracao do agente quando a implementacao comecar.

## RAG e publicacao

O indice documental serve para localizar evidencias e apoiar a curadoria. Os resultados recuperados devem conter documento, pagina e trecho. O pipeline pode sugerir um registro estruturado, mas nao pode mudar seu status para `published` automaticamente.

Durante o atendimento, o RAG pode explicar uma recomendacao ja publicada ou ajudar a preparar um caso para revisao. Se o banco estruturado nao possuir uma aplicacao publicada, o agente nao pode converter diretamente um trecho recuperado em recomendacao ao cliente.

## Testes e avaliacoes

A estrategia de qualidade tera camadas com responsabilidades diferentes:

- Testes unitarios com Vitest cobrem schemas, repositorios, calculos, formatacao, tools e webhook sem rede.
- Testes do agent loop usam o `fakeModel()` oficial do LangChain para controlar chamadas de tools, respostas e falhas sem depender de um LLM real.
- Testes de integracao cobrem Drizzle migrations, PostgreSQL, persistencia entre turnos, gateway de IA e fronteiras externas em um job separado.
- Trajectory evals verificam tools chamadas, argumentos e passos intermediarios. A ordem so e rigida quando for requisito de seguranca.
- Code evaluators bloqueantes verificam invariantes como resposta nao vazia, ausencia de preco inventado e proibicao de tools abertas.
- LLM-as-judge avalia correcao, groundedness, clareza, cordialidade e concisao. Ele sera inicialmente uma metrica nao bloqueante ate que sua variabilidade seja medida e calibrada contra revisao humana.
- Simulacoes multi-turn verificam coleta gradual de dados, correcoes do cliente, memoria, falhas de tool e isolamento entre numeros de WhatsApp.

O LangSmith ja configurado em desenvolvimento e producao continuara sendo usado para tracing, datasets, experimentos e avaliacoes. Nao sera criado um sistema paralelo de observabilidade de agentes. O mesmo identificador de conversa deve ser enviado como `configurable.thread_id` para o checkpoint do LangGraph e como `metadata.thread_id` para agrupar runs no LangSmith.

Casos reais anonimizados e falhas confirmadas alimentam um golden dataset versionado. Thresholds, numero de repeticoes e gates de LLM-as-judge nao serao estimados antecipadamente; primeiro sera executada uma baseline para medir comportamento e variabilidade.

## Falhas e degradacao segura

- Banco indisponivel: o agente informa que nao consegue consultar naquele momento e encaminha para o responsavel.
- Preco ausente ou vencido: o agente nao apresenta valor antigo como atual.
- Aplicacao com mais de um motor possivel: o agente pede o dado que diferencia as opcoes.
- Produto sem ficha tecnica suficiente: nao aparece como compativel.
- RAG indisponivel: consultas estruturadas publicadas continuam funcionando.
- Modelo indisponivel: o webhook deve falhar de forma observavel e nao enviar uma resposta vazia ao cliente.
- Mensagem administrativa de numero nao autorizado: tratar como conversa comum e nao revelar funcoes internas.
- Alteracao administrativa ambigua: nao executar e pedir identificacao exata do item.

## Privacidade e seguranca

- Armazenar somente os dados de contato e conversa necessarios para atendimento e acompanhamento.
- Nao enviar manuais integrais ou dados pessoais ao modelo quando um trecho minimo for suficiente.
- Proteger credenciais de banco, Twilio e provedores de IA fora do repositorio.
- Autorizar comandos administrativos por identidade verificada e registrar auditoria.
- Separar operacoes de leitura comercial das operacoes de escrita administrativa.
- Nao registrar chaves Pix, credenciais ou dados de pagamento em historico de conversa sem necessidade definida.

## Validacao

A primeira entrega sera considerada valida quando demonstrar:

- respostas curtas e cordiais para as conversas de exemplo;
- coleta de marca, modelo, ano e motor sem repetir dados ja informados;
- recusa consistente em recomendar quando faltar aplicacao publicada;
- consulta de um produto e preco com unidade e vigencia corretas;
- diferenciacao entre produtos de mesma viscosidade e especificacoes diferentes;
- calculo reproduzivel de um orcamento completo cadastrado;
- falha explicita quando faltar capacidade, filtro, mao de obra ou preco;
- rastreabilidade de toda recomendacao ate documento, edicao e pagina;
- impossibilidade de um cliente comum alterar precos;
- historico preservado apos uma alteracao administrativa;
- comportamento seguro quando banco ou RAG estiver indisponivel;
- testes com variacoes de escrita, audio transcrito, ano incompleto e motor ambiguo.

## Sequencia de entrega

1. Substituir o prompt generico por um prompt de atendimento seguro e remover ferramentas demonstrativas.
2. Implementar com Drizzle o catalogo comercial, as consultas deterministicas e a importacao de dados confirmados.
3. Validar tools e orquestracao com testes unitarios, `fakeModel`, integracao e evals no LangSmith existente.
4. Cadastrar informacoes confirmadas do estabelecimento, produtos e precos iniciais.
5. Validar o atendimento simples sem recomendacao tecnica automatica.
6. Implementar em uma entrega separada o pipeline idempotente de manuais ate `pending_review`.
7. Executar o piloto de ingestao com uma montadora e uma familia de veiculo por CLI ou `Job` manual.
8. Publicar somente os registros tecnicos revisados e integrar a consulta tecnica ao agente.
9. Adicionar o indice documental para apoiar curadoria e evidencia.
10. Medir qualidade e custo do piloto antes de ampliar cobertura ou criar o `CronJob`.
11. Implementar atualizacao administrativa pelo WhatsApp depois que o formato real dos produtos e precos estiver estabilizado.
12. Planejar CloudNativePG, migrations por `Job`, backups e recovery como infraestrutura independente.

## Evolucoes futuras

- Painel administrativo se comandos pelo WhatsApp forem insuficientes.
- Controle de estoque se Lucas passar a registrar entradas e saidas.
- Integracao de filtros por catalogo licenciado.
- Agendamento quando houver processo operacional para cumprir horarios.
- Pagamento Pix somente com regras, conciliacao e tratamento seguro de dados.
- Avaliacao de Olyslager, Autodata, OATS ou TecRMI contra casos brasileiros ja validados.
- Priorizacao automatica da curadoria com base em consultas nao resolvidas.
- CloudNativePG com roles de minimo privilegio, backups e testes de recovery.
- Kubernetes `CronJob` para descoberta periodica depois da validacao do extrator manual.
