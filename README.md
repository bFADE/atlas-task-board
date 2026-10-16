# Atlas

**[Português](#português) · [English](#english)**

---

## Português

Gerenciador de tarefas pessoal estilo Trello que roda 100% no seu computador (sem login, sem nuvem). Os dados ficam em `data/tasks.db` (SQLite).

### Instalação

Requer **Node.js 20+** (testado com Node 22).

```bash
cd atlas
npm install
npm run dev
```

Abra **http://localhost:5173**. O `npm run dev` sobe o frontend (Vite, porta 5173) e a API (Express, porta 3001) juntos.

**Uso diário (recomendado):** o modo `dev` é para desenvolvimento. Para usar o app no dia a dia, gere a versão de produção e rode só o servidor local:

```bash
npm run build
npm start
```

Depois abra **http://localhost:3001**. Os dois servidores só aceitam conexões da própria máquina (`localhost` / `127.0.0.1`).

Na primeira execução o banco é criado com as categorias iniciais e 10 tarefas de exemplo.

### Uso

- **Visões:** 🗂️ Quadro (Kanban com arrastar e soltar), 📅 Calendário (mês/semana), 📋 Todas as tarefas ativas e Visão padrão.
- **Tarefas:** clique em um card ou linha para editar; "+ Nova tarefa" no topo ou em cada coluna; clique em um dia vazio do calendário para criar com aquele prazo.
- **Arrastar:** no Quadro, muda o Status e a ordem; no Calendário, muda o prazo.
- **Ordem das colunas do Quadro:** arraste o cabeçalho de uma coluna para a posição desejada (a ordem fica salva; ⚙️ restaura a padrão).
- **Exclusão em lote (Visão padrão):** marque as caixinhas ao lado do Status (Shift+clique seleciona um intervalo), `⌘A` / `Ctrl+A` seleciona todas, e `Delete` / `Backspace` ou o botão 🗑 exclui as selecionadas.
- **Busca e filtros** (Categoria, Prioridade, Status) valem para todas as visões.
- **Idioma:** botão `PT | EN` no cabeçalho. **Tema:** 🌙/☀️. **Configurações:** ⚙️ (durações do Pomodoro, categorias e dados de exemplo).
- **Pomodoro:** botão 🍅 no canto inferior direito.

### Dados de exemplo

- Pela interface: ⚙️ → *Remover dados de exemplo* / *Restaurar dados de exemplo*.
- Pelo terminal: `npm run clear-sample` (remove) ou `npm run seed` (insere de novo).

Só as tarefas de exemplo são afetadas; as suas tarefas e categorias ficam intactas.

### Traduções

Os textos ficam em `src/locales/pt.json` e `src/locales/en.json`. Status e Prioridade são salvos no banco como chaves fixas (`backlog`, `todo`, `in_progress`, `blocked`, `done` / `high`, `medium`, `low`), então trocar o idioma não afeta os dados.

### Backup

Copie a pasta `data/` (com o app parado) para fazer backup.

---

## English

A Trello-style personal task manager that runs 100% on your computer (no login, no cloud). Data is stored in `data/tasks.db` (SQLite).

### Install

Requires **Node.js 20+** (tested with Node 22).

```bash
cd atlas
npm install
npm run dev
```

Open **http://localhost:5173**. `npm run dev` starts the frontend (Vite, port 5173) and the API (Express, port 3001) together.

**Daily use (recommended):** `dev` mode is meant for development. For everyday use, build once and run only the local server:

```bash
npm run build
npm start
```

Then open **http://localhost:3001**. Both servers only accept connections from this machine (`localhost` / `127.0.0.1`).

On first run the database is created with the starting categories and 10 sample tasks.

### Usage

- **Views:** 🗂️ Board (drag-and-drop Kanban), 📅 Calendar (month/week), 📋 All Active Tasks and Default view.
- **Tasks:** click a card or row to edit; "+ New task" at the top or in any column; click an empty calendar day to create a task due that day.
- **Drag:** on the Board it changes Status and order; on the Calendar it changes the Due Date.
- **Board column order:** drag a column header to wherever you want it (the order is saved; ⚙️ restores the default).
- **Bulk delete (Default view):** tick the checkboxes next to Status (Shift+click selects a range), `⌘A` / `Ctrl+A` selects all, and `Delete` / `Backspace` or the 🗑 button deletes the selection.
- **Search and filters** (Category, Priority, Status) apply to every view.
- **Language:** `PT | EN` toggle in the header. **Theme:** 🌙/☀️. **Settings:** ⚙️ (Pomodoro durations, categories and sample data).
- **Pomodoro:** 🍅 button in the bottom-right corner.

### Sample data

- In the app: ⚙️ → *Remove sample data* / *Restore sample data*.
- From the terminal: `npm run clear-sample` (remove) or `npm run seed` (insert again).

Only the sample tasks are affected; your own tasks and categories are kept.

### Translations

UI text lives in `src/locales/en.json` and `src/locales/pt.json`. Status and Priority are stored as fixed keys (`backlog`, `todo`, `in_progress`, `blocked`, `done` / `high`, `medium`, `low`), so switching language never affects your data.

### Backup

Copy the `data/` folder (while the app is stopped) to back up your tasks.
