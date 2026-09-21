/* Regras financeiras e compatibilidade de armazenamento. Sem dependências. */
(function(root) {
    'use strict';
    const currency = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
    const kinds = ['transactions', 'budgets', 'goals'];
    const categories = ['Moradia', 'Alimentação', 'Transporte', 'Compras', 'Lazer', 'Saúde', 'Educação', 'Salário', 'Outros'];
    const empty = () => ({
        transactions: [],
        budgets: [],
        goals: []
    });
    const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
    const sum = rows => rows.reduce((acc, row) => acc + cents(row.amount), 0) / 100;
    const subtract = (a, b) => (cents(a) - cents(b)) / 100;
    const money = value => currency.format(value);
    const validText = (value, max) => typeof value === 'string' && !!value.trim() && value.length <= max;

    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + 'T12:00:00Z');
        return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value && value >= '1000-01-01';
    }

    function validMoney(value, zero = false) {
        return typeof value === 'number' && Number.isFinite(value) && value >= (zero ? 0 : .01) && value <= 999999999 && Math.abs(value * 100 - cents(value)) < .0001;
    }

    function validateRecord(kind, item) {
        if (!item || typeof item !== 'object' || !validText(item.id, 200)) return false;
        if (kind === 'transactions') return validText(item.description, 100) && validMoney(item.amount) && validDate(item.date) && categories.includes(item.category) && ['income', 'expense'].includes(item.type) && validText(item.account, 100);
        if (kind === 'budgets') return categories.includes(item.category) && validMoney(item.amount);
        if (kind === 'goals') return validText(item.name, 80) && validMoney(item.target) && validMoney(item.saved, true) && validDate(item.date);
        return false;
    }

    function validateData(data) {
        if (!data || typeof data !== 'object') return false;
        for (const kind of kinds) {
            if (!Array.isArray(data[kind]) || !data[kind].every(item => validateRecord(kind, item))) return false;
            if (new Set(data[kind].map(item => item.id)).size !== data[kind].length) return false;
        }
        if (new Set(data.budgets.map(item => item.category)).size !== data.budgets.length) return false;
        return Number.isSafeInteger(data.transactions.reduce((acc, item) => acc + cents(item.amount), 0));
    }

    function index(data) {
        const months = new Map();
        const sorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
        for (const row of sorted) {
            const month = row.date.slice(0, 7);
            if (!months.has(month)) months.set(month, {
                rows: [],
                income: 0,
                expense: 0,
                categories: new Map()
            });
            const bucket = months.get(month);
            bucket.rows.push(row);
            bucket[row.type] += cents(row.amount);
            if (row.type === 'expense') bucket.categories.set(row.category, (bucket.categories.get(row.category) || 0) + cents(row.amount));
        }
        return {
            months,
            sorted
        };
    }

    function repository(storage, mode, seed) {
        const key = 'claro-' + mode; // Keep the exact v1 keys and JSON shape.
        let baseline, blocked = false;
        return {
            read() {
                blocked = false;
                try {
                    baseline = storage.getItem(key);
                    const data = baseline === null ? seed() : JSON.parse(baseline);
                    if (!validateData(data)) throw new Error('invalid');
                    return data;
                } catch (error) {
                    blocked = true;
                    throw new Error('Os dados salvos não puderam ser lidos. O conteúdo original foi preservado; a gravação está bloqueada para evitar perda de dados.');
                }
            },
            write(data) {
                if (blocked) throw new Error('Gravação bloqueada para preservar os dados originais.');
                if (!validateData(data)) throw new Error('Há campos inválidos. Revise datas e valores com até duas casas decimais.');
                if (storage.getItem(key) !== baseline) throw new Error('Os dados mudaram em outra aba. Feche este formulário e abra novamente antes de salvar.');
                const next = JSON.stringify(data);
                storage.setItem(key, next); // Update memory only after a successful write.
                baseline = next;
            }
        };
    }
    const api = {
        cents,
        sum,
        subtract,
        money,
        empty,
        validateData,
        validateRecord,
        validDate,
        validMoney,
        index,
        repository,
        categories
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.FinanceCore = api;
})(typeof window === 'object' ? window : globalThis);
