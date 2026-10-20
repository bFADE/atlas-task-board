# Atlas v2: relatório da Fase 1 (modelo de dados, etapas e compromissos)

**Data:** 20/10/2026 · **Branch:** `v2-gamification` (a `main` não foi tocada) · **Base:** `be06357`

**Resultado:** as 7 etapas foram concluídas. Os testes automatizados passam (23/23), `tsc` e `build` estão OK, `npm audit` encontra 0 vulnerabilidades e a regressão no navegador passou em 30/30. Nada de XP, níveis, missões ou visual de jogo foi implementado, como pedido.

**Seu banco real (`data/atlas.db`) não foi alterado nesta fase:** continua com `user_version` 0, 6 tabelas e os mesmos arquivos. A migração foi testada em cópias. Ela roda de verdade na primeira vez que você abrir o app nesta branch e grava um backup antes (ver "Como usar").

## Commits

| Commit | Etapa |
|---|---|
| `e8c9088` | GAME_DESIGN.md adicionado à branch |
| `6e679ad` | **P1-1** Migração das tabelas do jogo (`user_version` 1) com backup automático |
| `fd2d55d` | **P1-2** `game_config` com todos os números do documento |
| `75d76e3` | **P1-3** Atributos das categorias (tela nas configurações) |
| `b75549b` | **P1-4** Etapas (checklist) com barra de progresso |
| `b3df891` | **P1-5** Compromissos: CRUD na API + lista simples |
| `f5fc492` | **P1-6** Testes automatizados (migração, API, i18n) |
| (este) | **P1-7** PHASE1_REPORT.md |

## O que foi feito

### 1. Migração segura
- `server/game/schema.js` cria as 13 tabelas pedidas: `task_stages`, `appointments`, `xp_events` (com `key` UNIQUE), `category_attributes`, `quest_templates`, `daily_quests`, `penalties`, `rest_days`, `vacation_periods`, `debuffs`, `trials`, `game_config` e `player_profile`. Os valores fixos (atributos, status, ranks, tipos de debuff) são protegidos por `CHECK`. As chaves estrangeiras usam `CASCADE` ou `SET NULL`, conforme o caso.
- As migrações são versionadas com `PRAGMA user_version`. Cada uma roda numa transação e **só adiciona** (nunca apaga nem reescreve dados).
- **Backup automático:** antes de migrar um banco que já existe, uma cópia consistente é gravada em `data/backups/atlas-before-v1-<data>.db`. Ela é feita com `VACUUM INTO`, que inclui o conteúdo do WAL. Um banco novo não precisa de backup.
- `ATLAS_DB_PATH` permite apontar o app (e os testes) para outro arquivo de banco.
- **Testado em cópia do banco atual:** fiz um snapshot somente leitura de `data/atlas.db`, migrei o snapshot e comparei: todas as linhas v1 ficaram idênticas, `integrity_check` = ok, `foreign_key_check` vazio e o backup tem os dados originais. O mesmo teste roda com um banco criado pelo **código v1 da `main`** (com tarefas, vínculos e sessões). Abrir o app de novo não faz nada (sem segundo backup).

### 2. `game_config`
- `server/game/config.js` tem **70 chaves**, cada uma com a seção do documento de onde vem: XP por prioridade, etapas, Pomodoro (valor e limite diário), compromisso, divisão entre atributos (100%/50%, WILL 25%), modificadores (adiantado, atrasado, anti-farm), soft cap, curvas de nível e de atributo, níveis dos ranks, limite do dia (03:00), metas e recompensas das missões, Daily Clear, penalidades, Fatigue, Rusty, descanso, escudo, trials D/C/B e limites dos buffs.
- O seed roda a cada início com *upsert*: chaves novas aparecem sozinhas, `default_value` é atualizado e **valores que você editou são mantidos**. `GET /api/game/config` serve para leitura (a edição vem nas fases do motor).

### 3. Atributos das categorias
- API: `GET /api/category-attributes`, `PUT` e `DELETE /api/category-attributes/:categoryId`, validados (10 chaves, secundário ≠ principal, categoria precisa existir).
- **Configurações → Atributos das categorias:** uma tabela com principal (100%) e secundário opcional (50%). O secundário fica desativado sem principal e não oferece o mesmo atributo do principal. Os rótulos dos 10 atributos estão em PT e EN.
- As sugestões da seção 2 do design são aplicadas pelo nome da categoria (sem diferenciar maiúsculas) em três momentos: na migração, nas categorias do primeiro uso e quando você cria uma categoria sugerida (por exemplo, "Gym" → STR/VIT).

### 4. Etapas
- API: `POST /api/tasks/:id/stages`, `PATCH` e `DELETE /api/stages/:id`, `PUT /api/tasks/:id/stages/order` (a lista precisa conter todas as etapas exatamente uma vez). Também é possível enviar `stages: [títulos]` no `POST /api/tasks`. Cada tarefa traz suas etapas em ordem.
- Validação: título de 1 a 200 caracteres, no máximo 100 etapas por tarefa, `done` booleano. Todos os erros estão traduzidos.
- **No modal da tarefa:** adicionar, renomear direto na lista (Esc desfaz), marcar, excluir e reordenar arrastando a alça ⠿ (ou pelo teclado).
- **Barra de progresso** (feitas/total) no card do Quadro e embaixo do nome nas duas tabelas.

### 5. Compromissos
- API: `GET /api/appointments` (com filtro opcional `from`/`to`), `GET`, `POST`, `PATCH` e `DELETE /api/appointments/:id`.
- Validação:
  - título de 1 a 200 caracteres;
  - categoria existente ou nula;
  - início e fim com data e hora reais;
  - **fim > início**, inclusive num PATCH que muda só um dos dois (comparado com o que está salvo);
  - local até 200 caracteres e notas até 50.000;
  - status `planned` / `attended` / `missed`.
- **Configurações → Compromissos (prévia):** lista com criar, editar, status direto na linha e excluir com confirmação. Usa os mesmos campos de data e hora do app, então segue o idioma. A visão no calendário fica para a fase 2.

### 6. Testes automatizados (`npm test`, 23 testes, executor nativo do Node)
- `tests/migration.test.mjs` (6): snapshot do banco atual, banco v1 da `main`, idempotência, banco novo, restrições do schema, seed do `game_config` mantendo edições.
- `tests/api.test.mjs` (13): sobe a API de verdade num banco temporário. Cobre `game_config`, atributos, etapas e compromissos (incluindo 16 entradas inválidas), além do CRUD de tarefas v1 e da proteção de Host.
- `tests/i18n.test.mjs` (4): paridade de chaves `en`/`pt` (**250 = 250**), toda chave usada em `t()` existe, todo código de erro da API está traduzido, e atributos e status têm rótulo.

## Decisões (onde o documento era ambíguo)

1. **Tabelas:** criei as 13 da lista do pedido. `streak_state` será **calculado** a partir dos eventos (o documento permite). `badge_defs`, `badge_unlocks` e `titles` ficam para a fase 4b, junto com as medalhas.
2. **`xp_events` com um atributo por linha:** mantive exatamente as colunas do documento. Uma conclusão que alimenta vários atributos (principal, secundário e WILL) vai virar várias linhas com chaves derivadas, cada uma idempotente. Os detalhes ficam para a fase 3.
3. **Metas das missões:** o documento diz que ficam em `quest_templates` e o pedido diz `game_config`. Para ter um único lugar para os números, as **metas e recompensas ficam em `game_config`** (`quest.<chave>.*`), e `quest_templates` guarda a estrutura: métrica, atributo e se entra no Daily Clear.
4. **Formato dos números:** todos os valores são numéricos (`REAL`). O limite do dia é guardado em minutos (180 = 03:00) e as proporções como frações (0,5 = 50%).
5. **Valores que o documento não define:**
   - "pequeno XP de MIND" no dia de descanso: `rest.mind_xp = 10`;
   - "equilíbrio entre atributos" do trial B: `trial.B.balance_min_attribute_level = 3` (valor provisório);
   - trials A e S: sem valores (o documento diz "a definir").
   Todos podem ser editados no banco.
6. **Limites das medalhas e buffs dos títulos** não estão no `game_config`: são dados de `badge_defs` e `titles` (fase 4b). Já estão lá os **limites gerais dos buffs** (ouro +10% até o teto de +25%).
7. **Datas dos compromissos:** guardadas como horário local `YYYY-MM-DDTHH:MM` sem fuso, igual às tarefas. O fim precisa ser **estritamente** depois do início. O filtro `from`/`to` é pelo dia de início.
8. **Etapas no modal:** numa tarefa existente, salvam na hora (como as edições direto na tabela), então não contam como "alterações não salvas". Numa tarefa nova, ficam no formulário e são criadas junto com a tarefa. Mexer nas etapas de uma tarefa de exemplo faz ela virar sua (mesma regra do H4).
9. **Lista de compromissos** ficou nas Configurações, porque é provisória. Na fase 2 o calendário substitui.
10. **Dias do jogo:** as colunas `day` vão guardar o "dia do jogo", que começa às 03:00. Esse cálculo é da fase 3.

## Problemas encontrados

- **Apaguei o `dist/` sem querer, e o seu app em uso (`npm start` na porta 3001) depende dele.** Isso aconteceu numa checagem de build. Builds anteriores desta sessão também já tinham colocado ali o frontend v2, que não combina com o servidor v1. **Corrigido:** reconstruí o `dist/` a partir da `main` (numa worktree separada) e confirmei no navegador que o app em 3001 carrega normalmente. A partir daí, todos os builds de checagem foram para uma pasta temporária.
- **Bug encontrado nos testes, antes do commit:** apertar Esc no título de uma etapa salvava o texto em vez de desfazer. Corrigido no P1-4.
- **Problemas do ambiente de teste (não do app):**
  - o glob do `npm test` (o commit foi corrigido com `--amend` antes de seguir);
  - o `fetch` do Node ignora um cabeçalho `Host` personalizado (o teste passou a usar `node:http`);
  - erros de hot reload do Vite depois de editar arquivos com o app aberto (somem ao reiniciar; o build de produção não é afetado).
- **Observações que já existiam antes desta fase (não alterei):**
  - em Configurações → Quadro, o texto ainda diz "arraste o cabeçalho da coluna", mas desde o M1 se arrasta pela alça ⠿;
  - mover colunas pelo teclado não funciona (registrado no FIXES.md).

## Resultado dos testes

| Verificação | Resultado |
|---|---|
| `npm test` (migração 6 + API 13 + i18n 4) | **23/23** |
| `npx tsc --noEmit` | OK |
| `npm run build` (em pasta temporária) | OK |
| `npm audit` | **0 vulnerabilidades** |
| Navegador: atributos (EN, PT) | definir, trocar, limpar, sugestão automática para "Gym", exclusão em cascata; sem erros no console |
| Navegador: etapas (EN, PT) | criar com a tarefa, marcar, renomear, Esc desfaz, excluir, adicionar, arrastar; barra no card e na tabela; pergunta antes de descartar etapas de uma tarefa nova |
| Navegador: compromissos (EN, PT) | criar, status direto na linha, editar, erro "fim antes do início" sem perder o formulário, excluir com confirmação; datas e horas no formato do idioma |
| Regressão v1 (EN claro e PT escuro) | **30/30**: Quadro (arrastar para área vazia), modal, arrastar no calendário, colunas das tabelas, status direto na linha, Visão padrão, Pomodoro, 375 px sem rolagem horizontal, sem erros no console |
| Banco real `data/atlas.db` | intocado (`user_version` 0) |

## Como usar e testar

```bash
git checkout v2-gamification
npm test          # 23 testes (não mexem no data/atlas.db)
npm run dev       # na 1ª vez, migra data/atlas.db e grava o backup em data/backups/
```

Para experimentar sem tocar no seu banco:

```bash
ATLAS_DB_PATH=/tmp/atlas-teste.db npm run dev
```

Se quiser voltar atrás depois de migrar: pare o app e copie o arquivo de `data/backups/atlas-before-v1-*.db` para `data/atlas.db`. A v1 (`main`) também funciona com o banco migrado, porque ela simplesmente ignora as tabelas novas.

## Próxima fase

Fase 2: calendário com compromissos (visões semanal e diária), substituindo a lista provisória das Configurações.
