const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

for (const archivo of ['SisGranja_v2.5.html', 'index.html', 'SisGranja/index.html']) test(`${archivo}: la guía de voz no recomienda drenar linfadenitis`, () => {
    const html = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
    const inicio = html.indexOf("titulo: 'Abscesos / linfadenitis'");
    const fin = html.indexOf('], pie: AVISO_VET', inicio);
    assert.ok(inicio >= 0 && fin > inicio);
    const respuesta = html.slice(inicio, fin);
    assert.match(respuesta, /No drene el absceso/);
    assert.doesNotMatch(respuesta, /Drene el absceso maduro|Enrofloxacina/);
    const diarreaInicio = html.indexOf("titulo: 'Diarreas / enteritis'");
    const diarreaFin = html.indexOf('], pie: AVISO_VET', diarreaInicio);
    assert.ok(diarreaInicio >= 0 && diarreaFin > diarreaInicio);
    assert.doesNotMatch(html.slice(diarreaInicio, diarreaFin), /enrofloxacina|toltrazuril/i);
});

test('el analisis resumido no entrega dosis generadas por el modelo', async () => {
    let handler;
    globalThis.Deno = {
        env: { get: nombre => ({ ALLOWED_ORIGINS: 'https://granja.test', GEMINI_API_KEY: 'test' })[nombre] },
        serve: callback => { handler = callback; }
    };
    globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        enfermedad: 'Posible infeccion', farmaco_dosis: 'dosis generada', dias: '5 dias', accion: 'aislar', prevencion: 'limpieza'
    }) }] } }] });
    require('../SisGranja/supabase/functions/veterinario-virtual/index.ts');
    const respuesta = await handler(new Request('https://servicio.test', {
        method: 'POST', headers: { origin: 'https://granja.test', 'content-type': 'application/json' },
        body: JSON.stringify({ formato: 'resumido', image: 'iVBORw0KGgo=', mime_type: 'image/png' })
    }));
    assert.equal(respuesta.status, 200);
    const { result } = await respuesta.json();
    assert.match(result.farmaco_dosis, /Consultar al veterinario/);
    assert.equal(result.dias, 'Según evaluación veterinaria.');
});