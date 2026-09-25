/* ============================================================
   geral-portao.js — "Entrada pelo Hub"  |  v1 — 25/09/2026
   ============================================================
   Quem digita o endereço de um app direto no navegador, sem estar
   logado nele, é mandado para o Hub. Quem veio do Hub (cartão abre o
   app com ?de=hub) ou já tem sessão salva neste app entra normal.

   ISTO NÃO É SEGURANÇA. É organização da porta de entrada: quem copiar
   o link com ?de=hub entra. O que protege dado continua sendo o login
   do app e o módulo liberado no Hub. Não troque um pelo outro.

   COMO USAR: primeira coisa do <head>, síncrono, antes de qualquer
   outro script (é o que evita a tela do app piscar antes de sair):

     <script src="ds/geral-portao.js?v=1"></script>        (HTML puro)
     <script src="/ds/geral-portao.js?v=1"></script>       (Vite, em public/ds/)

   QUEM NÃO É MANDADO PARA O HUB, e por quê:
   - tem chave de sessão do Supabase no localStorage (sb-*-auth-token,
     ou a que o app declarar em data-sessao — o Vendas usa varejo_session):
     já entrou neste app; é o que mantém o ícone instalado (PWA) abrindo.
   - chegou com ?de=hub, ou chegou por ele há menos de 12h neste aparelho
     (a marca fica no localStorage: recarregar ou navegar não expulsa, e
     app sem login — E-commerce, Loja, Frete — não expulsa a cada F5).
   - veio de link de e-mail do Supabase (#access_token, type=recovery,
     ?code=): redefinição de senha precisa chegar na tela do app.
   - localhost/127.0.0.1: desenvolvimento local.
   - localStorage bloqueado (aba anônima estrita): na dúvida, deixa entrar.
     Prender alguém do lado de fora é pior que deixar passar — o login
     do app segura o resto.

   ESTE ARQUIVO É CÓPIA VERBATIM. A original vive em bononi-hub/ds/.
   Mudou aqui? Mude lá e recopie para todos. Confira com:
     cmp ds/geral-portao.js <hub>/ds/geral-portao.js
   ============================================================ */
(function () {
  'use strict';

  var HUB = 'https://bononi-hub.vercel.app/';
  var MARCA = 'geral_portao_de_hub';
  var VALIDADE_MS = 12 * 60 * 60 * 1000;

  try {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === 'bononi-hub.vercel.app') return;

    var busca = new URLSearchParams(location.search);
    var hash = location.hash || '';
    if (/access_token=|type=recovery|error_description=/.test(hash) || busca.has('code')) return;

    if (busca.get('de') === 'hub') {
      localStorage.setItem(MARCA, String(Date.now()));
      busca.delete('de');
      var resto = busca.toString();
      history.replaceState(history.state, '', location.pathname + (resto ? '?' + resto : '') + hash);
      return;
    }

    var quando = Number(localStorage.getItem(MARCA) || 0);
    if (quando && Date.now() - quando < VALIDADE_MS) return;

    // App que guarda a sessão fora do padrão do supabase-js avisa na tag:
    //   <script src="ds/geral-portao.js?v=1" data-sessao="varejo_session">
    var extra = document.currentScript && document.currentScript.getAttribute('data-sessao');
    if (extra && localStorage.getItem(extra)) return;

    for (var i = 0; i < localStorage.length; i++) {
      if (/^sb-.+-auth-token$/.test(localStorage.key(i) || '')) return;
    }
  } catch (e) {
    return;
  }

  location.replace(HUB);
})();
