const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('dos granjas aisladas rechazan accesos cruzados y escrituras obsoletas', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            create role anon;
            create role authenticated;
            create schema auth;
            create table auth.users (id uuid primary key);
            create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
            grant usage on schema auth to authenticated;
            insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
        `);
        const migracion = fs.readFileSync(path.join(__dirname, '../SisGranja/supabase/migrations/20261106000000_granjas_v3.sql'), 'utf8');
        await db.exec(migracion);
        await db.exec("set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);");
        const { rows: [primera] } = await db.query("select public.sisgranja_crear_granja_v3('Primera') as id");
        await db.query('select public.sisgranja_guardar_estado_v3($1, 0, $2::jsonb)', [primera.id, JSON.stringify({ cuyes: [1] })]);
        await assert.rejects(db.query('select public.sisgranja_guardar_estado_v3($1, 0, $2::jsonb)', [primera.id, '{}']), /Conflicto de versión/);
        await db.exec("select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);");
        const { rows: [segunda] } = await db.query("select public.sisgranja_crear_granja_v3('Segunda') as id");
        assert.notEqual(primera.id, segunda.id);
        assert.deepEqual((await db.query('select id from public.sisgranja_granjas_v3')).rows.map(fila => fila.id), [segunda.id]);
        assert.equal((await db.query('select * from public.sisgranja_miembros_v3')).rows.length, 1);
        assert.equal((await db.query('select * from public.sisgranja_estado_v3')).rows.length, 0);
        await assert.rejects(db.query('select public.sisgranja_guardar_estado_v3($1, 1, $2::jsonb)', [primera.id, '{}']), /Granja no autorizada/);
        await assert.rejects(db.query('update public.sisgranja_estado_v3 set datos = $1::jsonb', ['{}']), /permission denied/);
        await db.query('select public.sisgranja_guardar_estado_v3($1, 0, $2::jsonb)', [segunda.id, '{"cuyes":[2]}']);
        await db.exec("select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);");
        assert.deepEqual((await db.query('select granja_id from public.sisgranja_estado_v3')).rows.map(fila => fila.granja_id), [primera.id]);
        await db.query('select public.sisgranja_guardar_estado_v3($1, 1, $2::jsonb)', [primera.id, '{"cuyes":[3]}']);
        await assert.rejects(db.query('select public.sisgranja_guardar_estado_v3($1, 1, $2::jsonb)', [primera.id, '{}']), /Conflicto de versión/);
        await db.exec("reset role; set role anon;");
        await assert.rejects(db.query('select * from public.sisgranja_estado_v3'), /permission denied/);
    } finally {
        await db.close();
    }
});