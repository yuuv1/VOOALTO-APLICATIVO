# VOOALTO — aplicativo de Ficha Técnica e Orçamento

Sistema local (100% offline, roda no navegador) para produzir a **ficha técnica
de produção** e a **proposta de venda** de uniformes.

## Versão em desenvolvimento: **V9**

```
VERSAO_9_0/                     ← única versão do projeto
  ATUALIZACAO_V9/               app (é esta pasta que o servidor local serve)
    index.html                  shell: barra do topo + Ficha Técnica + Orçamento
    criador_ficha_tecnica/      módulo 1 — folha(s) A4 de produção
    criador_orcamento/          módulo 2 — proposta de venda A4
    manual.html                 manual completo
    mockup/                     estúdio da peça (camiseta) + render vetorial
    limpar_cache.html           apaga só o cache do service worker
    zerar_dados.html            apaga os dados (duas confirmações)
    manifest.webmanifest        identidade PWA
    version.json                app + versão (fonte única, lida pelos 2 servidores)
    sw.js                       cache offline (GERADO pelo build)
    server.js / server.py       servidor local em 127.0.0.1:4800
    instalar_e_abrir_V9.bat     inicializador Windows
    assets/  icons/             bibliotecas, fontes, logos e ícones locais
  build_v9_pwa.py               gera o sw.js e o VOOALTO_V9_PWA.zip
  tests/                        suíte automatizada (jsdom + unittest)
  tools/servir_preview.py       servidor de preview em 0.0.0.0 (para conferir)
  PLANO_V9.md                   arquitetura do sistema como ele é hoje
  CHANGELOG_V9.md               o que mudou em cada versão (V9 + histórico V8)
```

Para usar o app **não** é preciso instalar nada além de um navegador: o `.bat`
sobe o servidor com Node.js **ou** com Python 3.10+ (o que existir na máquina;
Node tem preferência). Node só é obrigatório para desenvolver e rodar os testes.

As pastas das versões V5, V6, V7 e V8 foram removidas; o conteúdo da V8 é a base
da V9. A V9 usa o **mesmo endereço** (`http://localhost:4800/`) e as **mesmas
chaves de dados** da V8 — quem atualiza não perde ficha, rascunho nem orçamento.

## Rodar

Windows (uso normal): dois cliques em `instalar_e_abrir_V9.bat` dentro de
`ATUALIZACAO_V9/`.

Desenvolvimento:

```bash
cd VERSAO_9_0
npm install            # Node 20+ (jsdom é a única dependência)
npm test               # suíte JS (jsdom) — 15 suítes
npm run test:python    # build, identidade e servidor (Python 3.10+)
npm run build          # regenera sw.js e o ZIP de distribuição

# uma suíte só, enquanto trabalha num módulo:
node tests/test_mockup_v9.js

# preview no navegador (0.0.0.0:8080):
python3 tools/servir_preview.py
```

**`sw.js` e o ZIP são gerados**, não editados à mão. Mudou qualquer arquivo de
`ATUALIZACAO_V9/`, rode `npm run build`: o hash do conteúdo muda, o service
worker novo assume e quem já usa o app recebe a atualização. O CI
(`.github/workflows/ci.yml`) falha se o `sw.js` commitado estiver fora de
sincronia. O ZIP não é versionado (sai como artefato de release).

## Documentos

- `VERSAO_9_0/PLANO_V9.md` — como o sistema é por dentro (módulos, dados,
  temas, PWA, servidor, testes) e o que **não** fazer.
- `VERSAO_9_0/CHANGELOG_V9.md` — o que mudou, com a causa de cada correção.
- `VERSAO_9_0/ATUALIZACAO_V9/README.txt` — guia rápido do usuário final.

## Licença

O repositório ainda **não tem licença definida** (sem `LICENSE`): o código está
sob copyright do autor, todos os direitos reservados. Se o app for distribuído
a clientes, vale escolher uma licença antes disso.
