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
    limpar_cache.html           apaga só o cache do service worker
    zerar_dados.html            apaga os dados (duas confirmações)
    manifest.webmanifest        identidade PWA
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

As pastas das versões V5, V6, V7 e V8 foram removidas; o conteúdo da V8 é a base
da V9. A V9 usa o **mesmo endereço** (`http://localhost:4800/`) e as **mesmas
chaves de dados** da V8 — quem atualiza não perde ficha, rascunho nem orçamento.

## Rodar

Windows (uso normal): dois cliques em `instalar_e_abrir_V9.bat` dentro de
`ATUALIZACAO_V9/`.

Desenvolvimento:

```bash
cd VERSAO_9_0
npm install
npm test               # suíte JS (jsdom)
npm run test:python    # build + servidor
npm run build          # regenera sw.js e o ZIP de distribuição

# preview no navegador (0.0.0.0:8080):
python3 tools/servir_preview.py
```

## Documentos

- `VERSAO_9_0/PLANO_V9.md` — como o sistema é por dentro (módulos, dados,
  temas, PWA, servidor, testes) e o que **não** fazer.
- `VERSAO_9_0/CHANGELOG_V9.md` — o que mudou, com a causa de cada correção.
- `VERSAO_9_0/ATUALIZACAO_V9/README.txt` — guia rápido do usuário final.
