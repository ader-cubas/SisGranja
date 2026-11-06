const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const archivo of ['SisGranja_v2.5.html', 'index.html', 'SisGranja/index.html']) test(`${archivo}: conserva granjas de 100 o mas pozas y sus registros`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    const inicio = html.indexOf('        function normalizarDB() {');
    const fin = html.indexOf('        const MENSAJE_CONFIRMACION', inicio);
    assert.ok(inicio >= 0 && fin > inicio);
    const pozas = Array.from({ length: 100 }, (_, indice) => ({ id: indice + 1 }));
    const contexto = { db: { cuyes: pozas, partos: [{ id: 1 }] } };
    contexto.obtenerPozasUnicas = () => contexto.db.cuyes;
    vm.runInNewContext(html.slice(inicio, fin) + '\nnormalizarDB();', contexto);
    assert.equal(contexto.db.cuyes.length, 100);
    assert.equal(contexto.db.partos.length, 1);
});