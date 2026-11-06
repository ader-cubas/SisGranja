const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

for (const [archivo, pagina] of [['sw.js', 'SisGranja_v2.5.html'], ['SisGranja/sw.js', 'SisGranja/index.html']]) {
    test(`${archivo}: instala su pagina y conserva caches ajenas`, async () => {
        const raiz = path.join(__dirname, '..');
        const listeners = {};
        const agregadas = [];
        const eliminadas = [];
        const contexto = {
            self: { addEventListener: (tipo, fn) => { listeners[tipo] = fn; }, skipWaiting: () => {}, clients: { claim: () => {} }, location: { origin: 'https://example.test' } },
            caches: {
                open: async nombre => {
                    assert.equal(nombre, 'sisgranja-v3.0.0-20261103');
                    return { add: async url => { agregadas.push(url); }, addAll: async urls => { agregadas.push(...urls); } };
                },
                keys: async () => ['sisgranja-vieja', 'sisgranja-v3.0.0-20261103', 'otra-app'],
                delete: async nombre => { eliminadas.push(nombre); }
            },
            URL, Promise
        };
        vm.runInNewContext(fs.readFileSync(path.join(raiz, archivo), 'utf8'), contexto);
        let espera;
        listeners.install({ waitUntil: promesa => { espera = promesa; } });
        await espera;
        assert.ok(agregadas.includes('./' + path.basename(pagina)));
        assert.ok(agregadas.includes(archivo === 'sw.js' ? './SisGranja/js/persistencia.js' : './js/persistencia.js'));
        assert.ok(fs.existsSync(path.join(raiz, pagina)));
        listeners.activate({ waitUntil: promesa => { espera = promesa; } });
        await espera;
        assert.deepEqual(eliminadas, ['sisgranja-vieja']);
    });
}