# Atlas — Versão 1

Resumo do que foi construído e alterado na primeira versão do Atlas, um gerenciador de tarefas pessoal estilo Trello que roda 100% local (sem login, sem nuvem).

## Como rodar

```bash
cd "vsc cpp/atlas"
npm run dev
```

Abra **http://localhost:5173**. O comando sobe o frontend (Vite, porta 5173) e a API (Express, porta 3001) juntos.

- O Node.js 22 LTS foi instalado em `~/.local/node`, e o `~/.zprofile` recebeu uma linha adicionando-o ao PATH.
- Dados de exemplo: ⚙️ → *Remover / Restaurar dados de exemplo*, ou `npm run clear-sample` / `npm run seed`.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Node + Express |
| Banco | SQLite (better-sqlite3), arquivo `data/tasks.db` |
| Drag and drop | @dnd-kit |
| Idiomas | react-i18next (`src/locales/pt.json` e `en.json`) |

## Etapa 1 — App inicial

### Modelo de dados
- **Tarefa:** Nome (obrigatório), Status, Prioridade, Prazo (data + horário opcional), Categorias (multi-seleção), Notas e Criada em (automática).
- Status e Prioridade ficam no banco como chaves fixas (`backlog`, `todo`, `in_progress`, `blocked`, `done` / `high`, `medium`, `low`). Por isso, trocar o idioma não afeta os dados.
- **Categorias iniciais:** Comp and Rhetoric II, Intro CIS, Physical Science I, psychology. Dá para criar, renomear, excluir e escolher a cor de cada uma pela interface.

### Views
- **🗂️ Quadro:** Kanban com uma coluna por Status. Arrastar um card muda o Status, e arrastar dentro da coluna muda a ordem, que fica salva. Cada coluna tem "+ Nova tarefa". Cards atrasados ficam em vermelho.
- **📅 Calendário:** visões mensal e semanal. Arrastar uma tarefa muda o prazo. Clicar num dia vazio cria uma tarefa com aquela data. Tem botões Hoje / Anterior / Próximo e destaque do dia atual.
- **📋 Todas as tarefas ativas:** tabela sem as tarefas concluídas, ordenada por prazo crescente.
- **Visão padrão:** todas as tarefas, ordenadas por nome decrescente.
- Nas tabelas, os cabeçalhos são clicáveis para ordenar, e Status e Prioridade podem ser editados direto na linha.

### Recursos gerais
- Modal de criação e edição com todos os campos. Exclusão sempre pede confirmação.
- Busca e filtros (Categoria, Prioridade, Status) valem para todas as views.
- Tema claro e escuro, visual inspirado no Notion, layout responsivo.
- **Idiomas PT / EN:** a troca é instantânea, fica salva no navegador e, na primeira visita, segue o idioma do navegador. Datas aparecem como DD/MM/AAAA em PT e MM/DD/YYYY em EN. A semana começa na segunda em PT e no domingo em EN.

### Pomodoro (botão 🍅, disponível em qualquer view)
- Modos Pomodoro (25), Pausa curta (5), Pausa longa (15) e Personalizado. As durações são editáveis em ⚙️.
- Controles Iniciar, Pausar, Reiniciar e Pular. O tempo restante aparece no título da aba.
- O timer é calculado pelo horário de término, então continua preciso com a aba em segundo plano.
- Ciclo automático opcional: 4 pomodoros e depois uma pausa longa.
- Ao terminar, toca um som (Web Audio) e mostra uma notificação do navegador no idioma escolhido.
- Dá para vincular o pomodoro a uma tarefa. As sessões ficam salvas no SQLite, e o painel mostra um resumo do dia.

### Dados de exemplo
10 tarefas entre 16/10 e 10/11/2026, com status, prioridades e categorias variados. Uma delas vence em 16/10 às 9:00 para mostrar o destaque de atrasada.

## Etapa 2 — Atualização "Atlas"

1. **Identidade:** o app passou a se chamar **Atlas**, com logo de globo (cabeçalho e favicon). Pasta, `package.json`, título da aba, README e textos foram atualizados.
2. **Ordem das colunas do Quadro:** basta arrastar o cabeçalho de uma coluna. A ordem fica salva no banco, e ⚙️ tem a opção de voltar à ordem padrão.
3. **Colunas das tabelas:** nova ordem Status → Prioridade → Nome → Notas → Prazo.
4. **Seleção e exclusão em lote (Visão padrão):**
   - Caixinha em cada linha e no cabeçalho. Shift+clique seleciona um intervalo.
   - `⌘A` / `Ctrl+A` seleciona todas as linhas visíveis.
   - Para excluir, use o botão 🗑 "Excluir selecionadas" ou as teclas `Delete` / `Backspace`, sempre com confirmação. `Esc` limpa a seleção.

## Testes

Todos os testes rodaram no Chrome, nos dois idiomas e nos dois temas, sem erros no console:
- Arrastar cards e colunas no Quadro, e tarefas no Calendário.
- Criação, edição, exclusão individual e em lote.
- Filtros, categorias, ordenação e atalhos de teclado.
- Um ciclo completo de Pomodoro, com a sessão registrada no banco.

**Não verificado:** o som e a notificação do Pomodoro de fato aparecendo na tela, porque os testes rodaram sem janela visível.

## Pendências para decidir

- **Coluna Categoria nas tabelas:** foi removida para seguir a sequência pedida. Pode voltar, no final da tabela.
- **Arquivo do banco:** continua `data/tasks.db`. Pode ser renomeado para `data/atlas.db`.
- **Campo de horário:** usa o formato do sistema operacional. As datas seguem o idioma do app.
