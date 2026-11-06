create table public.sisgranja_granjas_v3 (
    id uuid primary key default gen_random_uuid(),
    nombre text not null check (length(trim(nombre)) between 1 and 120),
    creado_por uuid not null references auth.users(id),
    creado timestamptz not null default now()
);

create table public.sisgranja_miembros_v3 (
    granja_id uuid not null references public.sisgranja_granjas_v3(id) on delete cascade,
    usuario_id uuid not null references auth.users(id) on delete cascade,
    primary key (granja_id, usuario_id)
);

create table public.sisgranja_estado_v3 (
    granja_id uuid primary key references public.sisgranja_granjas_v3(id) on delete cascade,
    datos jsonb not null check (jsonb_typeof(datos) = 'object'),
    version bigint not null check (version > 0),
    actualizado timestamptz not null default now()
);

alter table public.sisgranja_granjas_v3 enable row level security;
alter table public.sisgranja_miembros_v3 enable row level security;
alter table public.sisgranja_estado_v3 enable row level security;

create policy miembros_propios on public.sisgranja_miembros_v3 for select to authenticated
    using (usuario_id = (select auth.uid()));
create policy granjas_propias on public.sisgranja_granjas_v3 for select to authenticated
    using (exists (select 1 from public.sisgranja_miembros_v3 miembro where miembro.granja_id = id and miembro.usuario_id = (select auth.uid())));
create policy estado_propio on public.sisgranja_estado_v3 for select to authenticated
    using (exists (select 1 from public.sisgranja_miembros_v3 miembro where miembro.granja_id = sisgranja_estado_v3.granja_id and miembro.usuario_id = (select auth.uid())));

revoke all on public.sisgranja_granjas_v3, public.sisgranja_miembros_v3, public.sisgranja_estado_v3 from public, anon, authenticated;
grant select on public.sisgranja_granjas_v3, public.sisgranja_miembros_v3, public.sisgranja_estado_v3 to authenticated;

create function public.sisgranja_crear_granja_v3(nombre_granja text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    usuario uuid := auth.uid();
    granja uuid;
begin
    if usuario is null then raise exception 'Autenticación requerida' using errcode = '42501'; end if;
    insert into public.sisgranja_granjas_v3(nombre, creado_por) values (trim(nombre_granja), usuario) returning id into granja;
    insert into public.sisgranja_miembros_v3(granja_id, usuario_id) values (granja, usuario);
    return granja;
end;
$$;

create function public.sisgranja_guardar_estado_v3(granja uuid, version_esperada bigint, estado jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
    nueva_version bigint;
begin
    if auth.uid() is null or not exists (
        select 1 from public.sisgranja_miembros_v3 miembro where miembro.granja_id = granja and miembro.usuario_id = auth.uid()
    ) then raise exception 'Granja no autorizada' using errcode = '42501'; end if;
    if version_esperada is null or version_esperada < 0 or estado is null or jsonb_typeof(estado) <> 'object' then
        raise exception 'Estado o versión inválidos' using errcode = '22023';
    end if;
    if version_esperada = 0 then
        insert into public.sisgranja_estado_v3(granja_id, datos, version) values (granja, estado, 1)
        on conflict (granja_id) do nothing returning version into nueva_version;
    else
        update public.sisgranja_estado_v3 set datos = estado, version = version + 1, actualizado = now()
        where granja_id = granja and version = version_esperada returning version into nueva_version;
    end if;
    if nueva_version is null then raise exception 'Conflicto de versión' using errcode = '40001'; end if;
    return nueva_version;
end;
$$;

revoke all on function public.sisgranja_crear_granja_v3(text) from public, anon;
revoke all on function public.sisgranja_guardar_estado_v3(uuid, bigint, jsonb) from public, anon;
grant execute on function public.sisgranja_crear_granja_v3(text) to authenticated;
grant execute on function public.sisgranja_guardar_estado_v3(uuid, bigint, jsonb) to authenticated;