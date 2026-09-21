/* Events are delegated once. Financial records keep the original v1 shape. */
'use strict';

function focusContent() {
    $('#main').focus({
        preventScroll: true
    });
}

function syncChart(target) {
    const button = target.closest('[data-chart],[data-category-detail]');
    if (!button) return;
    const detail = $(button.dataset.chart ? '#chart-detail' : '#category-detail');
    const text = button.dataset.chart || button.dataset.categoryDetail;
    if (detail && detail.textContent !== text) detail.textContent = text;
}
document.addEventListener('click', event => {
    const button = event.target.closest('button,a');
    if (!button) return;
    const {
        dataset: d
    } = button;
    if (d.view) {
        event.preventDefault();
        if (!['overview', 'transactions', 'budgets', 'goals'].includes(d.view) || d.view === view) return;
        view = d.view;
        pageNumber = 1;
        render();
        window.scrollTo({
            top: 0,
            behavior: 'instant'
        });
        return;
    }
    if (d.edit) {
        form(d.edit, d.id);
        return;
    }
    if (d.delete) {
        const kind = d.delete,
            id = d.id;
        if (!['transactions', 'budgets', 'goals'].includes(kind)) return;
        const next = structuredClone(data),
            item = next[kind].find(x => x.id === id);
        if (!item) return;
        next[kind] = next[kind].filter(x => x.id !== id);
        if (persist(next)) {
            undoStack.push({
                kind,
                item,
                mode
            });
            render();
            focusContent();
            toast('Registro excluído.', true);
        }
        return;
    }
    if (d.chart || d.categoryDetail) {
        syncChart(button);
        return;
    }
    switch (d.action) {
        case 'add-transaction':
            form('transactions');
            break;
        case 'add-budget':
            form('budgets');
            break;
        case 'add-goal':
            form('goals');
            break;
        case 'settings':
        case 'mode':
            settings();
            break;
        case 'close':
            closeDialog();
            break;
        case 'prev':
        case 'next': {
            const nextMonth = shifted(month, d.action === 'prev' ? -1 : 1);
            if (/^\d{4}-\d{2}$/.test(nextMonth) && nextMonth >= '1000-01' && nextMonth <= '9999-12') {
                month = nextMonth;
                pageNumber = 1;
                render();
            }
            break;
        }
        case 'clear':
            filters = {
                search: '',
                type: '',
                category: '',
                start: '',
                end: ''
            };
            pageNumber = 1;
            render();
            $('#search').focus();
            break;
        case 'page-prev':
        case 'page-next':
            pageNumber = Math.max(1, pageNumber + (d.action === 'page-next' ? 1 : -1));
            filterRows();
            $('.table-wrap')?.focus({
                preventScroll: true
            });
            break;
        case 'switch': {
            const nextMode = mode === 'demo' ? 'personal' : 'demo';
            try {
                localStorage.setItem('claro-mode', nextMode);
            } catch (_) {
                toast('Não foi possível salvar a troca de modo. O modo atual foi mantido.');
                return;
            }
            mode = nextMode;
            load();
            undoStack.length = 0;
            pageNumber = 1;
            if (!storageError) $('#toast').hidden = true;
            closeDialog();
            render();
            break;
        }
        case 'undo': {
            const last = undoStack.at(-1);
            if (!last || last.mode !== mode) return;
            const next = structuredClone(data);
            if (next[last.kind].some(x => x.id === last.item.id) || (last.kind === 'budgets' && next.budgets.some(x => x.category === last.item.category))) {
                toast('Não é possível restaurar enquanto existir um registro com a mesma identificação ou categoria.');
                return;
            }
            next[last.kind].push(last.item);
            if (persist(next)) {
                undoStack.pop();
                render();
                toast('Registro restaurado.');
            }
            break;
        }
        case 'dismiss':
            $('#toast').hidden = true;
            break;
    }
});
let searchTimer = 0;
document.addEventListener('input', event => {
    const map = {
        search: 'search',
        'type-filter': 'type',
        'category-filter': 'category',
        'start-filter': 'start',
        'end-filter': 'end'
    };
    const name = map[event.target.id];
    if (!name) return;
    filters[name] = event.target.value;
    pageNumber = 1;
    clearTimeout(searchTimer);
    if (name === 'search') searchTimer = setTimeout(() => {
        if (view === 'transactions') filterRows();
    }, 100);
    else filterRows();
});
$('#month').addEventListener('change', event => {
    const value = event.target.value;
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= '1000-01' && value <= '9999-12') {
        month = value;
        pageNumber = 1;
        render();
    } else event.target.value = month;
});
document.addEventListener('mouseover', event => syncChart(event.target));
document.addEventListener('focusin', event => syncChart(event.target));
$('#dialog').addEventListener('cancel', event => {
    event.preventDefault();
    closeDialog();
});
document.addEventListener('submit', event => {
    if (event.target.id !== 'entry-form') return;
    event.preventDefault();
    const f = event.target,
        kind = f.dataset.kind,
        id = f.dataset.id;
    if (!['transactions', 'budgets', 'goals'].includes(kind) || !f.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(f));
    for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
    for (const key of ['amount', 'target', 'saved'])
        if (key in fields) fields[key] = Number(fields[key]);
    const original = data[kind].find(x => x.id === id);
    if (id && !original) {
        $('#form-error').textContent = 'Este registro não está mais disponível. Feche e abra novamente.';
        return;
    }
    const item = {
        ...original,
        ...fields,
        id: id || crypto.randomUUID()
    };
    if (!FinanceCore.validateRecord(kind, item)) {
        $('#form-error').textContent = 'Revise os campos. Use uma data válida e valores positivos com até duas casas decimais (acumulado pode ser zero).';
        return;
    }
    if (kind === 'budgets' && data.budgets.some(x => x.category === item.category && x.id !== id)) {
        $('#form-error').textContent = 'Já existe um orçamento para essa categoria. Edite o limite existente.';
        return;
    }
    const next = structuredClone(data);
    if (id) next[kind] = next[kind].map(x => x.id === id ? item : x);
    else next[kind].push(item);
    if (persist(next)) {
        closeDialog();
        render();
        toast(id ? 'Alterações salvas.' : 'Registro adicionado.');
    } else $('#form-error').textContent = $('#toast').textContent;
});
window.addEventListener('storage', event => {
    if (event.key !== 'claro-' + mode && event.key !== null) return;
    undoStack.length = 0;
    if ($('#dialog').open) {
        stale = true;
        toast('Dados alterados em outra aba. Feche e reabra o formulário para carregar a versão atual.');
    } else {
        load();
        render();
        if (!storageError) toast('Dados atualizados a partir da outra aba.');
    }
});
window.addEventListener('pagehide', () => {
    clearTimeout(searchTimer);
    clearTimeout(dialogTimer);
});
load();
render();
