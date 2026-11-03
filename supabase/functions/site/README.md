# Servidor do site no Supabase (`functions/v1/site`)

O app V10 é uma PWA de arquivos estáticos. O Supabase **não hospeda site
estático**: o Storage entrega `.html` como `text/plain` e o Edge Function não
devolve HTML. A função `site` resolve isso lendo o arquivo do Storage ou do
GitHub e devolvendo com o `Content-Type` certo.

## Endereço público

```
https://eeurdquvrdmoyjgzgpac.supabase.co/functions/v1/site/
```

- raiz → `index.html` (o app)
- `home` → capa de entrada (`entrar.html`) — usada para instalar o app/offline
- `version.json`, `sw.js`, `manifest.webmanifest`, `assets/…` → arquivos do app

## De onde saem os arquivos

1. bucket `app` do Storage (envio imediato) — hoje **vazio**; o upload precisa de
   uma chave `service_role` (`node VERSAO_10_0/tools/publicar_supabase.mjs`);
2. GitHub `yuuv1/VOOALTO-APLICATIVO@main`, pasta `VERSAO_10_0/ATUALIZACAO_V10`
   — é o caminho em uso: `git push` na `main` já publica.

O cabeçalho `x-vooalto-origem` diz de qual fonte veio (`storage`, `github` ou
`shell`).

## Duas armadilhas do gateway (medidas em 2026-11-03)

| Situação | O que acontece | O que a função faz |
|---|---|---|
| `content-type: text/html` (minúsculo) | o gateway troca por `text/plain` | envia `Text/HTML; charset=utf-8` — a troca só pega o valor exato em minúsculas e o MIME é case-insensitive |
| URL terminada em `.html` | o gateway força `text/plain` pela extensão do caminho, ignorando o cabeçalho | a capa é servida em caminho **sem** extensão (`/site/home`) e o app inteiro na raiz (`/site/`) |

JS, CSS, JSON e `manifest.webmanifest` passam intactos (verificado).

## Atualizar a função

O código-fonte é este arquivo. Publique com a ferramenta do Supabase
(Edge Functions → `site` → colar o conteúdo) ou pela CLI:

```bash
supabase functions deploy site --project-ref eeurdquvrdmoyjgzgpac --no-verify-jwt
```

## Como conferir sem navegador

Do próprio banco (o `bash` do ambiente não alcança `*.supabase.co`):

```sql
select net.http_get(url := 'https://eeurdquvrdmoyjgzgpac.supabase.co/functions/v1/site/');
select status_code, headers::jsonb->>'content-type', headers::jsonb->>'x-vooalto-origem'
  from net._http_response order by id desc limit 1;
```
