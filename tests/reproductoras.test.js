const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const archivo of ['SisGranja_v2.5.html', 'index.html', 'SisGranja/index.html']) test(`${archivo}: identifica el cuarto parto de cada madre`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    const inicio = html.indexOf('        function obtenerReproductorasDescarte(');
    const fin = html.indexOf('        function estadoCicloPoza(', inicio);
    assert.ok(inicio >= 0 && fin > inicio);
    const contexto = {};
    vm.runInNewContext(html.slice(inicio, fin), contexto);
    const partos = Array.from({ length: 3 }, (_, indice) => ({ madre: 'm-1', poza: 'PZ-1', fecha: `2026-01-0${indice + 1}` }));
    partos.push(...Array.from({ length: 8 }, () => ({ poza: 'PZ-1', fecha: '2026-01-04' })));
    assert.equal(contexto.obtenerReproductorasDescarte(partos).length, 0);
    partos.push({ madre: 'M-1', poza: 'PZ-2', fecha: '2026-02-01' });
    const resultado = contexto.obtenerReproductorasDescarte(partos);
    assert.equal(resultado.length, 1);
    assert.equal(resultado[0].madre, 'M-1');
    assert.equal(resultado[0].partos, 4);
    assert.equal(resultado[0].poza, 'PZ-2');
    assert.equal(contexto.obtenerReproductorasDescarte([{ madre: 'M-2', fecha: '2026-01-01', poza: 'PZ-1', partosPrevios: 3 }])[0].partos, 4);
    assert.equal(contexto.obtenerReproductorasDescarte([{ madre: 'M-3', fecha: '2026-01-01', poza: 'PZ-2', partosPrevios: 2 }, { madre: 'M-3', fecha: '2026-01-01', poza: 'PZ-1' }])[0].poza, 'PZ-2');
});