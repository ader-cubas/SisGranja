const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const persistencia = require('../SisGranja/js/persistencia.js');

for (const archivo of ['SisGranja_v2.5.html', 'index.html', 'SisGranja/index.html']) test(`${archivo}: recupera IndexedDB antes de habilitar los controles`, async () => {
    const raiz = path.join(__dirname, '..');
    const indexedDB = new IDBFactory();
    const conexion = await persistencia.abrir(indexedDB);
    await persistencia.guardar(conexion, JSON.stringify({ _ts: 200, cuyes: [{ codigo: 'PZ-002' }], partos: [] }));
    conexion.close();
    class Recursos extends ResourceLoader {
        fetch(url) {
            if (url.endsWith('/SisGranja/js/persistencia.js')) return Promise.resolve(fs.readFileSync(path.join(raiz, 'SisGranja/js/persistencia.js')));
            return null;
        }
    }
    const errores = [];
    const consola = new VirtualConsole();
    consola.on('jsdomError', error => errores.push(error));
    const html = fs.readFileSync(path.join(raiz, archivo), 'utf8').replace(/<script src="[^"]*persistencia\.js"><\/script>/, () => `<script>${fs.readFileSync(path.join(raiz, 'SisGranja/js/persistencia.js'), 'utf8')}</script>`);
    const dom = new JSDOM(html, {
        url: `https://granja.test/${archivo}`, runScripts: 'dangerously', resources: new Recursos(), virtualConsole: consola,
        beforeParse(ventana) {
            ventana.indexedDB = indexedDB;
            ventana.Date.now = () => 1000;
            ventana.localStorage.setItem('sisgranja_cuy_db', JSON.stringify({ _ts: 100, cuyes: [{ codigo: 'PZ-001' }] }));
            Object.defineProperty(ventana.navigator, 'onLine', { value: false });
            ventana.fetch = async () => { throw new Error('offline'); };
            ventana.alert = mensaje => errores.push(new Error(mensaje));
            ventana.matchMedia = () => ({ matches: false });
            ventana.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} });
        }
    });
    try {
        for (let intento = 0; intento < 100 && dom.window.document.getElementById('app-container').inert !== false; intento++) {
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.deepEqual(errores, []);
        assert.equal(dom.window.document.getElementById('app-container').inert, false);
        assert.equal(dom.window.eval('db.cuyes[0].codigo'), 'PZ-002');
        assert.equal(JSON.parse(dom.window.localStorage.getItem('sisgranja_cuy_db')).cuyes[0].codigo, 'PZ-002');
        dom.window.eval("db.cuyes.push({ codigo: 'PZ-003' }); guardarBD(''); db.cuyes.push({ codigo: 'PZ-004' }); guardarBD('');");
        await dom.window.eval('colaPersistencia');
        const verificacion = await persistencia.abrir(indexedDB);
        const almacenado = JSON.parse(await persistencia.leer(verificacion));
        verificacion.close();
        assert.ok(almacenado.cuyes.some(poza => poza.codigo === 'PZ-004'));
        assert.deepEqual(errores, []);
        dom.window.eval("db.temperatura = { valor: 8, fecha: new Date(Date.now()).toISOString() }; actualizarAnalisisCrecimiento(-1);");
        assert.match(dom.window.document.getElementById('peso-frio').textContent, /maíz amarillo molido/);
        dom.window.eval("db.temperatura.fecha = '1969-12-30T00:00:00.000Z'; actualizarAnalisisCrecimiento(-1);");
        assert.equal(dom.window.document.getElementById('peso-frio').textContent, '');
        dom.window.eval("db.temperatura = { valor: null, fecha: new Date(Date.now()).toISOString() }; actualizarAnalisisCrecimiento(-1);");
        assert.equal(dom.window.document.getElementById('peso-frio').textContent, '');
        {
            const doc = dom.window.document;
            doc.getElementById('parto-poza').value = 'PZ-002';
            doc.getElementById('parto-madre').value = 'M-1';
            doc.getElementById('parto-previos').value = '3';
            doc.getElementById('parto-vivas').value = '2';
            doc.getElementById('parto-muertas').value = '0';
            assert.equal(dom.window.guardarParto({ preventDefault() {} }), true);
            assert.match(doc.getElementById('tabla-descarte').textContent, /M-1/);
            assert.equal(dom.window.eval('obtenerReproductorasDescarte(db.partos)[0].partos'), 4);
            doc.getElementById('parto-poza').value = 'PZ-002';
            doc.getElementById('parto-madre').value = 'M-1';
            doc.getElementById('parto-vivas').value = '1';
            assert.equal(dom.window.guardarParto({ preventDefault() {} }), false);
            dom.window.confirm = () => true;
            dom.window.eval("db.partos.push({ madre: 'M-1', poza: 'PZ-002', fecha: '1969-12-31', vivas: 1, muertas: 0 }); eliminarItem('partos', 0);");
            assert.equal(dom.window.eval('obtenerReproductorasDescarte(db.partos)[0].partos'), 4);
        }
        let solicitudes = 0;
        dom.window.fetch = async () => { solicitudes++; throw new Error('No debe conectarse'); };
        dom.window.SisGranjaPersistencia.guardar = async () => { throw new Error('Fallo simulado'); };
        dom.window.eval("guardarBD('');");
        await dom.window.eval('colaPersistencia');
        await assert.rejects(dom.window.subirANube(), /persistencia local falló/);
        assert.equal(solicitudes, 0);
    } finally {
        dom.window.close();
    }
});

test('copias diferentes con la misma marca temporal mantienen la aplicación bloqueada', async () => {
    const raiz = path.join(__dirname, '..');
    const indexedDB = new IDBFactory();
    const conexion = await persistencia.abrir(indexedDB);
    const indexado = JSON.stringify({ _ts: 10, cuyes: [{ codigo: 'PZ-002' }] });
    const local = JSON.stringify({ _ts: 10, cuyes: [{ codigo: 'PZ-001' }] });
    await persistencia.guardar(conexion, indexado);
    conexion.close();
    class Recursos extends ResourceLoader {
        fetch(url) {
            if (url.endsWith('/SisGranja/js/persistencia.js')) return Promise.resolve(fs.readFileSync(path.join(raiz, 'SisGranja/js/persistencia.js')));
            return null;
        }
    }
    let aviso = '';
    const html = fs.readFileSync(path.join(raiz, 'SisGranja_v2.5.html'), 'utf8').replace(/<script src="[^"]*persistencia\.js"><\/script>/, () => `<script>${fs.readFileSync(path.join(raiz, 'SisGranja/js/persistencia.js'), 'utf8')}</script>`);
    const dom = new JSDOM(html, {
        url: 'https://granja.test/SisGranja_v2.5.html', runScripts: 'dangerously', resources: new Recursos(), virtualConsole: new VirtualConsole(),
        beforeParse(ventana) {
            ventana.indexedDB = indexedDB;
            ventana.localStorage.setItem('sisgranja_cuy_db', local);
            ventana.alert = mensaje => { aviso = mensaje; };
            ventana.matchMedia = () => ({ matches: false });
        }
    });
    try {
        for (let intento = 0; intento < 100 && !aviso; intento++) await new Promise(resolve => setTimeout(resolve, 20));
        assert.match(aviso, /misma fecha/);
        assert.equal(dom.window.document.getElementById('app-container').inert, true);
        assert.equal(dom.window.document.getElementById('voice-fab').inert, true);
        assert.equal(dom.window.localStorage.getItem('sisgranja_cuy_db'), local);
        const verificacion = await persistencia.abrir(indexedDB);
        assert.equal(await persistencia.leer(verificacion), indexado);
        verificacion.close();
    } finally {
        dom.window.close();
    }
});