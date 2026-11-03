-- ══════════════════════════════════════════════════════════════════════════
-- VOOALTO V10.2 — Nuvem de numeração (Supabase)
--
-- Problema que isto resolve: o número da ficha técnica era guardado só no
-- navegador (localStorage `va4_ficha_counter` / `va3_num`). Duas máquinas
-- abertas com o mesmo contador geravam a MESMA ficha (3388 nas duas), e uma
-- delas podia imprimir um documento repetido.
--
-- Aqui o número deixa de ser um contador local e passa a ser uma RESERVA
-- central: a tabela `vooalto_numeros` guarda, para cada número, quem reservou
-- (dispositivo), para qual ficha e em que estado. Quem tenta pegar um número
-- que já é de outra máquina (em uso OU em backup) é recusado e o sistema sobe
-- para o próximo livre — sempre para cima, partindo de 3388, nunca repetindo.
--
-- Regras que valem para sempre:
--   * número nunca volta a ser entregue (nem "liberando" a ficha);
--   * a numeração é estritamente crescente por máquina;
--   * em uso e backup de OUTRA máquina bloqueiam igualmente;
--   * sem rede o app reserva localmente e sincroniza depois (as funções são
--     idempotentes: repetir a mesma reserva devolve o mesmo número).
--
-- A tabela fica com RLS ligado e SEM policy: ninguém lê nem escreve direto
-- pelo PostgREST. Toda a API é feita pelas funções SECURITY DEFINER abaixo,
-- que só expõem o necessário (número, estado, dono e cliente).
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.vooalto_numeros (
  numero            integer primary key,
  status            text not null default 'em_uso',
  ficha_id          text,
  cliente           text,
  dispositivo       text,
  dispositivo_nome  text,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create table if not exists public.vooalto_dispositivos (
  id            text primary key,
  nome          text,
  plataforma    text,
  versao        text,
  criado_em     timestamptz not null default now(),
  ultimo_acesso timestamptz not null default now()
);

create index if not exists vooalto_numeros_status_idx on public.vooalto_numeros (status);
create index if not exists vooalto_numeros_dispositivo_idx on public.vooalto_numeros (dispositivo);

alter table public.vooalto_numeros enable row level security;
alter table public.vooalto_dispositivos enable row level security;

-- Trava de estado: só estes quatro valores entram (qualquer outra coisa vira
-- 'em_uso' nas funções, mas o CHECK impede escrita manual errada).
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.vooalto_numeros'::regclass
       and conname = 'vooalto_numeros_status_chk'
  ) then
    alter table public.vooalto_numeros
      add constraint vooalto_numeros_status_chk
      check (status in ('em_uso', 'salvo', 'impresso', 'backup'));
  end if;
end $$;

-- ── Registro do aparelho (nome amigável que aparece no aviso de conflito) ──
create or replace function public.vooalto_registrar_dispositivo(
  p_id text, p_nome text default null, p_plataforma text default null, p_versao text default null
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(btrim(p_id), '') = '' then
    raise exception 'dispositivo vazio';
  end if;
  insert into vooalto_dispositivos (id, nome, plataforma, versao)
  values (left(btrim(p_id), 120), left(coalesce(p_nome, ''), 120),
          left(coalesce(p_plataforma, ''), 120), left(coalesce(p_versao, ''), 40))
  on conflict (id) do update
    set nome = coalesce(nullif(excluded.nome, ''), vooalto_dispositivos.nome),
        plataforma = coalesce(nullif(excluded.plataforma, ''), vooalto_dispositivos.plataforma),
        versao = coalesce(nullif(excluded.versao, ''), vooalto_dispositivos.versao),
        ultimo_acesso = now();
end $function$;

-- ── Reserva atômica do próximo número livre (a função central) ─────────────
-- Devolve: numero (o que a máquina DEVE usar), ajustado (true quando o número
-- pedido não estava livre), motivo, dono (nome da máquina que tinha o número)
-- e status. O laço garante o "joga o dígito superior": 3388 ocupado → 3389 →
-- 3390… até achar um livre. Nunca desce, nunca repete.
create or replace function public.vooalto_reservar_numero(
  p_pedido integer,
  p_base integer default 3388,
  p_ficha text default null,
  p_dispositivo text default null,
  p_dispositivo_nome text default null,
  p_cliente text default null
) returns table (numero integer, ajustado boolean, motivo text, dono text, status text)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_alvo integer;
  v_base integer := greatest(coalesce(p_base, 3388), 1);
  v_dono text;
  v_status text;
  v_ficha text;
  v_disp text;
  v_tentativas integer := 0;
begin
  if coalesce(btrim(p_dispositivo), '') = '' then
    raise exception 'dispositivo vazio';
  end if;
  v_alvo := greatest(coalesce(p_pedido, v_base), v_base);

  loop
    v_tentativas := v_tentativas + 1;
    if v_tentativas > 200000 then
      raise exception 'sem numero livre acima de %', v_alvo;
    end if;

    select n.dispositivo_nome, n.status, n.ficha_id, n.dispositivo
      into v_dono, v_status, v_ficha, v_disp
      from vooalto_numeros n where n.numero = v_alvo;

    if found then
      -- Mesma máquina pedindo de novo a mesma ficha: devolve o que já é dela.
      if v_disp = btrim(p_dispositivo)
         and (p_ficha is null or v_ficha is null or v_ficha = p_ficha) then
        update vooalto_numeros n
           set status = 'em_uso', atualizado_em = now(),
               cliente = coalesce(nullif(left(coalesce(p_cliente, ''), 160), ''), n.cliente),
               ficha_id = coalesce(nullif(left(coalesce(p_ficha, ''), 120), ''), n.ficha_id)
         where n.numero = v_alvo;
        return query select v_alvo, false, 'ja_era_desta_maquina'::text,
                            coalesce(v_dono, ''), 'em_uso'::text;
        return;
      end if;
      -- Em uso ou backup de OUTRA máquina: número queimado, sobe um.
      v_alvo := v_alvo + 1;
      continue;
    end if;

    begin
      insert into vooalto_numeros (numero, status, ficha_id, cliente, dispositivo, dispositivo_nome)
      values (v_alvo, 'em_uso', left(coalesce(p_ficha, ''), 120), left(coalesce(p_cliente, ''), 160),
              left(btrim(p_dispositivo), 120), left(coalesce(p_dispositivo_nome, ''), 120));
      return query select v_alvo, v_tentativas > 1,
        case when v_tentativas > 1 then 'ajustado_para_o_proximo_livre' else 'livre' end,
        ''::text, 'em_uso'::text;
      return;
    exception when unique_violation then
      -- Outra máquina reservou no mesmo instante: tenta o próximo.
      v_alvo := v_alvo + 1;
    end;
  end loop;
end $function$;

-- ── Registrar/mudar estado de um número que ESTA máquina já usa ────────────
create or replace function public.vooalto_registrar_numero(
  p_numero integer,
  p_ficha text default null,
  p_status text default 'em_uso',
  p_dispositivo text default null,
  p_dispositivo_nome text default null,
  p_cliente text default null
) returns table (ok boolean, dono text, motivo text, status text)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_dono text; v_disp text; v_ficha text; v_status text;
  v_novo_status text := case when coalesce(p_status, '') in ('em_uso', 'salvo', 'impresso', 'backup')
                             then p_status else 'em_uso' end;
begin
  if p_numero is null or p_numero < 1 then
    return query select false, ''::text, 'numero_invalido'::text, ''::text;
    return;
  end if;
  if coalesce(btrim(p_dispositivo), '') = '' then
    raise exception 'dispositivo vazio';
  end if;

  select n.dispositivo_nome, n.dispositivo, n.ficha_id, n.status
    into v_dono, v_disp, v_ficha, v_status
    from vooalto_numeros n where n.numero = p_numero;

  if found then
    if v_disp = btrim(p_dispositivo) or (p_ficha is not null and v_ficha = p_ficha) then
      update vooalto_numeros n
         set status = case
               when n.status = 'backup' and v_novo_status <> 'backup' then n.status
               else v_novo_status end,
             atualizado_em = now(),
             cliente = coalesce(nullif(left(coalesce(p_cliente, ''), 160), ''), n.cliente),
             ficha_id = coalesce(nullif(left(coalesce(p_ficha, ''), 120), ''), n.ficha_id)
       where n.numero = p_numero;
      return query select true, coalesce(v_dono, ''), 'atualizado'::text, v_novo_status;
      return;
    end if;
    return query select false, coalesce(v_dono, ''), 'ja_esta_em_outra_maquina'::text, coalesce(v_status, '');
    return;
  end if;

  insert into vooalto_numeros (numero, status, ficha_id, cliente, dispositivo, dispositivo_nome)
  values (p_numero, v_novo_status, left(coalesce(p_ficha, ''), 120), left(coalesce(p_cliente, ''), 160),
          left(btrim(p_dispositivo), 120), left(coalesce(p_dispositivo_nome, ''), 120));
  return query select true, ''::text, 'criado'::text, v_novo_status;
end $function$;

-- ── Sincronizar o histórico local (fichas antigas) de uma vez ─────────────
-- Idempotente: números que já são desta máquina só sobem de status; números
-- de outra máquina são ignorados (NUNCA são sequestrados) e voltam em
-- `ignorados` para o app avisar o usuário.
create or replace function public.vooalto_registrar_lote(
  p_numeros integer[],
  p_status text default 'backup',
  p_dispositivo text default null,
  p_dispositivo_nome text default null,
  p_versao text default null
) returns table (registrados integer, ignorados integer, ultimo integer)
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_num integer;
  v_dono text;
  v_status text := case when coalesce(p_status, '') in ('em_uso', 'salvo', 'impresso', 'backup')
                        then p_status else 'backup' end;
  v_reg integer := 0;
  v_ign integer := 0;
begin
  if coalesce(btrim(p_dispositivo), '') = '' then
    raise exception 'dispositivo vazio';
  end if;

  foreach v_num in array coalesce(p_numeros, array[]::integer[]) loop
    if v_num is null or v_num < 1 then
      v_ign := v_ign + 1;
      continue;
    end if;
    select n.dispositivo into v_dono from vooalto_numeros n where n.numero = v_num;
    if found then
      if v_dono = btrim(p_dispositivo) then
        update vooalto_numeros n
           set status = case when n.status = 'backup' then v_status else n.status end,
               atualizado_em = now()
         where n.numero = v_num;
        v_reg := v_reg + 1;
      else
        v_ign := v_ign + 1;
      end if;
      continue;
    end if;
    begin
      insert into vooalto_numeros (numero, status, dispositivo, dispositivo_nome)
      values (v_num, v_status, left(btrim(p_dispositivo), 120), left(coalesce(p_dispositivo_nome, ''), 120));
      v_reg := v_reg + 1;
    exception when unique_violation then
      v_ign := v_ign + 1;
    end;
  end loop;

  return query select v_reg, v_ign, (select coalesce(max(numero), 3387) from vooalto_numeros);
end $function$;

-- ── Consultas de leitura ──────────────────────────────────────────────────
create or replace function public.vooalto_nuvem_ok()
returns table (ok boolean, servidor timestamptz, ultimo_numero integer, total_numeros integer)
language sql security definer set search_path to 'public'
as $function$
  select true, now(), coalesce(max(numero), 3387), count(*)::integer from vooalto_numeros;
$function$;

create or replace function public.vooalto_ultimo_numero()
returns integer
language sql security definer set search_path to 'public'
as $function$
  select coalesce(max(numero), 3387) from vooalto_numeros;
$function$;

create or replace function public.vooalto_proximo_livre(p_base integer default 3388)
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_alvo integer := greatest(coalesce(p_base, 3388), 1);
begin
  loop
    if not exists (select 1 from vooalto_numeros n where n.numero = v_alvo) then
      return v_alvo;
    end if;
    v_alvo := v_alvo + 1;
    if v_alvo > 9999999 then
      raise exception 'sem numero livre acima de %', v_alvo;
    end if;
  end loop;
end $function$;

create or replace function public.vooalto_verificar_numero(p_numero integer)
returns table (ocupado boolean, status text, dono text, dispositivo text, ficha text, desde timestamptz)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  return query
    select true, n.status, coalesce(n.dispositivo_nome, ''), coalesce(n.dispositivo, ''),
           coalesce(n.ficha_id, ''), n.atualizado_em
      from vooalto_numeros n where n.numero = p_numero;
  if not found then
    return query select false, ''::text, ''::text, ''::text, ''::text, null::timestamptz;
  end if;
end $function$;

create or replace function public.vooalto_numeros_ocupados(p_desde integer default 3388)
returns table (numero integer, status text, dono text, cliente text, atualizado_em timestamptz)
language sql security definer set search_path to 'public'
as $function$
  select n.numero, n.status, coalesce(n.dispositivo_nome, ''), coalesce(n.cliente, ''), n.atualizado_em
    from vooalto_numeros n
   where n.numero >= greatest(coalesce(p_desde, 3388), 1)
   order by n.numero
   limit 20000;
$function$;

-- ── Permissões: só as funções são a API (a tabela continua fechada) ───────
revoke all on public.vooalto_numeros from anon, authenticated;
revoke all on public.vooalto_dispositivos from anon, authenticated;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'vooalto\_%'
  loop
    execute format('revoke all on function %s from public', f.assinatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.assinatura);
  end loop;
end $$;
