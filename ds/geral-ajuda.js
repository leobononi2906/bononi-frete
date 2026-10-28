/* ============================================================
   geral-ajuda.js — Bononinha, aba "Perguntar" do botão Ajuda  |  v23 — 28/10/2026
   ============================================================
   Assistente de IA dentro de todos os apps. Não se carrega sozinho:
   o geral-central.js (v22+) busca este arquivo NA MESMA PASTA, com o
   mesmo ?v=, no primeiro clique da aba "Perguntar". Por isso cada app
   só precisa ter os dois arquivos lado a lado em ds/ (ou public/ds/) —
   nenhuma linha nova no index.html além do ?v= do geral-central.

   Fala com a Edge Function geral-assistente (bononi-hub, migration 0081):
   POST { app, appNome, tela, mensagens } → text/event-stream com
   { t } texto, { ferramenta } consultando, { rascunho } pedido pronto
   para revisar, { fim }, { erro, codigo }.

   A IA nunca envia pedido: o rascunho vira o botão "Revisar e enviar
   como pedido", que abre a aba "Novo pedido" já preenchida (ctx.preencherPedido).

   Conversa guardada em sessionStorage (some ao fechar a aba) — conveniência,
   dentro de try/catch; sem storage, funciona do mesmo jeito.

   ESTE ARQUIVO É CÓPIA VERBATIM. A original vive em bononi-hub/ds/.
   Mudou aqui? Suba o VERSAO do geral-central.js (o ?v= deste arquivo é o dele)
   e recopie os DOIS para todos os apps.
   ============================================================ */
(function () {
  'use strict';

  var MAX_HISTORICO = 12;

  var SUGESTOES = [
    { rotulo: 'Como faço…', texto: 'Como eu faço para ' },
    { rotulo: 'Dúvida de produto', texto: 'Tenho uma dúvida sobre o produto ' },
    { rotulo: 'Encontrei um problema', texto: 'Encontrei um problema nesta tela: ' },
  ];

  var STATUS_FERRAMENTA = {
    buscar_produto_bononi: 'Consultando o catálogo Bononi…',
    consultar_produto_stonni: 'Consultando a base técnica Stonni…',
    pedidos_parecidos: 'Vendo se alguém já pediu isso…',
    consultar_nota_expedicao: 'Consultando a nota na Expedição…',
    rascunhar_pedido: 'Montando o rascunho do pedido…',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Markdown simples: tudo escapado primeiro; só **negrito**, [link](https://…),
  // listas "- " e "1. " e parágrafos voltam a virar HTML.
  function inline(t) {
    return t
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  function markdown(texto) {
    var linhas = esc(texto).split('\n');
    var html = '';
    var lista = null;
    function fecharLista() { if (lista) { html += '</' + lista + '>'; lista = null; } }
    linhas.forEach(function (l) {
      var m;
      if ((m = l.match(/^\s*[-•]\s+(.*)$/))) {
        if (lista !== 'ul') { fecharLista(); html += '<ul>'; lista = 'ul'; }
        html += '<li>' + inline(m[1]) + '</li>';
      } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) {
        if (lista !== 'ol') { fecharLista(); html += '<ol>'; lista = 'ol'; }
        html += '<li>' + inline(m[1]) + '</li>';
      } else if (!l.trim()) {
        fecharLista();
      } else {
        fecharLista();
        html += '<p>' + inline(l.replace(/^#+\s*/, '')) + '</p>';
      }
    });
    fecharLista();
    return html;
  }

  function garantirEstilo() {
    if (document.getElementById('gc-ajuda-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gc-ajuda-estilo';
    s.textContent =
      '.gc-aj{display:flex;flex-direction:column;height:min(62vh,520px)}' +
      '.gc-aj-lista{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 2px 8px}' +
      '.gc-aj-msg{max-width:88%;padding:9px 12px;border-radius:10px;font-size:13px;line-height:1.45;word-wrap:break-word}' +
      '.gc-aj-msg p{margin:0 0 6px}.gc-aj-msg p:last-child{margin-bottom:0}' +
      '.gc-aj-msg ul,.gc-aj-msg ol{margin:4px 0 6px;padding-left:20px}.gc-aj-msg li{margin:2px 0}' +
      '.gc-aj-msg a{color:var(--text-accent,#c11f25);text-decoration:underline;font-weight:600}' +
      '.gc-aj-eu{align-self:flex-end;background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);white-space:pre-wrap}' +
      '.gc-aj-ia{align-self:flex-start;background:var(--surface-hover,#f5f6f8);color:var(--text-strong,#14161a)}' +
      '.gc-aj-status{align-self:flex-start;font-size:12px;color:var(--text-muted,#6b7382);font-style:italic}' +
      '.gc-aj-erro{align-self:stretch;font-size:12px;color:var(--text-accent,#c11f25);background:var(--surface-hover,#f5f6f8);border-radius:8px;padding:9px 12px}' +
      '.gc-aj-vazio{font-size:13px;color:var(--text-muted,#6b7382);line-height:1.5;padding:4px 2px}' +
      '.gc-aj-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}' +
      '.gc-aj-chip{padding:6px 11px;font-size:12px;font-weight:600;border-radius:999px;cursor:pointer;' +
        'border:1px solid var(--border-subtle,#e2e5ea);background:var(--surface-card,#fff);color:var(--text-strong,#14161a)}' +
      '.gc-aj-rasc{align-self:stretch;border:1px solid var(--border-subtle,#e2e5ea);border-radius:8px;padding:10px 12px;font-size:12px;background:var(--surface-card,#fff)}' +
      '.gc-aj-rasc .tit{font-weight:700;margin-bottom:4px;color:var(--text-strong,#14161a)}' +
      '.gc-aj-rasc .txt{white-space:pre-wrap;color:var(--text-muted,#6b7382);margin-bottom:8px;max-height:120px;overflow-y:auto}' +
      '.gc-aj-btn{padding:8px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;border:none;' +
        'background:var(--action-primary,#14161a);color:var(--text-inverse,#fff)}' +
      '.gc-aj-btn:disabled{opacity:.55;cursor:default}' +
      '.gc-aj-btn2{padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;' +
        'border:1px solid var(--border-subtle,#e2e5ea);background:var(--surface-card,#fff);color:var(--text-strong,#14161a)}' +
      '.gc-aj-form{display:flex;gap:8px;align-items:flex-end;border-top:1px solid var(--border-subtle,#e2e5ea);padding-top:10px}' +
      '.gc-aj-form textarea{flex:1;min-height:40px;max-height:120px;padding:9px 10px;font-size:13px;resize:none;font-family:inherit;' +
        'border:1px solid var(--border-subtle,#e2e5ea);border-radius:6px;background:var(--surface-card,#fff);color:var(--text-strong,#14161a)}' +
      '.gc-aj-rodape{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--text-muted,#6b7382);margin-top:6px}' +
      '.gc-aj-rodape button{background:none;border:none;padding:0;font-size:11px;color:var(--text-muted,#6b7382);text-decoration:underline;cursor:pointer}';
    document.head.appendChild(s);
  }

  function chave(o) { return 'gc-ajuda:' + o.appId + ':' + String(o.usuario.email || '').toLowerCase(); }
  function lerConversa(o) {
    try { var v = JSON.parse(sessionStorage.getItem(chave(o)) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function gravarConversa(o, msgs) {
    try { sessionStorage.setItem(chave(o), JSON.stringify(msgs.slice(-40))); } catch (e) { /* conveniência */ }
  }

  async function tokenFresco(o) {
    try {
      var s = await o.sb.auth.getSession();
      return s && s.data && s.data.session ? s.data.session.access_token : o.token;
    } catch (e) { return o.token; }
  }

  function montar(cont, o, ctx) {
    garantirEstilo();
    var msgs = lerConversa(o);
    var ocupado = false;

    cont.innerHTML =
      '<div class="gc-aj">' +
        '<div class="gc-aj-lista" id="gc-aj-lista"></div>' +
        '<div class="gc-aj-form">' +
          '<textarea id="gc-aj-texto" rows="1" placeholder="Pergunte à Bononinha: como usar o app, um produto, ou conte um problema"></textarea>' +
          '<button type="button" class="gc-aj-btn" id="gc-aj-enviar">Enviar</button>' +
        '</div>' +
        '<div class="gc-aj-rodape"><span>Respostas de IA podem errar: confira antes de passar ao cliente.</span>' +
          '<button type="button" id="gc-aj-limpar">Limpar conversa</button></div>' +
      '</div>';
    var lista = cont.querySelector('#gc-aj-lista');
    var campo = cont.querySelector('#gc-aj-texto');
    var botao = cont.querySelector('#gc-aj-enviar');

    function rolar() { lista.scrollTop = lista.scrollHeight; }

    function cartaoRascunho(r) {
      var div = document.createElement('div');
      div.className = 'gc-aj-rasc';
      var texto = r.tipo === 'bug'
        ? 'O que eu queria fazer: ' + r.o_que_queria + '\nO que deveria acontecer: ' + r.o_que_deveria + '\nO que aconteceu: ' + r.o_que_aconteceu
        : r.mensagem;
      div.innerHTML = '<div class="tit">' + (r.tipo === 'bug' ? 'Rascunho: algo não funcionou' : 'Rascunho: ideia de melhoria') + '</div>' +
        '<div class="txt">' + esc(texto) + '</div>' +
        '<button type="button" class="gc-aj-btn">Revisar e enviar como pedido</button>';
      div.querySelector('button').addEventListener('click', function () { ctx.preencherPedido(r); });
      return div;
    }

    function desenhar() {
      lista.innerHTML = '';
      if (!msgs.length) {
        var vazio = document.createElement('div');
        vazio.className = 'gc-aj-vazio';
        vazio.innerHTML = 'Oi! Eu sou a <b>Bononinha</b>, a assistente interna das aplicações da Bononi e da Stonni. Aqui no <b>' + esc(ctx.appNome) + '</b> posso explicar como usar esta tela, tirar dúvida de produto Bononi ou Stonni, ou ajudar a escrever um pedido de melhoria.' +
          '<div class="gc-aj-chips">' + SUGESTOES.map(function (s, i) {
            return '<button type="button" class="gc-aj-chip" data-i="' + i + '">' + esc(s.rotulo) + '</button>';
          }).join('') + '</div>';
        vazio.querySelectorAll('.gc-aj-chip').forEach(function (b) {
          b.addEventListener('click', function () {
            campo.value = SUGESTOES[+b.dataset.i].texto;
            campo.focus();
            campo.setSelectionRange(campo.value.length, campo.value.length);
          });
        });
        lista.appendChild(vazio);
        return;
      }
      msgs.forEach(function (m) {
        var d = document.createElement('div');
        d.className = 'gc-aj-msg ' + (m.role === 'user' ? 'gc-aj-eu' : 'gc-aj-ia');
        if (m.role === 'user') d.textContent = m.content; else d.innerHTML = markdown(m.content);
        lista.appendChild(d);
        if (m.rascunho) lista.appendChild(cartaoRascunho(m.rascunho));
      });
      rolar();
    }

    function mostrarErro(texto, codigo) {
      var d = document.createElement('div');
      d.className = 'gc-aj-erro';
      d.textContent = texto;
      if (codigo === 'teto' || codigo === 'desligada' || codigo === 'falha') {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'gc-aj-btn2';
        b.style.marginTop = '8px';
        b.style.display = 'block';
        b.textContent = 'Fazer um pedido de melhoria';
        b.addEventListener('click', function () { ctx.preencherPedido(null); });
        d.appendChild(b);
      }
      lista.appendChild(d);
      rolar();
    }

    async function enviar() {
      var texto = campo.value.trim();
      if (!texto || ocupado) return;
      ocupado = true;
      botao.disabled = true;
      campo.value = '';
      msgs.push({ role: 'user', content: texto });
      gravarConversa(o, msgs);
      desenhar();

      var resposta = { role: 'assistant', content: '' };
      var bolha = document.createElement('div');
      bolha.className = 'gc-aj-msg gc-aj-ia';
      var status = document.createElement('div');
      status.className = 'gc-aj-status';
      status.textContent = 'A Bononinha está pensando…';
      lista.appendChild(status);
      rolar();

      var historico = msgs.slice(-MAX_HISTORICO).map(function (m) { return { role: m.role, content: m.content }; });
      try {
        var tk = await tokenFresco(o);
        var resp = await fetch(o.url + '/functions/v1/geral-assistente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: o.key, Authorization: 'Bearer ' + tk },
          body: JSON.stringify({ app: o.appId, appNome: ctx.appNome, tela: ctx.tela, mensagens: historico }),
        });
        if (!resp.ok || !resp.body) {
          var corpoErro = {};
          try { corpoErro = await resp.json(); } catch (e) { /* sem corpo */ }
          status.remove();
          var msgErro = corpoErro.erro || (resp.status === 404
            ? 'A assistente ainda não foi ativada.'
            : 'A assistente não respondeu (erro ' + resp.status + ').');
          mostrarErro(msgErro, corpoErro.codigo || (resp.status === 404 ? 'desligada' : 'falha'));
          msgs.pop();
          gravarConversa(o, msgs);
          return;
        }
        var leitor = resp.body.getReader();
        var dec = new TextDecoder();
        var buffer = '';
        var comecou = false;
        for (;;) {
          var parte = await leitor.read();
          if (parte.done) break;
          buffer += dec.decode(parte.value, { stream: true });
          var eventos = buffer.split('\n\n');
          buffer = eventos.pop();
          eventos.forEach(function (ev) {
            var linha = ev.split('\n').filter(function (l) { return l.indexOf('data:') === 0; }).map(function (l) { return l.slice(5).trim(); }).join('');
            if (!linha) return;
            var dado;
            try { dado = JSON.parse(linha); } catch (e) { return; }
            if (dado.t) {
              if (!comecou) { comecou = true; status.remove(); lista.appendChild(bolha); }
              resposta.content += dado.t;
              bolha.innerHTML = markdown(resposta.content);
              rolar();
            } else if (dado.ferramenta) {
              status.textContent = STATUS_FERRAMENTA[dado.ferramenta] || 'Consultando…';
              if (comecou) lista.appendChild(status);
              rolar();
            } else if (dado.rascunho) {
              resposta.rascunho = dado.rascunho;
            } else if (dado.erro) {
              status.remove();
              mostrarErro(dado.erro, dado.codigo);
            }
          });
        }
        status.remove();
        if (resposta.content.trim() || resposta.rascunho) {
          msgs.push(resposta);
          gravarConversa(o, msgs);
          if (resposta.rascunho) { lista.appendChild(cartaoRascunho(resposta.rascunho)); rolar(); }
        }
      } catch (e) {
        status.remove();
        mostrarErro('Sem conexão com a assistente agora. Tente de novo em instantes.', 'falha');
      } finally {
        ocupado = false;
        botao.disabled = false;
        campo.focus();
      }
    }

    botao.addEventListener('click', enviar);
    campo.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); enviar(); }
    });
    cont.querySelector('#gc-aj-limpar').addEventListener('click', function () {
      if (ocupado) return;
      msgs = [];
      gravarConversa(o, msgs);
      desenhar();
    });

    desenhar();
    setTimeout(function () { campo.focus(); }, 50);
  }

  window.GeralAjuda = { versao: '23', montar: montar };
})();
