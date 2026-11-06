const test = require('node:test');
const assert = require('node:assert/strict');
const { IDBFactory } = require('fake-indexeddb');
const persistencia = require('../SisGranja/js/persistencia.js');

test('migra una copia local y la recupera después de abrir la base de nuevo', async () => {
    const indexedDB = new IDBFactory();
    const original = JSON.stringify({ _ts: 10, cuyes: [{ id: 'PZ-1' }] });
    let conexion = await persistencia.abrir(indexedDB);
    assert.equal(persistencia.elegir(original, await persistencia.leer(conexion)), original);
    await persistencia.guardar(conexion, original);
    conexion.close();
    conexion = await persistencia.abrir(indexedDB);
    assert.equal(await persistencia.leer(conexion), original);
    conexion.close();
});

test('no reemplaza una copia más reciente y detecta conflictos ambiguos', async () => {
    const conexion = await persistencia.abrir(new IDBFactory());
    const reciente = JSON.stringify({ _ts: 20, cuyes: [1] });
    const anterior = JSON.stringify({ _ts: 10, cuyes: [2] });
    await persistencia.guardar(conexion, reciente);
    await assert.rejects(persistencia.guardar(conexion, anterior), /más reciente/);
    assert.equal(await persistencia.leer(conexion), reciente);
    await assert.rejects(persistencia.guardar(conexion, JSON.stringify({ _ts: 20, cuyes: [3] })), /misma fecha/);
    assert.equal(await persistencia.leer(conexion), reciente);
    assert.throws(() => persistencia.elegir('{', reciente), /JSON válido/);
    conexion.close();
});