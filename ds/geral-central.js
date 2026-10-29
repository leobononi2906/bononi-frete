/* ============================================================
   geral-central.js — Sugestão, avisos, atualização cadastral,
   expiração de senha, sino de pendências e caminho  |  v24 — 29/10/2026
   ============================================================
   v24: a Bononinha LÊ A TELA — o geral-ajuda.js manda o texto visível
   (dados pessoais mascarados) junto com cada pergunta. Só o VERSAO muda
   aqui, para o ?v= do geral-ajuda.js mudar junto.
   v23: a assistente tem nome — BONONINHA, a assistente interna das
   aplicações da Bononi e da Stonni (saudação, campo e "pensando" no
   geral-ajuda.js). Só texto; o VERSAO sobe para o ?v= do geral-ajuda.js
   mudar junto.
   v22: O BOTÃO VIRA "AJUDA", COM ASSISTENTE DE IA. O modal ganha a aba
   "Perguntar" (a primeira, aberta por padrão), antes de "Novo pedido" e
   "Meus pedidos". O chat mora em geral-ajuda.js, buscado SOB DEMANDA da
   mesma pasta deste arquivo e com o mesmo ?v= (VERSAO) — copie os DOIS
   arquivos para o app; sem o geral-ajuda.js a aba avisa e o pedido de
   melhoria segue igual. A IA (Edge Function geral-assistente, migration
   0081) tira dúvida de uso e de produto e RASCUNHA o pedido: o botão
   "Revisar e enviar como pedido" abre "Novo pedido" já preenchido, e o
   POST leva via_ia=true (só nesse caso — pedido normal não manda a coluna).
   v21: SENHA VENCE DE VERDADE E NÃO SE REPETE. A data da última troca
   vem do banco (RPC geral_senha_status, migration 0069 do bononi-hub:
   trigger em auth.users guarda o hash de toda senha nova) e não mais de
   user_metadata.senha_alterada_em — que ninguém gravava (0 de 106 em
   27/10) e o próprio usuário podia editar. A troca forçada grava pela RPC
   geral_trocar_senha, que recusa senha com menos de 8 caracteres (o mínimo do Auth) e as últimas 5
   (contando a atual;
   geral_seguranca_config.senhas_bloqueadas). GeralCentral.trocarSenha()
   expõe a mesma troca para a tela "Minha senha" do Hub. Sem a 0069 no
   banco, a RPC dá 404 e ninguém é bloqueado — silencioso como o resto.
   Também na v21: as 4 cores da mensagem da sugestão viraram token (vinham
   assim nas cópias da Stonni e faltavam aqui); a v21 vai para os 14 apps.
   v20: sino ganha o rótulo "Precificação" (precificacao_marketplace, Hub
   0066: produto com custo/preço alterado no SGA). Só rótulo; as outras
   cópias recebem na próxima subida de cada app (até lá, id cru).
   v19: cartão "Vendas" do Hub virou "Kit do Vendedor" (o app não mostra
   vendas); o sino acompanha. Só rótulo, mesma regra da v18 para as cópias.
   v18: nomes do sino seguem os cartões do Hub — varejo vira "Vendas" e
   vitrine (que aparecia cru, "vitrine") vira "E-commerce Bononi". Só
   rótulo; as outras cópias recebem na próxima subida de cada app.
   v17: "Enviar" da sugestão se desabilita durante o POST e ignora clique
   repetido (reabilita só se der erro). Sem isso o duplo clique gravava o
   mesmo pedido duas vezes em geral_pedidos_melhoria (pedidos 7/8 e 12/13).
   v16: NÃO SAI NA IMPRESSÃO. Sino, "Sugerir melhoria", cartão de
   treinamento e overlays ficam escondidos em @media print — o sino
   saía no romaneio impresso da Expedição (06/10/2026).
   v15: CAMINHO DENTRO DOS APPS. Grava qual app e qual tela a sessão
   abriu (RPC geral_registrar_navegacao, migration 0031 do bononi-hub) —
   é o que a tela "Acessos fora do horário" do Painel Dev mostra como
   "Hub → Vendas › envios". Grava ao iniciar e a cada troca de tela:
     - app com rotas (React Router, hash): sozinho, escutando
       pushState/replaceState/popstate/hashchange; número e uuid no
       caminho viram ":id" (/picking/123 → /picking/:id);
     - app de tela única (navegarPara/irPara): o app chama
       GeralCentral.tela('cmp-pedidos') na própria função de navegação.
       Chamada antes do iniciar fica guardada e vira a tela de entrada.
   Repetição seguida não grava. Sem a 0031 no banco, a chamada falha em
   silêncio e nada muda na tela.
   v14: SINO DE PENDÊNCIAS. Botão flutuante acima do "Sugerir melhoria"
   com o que está esperando ação: as filas deste app + o que é
   nominalmente da pessoa em qualquer outro app (no Hub, tudo). Vem da
   RPC geral_minhas_pendencias() (migration 0024 do bononi-hub), que
   CALCULA do estado real de cada fila — resolveu na tela, some do sino.
   Clique leva ao lugar (?abrir=… no link; o app lê e abre a tela, ou
   passa `aoAbrir` no iniciar para abrir sem recarregar). Novidade que é
   da pessoa abre o painel sozinha na entrada, uma vez. Relê a cada 3
   min e quando a aba volta a ficar visível. Emite o evento
   `gc:pendencias` (o Hub põe o contador nos cartões) e expõe
   GeralCentral.pendencias() / recarregarPendencias(). Sem a 0024 no
   banco, o sino não aparece — silencioso como o resto.
   v13: marcarVisto() grava também QUAIS campos a pessoa alterou de
   verdade na campanha de cadastro (geral_avisos_visualizacoes.campos_alterados,
   migration 0015) — é o que alimenta, no Painel Dev, "quem alterou,
   quem manteve" por campanha. EXIGE a 0015 já aplicada: sem a coluna,
   o PostgREST recusa o insert inteiro e o "visto" não grava.
   v12: campanha de atualização cadastral passa a ler/gravar em
   geral_cadastro_confirmacoes (RPCs geral_cadastro_status/
   geral_cadastro_confirmar, migration 0012/0014) em vez de
   user_metadata. O dev escolhe no Painel QUAIS dos 5 campos (nome,
   telefone, e-mail pessoal, cargo, empresa/loja) esta campanha pede
   (geral_avisos.campos); cada campo mostra o valor já registrado e um
   input em branco embaixo — em branco = "está certo" (mantém o valor
   atual), preenchido = corrige. Sem a migration 0014 no banco, desiste
   em silêncio (mesmo padrão de sempre).
   v2: botão vira ícone com tooltip no hover (antes era pílula de texto
   fixa, cobria mais tela). Formulário de sugestão passou a diferenciar
   "não funcionou" (o que eu queria fazer / o que deveria acontecer / o
   que aconteceu) de "ideia de melhoria" (o que poderia ser diferente),
   e captura a tela (título + rota) sozinho em vez de pedir pra pessoa
   descrever onde estava — ela só confere/corrige o campo se quiser.
   Precisa da migration 0008 (colunas tipo/tela em geral_pedidos_melhoria).
   v3: emoji dos dois botões de tipo trocado por SVG inline (mesmo
   espírito do ícone do FAB) — sem depender de fonte de emoji do SO.
   v4: atualização cadastral pode ser BLOQUEANTE (geral_avisos.bloqueante).
   Sem o botão "Depois" — a pessoa preenche o nome e só então o overlay
   sai, liberando o app. Existe porque e-mail de app é reutilizado por
   mais de uma pessoa no grupo, e um "Depois" infinito nunca corrige
   quem é o operador real da conta. Nome virou campo obrigatório.
   Precisa da migration 0009.
   v5: campo de e-mail de contato no formulário de cadastro (grava
   user_metadata.email_contato — não é o e-mail de login, que é
   compartilhado). Avisos ganham agendamento (mostrar_a_partir: nulo =
   assim que publicado) e frequência (uma_vez = padrão de sempre; diario
   = mostra de novo a cada primeiro acesso do dia, até ser resolvido ou
   desativado). marcarVisto virou upsert pra suportar o diario sem
   colidir com a chave (aviso_id, usuario_email). Precisa da migration
   0010.
   v6: aviso ganha atraso configurável pro botão "Entendi" liberar
   (geral_avisos.atraso_botao_segundos — obriga esperar N segundos,
   contador visível no botão). Botão "Sugerir melhoria" ganha aba "Meus
   pedidos": lista os próprios pedidos com status e resposta, e uma
   bolinha vermelha no ícone avisa quando tem novidade (resposta_vista=
   false). Abrir "Meus pedidos" chama a RPC geral_marcar_pedidos_vistos()
   e desliga a notificação. Precisa da migration 0011.
   v10: aviso de PRAZO DE TREINAMENTO fora do app de Treinamento. Chama
   a RPC trein_meus_prazos() (bononi-treinamento, migration 0007): grupo
   enviado à pessoa, com prazo vencendo em até 3 dias ou já vencido, e
   ainda não concluído. Cartão fixo no canto inferior esquerdo (não
   bloqueia, não é overlay), com botão que leva ao app de Treinamento.
   Some sozinho quando a pessoa conclui; "Lembrar amanhã" esconde só até
   o dia seguinte. No próprio app de Treinamento não aparece (lá já tem
   os selos). Sem a RPC no banco, desiste em silêncio.
   (v7–v9 foram mudanças de z-index/HTML no aviso, sem migration.)
   v11: o aviso de prazo leva ATÉ O GRUPO, não só ao app: "Abrir
   treinamento" abre o grupo mais urgente (o primeiro, por prazo) e cada
   nome de grupo no cartão é link para o próprio grupo
   (?grupo=<id>; o app de Treinamento filtra "Minhas trilhas" nele).
   Módulo para colar em qualquer app do grupo, complementar ao
   geral-acesso.js (aquele é "quem tem acesso"; este é "o Painel de
   Desenvolvimento falando com quem usa o app").

   O QUE FAZ, chamado com UMA linha logo após o login (mesmo ponto onde
   o app já confere `user_metadata.modulos`):

     <script src="ds/geral-central.js?v=1"></script>
     GeralCentral.iniciar({
       appId: 'compras',              // a MESMA chave `acesso` do APPS do Hub
       url: SUPA_URL, key: SUPA_KEY, sb,
       usuario: { email: session.user.email, nome: meta.nome || '' },
     });

   ORDEM (pensada assim de propósito):
     1. Expiração de senha — BLOQUEIA (tela cheia) se vencida. Só ela
        pára o resto: é a única das quatro que é sobre segurança, não
        sobre comunicação.
     2. Avisos ativos que a pessoa ainda não viu — banner, um de cada
        vez, e SÓ SOME depois de marcado como visto (grava em
        geral_avisos_visualizacoes). É a regra da casa: notificação
        persiste até ser vista, não só até ser mostrada uma vez.
     3. Campanha de atualização cadastral (mesma tabela, tipo
        diferente) — modal com nome/telefone/foto, grava no próprio
        user_metadata via supabase-js.
     4. Botão flutuante "Sugerir melhoria" — sempre, silencioso, grava
        em geral_pedidos_melhoria.

   SILENCIOSO SE FALTAR PRÉ-REQUISITO: se a migration 0007 ainda não
   foi aplicada neste banco, ou a tabela não responde, cada função
   desiste sem quebrar o app — mesmo espírito do geral-acesso.js.

   ESTE ARQUIVO É CÓPIA VERBATIM. A original vive em bononi-hub/ds/.
   Mudou aqui? Mude lá e recopie para todos os apps que usam.
   ============================================================ */
(function () {
  'use strict';

  var VERSAO = '24';
  // v22: o geral-ajuda.js mora ao lado deste arquivo (ds/ ou public/ds/).
  var BASE_DS = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      return src ? src.replace(/geral-central\.js(\?.*)?$/, '') : 'ds/';
    } catch (e) { return 'ds/'; }
  })();

  // v16: nada deste arquivo vai para o papel (romaneio, etiqueta, organograma).
  function garantirEstiloImpressao() {
    if (document.getElementById('gc-print-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gc-print-estilo';
    s.textContent = '@media print{.gc-fab-wrap,#gc-sino-wrap,#gc-sino-painel,#gc-trein-prazo,' +
      '[id^="gc-aviso-"],#gc-senha,#gc-cadastro,#gc-sugestao{display:none !important}}';
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Mensagem de aviso aceita um punhado de tags simples (negrito, itálico,
  // sublinhado, quebra de linha e link) — tudo escapado primeiro, depois só
  // essas tags específicas voltam a virar HTML de verdade. Nunca usar o texto
  // do aviso direto em innerHTML sem passar por aqui.
  function escHtmlSimples(s) {
    var t = esc(s);
    t = t.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    t = t.replace(/&lt;(\/?)(b|strong|i|em|u)&gt;/gi, '<$1$2>');
    t = t.replace(/&lt;a href=&quot;(https?:\/\/[^&"]*)&quot;&gt;/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--text-accent,#c11f25);text-decoration:underline;font-weight:700;cursor:pointer">');
    t = t.replace(/&lt;\/a&gt;/gi, '</a>');
    return t;
  }

  function overlay(id, htmlInterno) {
    var existente = document.getElementById(id);
    if (existente) existente.remove();
    var div = document.createElement('div');
    div.id = id;
    div.style.cssText = 'position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(20,22,26,.55)';
    div.innerHTML = htmlInterno;
    document.body.appendChild(div);
    return div;
  }

  function caixa() {
    return 'background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border-radius:10px;max-width:420px;width:100%;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-family:inherit';
  }

  async function rest(o, caminho, opcoes) {
    var headers = Object.assign({
      'apikey': o.key,
      'Authorization': 'Bearer ' + (o.token || o.key),
      'Content-Type': 'application/json',
    }, (opcoes && opcoes.headers) || {});
    try {
      var resp = await fetch(o.url + '/rest/v1/' + caminho, Object.assign({}, opcoes, { headers: headers }));
      return resp;
    } catch (e) {
      console.warn('[geral-central]', e && e.message);
      return null;
    }
  }

  async function token(o) {
    if (!o.sb) return null;
    try {
      var s = await o.sb.auth.getSession();
      return s && s.data && s.data.session ? s.data.session.access_token : null;
    } catch (e) { return null; }
  }

  // ── 1. Expiração de senha ────────────────────────────────────────
  // v21: prazo e histórico moram no banco (migration 0069 do bononi-hub).
  var ERRO_SENHA = {
    repetida: 'Essa senha já foi usada por você. Escolha uma diferente das últimas {n}.',
    curta: 'Mínimo de 8 caracteres.',
    sem_senha: 'Esta conta entra pelo Google e não tem senha para trocar.',
    sem_sessao: 'Sua sessão expirou. Entre de novo e troque a senha.',
  };

  /** Troca a senha da sessão atual conferindo o histórico. → { ok, mensagem } */
  async function trocarSenha(o, nova) {
    var tk = (await token(o)) || o.token;
    if (!tk) return { ok: false, mensagem: ERRO_SENHA.sem_sessao };
    var resp = await rest(Object.assign({}, o, { token: tk }), 'rpc/geral_trocar_senha', {
      method: 'POST',
      body: JSON.stringify({ p_nova: nova }),
    });
    var res = resp && resp.ok ? await resp.json().catch(function () { return null; }) : null;
    if (!res) return { ok: false, mensagem: 'Não foi possível salvar agora (' + (resp ? resp.status : 'sem conexão') + '). Tente de novo.' };
    if (res.ok) return { ok: true };
    var msg = ERRO_SENHA[res.erro] || ('Não foi possível salvar: ' + (res.erro || 'erro desconhecido'));
    return { ok: false, mensagem: msg.replace('{n}', res.bloqueadas || 5) };
  }

  async function verificarExpiracaoSenha(o) {
    try {
      var resp = await rest(o, 'rpc/geral_senha_status', { method: 'POST', body: '{}' });
      if (!resp || !resp.ok) return false; // sem a 0069 no banco: 404, não bloqueia
      var st = await resp.json();
      if (!st || st.vencida !== true) return false;
      var dias = st.dias;

      return new Promise(function (resolve) {
        var el = overlay('gc-senha', '<div style="' + caixa() + '">' +
          '<h3 style="font-size:16px;margin-bottom:6px">Hora de trocar sua senha</h3>' +
          '<p style="font-size:13px;color:var(--text-muted,#6b7382);margin-bottom:16px">Já se passaram mais de ' + dias + ' dias desde a última troca. Defina uma senha nova para continuar.</p>' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Nova senha</label>' +
          '<input id="gc-nova-senha" type="password" minlength="8" style="width:100%;padding:9px 11px;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;margin-bottom:10px">' +
          '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Confirmar senha</label>' +
          '<input id="gc-confirma-senha" type="password" minlength="8" style="width:100%;padding:9px 11px;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px">' +
          '<div id="gc-senha-erro" style="color:var(--text-accent,#c11f25);font-size:12px;margin-top:8px;min-height:16px"></div>' +
          '<button id="gc-senha-salvar" style="margin-top:10px;width:100%;padding:10px;background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);border:none;border-radius:5px;font-weight:700">Salvar e continuar</button>' +
          '</div>');

        var botao = el.querySelector('#gc-senha-salvar');
        botao.addEventListener('click', async function () {
          if (botao.disabled) return;
          var erroEl = el.querySelector('#gc-senha-erro');
          var nova = el.querySelector('#gc-nova-senha').value;
          var conf = el.querySelector('#gc-confirma-senha').value;
          if (nova.length < 8) { erroEl.textContent = ERRO_SENHA.curta; return; }
          if (nova !== conf) { erroEl.textContent = 'As senhas não conferem.'; return; }
          botao.disabled = true;
          erroEl.textContent = '';
          try {
            var r = await trocarSenha(o, nova);
            if (!r.ok) { erroEl.textContent = r.mensagem; botao.disabled = false; return; }
            el.remove();
            resolve(true);
          } catch (e) {
            erroEl.textContent = 'Erro ao salvar: ' + e.message;
            botao.disabled = false;
          }
        });
      });
    } catch (e) {
      console.warn('[geral-central] senha', e && e.message);
      return false;
    }
  }

  // ── 2 e 3. Avisos e campanha de atualização cadastral ────────────
  function mesmoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  async function buscarAvisosPendentes(o, tipo) {
    var agora = new Date();
    var resp = await rest(o, 'geral_avisos?select=*&ativo=eq.true&order=criado_em.asc');
    if (!resp || !resp.ok) return [];
    var todos = await resp.json();
    if (!Array.isArray(todos)) return [];
    var doTipo = todos.filter(function (a) {
      return a.tipo === tipo && (!a.apps_alvo || !a.apps_alvo.length || a.apps_alvo.indexOf(o.appId) !== -1)
        && (!a.expira_em || new Date(a.expira_em) > agora)
        && (!a.mostrar_a_partir || new Date(a.mostrar_a_partir) <= agora); // agendamento: ainda não chegou a hora
    });
    if (!doTipo.length) return [];

    var respVistos = await rest(o, 'geral_avisos_visualizacoes?usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&select=aviso_id,visto_em');
    var vistos = respVistos && respVistos.ok ? await respVistos.json() : [];
    vistos = Array.isArray(vistos) ? vistos : [];

    return doTipo.filter(function (a) {
      var registro = vistos.filter(function (v) { return v.aviso_id === a.id; })[0];
      if (!registro) return true; // nunca viu
      if (a.frequencia === 'diario') return !mesmoDia(new Date(registro.visto_em), agora); // já viu, mas não hoje
      return false; // uma_vez: já viu, não mostra de novo
    });
  }

  async function marcarVisto(o, avisoId, extra) {
    // upsert: em frequencia=diario a mesma pessoa marca visto todo dia, e a
    // chave (aviso_id, usuario_email) já existe — precisa atualizar, não inserir.
    // `extra` (opcional): hoje só `campos_alterados` (campanha de cadastro,
    // migration 0015) — quais campos a pessoa digitou nesta visualização.
    await rest(o, 'geral_avisos_visualizacoes?on_conflict=aviso_id,usuario_email', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(Object.assign(
        { aviso_id: avisoId, usuario_email: o.usuario.email, visto_em: new Date().toISOString() },
        extra || {}
      )),
    });
  }

  async function verificarAvisos(o) {
    try {
      var pendentes = await buscarAvisosPendentes(o, 'aviso');
      for (var i = 0; i < pendentes.length; i++) {
        await mostrarAviso(o, pendentes[i]);
      }
    } catch (e) { console.warn('[geral-central] avisos', e && e.message); }
  }

  function mostrarAviso(o, aviso) {
    return new Promise(function (resolve) {
      var el = overlay('gc-aviso-' + aviso.id, '<div style="' + caixa() + '">' +
        '<div style="font-size:11px;font-weight:700;color:var(--text-accent,#c11f25);letter-spacing:.03em;margin-bottom:6px">AVISO</div>' +
        '<h3 style="font-size:16px;margin-bottom:8px">' + esc(aviso.titulo) + '</h3>' +
        '<p style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-bottom:18px">' + escHtmlSimples(aviso.mensagem) + '</p>' +
        '<button id="gc-aviso-ok" style="width:100%;padding:10px;background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);border:none;border-radius:5px;font-weight:700;opacity:.5" disabled>Entendi</button>' +
        '</div>');

      var btn = el.querySelector('#gc-aviso-ok');
      var restante = Math.max(0, parseInt(aviso.atraso_botao_segundos, 10) || 0);
      function liberar() {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = 'Entendi';
      }
      if (restante <= 0) {
        liberar();
      } else {
        btn.textContent = 'Entendi (' + restante + ')';
        var cron = setInterval(function () {
          restante -= 1;
          if (restante <= 0) { clearInterval(cron); liberar(); }
          else { btn.textContent = 'Entendi (' + restante + ')'; }
        }, 1000);
      }

      btn.addEventListener('click', async function () {
        if (btn.disabled) return;
        el.remove();
        await marcarVisto(o, aviso.id);
        resolve();
      });
    });
  }

  // ── 2b. Prazo de treinamento (v10) ───────────────────────────────
  var TREIN_URL = 'https://bononi-treinamento.vercel.app/';

  function chaveAdiado(o) { return 'gc-trein-prazo-adiado:' + String(o.usuario.email).toLowerCase(); }
  function hojeLocal() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  // itens já vêm ordenados por prazo (RPC): o primeiro é o mais urgente
  function linkGrupo(p) {
    var id = String((p && p.grupo_id) || '');
    return /^[0-9a-f-]{36}$/i.test(id) ? TREIN_URL + '?grupo=' + id : TREIN_URL;
  }

  function textoPrazo(p) {
    var dias = parseInt(p.dias_para_prazo, 10);
    if (dias < 0) return 'atrasado há ' + (-dias) + (dias === -1 ? ' dia' : ' dias');
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    return 'vence em ' + dias + ' dias';
  }

  async function verificarPrazosTreinamento(o) {
    if (o.appId === 'treinamento') return;
    try {
      try { if (localStorage.getItem(chaveAdiado(o)) === hojeLocal()) return; } catch (e) { /* sem storage: mostra */ }
      var resp = await rest(o, 'rpc/trein_meus_prazos', { method: 'POST', body: '{}' });
      if (!resp || !resp.ok) return; // RPC ausente neste banco ou sem permissão: silencioso
      var itens = await resp.json();
      if (!Array.isArray(itens) || !itens.length) return;

      var algumAtrasado = itens.some(function (p) { return parseInt(p.dias_para_prazo, 10) < 0; });
      var cor = algumAtrasado ? '#c11f25' : '#b26a00';
      var velho = document.getElementById('gc-trein-prazo');
      if (velho) velho.remove();
      var el = document.createElement('div');
      el.id = 'gc-trein-prazo';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:10;' +
        'max-width:min(340px,calc(100vw - 96px));background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border:1px solid var(--border-subtle,#e2e5ea);' +
        'border-left:4px solid ' + cor + ';border-radius:8px;padding:12px 14px;box-shadow:0 6px 24px rgba(20,22,26,.18);' +
        'font-family:inherit;font-size:13px;line-height:1.4';
      el.innerHTML =
        '<div style="font-size:11px;font-weight:700;letter-spacing:.03em;color:' + cor + ';margin-bottom:6px">' +
          (algumAtrasado ? 'TREINAMENTO ATRASADO' : 'PRAZO DE TREINAMENTO') + '</div>' +
        itens.map(function (p) {
          return '<div style="margin-bottom:4px"><a href="' + linkGrupo(p) + '" target="_blank" rel="noopener" ' +
            'style="color:inherit;font-weight:700;text-decoration:underline">' + esc(p.grupo_nome) + '</a>' +
            (p.obrigatorio ? ' <span style="font-size:10.5px;font-weight:700;color:var(--status-warn-text,#b26a00)">(obrigatório)</span>' : '') +
            ' — ' + esc(textoPrazo(p)) + '</div>';
        }).join('') +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<a id="gc-trein-abrir" href="' + linkGrupo(itens[0]) + '" target="_blank" rel="noopener" style="background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);' +
            'text-decoration:none;border-radius:5px;padding:7px 12px;font-weight:700;font-size:12.5px">Abrir treinamento</a>' +
          '<button id="gc-trein-adiar" style="background:none;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;padding:7px 10px;' +
            'font-size:12.5px;cursor:pointer;color:var(--text-strong,#14161a)">Lembrar amanhã</button>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector('#gc-trein-adiar').addEventListener('click', function () {
        try { localStorage.setItem(chaveAdiado(o), hojeLocal()); } catch (e) { /* só some nesta tela */ }
        el.remove();
      });
    } catch (e) { console.warn('[geral-central] prazo treinamento', e && e.message); }
  }

  // Os 5 campos de geral_cadastro_confirmacoes (migration 0012/0014) — o
  // dev escolhe no Painel quais uma campanha pede (geral_avisos.campos).
  var CAMPOS_CADASTRO = [
    { valor: 'nome', label: 'Nome', tipo: 'text', placeholder: 'Ex: Maria Silva' },
    { valor: 'telefone', label: 'Telefone', tipo: 'tel', placeholder: '(11) 99999-9999' },
    { valor: 'email_pessoal', label: 'E-mail pessoal', tipo: 'email', placeholder: 'seu@email.com' },
    { valor: 'cargo', label: 'Cargo', tipo: 'text', placeholder: 'Ex: Vendedora' },
    { valor: 'empresa_ou_loja', label: 'Empresa/loja', tipo: 'text', placeholder: 'Ex: Loja Centro' },
  ];

  async function verificarAtualizacaoCadastral(o) {
    try {
      var pendentes = await buscarAvisosPendentes(o, 'atualizacao_cadastral');
      if (!pendentes.length) return;
      var respStatus = await rest(o, 'rpc/geral_cadastro_status', { method: 'POST', body: '{}' });
      if (!respStatus || !respStatus.ok) return; // migration 0012/0014 ausente neste banco: desiste em silêncio
      var status = await respStatus.json();
      var dadosAtuais = (status && status.dados) || {};
      await mostrarFormularioCadastro(o, pendentes[0], dadosAtuais);
    } catch (e) { console.warn('[geral-central] cadastro', e && e.message); }
  }

  function mostrarFormularioCadastro(o, aviso, dadosAtuais) {
    var travado = aviso.bloqueante === true;
    var pedidos = (Array.isArray(aviso.campos) && aviso.campos.length)
      ? CAMPOS_CADASTRO.filter(function (c) { return aviso.campos.indexOf(c.valor) !== -1; })
      : CAMPOS_CADASTRO;

    return new Promise(function (resolve) {
      var camposHtml = pedidos.map(function (c) {
        var atual = dadosAtuais[c.valor];
        return '<label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' + esc(c.label) + '</label>' +
          '<div style="width:100%;padding:8px 11px;border-radius:5px;margin-bottom:4px;background:var(--surface-hover,#f5f6f8);color:var(--text-muted,#6b7382);font-size:13px">' +
          (atual ? esc(atual) : 'ainda não informado') + '</div>' +
          '<input data-campo="' + c.valor + '" type="' + c.tipo + '" placeholder="Deixe em branco se está certo, ou digite o valor certo" ' +
          'style="width:100%;padding:9px 11px;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;margin-bottom:10px">';
      }).join('');

      var el = overlay('gc-cadastro', '<div style="' + caixa() + '">' +
        '<h3 style="font-size:16px;margin-bottom:4px">' + esc(aviso.titulo) + '</h3>' +
        '<p style="font-size:13px;color:var(--text-muted,#6b7382);margin-bottom:14px">' + escHtmlSimples(aviso.mensagem) + '</p>' +
        camposHtml +
        '<div id="gc-cad-erro" style="color:var(--text-accent,#c11f25);font-size:12px;margin-top:-2px;margin-bottom:8px;min-height:16px"></div>' +
        '<div style="display:flex;gap:8px;margin-top:2px">' +
        (travado ? '' : '<button id="gc-cad-depois" style="flex:1;padding:10px;background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;font-weight:600">Depois</button>') +
        '<button id="gc-cad-salvar" style="flex:' + (travado ? '1' : '2') + ';padding:10px;background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);border:none;border-radius:5px;font-weight:700">Salvar' + (travado ? ' e continuar' : '') + '</button>' +
        '</div></div>');

      var btnDepois = el.querySelector('#gc-cad-depois');
      if (btnDepois) btnDepois.addEventListener('click', function () { el.remove(); resolve(); });
      el.querySelector('#gc-cad-salvar').addEventListener('click', async function () {
        var erroEl = el.querySelector('#gc-cad-erro');
        // Campo em branco = "está certo": mantém o valor atual. Só o campo
        // que a pessoa de fato digitou vai como valor novo.
        var valores = {};
        var alterados = [];
        CAMPOS_CADASTRO.forEach(function (c) { valores[c.valor] = dadosAtuais[c.valor] || null; });
        pedidos.forEach(function (c) {
          var digitado = el.querySelector('[data-campo="' + c.valor + '"]').value.trim();
          if (digitado) { valores[c.valor] = digitado; alterados.push(c.valor); }
        });
        if (!valores.nome) { erroEl.textContent = 'Preencha o nome.'; return; }
        try {
          var resp = await rest(o, 'rpc/geral_cadastro_confirmar', {
            method: 'POST',
            body: JSON.stringify({
              p_nome: valores.nome,
              p_telefone: valores.telefone,
              p_email_pessoal: valores.email_pessoal,
              p_cargo: valores.cargo,
              p_empresa_ou_loja: valores.empresa_ou_loja,
              p_login_compartilhado: dadosAtuais.login_compartilhado || false,
              p_detalhe_compartilhamento: dadosAtuais.detalhe_compartilhamento || null,
            }),
          });
          if (!resp || !resp.ok) { erroEl.textContent = 'Erro ao salvar. Tente de novo.'; return; }
          // Exige a migration 0015 (coluna geral_avisos_visualizacoes.campos_alterados)
          // já aplicada: sem ela o PostgREST recusa o insert inteiro (coluna
          // desconhecida) e o "visto" nem grava — a campanha voltaria a
          // aparecer pra pessoa. NÃO subir este arquivo antes da 0015 estar
          // em produção.
          await marcarVisto(o, aviso.id, { campos_alterados: alterados });
          el.remove();
          resolve();
        } catch (e) {
          erroEl.textContent = 'Erro ao salvar: ' + e.message;
        }
      });
    });
  }

  // ── 4. Botão "Sugerir melhoria" ──────────────────────────────────
  // Captura a tela automaticamente (título + rota) — a pessoa não digita
  // onde estava, só confere/corrige se quiser.
  function capturarTela() {
    try {
      var titulo = (document.title || '').trim();
      var rota = location.pathname + (location.hash || '');
      return (titulo ? titulo + ' — ' : '') + rota;
    } catch (e) {
      return location.href || '';
    }
  }

  function garantirEstiloFab() {
    if (document.getElementById('gc-fab-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gc-fab-estilo';
    s.textContent =
      '.gc-oculto{display:none !important}' +
      '.gc-fab-wrap{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:10;' +
        'display:flex;align-items:center;gap:8px}' +
      '.gc-fab-tooltip{background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);font-size:12px;font-weight:600;padding:6px 11px;' +
        'border-radius:6px;white-space:nowrap;opacity:0;transform:translateX(6px);pointer-events:none;' +
        'transition:opacity .15s ease,transform .15s ease;box-shadow:0 2px 8px rgba(20,22,26,.18)}' +
      '.gc-fab-wrap:hover .gc-fab-tooltip,.gc-fab-wrap:focus-within .gc-fab-tooltip{opacity:1;transform:translateX(0)}' +
      '#gc-fab-sugestao{width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;position:relative;' +
        'background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);display:flex;align-items:center;justify-content:center;' +
        'box-shadow:var(--shadow-raised,0 4px 16px rgba(20,22,26,.25));flex:none}' +
      '#gc-fab-sugestao:active{transform:translateY(1px)}' +
      '.gc-fab-badge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;border-radius:999px;' +
        'background:var(--action-accent,#c11f25);color:var(--text-inverse,#fff);font-size:10px;font-weight:800;line-height:16px;text-align:center;' +
        'padding:0 4px;border:2px solid var(--surface-card,#fff);box-sizing:content-box}' +
      '.gc-modo-toggle{display:flex;gap:6px;margin-bottom:14px;border-bottom:1px solid var(--border-subtle,#e2e5ea);padding-bottom:10px}' +
      '.gc-modo-btn{flex:1;padding:7px 8px;font-size:12px;font-weight:700;border-radius:6px;border:none;' +
        'background:transparent;color:var(--text-muted,#6b7382);cursor:pointer;text-align:center;position:relative}' +
      '.gc-modo-btn.ativo{background:var(--surface-hover,#f5f6f8);color:var(--text-strong,#14161a)}' +
      '.gc-modo-btn .gc-fab-badge{position:absolute;top:2px;right:6px;border-color:var(--surface-hover,#f5f6f8)}' +
      '.gc-pedido-item{border:1px solid var(--border-subtle,#e2e5ea);border-radius:6px;padding:10px;margin-bottom:8px;font-size:12px}' +
      '.gc-pedido-item .topo{display:flex;justify-content:space-between;gap:8px;color:var(--text-muted,#6b7382);font-size:11px;margin-bottom:4px}' +
      '.gc-pedido-item .msg{white-space:pre-wrap;color:var(--text-strong,#14161a);margin-bottom:6px}' +
      '.gc-pedido-item .resposta{background:var(--surface-hover,#f5f6f8);border-radius:5px;padding:7px 9px;font-size:11px;color:var(--text-strong,#14161a);margin-top:6px}' +
      '.gc-tipo-toggle{display:flex;gap:6px;margin-bottom:14px}' +
      '.gc-tipo-btn{flex:1;padding:9px 8px;font-size:12px;font-weight:600;border-radius:6px;' +
        'border:1px solid var(--border-subtle,#e2e5ea);background:var(--surface-card,#fff);color:var(--text-strong,#14161a);cursor:pointer;text-align:center;' +
        'display:flex;align-items:center;justify-content:center;gap:6px}' +
      '.gc-tipo-btn svg{flex:none}' +
      '.gc-tipo-btn.ativo{background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);border-color:var(--border-focus,#14161a)}' +
      '.gc-campo label{display:block;font-size:12px;font-weight:600;margin:10px 0 4px}' +
      '.gc-campo textarea{width:100%;min-height:64px;padding:9px 10px;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;resize:vertical}' +
      '.gc-campo input[type=text]{width:100%;padding:8px 10px;border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;font-size:12px;color:var(--text-muted,#6b7382)}';
    document.head.appendChild(s);
  }

  // Ícone de balão de conversa com "+" — sem depender do sistema de ícones
  // de cada app (nem todos têm o mesmo hidratador de SVG).
  var ICONE_FAB = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 ' +
    '8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 ' +
    '8.48 0 0 1 8 8v.5z"/><line x1="12" y1="7.5" x2="12" y2="13.5"/><line x1="9" y1="10.5" x2="15" y2="10.5"/></svg>';

  // Ícones dos dois tipos do formulário — mesmo espírito do ícone do FAB:
  // SVG inline, sem depender do hidratador de ícones de cada app.
  var ICONE_LAMPADA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 ' +
    '1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
  var ICONE_ALERTA = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 ' +
    '1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  async function contarPedidosNaoVistos(o) {
    try {
      var resp = await rest(o, 'geral_pedidos_melhoria?select=id&usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&resposta_vista=eq.false', {
        headers: { Prefer: 'count=exact', Range: '0-0' },
      });
      if (!resp || !resp.ok) return 0;
      var cr = resp.headers.get('content-range');
      if (!cr) return 0;
      var total = cr.split('/')[1];
      return total === '*' ? 0 : parseInt(total, 10) || 0;
    } catch (e) { return 0; }
  }

  async function atualizarBadgeFab(o) {
    var n = await contarPedidosNaoVistos(o);
    var fab = document.getElementById('gc-fab-sugestao');
    if (!fab) return n;
    var badge = fab.querySelector('.gc-fab-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'gc-fab-badge';
        fab.appendChild(badge);
      }
      badge.textContent = n > 9 ? '9+' : String(n);
    } else if (badge) {
      badge.remove();
    }
    return n;
  }

  function montarFabSugestao(o) {
    if (document.getElementById('gc-fab-sugestao')) return;
    garantirEstiloFab();
    var wrap = document.createElement('div');
    wrap.className = 'gc-fab-wrap';
    wrap.innerHTML =
      '<span class="gc-fab-tooltip">Ajuda · Bononinha</span>' +
      '<button id="gc-fab-sugestao" type="button" aria-label="Ajuda: perguntar ou sugerir melhoria">' + ICONE_FAB + '</button>';
    document.body.appendChild(wrap);
    wrap.querySelector('#gc-fab-sugestao').addEventListener('click', function () { abrirModalSugestao(o); });
    atualizarBadgeFab(o);
  }

  var ROTULO_STATUS = { aberto: 'Aberto', em_analise: 'Em análise', resolvido: 'Resolvido' };

  async function carregarMeusPedidos(o, el) {
    var lista = el.querySelector('#gc-meus-lista');
    lista.innerHTML = '<div style="font-size:12px;color:var(--text-muted,#6b7382);text-align:center;padding:16px 0">Carregando…</div>';
    try {
      var resp = await rest(o, 'geral_pedidos_melhoria?select=*&usuario_email=eq.' + encodeURIComponent(o.usuario.email) + '&order=criado_em.desc', { headers: { Range: '0-49' } });
      var pedidos = resp && resp.ok ? await resp.json() : [];
      if (!Array.isArray(pedidos) || !pedidos.length) {
        lista.innerHTML = '<div style="font-size:12px;color:var(--text-muted,#6b7382);text-align:center;padding:16px 0">Você ainda não mandou nenhum pedido.</div>';
      } else {
        lista.innerHTML = pedidos.map(function (p) {
          return '<div class="gc-pedido-item">' +
            '<div class="topo"><span>' + esc(p.app_origem) + ' · ' + (p.tipo === 'bug' ? 'não funcionou' : 'melhoria') + '</span>' +
            '<span>' + (ROTULO_STATUS[p.status] || p.status) + '</span></div>' +
            '<div class="msg">' + esc(p.mensagem) + '</div>' +
            (p.resposta ? '<div class="resposta"><b>Resposta:</b> ' + esc(p.resposta) + '</div>' : '') +
            '</div>';
        }).join('');
      }
      // Abrir "Meus pedidos" é o que conta como "vi a resposta" — desliga a notificação.
      await rest(o, 'rpc/geral_marcar_pedidos_vistos', { method: 'POST', body: '{}' });
      atualizarBadgeFab(o);
      var badgeAba = el.querySelector('#gc-aba-meus .gc-fab-badge');
      if (badgeAba) badgeAba.remove();
    } catch (e) {
      lista.innerHTML = '<div style="font-size:12px;color:var(--text-accent,#c11f25);text-align:center;padding:16px 0">Erro ao carregar: ' + esc(e.message) + '</div>';
    }
  }

  // v22: carrega o geral-ajuda.js uma vez, da mesma pasta e com o mesmo ?v=.
  var _ajudaCarregando = null;
  function carregarAjuda() {
    if (window.GeralAjuda) return Promise.resolve(true);
    if (_ajudaCarregando) return _ajudaCarregando;
    _ajudaCarregando = new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = BASE_DS + 'geral-ajuda.js?v=' + VERSAO;
      s.onload = function () { ok(!!window.GeralAjuda); };
      s.onerror = function () { _ajudaCarregando = null; ok(false); };
      document.head.appendChild(s);
    });
    return _ajudaCarregando;
  }

  async function abrirModalSugestao(o) {
    var telaCapturada = capturarTela();
    var naoVistos = await contarPedidosNaoVistos(o);
    var viaIa = false;
    var el = overlay('gc-sugestao', '<div style="' + caixa().replace('max-width:420px', 'max-width:540px') + '">' +
      '<div class="gc-modo-toggle">' +
        '<button type="button" class="gc-modo-btn ativo" id="gc-aba-perguntar" data-modo="perguntar">Perguntar</button>' +
        '<button type="button" class="gc-modo-btn" id="gc-aba-novo" data-modo="novo">Novo pedido</button>' +
        '<button type="button" class="gc-modo-btn" id="gc-aba-meus" data-modo="meus">Meus pedidos' +
          (naoVistos > 0 ? '<span class="gc-fab-badge">' + (naoVistos > 9 ? '9+' : naoVistos) + '</span>' : '') +
        '</button>' +
        '<button type="button" id="gc-ajuda-fechar" aria-label="Fechar" style="flex:none;width:30px;border:none;background:transparent;' +
          'color:var(--text-muted,#6b7382);font-size:18px;line-height:1;cursor:pointer">×</button>' +
      '</div>' +
      '<div id="gc-modo-perguntar"><div style="font-size:12px;color:var(--text-muted,#6b7382);text-align:center;padding:16px 0">Carregando…</div></div>' +
      '<div id="gc-modo-novo" class="gc-oculto">' +
      '<h3 style="font-size:16px;margin-bottom:4px">Sugerir melhoria</h3>' +
      '<p style="font-size:12px;color:var(--text-muted,#6b7382);margin-bottom:12px">Isso vai direto para o desenvolvedor, no Painel de Desenvolvimento.</p>' +
      '<div class="gc-tipo-toggle">' +
        '<button type="button" class="gc-tipo-btn ativo" data-tipo="melhoria">' + ICONE_LAMPADA + ' Uma ideia de melhoria</button>' +
        '<button type="button" class="gc-tipo-btn" data-tipo="bug">' + ICONE_ALERTA + ' Algo não funcionou</button>' +
      '</div>' +
      '<div id="gc-campos-melhoria" class="gc-campo">' +
        '<label>O que essa tela faz hoje que poderia ser diferente?</label>' +
        '<textarea id="gc-m-diferente" placeholder="Ex.: essa lista podia ter um filtro por data"></textarea>' +
      '</div>' +
      '<div id="gc-campos-bug" class="gc-campo gc-oculto">' +
        '<label>O que você estava tentando fazer?</label>' +
        '<textarea id="gc-b-tentando"></textarea>' +
        '<label>O que deveria acontecer?</label>' +
        '<textarea id="gc-b-esperado"></textarea>' +
        '<label>O que aconteceu de fato?</label>' +
        '<textarea id="gc-b-aconteceu"></textarea>' +
      '</div>' +
      '<div class="gc-campo"><label>Tela</label><input id="gc-tela" type="text" value="' + esc(telaCapturada) + '"></div>' +
      '<div id="gc-sug-msg" style="font-size:12px;margin-top:6px;min-height:16px"></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<button id="gc-sug-cancelar" style="flex:1;padding:10px;background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;font-weight:600">Cancelar</button>' +
      '<button id="gc-sug-enviar" style="flex:2;padding:10px;background:var(--action-primary,#14161a);color:var(--text-inverse,#fff);border:none;border-radius:5px;font-weight:700">Enviar</button>' +
      '</div>' +
      '</div>' +
      '<div id="gc-modo-meus" class="gc-oculto">' +
      '<h3 style="font-size:16px;margin-bottom:10px">Meus pedidos</h3>' +
      '<div id="gc-meus-lista" style="max-height:340px;overflow-y:auto"></div>' +
      '<button id="gc-meus-fechar" style="width:100%;margin-top:10px;padding:10px;background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border:1px solid var(--border-subtle,#e2e5ea);border-radius:5px;font-weight:600">Fechar</button>' +
      '</div>' +
      '</div>');

    var botoesModo = el.querySelectorAll('.gc-modo-btn');
    function irPara(modo) {
      botoesModo.forEach(function (b) { b.classList.toggle('ativo', b.dataset.modo === modo); });
      ['perguntar', 'novo', 'meus'].forEach(function (m) {
        el.querySelector('#gc-modo-' + m).classList.toggle('gc-oculto', m !== modo);
      });
      if (modo === 'meus') carregarMeusPedidos(o, el);
    }
    botoesModo.forEach(function (btn) {
      btn.addEventListener('click', function () { irPara(btn.dataset.modo); });
    });
    el.querySelector('#gc-meus-fechar').addEventListener('click', function () { el.remove(); });
    el.querySelector('#gc-ajuda-fechar').addEventListener('click', function () { el.remove(); });

    var tipoAtual = 'melhoria';
    var botoesTipo = el.querySelectorAll('.gc-tipo-btn');
    function escolherTipo(tipo) {
      tipoAtual = tipo;
      botoesTipo.forEach(function (b) { b.classList.toggle('ativo', b.dataset.tipo === tipo); });
      el.querySelector('#gc-campos-melhoria').classList.toggle('gc-oculto', tipoAtual !== 'melhoria');
      el.querySelector('#gc-campos-bug').classList.toggle('gc-oculto', tipoAtual !== 'bug');
    }
    botoesTipo.forEach(function (btn) {
      btn.addEventListener('click', function () { escolherTipo(btn.dataset.tipo); });
    });

    // v22: rascunho da IA → "Novo pedido" preenchido (a pessoa revisa e envia).
    // null = só abre a aba (a IA está fora do ar ou no teto do mês).
    function preencherPedido(r) {
      irPara('novo');
      if (!r) return;
      viaIa = true;
      escolherTipo(r.tipo === 'bug' ? 'bug' : 'melhoria');
      if (r.tipo === 'bug') {
        el.querySelector('#gc-b-tentando').value = r.o_que_queria || '';
        el.querySelector('#gc-b-esperado').value = r.o_que_deveria || '';
        el.querySelector('#gc-b-aconteceu').value = r.o_que_aconteceu || '';
      } else {
        el.querySelector('#gc-m-diferente').value = r.mensagem || '';
      }
      if (r.tela) el.querySelector('#gc-tela').value = r.tela;
    }

    var contPerguntar = el.querySelector('#gc-modo-perguntar');
    carregarAjuda().then(function (ok) {
      if (!document.body.contains(el)) return;
      if (!ok) {
        contPerguntar.innerHTML = '<div style="font-size:12px;color:var(--text-muted,#6b7382);text-align:center;padding:16px 0">' +
          'A assistente ainda não está disponível neste app.</div>';
        irPara('novo');
        return;
      }
      window.GeralAjuda.montar(contPerguntar, o, {
        appNome: NOME_APP[o.appId] || o.appId,
        tela: telaCapturada,
        preencherPedido: preencherPedido,
      });
    });

    el.querySelector('#gc-sug-cancelar').addEventListener('click', function () { el.remove(); });
    el.querySelector('#gc-sug-enviar').addEventListener('click', async function () {
      var msgEl = el.querySelector('#gc-sug-msg');
      var tela = el.querySelector('#gc-tela').value.trim();
      var mensagem;
      if (tipoAtual === 'bug') {
        var tentando = el.querySelector('#gc-b-tentando').value.trim();
        var esperado = el.querySelector('#gc-b-esperado').value.trim();
        var aconteceu = el.querySelector('#gc-b-aconteceu').value.trim();
        if (!tentando || !esperado || !aconteceu) {
          msgEl.style.color = 'var(--text-accent,#c11f25)'; msgEl.textContent = 'Preencha os três campos.'; return;
        }
        mensagem = 'O que eu queria fazer: ' + tentando +
          '\nO que deveria acontecer: ' + esperado +
          '\nO que aconteceu: ' + aconteceu;
      } else {
        var diferente = el.querySelector('#gc-m-diferente').value.trim();
        if (!diferente) { msgEl.style.color = 'var(--text-accent,#c11f25)'; msgEl.textContent = 'Escreva alguma coisa.'; return; }
        mensagem = diferente;
      }
      var btnEnviar = this;
      if (btnEnviar.disabled) return;
      btnEnviar.disabled = true;
      btnEnviar.style.opacity = '.6';
      try {
        var corpoPedido = {
          app_origem: o.appId,
          usuario_email: o.usuario.email,
          usuario_nome: o.usuario.nome || null,
          tipo: tipoAtual,
          tela: tela || null,
          mensagem: mensagem,
        };
        if (viaIa) corpoPedido.via_ia = true; // v22: só quando veio do rascunho (coluna da 0081)
        var resp = await rest(o, 'geral_pedidos_melhoria', {
          method: 'POST',
          body: JSON.stringify(corpoPedido),
        });
        if (!resp || !resp.ok) throw new Error('HTTP ' + (resp ? resp.status : '?'));
        msgEl.style.color = 'var(--status-ok-text,#1a7f37)';
        msgEl.textContent = 'Enviado — obrigado!';
        setTimeout(function () { el.remove(); }, 1200);
      } catch (e) {
        msgEl.style.color = 'var(--text-accent,#c11f25)';
        msgEl.textContent = 'Erro ao enviar: ' + e.message;
        btnEnviar.disabled = false;
        btnEnviar.style.opacity = '';
      }
    });
  }

  // ── 5. Sino de pendências (v14) ──────────────────────────────────
  // Fonte: RPC geral_minhas_pendencias() (migration 0024 do bononi-hub) —
  // calcula, para quem está logado, o que está esperando ação em cada app.
  // Não grava evento: resolveu na tela do app, some daqui na próxima
  // leitura. Sem a RPC no banco, o sino nem aparece (silencioso).
  //
  // Onde aparece: botão flutuante acima do "Sugerir melhoria". Dentro de um
  // app mostra as pendências DAQUELE app + as que são nominalmente da
  // pessoa em qualquer outro; no Hub (appId 'hub') mostra tudo.
  // "Novo" = fila nominal que cresceu desde a última vez que a pessoa abriu
  // o sino (localStorage, só conveniência). Com novidade, o painel abre
  // sozinho uma vez na entrada — é a regra da casa: quem não sabe que a
  // coisa existe não vai procurar.
  //
  // Leva ao lugar: cada item tem link com ?abrir=<tela> (o app lê e abre a
  // tela certa). Mesmo app: chama opts.aoAbrir(params) se o app passou,
  // senão navega na mesma aba. Outro app: abre em aba nova, como o Hub.
  var NOME_APP = {
    assistencia: 'Assistência Stonni', compras: 'Compras', cobranca: 'Cobrança',
    stonni: 'Comercial Stonni', atacado: 'CRM Atacado', varejo: 'Kit do Vendedor', vitrine: 'E-commerce Bononi',
    frete: 'Frete', loja: 'Loja Física', expedicao: 'Expedição', financeiro: 'Financeiro',
    'painel-dev': 'Painel Dev', hub: 'Hub', treinamento: 'Treinamento', rh: 'RH', recrutamento: 'Recrutamento',
    prospeccao: 'Prospecção', marketing: 'Marketing', precificacao_marketplace: 'Precificação',
  };
  // appId do app que carrega este arquivo → apps cujas filas moram nele
  // (o CRM Atacado roda dentro do Comercial Stonni, com appId próprio).
  var APPS_DA_CASA = { stonni: ['stonni', 'atacado'], atacado: ['atacado', 'stonni'] };

  var ICONE_SINO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
    '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

  var _pend = { itens: [], o: null, timer: null };

  function chavePendVisto(o) { return 'gc-pend-visto:' + String(o.usuario.email).toLowerCase(); }
  function lerPendVisto(o) {
    try { return JSON.parse(localStorage.getItem(chavePendVisto(o)) || '{}') || {}; } catch (e) { return {}; }
  }
  function gravarPendVisto(o, itens) {
    var m = {};
    itens.forEach(function (p) { if (p.para_mim) m[p.app + ':' + p.chave] = p.qtd; });
    try { localStorage.setItem(chavePendVisto(o), JSON.stringify(m)); } catch (e) { /* sem storage: sem "novo" */ }
  }
  function ehNovo(p, visto) { return p.para_mim && p.qtd > (visto[p.app + ':' + p.chave] || 0); }

  function pendDesteApp(o, itens) {
    if (o.appId === 'hub') return itens;
    var casa = APPS_DA_CASA[o.appId] || [o.appId];
    return itens.filter(function (p) { return casa.indexOf(p.app) !== -1 || p.para_mim; });
  }
  function doApp(o, p) { return (APPS_DA_CASA[o.appId] || [o.appId]).indexOf(p.app) !== -1; }
  function numCurto(n) { return n > 99 ? '99+' : String(n); }
  function dataCurta(s) {
    if (!s) return '';
    // "2026-09-01" sozinho o JS lê como meia-noite UTC — no Brasil vira 31/08.
    var so = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    var d = so ? new Date(+so[1], so[2] - 1, +so[3]) : new Date(s);
    if (isNaN(d)) return '';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  function garantirEstiloSino() {
    if (document.getElementById('gc-sino-estilo')) return;
    var s = document.createElement('style');
    s.id = 'gc-sino-estilo';
    s.textContent =
      '#gc-sino-wrap{position:fixed;right:16px;bottom:calc(68px + env(safe-area-inset-bottom));z-index:10;' +
        'display:flex;align-items:center;gap:8px}' +
      '#gc-sino-wrap:hover .gc-fab-tooltip,#gc-sino-wrap:focus-within .gc-fab-tooltip{opacity:1;transform:translateX(0)}' +
      '#gc-sino{width:44px;height:44px;border-radius:50%;cursor:pointer;position:relative;flex:none;' +
        'background:var(--surface-card,#fff);color:var(--text-strong,#14161a);border:1px solid var(--border-subtle,#e2e5ea);display:flex;align-items:center;justify-content:center;' +
        'box-shadow:var(--shadow-raised,0 4px 16px rgba(20,22,26,.18))}' +
      '#gc-sino.tem{color:var(--text-accent,#c11f25)}' +
      '#gc-sino.novo .gc-fab-badge{animation:gc-pulso 1.6s ease-out 3}' +
      '@keyframes gc-pulso{0%{box-shadow:0 0 0 0 rgba(193,31,37,.55)}100%{box-shadow:0 0 0 10px rgba(193,31,37,0)}}' +
      '#gc-sino-painel{position:fixed;right:16px;bottom:calc(120px + env(safe-area-inset-bottom));z-index:12;' +
        'width:min(380px,calc(100vw - 32px));max-height:min(62vh,520px);overflow-y:auto;background:var(--surface-card,#fff);color:var(--text-strong,#14161a);' +
        'border:1px solid var(--border-subtle,#e2e5ea);border-radius:10px;box-shadow:0 12px 40px rgba(20,22,26,.25);font-family:inherit;font-size:13px}' +
      '#gc-sino-painel .gc-sp-topo{display:flex;justify-content:space-between;align-items:center;padding:12px 14px 8px;' +
        'position:sticky;top:0;background:var(--surface-card,#fff);border-bottom:1px solid var(--border-subtle,#e2e5ea)}' +
      '#gc-sino-painel .gc-sp-sec{font-size:10.5px;font-weight:800;letter-spacing:.04em;color:var(--text-muted,#6b7382);padding:10px 14px 4px}' +
      '#gc-sino-painel .gc-sp-item{display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:none;' +
        'border:none;border-bottom:1px solid var(--border-subtle,#e2e5ea);padding:10px 14px;cursor:pointer;font:inherit;color:inherit}' +
      '#gc-sino-painel .gc-sp-item:hover,#gc-sino-painel .gc-sp-item:focus-visible{background:var(--surface-hover,#f5f6f8)}' +
      '#gc-sino-painel .gc-sp-n{min-width:28px;height:22px;border-radius:999px;background:var(--surface-sunken,#f1f2f4);color:var(--text-strong,#14161a);' +
        'font-weight:800;font-size:12px;line-height:22px;text-align:center;padding:0 6px;flex:none}' +
      '#gc-sino-painel .gc-sp-item.mim .gc-sp-n{background:var(--action-accent,#c11f25);color:var(--text-inverse,#fff)}' +
      '#gc-sino-painel .gc-sp-sub{color:var(--text-muted,#6b7382);font-size:11.5px;margin-top:2px}' +
      '#gc-sino-painel .gc-sp-novo{font-size:10px;font-weight:800;color:var(--text-accent,#c11f25);margin-left:6px}' +
      '#gc-sino-painel .gc-sp-vazio{padding:22px 14px;text-align:center;color:var(--text-muted,#6b7382)}' +
      // sinoEm: o sino entra no cabeçalho do app (sem flutuar) e o painel abre embaixo dele
      '#gc-sino-wrap.gc-no-topo{position:static;display:inline-flex}' +
      '#gc-sino-wrap.gc-no-topo #gc-sino{width:38px;height:38px;box-shadow:none}' +
      '#gc-sino-wrap.gc-no-topo .gc-fab-tooltip{display:none}' +
      '#gc-sino-painel.gc-no-topo{bottom:auto;top:calc(72px + env(safe-area-inset-top));z-index:30}';
    document.head.appendChild(s);
  }

  function montarSino(o) {
    if (document.getElementById('gc-sino')) return;
    garantirEstiloFab();
    garantirEstiloSino();
    var wrap = document.createElement('div');
    wrap.id = 'gc-sino-wrap';
    wrap.innerHTML = '<span class="gc-fab-tooltip">Pendências</span>' +
      '<button id="gc-sino" type="button" aria-label="Pendências" aria-expanded="false">' + ICONE_SINO + '</button>';
    // App com botão flutuante próprio no canto (ex.: o "+" de upload do
    // Consulta Vendas) passa `sinoEm: '<seletor>'` e o sino vai para lá.
    var alvo = o.sinoEm ? document.querySelector(o.sinoEm) : null;
    if (alvo) { wrap.classList.add('gc-no-topo'); alvo.appendChild(wrap); }
    else document.body.appendChild(wrap);
    wrap.querySelector('#gc-sino').addEventListener('click', function () {
      if (document.getElementById('gc-sino-painel')) fecharPainelSino(); else abrirPainelSino(o);
    });
  }

  function atualizarSino(o) {
    var btn = document.getElementById('gc-sino'); if (!btn) return;
    var meus = pendDesteApp(o, _pend.itens);
    var total = meus.reduce(function (s, p) { return s + p.qtd; }, 0);
    var visto = lerPendVisto(o);
    var temNovo = meus.some(function (p) { return ehNovo(p, visto); });
    var badge = btn.querySelector('.gc-fab-badge');
    if (total > 0) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'gc-fab-badge'; btn.appendChild(badge); }
      badge.textContent = numCurto(total);
    } else if (badge) badge.remove();
    btn.classList.toggle('tem', total > 0);
    btn.classList.toggle('novo', temNovo);
    btn.setAttribute('aria-label', total === 0 ? 'Pendências: nada esperando você'
      : total === 1 ? 'Pendências: 1 item esperando ação' : 'Pendências: ' + total + ' itens esperando ação');
    return temNovo;
  }

  function fecharPainelSino() {
    var el = document.getElementById('gc-sino-painel'); if (el) el.remove();
    var btn = document.getElementById('gc-sino'); if (btn) btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', escFechaSino);
  }
  function escFechaSino(ev) { if (ev.key === 'Escape') fecharPainelSino(); }

  function itemHtml(o, p, i, visto) {
    var sub = [];
    if (!doApp(o, p)) sub.push(NOME_APP[p.app] || p.app);
    if (p.desde) sub.push('desde ' + dataCurta(p.desde));
    return '<button type="button" class="gc-sp-item' + (p.para_mim ? ' mim' : '') + '" data-i="' + i + '">' +
      '<span class="gc-sp-n">' + (p.chave === 'erro' ? '!' : numCurto(p.qtd)) + '</span>' +
      '<span style="flex:1;min-width:0"><span style="font-weight:600">' + esc(p.titulo) + '</span>' +
      (ehNovo(p, visto) ? '<span class="gc-sp-novo">NOVO</span>' : '') +
      (sub.length ? '<div class="gc-sp-sub">' + esc(sub.join(' · ')) + '</div>' : '') +
      '</span></button>';
  }

  function abrirPainelSino(o) {
    fecharPainelSino();
    var meus = pendDesteApp(o, _pend.itens);
    var visto = lerPendVisto(o);
    var mim = [], setor = [];
    meus.forEach(function (p, i) { (p.para_mim ? mim : setor).push({ p: p, i: i }); });
    var html = '<div class="gc-sp-topo"><b style="font-size:14px">Pendências</b>' +
      '<button type="button" id="gc-sp-fechar" aria-label="Fechar" style="background:none;border:none;cursor:pointer;font-size:18px;line-height:1;color:var(--text-muted,#6b7382)">×</button></div>';
    if (!meus.length) {
      html += '<div class="gc-sp-vazio">Nada esperando você agora.</div>';
    } else {
      if (mim.length) html += '<div class="gc-sp-sec">PARA VOCÊ</div>' + mim.map(function (x) { return itemHtml(o, x.p, x.i, visto); }).join('');
      if (setor.length) html += '<div class="gc-sp-sec">' + (o.appId === 'hub' ? 'FILAS DOS SETORES' : 'FILAS DESTE APP') + '</div>' +
        setor.map(function (x) { return itemHtml(o, x.p, x.i, visto); }).join('');
    }
    var el = document.createElement('div');
    el.id = 'gc-sino-painel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Pendências');
    el.innerHTML = html;
    if (document.querySelector('#gc-sino-wrap.gc-no-topo')) el.classList.add('gc-no-topo');
    document.body.appendChild(el);
    var btn = document.getElementById('gc-sino'); if (btn) btn.setAttribute('aria-expanded', 'true');
    el.querySelector('#gc-sp-fechar').addEventListener('click', fecharPainelSino);
    document.addEventListener('keydown', escFechaSino);
    el.querySelectorAll('.gc-sp-item').forEach(function (b) {
      b.addEventListener('click', function () { irParaPendencia(o, meus[parseInt(b.dataset.i, 10)]); });
    });
    // Abrir o sino é o "vi" do NOVO (a contagem continua até resolver).
    gravarPendVisto(o, _pend.itens);
    atualizarSino(o);
  }

  function irParaPendencia(o, p) {
    if (!p || !p.link) return;
    fecharPainelSino();
    if (p.link === 'gc:meus-pedidos') {
      abrirModalSugestao(o).then(function () {
        var aba = document.getElementById('gc-aba-meus'); if (aba) aba.click();
      });
      return;
    }
    var destino;
    try { destino = new URL(p.link); } catch (e) { return; }
    if (destino.origin === location.origin) {
      var params = {};
      destino.searchParams.forEach(function (v, k) { params[k] = v; });
      params._caminho = destino.pathname;
      if (typeof o.aoAbrir === 'function') {
        try { if (o.aoAbrir(params) !== false) return; } catch (e) { console.warn('[geral-central] aoAbrir', e && e.message); }
      }
      location.href = destino.href;
      return;
    }
    // outro app: o portão dele (ds/geral-portao.js) só deixa entrar sem
    // sessão quem chega do Hub — mesmo parâmetro que o cartão do Hub usa.
    destino.searchParams.set('de', 'hub');
    window.open(destino.href, '_blank', 'noopener');
  }

  async function carregarPendencias(o) {
    try {
      o.token = (await token(o)) || o.token; // o token vence em 1h; o sino fica aberto o dia todo
      var resp = await rest(o, 'rpc/geral_minhas_pendencias', { method: 'POST', body: '{}' });
      if (!resp || !resp.ok) return null; // RPC ausente neste banco: sem sino
      var itens = await resp.json();
      if (!Array.isArray(itens)) return null;
      _pend.itens = itens.map(function (p) {
        return { app: p.app, chave: p.chave, titulo: p.titulo, qtd: parseInt(p.qtd, 10) || 0,
                 para_mim: p.para_mim === true, desde: p.desde, link: p.link };
      });
      try { window.dispatchEvent(new CustomEvent('gc:pendencias', { detail: _pend.itens })); } catch (e) { /* navegador antigo */ }
      return _pend.itens;
    } catch (e) { console.warn('[geral-central] pendências', e && e.message); return null; }
  }

  async function iniciarSino(o) {
    // Portal do Parceiro é da autorizada (externa): as pendências dela já têm
    // selo e faixa próprios lá, e a RPC não devolve nada para conta parceira.
    if (o.appId === 'rede-autorizada') return;
    // App embutido (o CRM Atacado roda num iframe dentro do Comercial
    // Stonni): o sino fica só na janela de cima, senão aparecem dois.
    try { if (window.top !== window.self) return; } catch (e) { return; }
    // `sino: false` — tela onde o sino não fala com quem lê (a autorizada
    // dentro da Assistência Stonni usa o mesmo appId da equipe interna).
    if (o.sino === false) return;
    // App React chama iniciar() de novo a cada renovação de sessão: a partir
    // da segunda vez só troca o contexto (token, aoAbrir) e relê — sem
    // empilhar outro timer e outro ouvinte de visibilidade.
    var primeira = !_pend.o;
    _pend.o = o;
    var itens = await carregarPendencias(o);
    if (!itens) {
      // falha na 1ª leitura (rede, token, view fria): tenta de novo em 1 min, uma vez
      if (primeira && !_pend.retentou) {
        _pend.retentou = true; _pend.o = null;
        setTimeout(function () { iniciarSino(o); }, 60000);
      }
      return;
    }
    montarSino(o);
    var temNovo = atualizarSino(o);
    if (temNovo && !_pend.abriuNaEntrada) { _pend.abriuNaEntrada = true; abrirPainelSino(o); } // novidade nominal: mostra na entrada, uma vez
    if (_pend.timer) return;
    _pend.timer = setInterval(async function () {
      if (document.hidden) return;
      if (await carregarPendencias(_pend.o)) atualizarSino(_pend.o);
    }, 180000);
    document.addEventListener('visibilitychange', async function () {
      if (!document.hidden && await carregarPendencias(_pend.o)) atualizarSino(_pend.o);
    });
  }

  // ── 7. Caminho (v15) ─────────────────────────────────────────────
  var _nav = { o: null, ultima: null, pendente: null, escutando: false };

  function rotaAtual() {
    var p = (location.pathname || '/') + (location.hash && location.hash.length > 1 ? location.hash : '');
    return p
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+(?=\/|$|\?|#)/g, '/:id');
  }

  async function registrarTela(tela) {
    var o = _nav.o;
    if (!o || !tela || tela === _nav.ultima) return;
    _nav.ultima = tela;
    try {
      o.token = (await token(o)) || o.token; // o token renova a cada hora
      await rest(o, 'rpc/geral_registrar_navegacao', {
        method: 'POST',
        body: JSON.stringify({ p_app: o.appId, p_tela: String(tela).slice(0, 120) }),
      });
    } catch (e) { /* silencioso: caminho não pode atrapalhar o app */ }
  }

  function escutarRotas() {
    if (_nav.escutando) return;
    _nav.escutando = true;
    var aoMudar = function () { setTimeout(function () { registrarTela(rotaAtual()); }, 0); };
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      if (typeof orig !== 'function') return;
      history[m] = function () {
        var r = orig.apply(this, arguments);
        // app de tela única que usa replaceState só para limpar ?abrir= não
        // conta: nele quem diz a tela é GeralCentral.tela()
        if (!_nav.manual) aoMudar();
        return r;
      };
    });
    window.addEventListener('popstate', function () { if (!_nav.manual) aoMudar(); });
    window.addEventListener('hashchange', function () { if (!_nav.manual) aoMudar(); });
  }

  function iniciarCaminho(o) {
    _nav.o = o;
    if (_nav.pendente) { registrarTela(_nav.pendente); _nav.pendente = null; }
    // app de tela única costuma dizer a tela logo depois do iniciar: espera um
    // instante antes de gravar a rota, para não registrar um "/" à toa
    else setTimeout(function () { if (!_nav.manual) registrarTela(rotaAtual()); }, 1500);
    escutarRotas();
  }

  var GeralCentral = {
    versao: VERSAO,

    /** v15: o app de tela única avisa a troca de tela (id estável, ex. 'cmp-pedidos'). */
    tela: function (id) {
      if (!id) return;
      _nav.manual = true;
      if (!_nav.o) { _nav.pendente = String(id); return; }
      registrarTela(String(id));
    },

    /** Última lista do sino (a mesma que o evento `gc:pendencias` entrega). */
    pendencias: function () { return _pend.itens.slice(); },

    /** v21: troca a senha da sessão conferindo as últimas 5 ({url, key, sb}). → { ok, mensagem } */
    trocarSenha: function (o, nova) { return trocarSenha(o, nova); },

    /** Relê as pendências agora — o app chama depois de resolver algo na tela. */
    recarregarPendencias: async function () {
      if (!_pend.o) return [];
      var itens = await carregarPendencias(_pend.o);
      if (itens) atualizarSino(_pend.o);
      return _pend.itens.slice();
    },

    /**
     * @param {object} o
     * @param {string} o.appId    chave `acesso` do APPS do Hub (compras, financeiro…)
     * @param {string} o.url      SUPA_URL
     * @param {string} o.key      SUPA_KEY (anon)
     * @param {object} o.sb       client supabase-js (sessão já logada)
     * @param {object} o.usuario  { email, nome }
     * @param {string} [o.sinoEm] v14: seletor de um elemento do cabeçalho onde
     *   o sino entra (em vez de flutuar no canto) — para app com botão
     *   flutuante próprio no mesmo lugar.
     * @param {boolean} [o.sino] v14: false = não mostra o sino nesta tela.
     * @param {function} [o.aoAbrir] v14: recebe os parâmetros do link de um
     *   item do sino que é DESTE app ({abrir, id, …, _caminho}) e abre a tela
     *   sem recarregar. Devolver false = "não sei abrir" → navega pelo link.
     */
    iniciar: async function (opts) {
      if (!opts || !opts.appId || !opts.url || !opts.key || !opts.sb || !opts.usuario) return;
      garantirEstiloImpressao();
      opts.token = await token(opts);
      if (!opts.token) return; // sem sessão, não faz nada
      iniciarCaminho(opts);    // v15: primeiro, sem await — não espera aviso nem senha

      var bloqueado = await verificarExpiracaoSenha(opts);
      if (bloqueado) {
        // sessão trocou de senha agora — o restante roda depois, já liberado.
      }
      await verificarAvisos(opts);
      await verificarAtualizacaoCadastral(opts);
      montarFabSugestao(opts);
      verificarPrazosTreinamento(opts); // sem await: cartão não bloqueia nada
      iniciarSino(opts);                // sem await: sino não bloqueia nada
    },
  };

  window.GeralCentral = GeralCentral;
})();
