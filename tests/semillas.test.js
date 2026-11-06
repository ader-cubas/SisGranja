const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const archivo of ['SisGranja_v2.5.html', 'index.html', 'SisGranja/index.html']) test(`${archivo}: calcula semillas por area y valida entradas`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    const inicio = html.indexOf('        function calcularCantidadSemilla(');
    const fin = html.indexOf('        function calcularSemillas()', inicio);
    assert.ok(inicio >= 0 && fin > inicio);
    const contexto = {};
    vm.runInNewContext(html.slice(inicio, fin), contexto);
    const calcular = contexto.calcularCantidadSemilla;
    assert.deepEqual(Array.from(calcular(5000, 'm2', [20, 4, 6, 80])), [10, 2, 3, 40]);
    assert.deepEqual(Array.from(calcular(2, 'ha', [20, 0, 0, 0])), [40, 0, 0, 0]);
    assert.equal(calcular(0, 'ha', [20]), null);
    assert.equal(calcular(1, 'ha', [-1]), null);
    assert.equal(calcular(1, 'km2', [20]), null);
});