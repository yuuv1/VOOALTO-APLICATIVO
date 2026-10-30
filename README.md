# VOOALTO — aplicativo de Ficha Técnica, Orçamento e Contrato

Sistema local (100% offline, roda no navegador) para produzir a **ficha técnica
de produção**, a **proposta de venda** e o **documento contratual** de uniformes.

## Versão em desenvolvimento: **V10**

```
VERSAO_10_0/                    ← única versão do app
  ATUALIZACAO_V10/              app (é esta pasta que o servidor local serve)
    index.html                  shell: barra do topo + 3 ferramentas em tela cheia
    criador_ficha_tecnica/      módulo 1 — folha(s) A4 de produção
    criador_orcamento/          módulo 2 — proposta de venda A4
    criador_contrato/           módulo 3 — contrato em .docx/.pdf (ver abaixo)
    manual.html                 manual completo
    mockup/                     estúdio da peça (camiseta) + render vetorial
    limpar_cache.html           apaga só o cache do service worker
    zerar_dados.html            apaga os dados (duas confirmações)
    manifest.webmanifest        identidade PWA
    version.json                app + versão (fonte única, lida pelos 2 servidores)
    sw.js                       cache offline (GERADO pelo build)
    server.js / server.py       servidor local em 127.0.0.1:4800
    instalar_e_abrir_V10.bat    inicializador Windows
    assets/  icons/             bibliotecas, fontes, logos e ícones locais
  build_v10_pwa.py              gera o sw.js e o VOOALTO_V10_PWA.zip
  tools/atualizar_contrato.py   copia+corrige o motor de contratos para o app
  tests/                        suíte automatizada (jsdom + unittest)
  PLANO_V10.md                  arquitetura do sistema como ele é hoje
  CHANGELOG_V10.md              o que mudou em cada versão

documento-contratual/           projeto-fonte do motor de contratos (React + TS)
  Abrir_Sistema_Vooalto.html    artefato autônomo — é o que a V10 embarca
  web/  docs/  contratos/       código, build estático e contratos de exemplo
```

Para usar o app **não** é preciso instalar nada além de um navegador: o `.bat`
sobe o servidor com Node.js **ou** com Python 3.10+ (o que existir na máquina;
Node tem preferência). Node só é obrigatório para desenvolver e rodar os testes.

As pastas das versões V5, V6, V7, V8 e V9 foram removidas; o conteúdo da V9 é a
base da V10. A V10 usa o **mesmo endereço** (`http://localhost:4800/`) e as
**mesmas chaves de dados** — quem atualiza não perde ficha, rascunho, orçamento
nem o estado do contrato.

## As três ferramentas

| Aba | O que faz | Carrega |
|---|---|---|
| 📋 Ficha Técnica | cliente, modelos, cores, medidas, artes e o estúdio do mockup; sai em A4 (PDF/PNG) | na abertura |
| 💰 Orçamento | proposta com itens, totais, destaques e assinatura; sai em A4 | ao abrir a aba |
| 📄 Contrato | arrasta a ficha ou a proposta em PDF e gera o contrato em .docx e .pdf | ao abrir a aba (bundle de ~10 MB) |

O módulo de contrato é o app `documento-contratual/` embarcado: leitura de PDF e
OCR acontecem **no navegador**, nada é enviado para fora. Ele **não** é copiado à
mão — `tools/atualizar_contrato.py` copia e aplica a correção obrigatória do
limpador de cache (sem ela, o contrato apagaria o precache da V10 na primeira
abertura). Detalhes em `VERSAO_10_0/PLANO_V10.md` §13.

## Rodar

Windows (uso normal): dois cliques em `instalar_e_abrir_V10.bat` dentro de
`ATUALIZACAO_V10/`.

Desenvolvimento:

```bash
cd VERSAO_10_0
npm install            # Node 20+ (jsdom é a única dependência)
npm test               # suíte JS (jsdom) — 16 suítes
npm run test:python    # build, contrato, identidade e servidor (Python 3.10+)
npm run build          # regenera sw.js e o ZIP de distribuição

# uma suíte só, enquanto trabalha num módulo:
node tests/test_contrato_v10.js

# atualizar o motor de contratos depois de mexer em documento-contratual/:
python3 tools/atualizar_contrato.py && npm run build

# preview no navegador (0.0.0.0:8080):
python3 tools/servir_preview.py
```

**`sw.js` e o ZIP são gerados**, não editados à mão. Mudou qualquer arquivo de
`ATUALIZACAO_V10/`, rode `npm run build`: o hash do conteúdo muda, o service
worker novo assume e quem já usa o app recebe a atualização. O CI
(`.github/workflows/ci.yml`) falha se o `sw.js` commitado estiver fora de
sincronia. O ZIP não é versionado (sai como artefato de release).

O bundle do contrato entra no precache em **segunda fase** (`PRECACHE_PESADOS`,
arquivos acima de 2 MB): `cache.addAll()` é atômico e uma falha em 10 MB
derrubaria a instalação inteira do service worker.

## Documentos

- `VERSAO_10_0/PLANO_V10.md` — como o sistema é por dentro (módulos, dados,
  temas, PWA, servidor, testes, integração do contrato) e o que **não** fazer.
- `VERSAO_10_0/CHANGELOG_V10.md` — o que mudou, com a causa de cada correção.
- `VERSAO_10_0/ATUALIZACAO_V10/README.txt` — guia rápido do usuário final.
- `documento-contratual/INTEGRACAO.md` — como o motor de contratos se integra.

## Licença

O repositório ainda **não tem licença definida** (sem `LICENSE`): o código está
sob copyright do autor, todos os direitos reservados. Se o app for distribuído
a clientes, vale escolher uma licença antes disso.
