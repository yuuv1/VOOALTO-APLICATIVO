-- ══════════════════════════════════════════════════════════════════════════
-- VOOALTO V10.3 — Rascunhos online (Supabase)
--
-- Problema que isto resolve: os rascunhos viviam só no navegador de cada
-- aparelho (localStorage / IndexedDB). A ficha em andamento, o rascunho
-- anterior, as fichas de "Minhas fichas" e os rascunhos de orçamento feitos
-- num computador NÃO existiam nos outros — quem trocava de máquina (ou
-- limpava o navegador) perdia o trabalho em andamento.
--
-- Aqui cada rascunho vira uma linha central em `vooalto_rascunhos`, chaveada
-- por (tipo, chave):
--
--   tipo 'ficha_salva'     chave = id local  -> cada ficha de "Minhas fichas"
--   tipo 'orcamento'       chave = id local  -> cada rascunho de orçamento
--
-- Só os rascunhos SALVOS são compartilhados (decisão do usuário): cada
-- computador edita uma ficha diferente ao mesmo tempo, então o trabalho em
-- andamento (autosave, slot único) continua LOCAL — compartilhar esse slot
-- faria um aparelho pisar no trabalho do outro.
--
-- Regras:
--   * TODOS os aparelhos conectados veem e editam os MESMOS rascunhos
--     (não há login no app; a chave publicável só executa as funções abaixo);
--   * conflito = "a edição mais recente vence" (atualizado_em do servidor);
--     o aparelho que perde mantém uma cópia local de segurança;
--   * exclusão propaga: apagar num aparelho apaga nos outros (tumba
--     `excluido = true`, para quem estava offline aprender ao voltar);
--   * sem rede nada trava: o app continua no armazenamento local e
--     sincroniza sozinho quando a conexão volta (funções idempotentes).
--
-- Como na numeração (V10.2), a tabela fica com RLS ligado e SEM policy:
-- ninguém lê nem escreve direto pelo PostgREST. A API são só as funções
-- SECURITY DEFINER abaixo.
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.vooalto_rascunhos (
  tipo              text not null,
  chave             text not null,
  titulo            text,
  payload           jsonb not null default '{}'::jsonb,
  dispositivo       text,
  dispositivo_nome  text,
  excluido          boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  primary key (tipo, chave)
);

create index if not exists vooalto_rascunhos_atualizado_idx
  on public.vooalto_rascunhos (atualizado_em);
create index if not exists vooalto_rascunhos_tipo_idx
  on public.vooalto_rascunhos (tipo);

alter table public.vooalto_rascunhos enable row level security;

-- ── Salvar (criar/atualizar) um rascunho ───────────────────────────────────
-- Idempotente: salvar o MESMO conteúdo de novo devolve a mesma linha sem
-- mexer no relógio (senão o polling do próprio aparelho pareceria edição de
-- outra máquina). Ressuscita linhas excluídas (quem editou offline e voltou
-- depois da exclusão readiciona o rascunho — a edição mais recente vence).
create or replace function public.vooalto_rascunho_salvar(
  p_tipo text,
  p_chave text,
  p_titulo text default null,
  p_payload jsonb default '{}'::jsonb,
  p_dispositivo text default null,
  p_dispositivo_nome text default null
) returns table (tipo text, chave text, titulo text, dispositivo_nome text, atualizado_em timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tipo text := left(btrim(coalesce(p_tipo, '')), 40);
  v_chave text := left(btrim(coalesce(p_chave, '')), 160);
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_tipo = '' or v_chave = '' then
    raise exception 'tipo/chave vazios';
  end if;
  if octet_length(v_payload::text) > 9000000 then
    raise exception 'rascunho grande demais (limite ~9 MB)';
  end if;

  insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
  values (v_tipo, v_chave, left(coalesce(p_titulo, ''), 300), v_payload,
          left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), false)
  on conflict (tipo, chave) do update
    set titulo = excluded.titulo,
        payload = excluded.payload,
        dispositivo = excluded.dispositivo,
        dispositivo_nome = excluded.dispositivo_nome,
        excluido = false,
        atualizado_em = case
          when vooalto_rascunhos.payload = excluded.payload
               and vooalto_rascunhos.titulo = excluded.titulo
               and not vooalto_rascunhos.excluido
          then vooalto_rascunhos.atualizado_em
          else now()
        end;

  return query
    select r.tipo, r.chave, coalesce(r.titulo, ''), coalesce(r.dispositivo_nome, ''), r.atualizado_em
      from vooalto_rascunhos r where r.tipo = v_tipo and r.chave = v_chave;
end $function$;

-- ── Excluir um rascunho (tumba: a exclusão precisa viajar aos outros) ─────
create or replace function public.vooalto_rascunho_excluir(
  p_tipo text,
  p_chave text,
  p_dispositivo text default null,
  p_dispositivo_nome text default null
) returns table (tipo text, chave text, excluido boolean, atualizado_em timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_tipo text := left(btrim(coalesce(p_tipo, '')), 40);
  v_chave text := left(btrim(coalesce(p_chave, '')), 160);
begin
  if v_tipo = '' or v_chave = '' then
    raise exception 'tipo/chave vazios';
  end if;

  insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
  values (v_tipo, v_chave, '', '{}'::jsonb,
          left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), true)
  on conflict (tipo, chave) do update
    set payload = '{}'::jsonb,
        dispositivo = excluded.dispositivo,
        dispositivo_nome = excluded.dispositivo_nome,
        excluido = true,
        atualizado_em = case when vooalto_rascunhos.excluido
                             then vooalto_rascunhos.atualizado_em else now() end;

  return query
    select r.tipo, r.chave, r.excluido, r.atualizado_em
      from vooalto_rascunhos r where r.tipo = v_tipo and r.chave = v_chave;
end $function$;

-- ── Sincronização: tudo que mudou desde um instante (inclusive exclusões) ──
-- O app chama com o último instante que ele já viu; na primeira vez, com a
-- época (1970), e recebe a nuvem inteira. O teto de linhas protege contra
-- respostas gigantes; o cliente avança o cursor pelo maior atualizado_em.
create or replace function public.vooalto_rascunhos_desde(
  p_desde timestamptz default '1970-01-01T00:00:00Z'::timestamptz,
  p_limite integer default 500
) returns table (tipo text, chave text, titulo text, payload jsonb,
                 dispositivo text, dispositivo_nome text, excluido boolean,
                 atualizado_em timestamptz)
language sql security definer set search_path to 'public'
as $function$
  select r.tipo, r.chave, coalesce(r.titulo, ''), r.payload,
         coalesce(r.dispositivo, ''), coalesce(r.dispositivo_nome, ''),
         r.excluido, r.atualizado_em
    from vooalto_rascunhos r
   where r.atualizado_em > coalesce(p_desde, '1970-01-01T00:00:00Z'::timestamptz)
   order by r.atualizado_em asc
   limit least(greatest(coalesce(p_limite, 500), 1), 2000);
$function$;

-- ── Leitura leve (sem payload): quem tem o quê, para diagnóstico/UI ───────
create or replace function public.vooalto_rascunhos_resumo()
returns table (tipo text, total integer, ultimo timestamptz)
language sql security definer set search_path to 'public'
as $function$
  select r.tipo, count(*)::integer, max(r.atualizado_em)
    from vooalto_rascunhos r
   where not r.excluido
   group by r.tipo
   order by r.tipo;
$function$;

-- ── Permissões: só as funções são a API (a tabela continua fechada) ───────
revoke all on public.vooalto_rascunhos from anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vooalto\_rascunho%'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.assinatura);
  end loop;
end $$;

-- Correção (teste de fumaça no projeto real): sem a diretiva abaixo, os
-- nomes das colunas de saída (tipo/chave) colidem com as colunas da tabela
-- dentro do INSERT ... ON CONFLICT ("column reference is ambiguous").
create or replace function public.vooalto_rascunho_salvar(
  p_tipo text, p_chave text, p_titulo text default null, p_payload jsonb default '{}'::jsonb,
  p_dispositivo text default null, p_dispositivo_nome text default null
) returns table (tipo text, chave text, titulo text, dispositivo_nome text, atualizado_em timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
#variable_conflict use_variable
declare
  v_tipo text := left(btrim(coalesce(p_tipo, '')), 40);
  v_chave text := left(btrim(coalesce(p_chave, '')), 160);
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_tipo = '' or v_chave = '' then raise exception 'tipo/chave vazios'; end if;
  if octet_length(v_payload::text) > 9000000 then raise exception 'rascunho grande demais (limite ~9 MB)'; end if;
  insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
  values (v_tipo, v_chave, left(coalesce(p_titulo, ''), 300), v_payload,
          left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), false)
  on conflict (tipo, chave) do update
    set titulo = excluded.titulo, payload = excluded.payload,
        dispositivo = excluded.dispositivo, dispositivo_nome = excluded.dispositivo_nome,
        excluido = false,
        atualizado_em = case
          when vooalto_rascunhos.payload = excluded.payload
               and vooalto_rascunhos.titulo = excluded.titulo
               and not vooalto_rascunhos.excluido
          then vooalto_rascunhos.atualizado_em else now() end;
  return query
    select r.tipo, r.chave, coalesce(r.titulo, ''), coalesce(r.dispositivo_nome, ''), r.atualizado_em
      from vooalto_rascunhos r where r.tipo = v_tipo and r.chave = v_chave;
end $function$;

create or replace function public.vooalto_rascunho_excluir(
  p_tipo text, p_chave text, p_dispositivo text default null, p_dispositivo_nome text default null
) returns table (tipo text, chave text, excluido boolean, atualizado_em timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
#variable_conflict use_variable
declare
  v_tipo text := left(btrim(coalesce(p_tipo, '')), 40);
  v_chave text := left(btrim(coalesce(p_chave, '')), 160);
begin
  if v_tipo = '' or v_chave = '' then raise exception 'tipo/chave vazios'; end if;
  insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
  values (v_tipo, v_chave, '', '{}'::jsonb,
          left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), true)
  on conflict (tipo, chave) do update
    set payload = '{}'::jsonb, dispositivo = excluded.dispositivo,
        dispositivo_nome = excluded.dispositivo_nome, excluido = true,
        atualizado_em = case when vooalto_rascunhos.excluido
                             then vooalto_rascunhos.atualizado_em else now() end;
  return query
    select r.tipo, r.chave, r.excluido, r.atualizado_em
      from vooalto_rascunhos r where r.tipo = v_tipo and r.chave = v_chave;
end $function$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vooalto\_rascunho%'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.assinatura);
  end loop;
end $$;

-- Correção 2 (idem): em PL/pgSQL os parâmetros de saída colidem com os nomes
-- das colunas também no alvo do ON CONFLICT. As duas funções de escrita viram
-- SQL puro (parâmetros só aparecem como p_*), eliminando a ambiguidade.
create or replace function public.vooalto_rascunho_salvar(
  p_tipo text, p_chave text, p_titulo text default null, p_payload jsonb default '{}'::jsonb,
  p_dispositivo text default null, p_dispositivo_nome text default null
) returns table (tipo text, chave text, titulo text, dispositivo_nome text, atualizado_em timestamptz)
language sql security definer set search_path to 'public'
as $function$
  with up as (
    insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
    select left(btrim(coalesce(p_tipo, '')), 40), left(btrim(coalesce(p_chave, '')), 160),
           left(coalesce(p_titulo, ''), 300), coalesce(p_payload, '{}'::jsonb),
           left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), false
     where btrim(coalesce(p_tipo, '')) <> '' and btrim(coalesce(p_chave, '')) <> ''
       and octet_length(coalesce(p_payload, '{}'::jsonb)::text) <= 9000000
    on conflict (tipo, chave) do update
      set titulo = excluded.titulo, payload = excluded.payload,
          dispositivo = excluded.dispositivo, dispositivo_nome = excluded.dispositivo_nome,
          excluido = false,
          atualizado_em = case
            when vooalto_rascunhos.payload = excluded.payload
                 and vooalto_rascunhos.titulo = excluded.titulo
                 and not vooalto_rascunhos.excluido
            then vooalto_rascunhos.atualizado_em else now() end
    returning vooalto_rascunhos.tipo, vooalto_rascunhos.chave, vooalto_rascunhos.titulo,
              vooalto_rascunhos.dispositivo_nome, vooalto_rascunhos.atualizado_em
  )
  select up.tipo, up.chave, coalesce(up.titulo, ''), coalesce(up.dispositivo_nome, ''), up.atualizado_em from up;
$function$;

create or replace function public.vooalto_rascunho_excluir(
  p_tipo text, p_chave text, p_dispositivo text default null, p_dispositivo_nome text default null
) returns table (tipo text, chave text, excluido boolean, atualizado_em timestamptz)
language sql security definer set search_path to 'public'
as $function$
  with up as (
    insert into vooalto_rascunhos (tipo, chave, titulo, payload, dispositivo, dispositivo_nome, excluido)
    select left(btrim(coalesce(p_tipo, '')), 40), left(btrim(coalesce(p_chave, '')), 160),
           '', '{}'::jsonb,
           left(coalesce(p_dispositivo, ''), 120), left(coalesce(p_dispositivo_nome, ''), 120), true
     where btrim(coalesce(p_tipo, '')) <> '' and btrim(coalesce(p_chave, '')) <> ''
    on conflict (tipo, chave) do update
      set payload = '{}'::jsonb, dispositivo = excluded.dispositivo,
          dispositivo_nome = excluded.dispositivo_nome, excluido = true,
          atualizado_em = case when vooalto_rascunhos.excluido
                               then vooalto_rascunhos.atualizado_em else now() end
    returning vooalto_rascunhos.tipo, vooalto_rascunhos.chave, vooalto_rascunhos.excluido,
              vooalto_rascunhos.atualizado_em
  )
  select up.tipo, up.chave, up.excluido, up.atualizado_em from up;
$function$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vooalto\_rascunho%'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.assinatura);
  end loop;
end $$;

-- Correção 3: a sincronização ganha filtro por tipo. Cada módulo do app
-- (Ficha / Orçamento) mantém seu próprio cursor; sem o filtro, abrir a Ficha
-- avançaria o cursor global para além dos rascunhos de orçamento ainda não
-- baixados, e eles nunca chegariam neste aparelho.
drop function if exists public.vooalto_rascunhos_desde(timestamptz, integer);
create or replace function public.vooalto_rascunhos_desde(
  p_desde timestamptz default '1970-01-01T00:00:00Z'::timestamptz,
  p_limite integer default 500,
  p_tipo text default null
) returns table (tipo text, chave text, titulo text, payload jsonb,
                 dispositivo text, dispositivo_nome text, excluido boolean,
                 atualizado_em timestamptz)
language sql security definer set search_path to 'public'
as $function$
  select r.tipo, r.chave, coalesce(r.titulo, ''), r.payload,
         coalesce(r.dispositivo, ''), coalesce(r.dispositivo_nome, ''),
         r.excluido, r.atualizado_em
    from vooalto_rascunhos r
   where r.atualizado_em > coalesce(p_desde, '1970-01-01T00:00:00Z'::timestamptz)
     and (p_tipo is null or r.tipo = p_tipo)
   order by r.atualizado_em asc
   limit least(greatest(coalesce(p_limite, 500), 1), 2000);
$function$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vooalto\_rascunho%'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.assinatura);
  end loop;
end $$;
