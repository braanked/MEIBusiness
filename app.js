const $ = s => document.querySelector(s),
    money = FinanceCore.money,
    esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    } [c]));
const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    },
    currentMonth = today().slice(0, 7),
    categories = ['Moradia', 'Alimentação', 'Transporte', 'Compras', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'],
    colors = ['#0071e3', '#619ee5', '#9fbfe6', '#c1d4eb', '#dce6f2', '#7294bd', '#bac9db', '#537fae', '#d0d9e5'],
    icons = ['⌂', '♧', '↗', '◇', '☼', '♡', '▤', '↓', '·'];
const empty = () => ({
    transactions: [],
    budgets: [],
    goals: []
});
const shifted = (m, n) => {
    const d = new Date(m + '-15T12:00:00');
    d.setMonth(d.getMonth() + n);
    return `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}`
};

function seed() {
    const d = empty();
    for (let k = -5; k <= 0; k++) {
        const m = shifted(currentMonth, k);
        const rows = [
            ['Salário', 8500, 'Salário', 'income', 5],
            ['Projeto freelance', 1250 + (k + 5) * 100, 'Outros', 'income', 12],
            ['Aluguel', 2100, 'Moradia', 'expense', 8],
            ['Supermercado', 680 + (k + 5) * 25, 'Alimentação', 'expense', 15],
            ['Café da manhã', 38.5, 'Alimentação', 'expense', 18],
            ['Transporte por aplicativo', 45.9, 'Transporte', 'expense', 19],
            ['Cinema', 72, 'Lazer', 'expense', 17],
            ['Livraria', 149.9, 'Compras', 'expense', 16],
            ['Plano de saúde', 420, 'Saúde', 'expense', 10],
            ['Restaurante', 186, 'Alimentação', 'expense', 13],
            ['Internet', 119.9, 'Moradia', 'expense', 11]
        ];
        rows.forEach((r, i) => d.transactions.push({
            id: crypto.randomUUID(),
            description: r[0],
            amount: r[1],
            category: r[2],
            type: r[3],
            date: `${m}-${String(r[4]).padStart(2,'0')}`,
            account: i < 3 ? 'Conta principal' : 'Cartão de crédito'
        }));
    }
    d.budgets = [{
        id: crypto.randomUUID(),
        category: 'Alimentação',
        amount: 1200
    }, {
        id: crypto.randomUUID(),
        category: 'Moradia',
        amount: 2500
    }, {
        id: crypto.randomUUID(),
        category: 'Lazer',
        amount: 400
    }, {
        id: crypto.randomUUID(),
        category: 'Compras',
        amount: 140
    }];
    d.goals = [{
        id: crypto.randomUUID(),
        name: 'Reserva de emergência',
        target: 30000,
        saved: 12400,
        date: shifted(currentMonth, 12) + '-20'
    }, {
        id: crypto.randomUUID(),
        name: 'Próxima viagem',
        target: 12000,
        saved: 4500,
        date: shifted(currentMonth, 6) + '-20'
    }, {
        id: crypto.randomUUID(),
        name: 'Um novo começo',
        target: 8000,
        saved: 1600,
        date: shifted(currentMonth, 9) + '-20'
    }];
    return d
}
let mode = 'demo',
    view = 'overview',
    month = currentMonth,
    data, undo = null,
    storageError = false,
    repo, stale = false,
    cacheData = null,
    cache = null,
    pageNumber = 1;
const undoStack = [];
const PAGE_SIZE = 50;
try {
    mode = localStorage.getItem('claro-mode') || 'demo'
} catch (e) {
    storageError = true
}
if (!['demo', 'personal'].includes(mode)) mode = 'demo';

function load() {
    storageError = false;
    stale = false;
    try {
        repo = FinanceCore.repository(localStorage, mode, () => mode === 'demo' ? seed() : empty());
        data = repo.read()
    } catch (e) {
        data = empty();
        storageError = true;
        toast(e.message)
    }
    cacheData = null
}

function persist(next) {
    try {
        if (storageError) throw Error('Gravação bloqueada para preservar os dados originais.');
        repo.write(next);
        data = next;
        return true
    } catch (e) {
        toast(e.message === 'QuotaExceededError' ? 'Armazenamento cheio. Nada foi alterado.' : e.message || 'Não foi possível salvar. Nada foi alterado.');
        return false
    }
}

function getIndex() {
    if (cacheData !== data) {
        cache = FinanceCore.index(data);
        cacheData = data
    }
    return cache
}

function toast(message, canUndo = false) {
    $('#toast').innerHTML = `${esc(message)}${(canUndo||undoStack.length)?'<button data-action="undo">Desfazer última exclusão</button>':''}<button data-action="dismiss" aria-label="Fechar mensagem">×</button>`;
    $('#toast').hidden = false
}

function total(rows, type) {
    return FinanceCore.sum(rows.filter(x => x.type === type))
}
const monthly = m => getIndex().months.get(m)?.rows || [];
const dateFormat = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

function change(now, prev, inverse = false) {
    if (!prev) return '<span class="muted">Sem base no mês anterior</span>';
    let v = (now - prev) / Math.abs(prev) * 100;
    return `<span class="${(inverse?v<=0:v>=0)?'good':'bad'}">${v>=0?'↗':'↘'} ${Math.abs(v).toFixed(1).replace('.',',')}%</span> em relação ao mês anterior`
}

function stat(label, value, note, symbol, cls = '') {
    return `<article class="card stat ${cls}"><div class="stat-label">${label}<span class="symbol" aria-hidden="true">${symbol}</span></div><div class="stat-value"><small>R$</small><span>${money(value).replace(/^R\$\s*/, '')}</span></div><div class="stat-note">${note}</div></article>`
}

function table(rows, recent = false) {
    if (!rows.length) return `<div class="empty"><strong>${recent?'Seu primeiro passo começa aqui.':'Nenhuma transação encontrada.'}</strong>${recent?'Adicione uma receita ou despesa para acompanhar seu dinheiro.':'Ajuste os filtros ou adicione uma nova transação.'}<br><button class="primary" data-action="add-transaction">Adicionar transação</button></div>`;
    return `<div class="table-wrap" role="region" aria-label="Lista de transações" tabindex="0"><table><thead><tr><th>Descrição</th><th>Data</th><th>Categoria</th><th>Conta</th><th style="text-align:right">Valor</th><th><span class="muted">Ações</span></th></tr></thead><tbody>${rows.map(t=>`<tr><td><div class="desc"><span class="category-icon" aria-hidden="true">${icons[categories.indexOf(t.category)]||'·'}</span>${esc(t.description)}</div></td><td class="muted">${dateFormat(t.date)}</td><td><span class="pill">${esc(t.category)}</span></td><td class="muted">${esc(t.account)}</td><td class="amount ${t.type}">${t.type==='income'?'+':'−'} ${money(t.amount)}</td><td><div class="row-actions"><button data-edit="transactions" data-id="${esc(t.id)}" aria-label="Editar ${esc(t.description)}">Editar</button><button data-delete="transactions" data-id="${esc(t.id)}" aria-label="Excluir ${esc(t.description)}">×</button></div></td></tr>`).join('')}</tbody></table></div>`
}

function charts() {
    const months = Array.from({
        length: 6
    }, (_, i) => shifted(month, i - 5));
    const values = months.map(m => ({
        m,
        inc: total(monthly(m), 'income'),
        exp: total(monthly(m), 'expense')
    }));
    const max = Math.max(1, ...values.flatMap(x => [x.inc, x.exp]));
    const expenses = monthly(month).filter(x => x.type === 'expense'),
        sum = total(expenses, 'expense');
    const cats = categories.map((c, i) => ({
        name: c,
        value: (getIndex().months.get(month)?.categories.get(c) || 0) / 100,
        color: colors[i]
    })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
    let angle = 0;
    const conic = cats.map(c => {
        const start = angle;
        angle += c.value / sum * 360;
        return `${c.color} ${start}deg ${angle}deg`
    }).join(',');
    return `<div class="charts"><section class="card chart-card"><div class="card-head"><h2>Seu dinheiro em movimento</h2><div class="legend"><span><i class="dot"></i>Receitas</span><span><i class="dot light"></i>Despesas</span></div></div><p class="eyebrow">Os últimos 6 meses, em perspectiva.</p><div class="chart" aria-label="Receitas e despesas mensais">${values.map(v=>`<button class="bar-group" data-chart="${esc(new Date(v.m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})+': receitas '+money(v.inc)+' · despesas '+money(v.exp))}" aria-label="${v.m}: receitas ${money(v.inc)}, despesas ${money(v.exp)}"><span class="bar" style="height:${v.inc/max*100}%"></span><span class="bar expense" style="height:${v.exp/max*100}%"></span><span class="bar-label">${new Date(v.m+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</span></button>`).join('')}</div><div id="chart-detail" class="chart-detail">Toque ou passe o cursor para ver os valores.</div></section><section class="card chart-card"><h2>Para onde vai seu dinheiro</h2><p class="eyebrow">Despesas por categoria neste mês.</p>${sum?`<div class="distribution"><div class="donut" role="img" aria-label="Total de despesas: ${money(sum)}" style="background:conic-gradient(${conic})"><div class="donut-center">Total de gastos<strong>${money(sum)}</strong></div></div><div class="category-list">${cats.map(c=>`<button class="category-item" data-category-detail="${esc(c.name+': '+money(c.value)+' ('+Math.round(c.value/sum*100)+'%)')}"><span><i class="dot" style="background:${c.color}"></i>${c.name}</span><b>${Math.round(c.value/sum*100)}%</b></button>`).join('')}</div></div><div class="chart-detail" id="category-detail">Toque em uma categoria para ver o valor.</div>`:'<div class="empty">Suas despesas aparecerão aqui.</div>'}</section></div>`
}

function overview() {
    const rows = monthly(month),
        prev = monthly(shifted(month, -1)),
        inc = total(rows, 'income'),
        exp = total(rows, 'expense'),
        pi = total(prev, 'income'),
        pe = total(prev, 'expense'),
        all = data.transactions.filter(x => x.date.slice(0, 7) <= month),
        before = data.transactions.filter(x => x.date.slice(0, 7) < month);
    const bal = FinanceCore.subtract(total(all, 'income'), total(all, 'expense')),
        pb = FinanceCore.subtract(total(before, 'income'), total(before, 'expense'));
    return `<div class="stats">${stat('Saldo disponível',bal,change(bal,pb),'◉','balance')}${stat('Receitas do mês',inc,change(inc,pi),'↙')}${stat('Despesas do mês',exp,change(exp,pe,true),'↗')}${stat('Resultado do mês',FinanceCore.subtract(inc,exp),change(FinanceCore.subtract(inc,exp),FinanceCore.subtract(pi,pe)),'≈')}</div>${charts()}<section class="card transactions"><div class="card-head"><h2>Transações recentes</h2><button class="text-btn" data-view="transactions">Ver todas <span>→</span></button></div>${table(rows.slice(0,5),true)}</section>`
}
let filters = {
    search: '',
    type: '',
    category: '',
    start: '',
    end: ''
};

function transactions() {
    return `<section class="card transactions"><div class="card-head"><h2>Suas transações</h2><span class="eyebrow">Organize cada movimento.</span></div><div class="filters"><input id="search" type="search" placeholder="Buscar por descrição" aria-label="Buscar por descrição" value="${esc(filters.search)}"><select id="type-filter" aria-label="Tipo"><option value="">Todos os tipos</option><option value="income" ${filters.type==='income'?'selected':''}>Receitas</option><option value="expense" ${filters.type==='expense'?'selected':''}>Despesas</option></select><select id="category-filter" aria-label="Categoria"><option value="">Todas as categorias</option>${categories.map(c=>`<option ${filters.category===c?'selected':''}>${c}</option>`).join('')}</select><label>De <input id="start-filter" type="date" value="${filters.start}"></label><label>Até <input id="end-filter" type="date" value="${filters.end}"></label><button class="text-btn" data-action="clear">Limpar filtros</button></div><p class="eyebrow">Sem intervalo personalizado, mostramos o mês selecionado.</p><div id="filtered-table"></div></section>`
}

function filterRows() {
    if (filters.start && filters.end && filters.start > filters.end) {
        $('#filtered-table').innerHTML = '<p class="error">A data inicial deve ser anterior à data final.</p>';
        return
    }
    const rows = getIndex().sorted.filter(t => (filters.start || filters.end || t.date.startsWith(month)) && (!filters.start || t.date >= filters.start) && (!filters.end || t.date <= filters.end) && (!filters.type || t.type === filters.type) && (!filters.category || t.category === filters.category) && t.description.toLocaleLowerCase('pt-BR').includes(filters.search.toLocaleLowerCase('pt-BR')));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    pageNumber = Math.min(pageNumber, pages);
    $('#filtered-table').innerHTML = table(rows.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE)) + (rows.length ? `<div class="table-pages"><span>${rows.length} registros · Página ${pageNumber} de ${pages}</span><button class="text-btn" data-action="page-prev" ${pageNumber===1?'disabled':''}>Anterior</button><button class="text-btn" data-action="page-next" ${pageNumber===pages?'disabled':''}>Próxima</button></div>` : '')
}

function budgets() {
    return `<div class="section-toolbar"><h2>Espaço para o que importa.</h2><button class="primary" data-action="add-budget">＋ Criar orçamento</button></div><p class="screen-note">Limites mensais recorrentes. Os gastos refletem o mês selecionado.</p>${data.budgets.length?`<div class="grid">${data.budgets.map(b=>{const spent=(getIndex().months.get(month)?.categories.get(b.category)||0)/100,pct=spent/b.amount*100;return `<article class="card progress-card"><div class="progress-top"><span class="category-icon">${icons[categories.indexOf(b.category)]||'·'}</span><span class="pill">${pct>100?'Limite ultrapassado':pct>=80?'Próximo do limite':'Dentro do planejado'}</span></div><h2>${esc(b.category)}</h2><div class="progress-value">${money(spent)} <small>de ${money(b.amount)}</small></div><div class="track ${pct>100?'over':pct>=80?'warning':''}" role="progressbar" aria-label="Orçamento de ${esc(b.category)}" aria-valuenow="${Math.min(100,Math.round(pct))}" aria-valuemin="0" aria-valuemax="100"><div style="width:${Math.min(100,pct)}%"></div></div><div class="progress-meta"><span>${pct.toFixed(0)}% utilizado</span><span>${money(Math.abs(FinanceCore.subtract(b.amount,spent)))} ${spent>b.amount?'acima':'disponíveis'}</span></div><div class="row-actions"><button data-edit="budgets" data-id="${esc(b.id)}">Editar limite</button><button data-delete="budgets" data-id="${esc(b.id)}">Excluir</button></div></article>`}).join('')}</div>`:'<div class="card empty"><strong>Planeje com leveza.</strong>Crie um limite por categoria para acompanhar seus gastos.</div>'}`
}

function goals() {
    return `<div class="section-toolbar"><h2>Hoje, um pouco mais perto.</h2><button class="primary" data-action="add-goal">＋ Criar meta</button></div><p class="screen-note">Acompanhe seus objetivos. Valores acumulados são informados manualmente.</p>${data.goals.length?`<div class="grid">${data.goals.map(g=>{const pct=g.saved/g.target*100;return `<article class="card progress-card"><div class="progress-top"><span class="category-icon">◎</span><span class="pill">${pct>=100?'Meta alcançada':g.date<today()?'Prazo encerrado':'Em progresso'}</span></div><h2>${esc(g.name)}</h2><p class="eyebrow">Até ${dateFormat(g.date)}</p><div class="progress-value">${money(g.saved)} <small>de ${money(g.target)}</small></div><div class="track" role="progressbar" aria-label="${esc(g.name)}" aria-valuenow="${Math.min(100,Math.round(pct))}" aria-valuemin="0" aria-valuemax="100"><div style="width:${Math.min(100,pct)}%"></div></div><div class="progress-meta"><span>${pct.toFixed(0)}% alcançado</span><span>Faltam ${money(Math.max(0,FinanceCore.subtract(g.target,g.saved)))}</span></div><div class="row-actions"><button data-edit="goals" data-id="${esc(g.id)}">Atualizar progresso</button><button data-delete="goals" data-id="${esc(g.id)}">Excluir</button></div></article>`}).join('')}</div>`:'<div class="card empty"><strong>O que você quer realizar?</strong>Crie sua primeira meta e acompanhe cada conquista.</div>'}`
}

function render() {
    MEIBusinessAppearance.stop();
    document.querySelectorAll('nav button').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
        b.setAttribute('aria-current', b.dataset.view === view ? 'page' : 'false')
    });
    $('#mode').innerHTML = mode === 'demo' ? 'Modo demonstração <span>↗</span>' : 'Meus dados <span>↗</span>';
    $('#month').value = month;
    document.querySelector('[data-action="prev"]').disabled = month === '1000-01';
    document.querySelector('[data-action="next"]').disabled = month === '9999-12';
    $('#content').innerHTML = ({
        overview,
        transactions,
        budgets,
        goals
    } [view])();
    if (view === 'transactions') filterRows();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) $('#content').animate([{
        opacity: .35,
        transform: 'translateY(5px)'
    }, {
        opacity: 1,
        transform: 'translateY(0)'
    }], {
        duration: 210,
        easing: 'ease-out'
    });
}
let dialogTimer = 0;

function closeDialog() {
    const d = $('#dialog');
    if (!d.open) return;
    clearTimeout(dialogTimer);
    const finish = () => {
        d.classList.remove('closing');
        d.close();
        if (document.activeElement === document.body) $('#main').focus({
            preventScroll: true
        });
        if (stale) {
            load();
            render();
            toast('Dados atualizados a partir da outra aba.')
        }
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
        d.classList.add('closing');
        dialogTimer = setTimeout(finish, 140)
    }
}

function openDialog(html) {
    clearTimeout(dialogTimer);
    $('#dialog').classList.remove('closing');
    $('#dialog-content').innerHTML = html;
    $('#dialog').showModal()
}
const head = title => `<div class="dialog-head"><h2 id="dialog-title">${title}</h2><button data-action="close" class="icon-btn" aria-label="Fechar">×</button></div>`;

function form(kind, id) {
    const item = data[kind].find(x => x.id === id) || {};
    const edit = !!id;
    const title = kind === 'transactions' ? (edit ? 'Editar transação' : 'Adicionar transação') : kind === 'budgets' ? (edit ? 'Editar orçamento' : 'Criar orçamento') : (edit ? 'Atualizar meta' : 'Criar meta');
    const field = (label, name, value = '', type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" ${type==='date'?'min="1000-01-01" max="9999-12-31"':''} value="${esc(value)}" ${extra} required></label>`;
    const cat = `<label>Categoria<select name="category">${categories.map(c=>`<option ${item.category===c?'selected':''}>${c}</option>`).join('')}</select></label>`;
    let fields = '';
    if (kind === 'transactions') fields = `<label>Tipo<select name="type"><option value="expense">Despesa</option><option value="income" ${item.type==='income'?'selected':''}>Receita</option></select></label>${field('Descrição','description',item.description||'','text','maxlength="100"')}${field('Valor (R$)','amount',item.amount||'','number','min="0.01" max="999999999" step="0.01"')}<div class="form-row">${field('Data','date',item.date||today(),'date')}${cat}</div><label>Conta<select name="account">${[...new Set(['Conta principal','Cartão de crédito','Carteira','Poupança','Outra conta',...(item.account?[item.account]:[])])].map(c=>`<option ${item.account===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>`;
    if (kind === 'budgets') fields = cat + field('Limite mensal (R$)', 'amount', item.amount || '', 'number', 'min="0.01" max="999999999" step="0.01"');
    if (kind === 'goals') fields = field('Nome do objetivo', 'name', item.name || '', 'text', 'maxlength="80"') + field('Valor desejado (R$)', 'target', item.target || '', 'number', 'min="0.01" max="999999999" step="0.01"') + field('Valor acumulado (R$)', 'saved', item.saved ?? 0, 'number', 'min="0" max="999999999" step="0.01"') + field('Prazo', 'date', item.date || shifted(month, 6) + '-01', 'date');
    openDialog(head(title) + `<form id="entry-form" data-kind="${kind}" data-id="${esc(id||'')}">${fields}<div id="form-error" class="error" role="alert"></div><div class="form-actions"><button type="button" class="secondary glass" data-action="close">Cancelar</button><button class="primary" type="submit">Salvar ${kind==='transactions'?'transação':kind==='budgets'?'orçamento':'meta'}</button></div></form>`)
}

function settings() {
    openDialog(head('Seu espaço, seus dados') + `<div class="settings-copy"><p>Você está em <strong>${mode==='demo'?'modo demonstração':'Meus dados'}</strong>.</p><div class="settings-box"><strong>Armazenamento local</strong>Os dados ficam apenas neste navegador e dispositivo. Não há sincronização com bancos ou outros dispositivos. Limpar os dados do navegador apaga seus registros.</div><p>O modo demonstração usa dados fictícios e tem armazenamento separado. Suas alterações na demonstração não afetam seus dados pessoais.</p><button class="primary" data-action="switch">${mode==='demo'?'Começar com meus dados':'Explorar demonstração'}</button></div>`)
}
