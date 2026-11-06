(function (raiz) {
    'use strict';

    function analizar(texto) {
        if (typeof texto !== 'string') return null;
        try {
            const datos = JSON.parse(texto);
            if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return null;
            return { texto, fecha: Number(datos._ts) || 0 };
        } catch (error) {
            return null;
        }
    }

    function elegir(local, indexado) {
        const anterior = analizar(local);
        const guardado = analizar(indexado);
        if (local && !anterior) throw new Error('El estado local no es JSON válido.');
        if (indexado && !guardado) throw new Error('El estado IndexedDB no es JSON válido.');
        if (!anterior) return indexado || null;
        if (!guardado) return local;
        if (anterior.fecha === guardado.fecha && anterior.texto !== guardado.texto) {
            throw new Error('Las copias locales tienen la misma fecha pero datos diferentes.');
        }
        return anterior.fecha >= guardado.fecha ? local : indexado;
    }

    function abrir(indexedDB) {
        return new Promise((resolve, reject) => {
            if (!indexedDB) return reject(new Error('IndexedDB no está disponible.'));
            const solicitud = indexedDB.open('sisgranja-datos', 1);
            let bloqueada = false;
            solicitud.onupgradeneeded = () => solicitud.result.createObjectStore('estado');
            solicitud.onsuccess = () => bloqueada ? solicitud.result.close() : resolve(solicitud.result);
            solicitud.onerror = () => reject(solicitud.error || new Error('No se pudo abrir IndexedDB.'));
            solicitud.onblocked = () => { bloqueada = true; reject(new Error('La base IndexedDB está bloqueada por otra pestaña.')); };
        });
    }

    function leer(conexion) {
        return new Promise((resolve, reject) => {
            const transaccion = conexion.transaction('estado', 'readonly');
            const solicitud = transaccion.objectStore('estado').get('principal');
            solicitud.onsuccess = () => resolve(solicitud.result ?? null);
            solicitud.onerror = () => reject(solicitud.error);
            transaccion.onabort = () => reject(transaccion.error || new Error('Lectura cancelada.'));
        });
    }

    function guardar(conexion, texto) {
        if (!analizar(texto)) return Promise.reject(new Error('Estado inválido.'));
        return new Promise((resolve, reject) => {
            const transaccion = conexion.transaction('estado', 'readwrite');
            const almacen = transaccion.objectStore('estado');
            const solicitud = almacen.get('principal');
            solicitud.onsuccess = () => {
                try {
                    if (elegir(texto, solicitud.result ?? null) !== texto) throw new Error('IndexedDB contiene una copia más reciente.');
                    almacen.put(texto, 'principal');
                } catch (error) {
                    transaccion.abort();
                    reject(error);
                }
            };
            transaccion.oncomplete = () => resolve();
            transaccion.onabort = () => reject(transaccion.error || new Error('Escritura cancelada.'));
            transaccion.onerror = () => reject(transaccion.error || new Error('Error al guardar en IndexedDB.'));
        });
    }

    const api = { abrir, leer, guardar, elegir };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.SisGranjaPersistencia = api;
})(globalThis);