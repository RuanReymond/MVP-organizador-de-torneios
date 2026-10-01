/* =========================================================
   MVP – Torneios da Loja
   Tudo roda no navegador. Os dados ficam no localStorage.
   Toda leitura/gravação passa pelo objeto `db`, então quando
   você tiver um backend basta trocar as funções dele.
   ========================================================= */

const CHAVE = "torneios_mvp_v1";
const ESPERA = 5; // vagas fixas de lista de espera em todo torneio

/* ---------- "Banco de dados" ---------- */
const db = {
  listar() {
    try {
      const bruto = JSON.parse(localStorage.getItem(CHAVE)) || [];
      let mudou = false;
      const lista = bruto.map(t => {
        const novo = { maxJogadores: 32, status: "ativo", ...t };
        if (!novo.codigo) { novo.codigo = gerarCodigo(); mudou = true; }
        if (!novo.status) { novo.status = "ativo"; mudou = true; }
        novo.inscritos = (novo.inscritos || []).map(j => ({ checkin: false, checkinEm: null, ...j }));
        return novo;
      });
      if (mudou) localStorage.setItem(CHAVE, JSON.stringify(lista));
      return lista;
    } catch { return []; }
  },
  salvar(lista) { localStorage.setItem(CHAVE, JSON.stringify(lista)); },
  buscar(id) { return this.listar().find(t => t.id === id); },
  criar(dados) {
    const lista = this.listar();
    const torneio = { id: novoId(), criadoEm: Date.now(), inscritos: [], status: "ativo", ...dados, codigo: gerarCodigo() };
    lista.push(torneio);
    this.salvar(lista);
    return torneio;
  },
  atualizar(id, dados) {
    const lista = this.listar();
    const t = lista.find(x => x.id === id);
    if (!t) return false;
    Object.assign(t, dados); // mantém id, criadoEm e inscritos
    this.salvar(lista);
    return true;
  },
  encerrar(id) {
    const lista = this.listar();
    const t = lista.find(x => x.id === id);
    if (!t) return false;
    t.status = "encerrado";
    t.encerradoEm = Date.now();
    this.salvar(lista);
    return true;
  },
  inscrever(torneioId, jogador) {
    const lista = this.listar();
    const t = lista.find(x => x.id === torneioId);
    if (!t) return { ok: false, erro: "Torneio não encontrado." };
    if (t.status === "encerrado") return { ok: false, erro: "Este torneio foi encerrado pelo lojista." };
    if (t.inscritos.some(j => j.idPlay === jogador.idPlay)) {
      return { ok: false, erro: "Esse ID Play! Pokémon já está inscrito neste torneio." };
    }
    if (t.inscritos.length >= t.maxJogadores + ESPERA) {
      return { ok: false, erro: "Este torneio está lotado: vagas e lista de espera preenchidas." };
    }
    t.inscritos.push({ ...jogador, inscritoEm: Date.now(), checkin: false, checkinEm: null });
    this.salvar(lista);
    const posicaoEspera = t.inscritos.length - t.maxJogadores;
    return { ok: true, espera: posicaoEspera > 0, posicaoEspera };
  },
  checkin(torneioId, idPlayDigitado, codigoDigitado) {
    const lista = this.listar();
    const t = lista.find(x => x.id === torneioId);
    if (!t) return { ok: false, erro: "Torneio não encontrado." };
    if (t.status === "encerrado") return { ok: false, erro: "Este torneio foi encerrado pelo lojista." };
    if (codigoDigitado.trim().toUpperCase() !== t.codigo) {
      return { ok: false, erro: "Código de check-in incorreto." };
    }
    const jogador = t.inscritos.find(j => j.idPlay === idPlayDigitado.trim());
    if (!jogador) return { ok: false, erro: "Não encontramos essa inscrição neste torneio." };
    if (jogador.checkin) {
      const hora = new Date(jogador.checkinEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return { ok: false, erro: `Check-in já feito às ${hora}.` };
    }
    jogador.checkin = true;
    jogador.checkinEm = Date.now();
    this.salvar(lista);
    return { ok: true, nome: jogador.nome };
  },
  removerInscrito(torneioId, idPlay) {
    const lista = this.listar();
    const t = lista.find(x => x.id === torneioId);
    if (t) t.inscritos = t.inscritos.filter(j => j.idPlay !== idPlay);
    this.salvar(lista);
  }
};

/* ---------- Utilidades ---------- */
function gerarCodigo() {
  // sem 0, O, 1, I para evitar confusão ao digitar no balcão da loja
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let codigo = "";
  for (let i = 0; i < 6; i++) codigo += chars[Math.floor(Math.random() * chars.length)];
  return codigo;
}

function novoId() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
    .replace(/-/g, "").slice(0, 10);
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dataHora(t) { return new Date(`${t.data}T${t.hora}`); }

function encerrado(t) { return dataHora(t) < new Date(); }

/* Vagas: os primeiros `maxJogadores` inscritos estão confirmados; os próximos
   ESPERA ficam na lista de espera. A ordem do array define a fila, então se o
   lojista remover alguém, quem estava na espera sobe sozinho. */
function situacao(t) {
  const total = t.inscritos.length;
  const max = t.maxJogadores;
  return {
    max,
    confirmados: Math.min(total, max),
    espera: Math.max(0, total - max),
    lotado: total >= max + ESPERA
  };
}

function textoVagas(s) {
  return `${s.confirmados}/${s.max} confirmados` + (s.espera ? ` · ${s.espera} em espera` : "");
}

function rotuloSelo(s) {
  if (s.lotado) return "Lotado";
  if (s.espera) return "Lista de espera";
  return `${s.confirmados}/${s.max}`;
}

function avisoVagas(s) {
  if (s.confirmados < s.max) {
    const livres = s.max - s.confirmados;
    return `<p class="aviso">${livres} ${livres === 1 ? "vaga disponível" : "vagas disponíveis"}.</p>`;
  }
  const livres = ESPERA - s.espera;
  return `<p class="aviso">Vagas esgotadas. Sua inscrição entrará na lista de espera (${livres} ${livres === 1 ? "lugar restante" : "lugares restantes"}).</p>`;
}

/* Lista visível para os jogadores: só o nome (ID e ano de nascimento ficam restritos ao lojista) */
function listaPublica(t) {
  const s = situacao(t);
  if (!t.inscritos.length) {
    return `<section class="lista-publica"><h2>Inscritos</h2><p class="sub" style="margin:0">Ninguém se inscreveu ainda. Seja o primeiro.</p></section>`;
  }
  const item = j => `<li>${esc(j.nome)}</li>`;
  return `
    <section class="lista-publica">
      <h2>Inscritos (${s.confirmados}/${s.max})</h2>
      <ol>${t.inscritos.slice(0, s.max).map(item).join("")}</ol>
      ${s.espera ? `<h2>Lista de espera (${s.espera}/${ESPERA})</h2><ol>${t.inscritos.slice(s.max).map(item).join("")}</ol>` : ""}
    </section>`;
}

function blocoCheckin(t) {
  return `
    <section class="painel-form" style="margin:24px 0">
      <h2>Check-in no local</h2>
      <p class="sub" style="margin:0 0 14px">Já está inscrito? Ao chegar na loja, informe seu ID Play! Pokémon e o código do dia que o lojista vai te passar no balcão.</p>
      <form data-form="checkin" data-id="${t.id}" novalidate>
        <div class="linha-2">
          <label>ID Play! Pokémon
            <input name="idPlay" inputmode="numeric" maxlength="12" required placeholder="Somente números" />
          </label>
          <label>Código do dia
            <input name="codigo" maxlength="6" required placeholder="Ex.: 7K9P2X" style="text-transform:uppercase" />
          </label>
        </div>
        <p class="erro" id="erro" role="alert"></p>
        <button class="btn principal" type="submit">Confirmar presença</button>
      </form>
    </section>`;
}

function formatarData(t) {
  const d = dataHora(t);
  const dia = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${dia} · ${hora}`;
}

function linkDoTorneio(id) {
  return `${location.href.split("#")[0]}#/torneio/${id}`;
}

function linkDaLista() {
  return `${location.href.split("#")[0]}#/torneios`;
}

let timerToast;
function avisar(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove("visivel"), 2200);
}

async function copiar(texto, msg = "Link copiado") {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(msg);
  } catch {
    window.prompt("Copie:", texto);
  }
}

/* ---------- Telas ---------- */
const app = document.getElementById("app");

function cartaTorneio(t, { lojista }) {
  const finalizado = t.status === "encerrado";
  const fechado = finalizado || encerrado(t);
  const qtd = t.inscritos.length;
  const s = situacao(t);
  const rotuloQtd = textoVagas(s);
  const seloTexto = finalizado ? "Histórico" : (fechado ? "Encerrado" : rotuloSelo(s));
  const checkins = t.inscritos.filter(j => j.checkin).length;

  const acoesLojistaAtivo = `
    <div class="codigo-checkin">
      <span class="rotulo" style="margin:0">Código de check-in</span>
      <strong>${esc(t.codigo)}</strong>
      <button class="btn pequeno" data-acao="copiar-codigo" data-id="${t.id}">Copiar código</button>
    </div>
    <div class="acoes">
      <button class="btn principal pequeno" data-acao="copiar" data-id="${t.id}">Copiar link</button>
      <a class="btn pequeno" href="#/editar/${t.id}">Editar torneio</a>
      <button class="btn perigo pequeno" data-acao="encerrar" data-id="${t.id}">Encerrar</button>
    </div>
    <details class="inscritos">
      <summary>Lista de inscritos (${qtd}) · ${checkins} com check-in</summary>
      ${tabelaInscritos(t)}
    </details>`;

  const acoesLojistaHistorico = `
    <div class="acoes">
      <span class="sub" style="margin:0">Encerrado em ${esc(new Date(t.encerradoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }))}</span>
    </div>
    <details class="inscritos">
      <summary>Lista de inscritos (${qtd}) · ${checkins} com check-in</summary>
      ${tabelaInscritos(t, { somenteLeitura: true })}
    </details>`;

  const acoesPublico = `
    <div class="acoes">
      <a class="btn principal pequeno" href="#/torneio/${t.id}">${fechado ? "Ver detalhes" : "Ver e inscrever-se"}</a>
    </div>`;

  return `
    <article class="carta">
      <div class="carta-topo">
        <span>${esc(formatarData(t))}</span>
        <span class="selo ${fechado ? "encerrado" : ""}">${seloTexto}</span>
      </div>
      <div class="carta-corpo">
        <h3>${esc(t.nome)}</h3>
        ${lojista ? `<p>${rotuloQtd}</p>` : ""}
        ${t.descricao ? `<p>${esc(t.descricao)}</p>` : ""}
      </div>
      ${lojista ? (finalizado ? acoesLojistaHistorico : acoesLojistaAtivo) : acoesPublico}
    </article>`;
}

function tabelaInscritos(t, { somenteLeitura = false } = {}) {
  if (!t.inscritos.length) return `<p class="sub" style="margin:10px 0 0">Ninguém se inscreveu ainda. Copie o link e envie para os jogadores.</p>`;
  const linhas = t.inscritos.map((j, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${esc(j.nome)}</td>
      <td>${esc(j.idPlay)}</td>
      <td>${esc(j.anoNascimento)}</td>
      <td>${i < t.maxJogadores ? "Confirmado" : `Espera ${i - t.maxJogadores + 1}`}</td>
      <td>${j.checkin ? `Sim · ${new Date(j.checkinEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Não"}</td>
      <td>${somenteLeitura ? "" : `<button class="btn perigo pequeno" data-acao="remover" data-id="${t.id}" data-play="${esc(j.idPlay)}">Remover</button>`}</td>
    </tr>`).join("");
  return `
    <div class="tabela-wrap">
      <table>
        <thead><tr><th>#</th><th>Nome</th><th>ID Play! Pokémon</th><th>Ano de nasc.</th><th>Situação</th><th>Check-in</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/* Painel do lojista */
function telaPainel() {
  const lista = db.listar();
  const ativos = lista.filter(t => t.status !== "encerrado").sort((a, b) => dataHora(a) - dataHora(b));
  const historico = lista.filter(t => t.status === "encerrado").sort((a, b) => (b.encerradoEm || 0) - (a.encerradoEm || 0));
  const total = lista.reduce((s, t) => s + t.inscritos.length, 0);

  app.innerHTML = `
    <div class="cabecalho-pagina">
      <div>
        <h1>Seus torneios</h1>
        <p class="sub" style="margin:0">${lista.length} ${lista.length === 1 ? "torneio criado" : "torneios criados"} · ${total} ${total === 1 ? "inscrição no total" : "inscrições no total"}</p>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn" data-acao="copiar-lista">Copiar link da lista</button>
        <a class="btn principal" href="#/novo">Criar torneio</a>
      </div>
    </div>
    <br />
    ${ativos.length
      ? `<section class="grade">${ativos.map(t => cartaTorneio(t, { lojista: true })).join("")}</section>`
      : `<div class="vazio"><p>Você não tem torneios ativos no momento.</p><a class="btn principal" href="#/novo">Criar torneio</a></div>`}

    ${historico.length ? `
      <h2 style="margin-top:40px">Histórico (${historico.length})</h2>
      <p class="sub">Torneios encerrados ficam salvos aqui com a lista completa de inscritos.</p>
      <section class="grade">${historico.map(t => cartaTorneio(t, { lojista: true })).join("")}</section>
    ` : ""}
  `;
}

/* Criar torneio */
function telaNovo() {
  const hoje = new Date().toISOString().slice(0, 10);
  app.innerHTML = `
    <a class="voltar" href="#/">Voltar ao painel</a>
    <h1>Criar torneio</h1>
    <p class="sub">Preencha os dados. Depois de salvar, é só copiar o link e enviar para os jogadores.</p>

    <form class="painel-form" data-form="novo" novalidate>
      <label>Nome do torneio
        <input name="nome" maxlength="80" required placeholder="Ex.: Liga Local – Rodada de Outubro" />
      </label>
      <div class="linha-2">
        <label>Data
          <input type="date" name="data" min="${hoje}" required />
        </label>
        <label>Hora
          <input type="time" name="hora" required />
        </label>
      </div>
      <label>Número máximo de jogadores
        <input type="number" name="max" min="2" max="512" required value="32" />
        <small>Depois que as vagas acabarem, entram mais ${ESPERA} jogadores na lista de espera.</small>
      </label>
      <label>Descrição <small>(opcional)</small>
        <textarea name="descricao" maxlength="500" placeholder="Formato, premiação, taxa de inscrição, local..."></textarea>
      </label>
      <label>Regras
        <textarea name="regras" maxlength="1500" required placeholder="Ex.: Formato Padrão, decks de 60 cartas, melhor de 3..."></textarea>
      </label>
      <p class="erro" id="erro" role="alert"></p>
      <button class="btn principal" type="submit">Salvar torneio</button>
    </form>
  `;
}

/* Editar torneio */
function telaEditar(id) {
  const t = db.buscar(id);
  if (!t) {
    app.innerHTML = `<div class="vazio"><p>Torneio não encontrado.</p><a class="btn" href="#/">Voltar ao painel</a></div>`;
    return;
  }
  const qtd = t.inscritos.length;
  app.innerHTML = `
    <a class="voltar" href="#/">Voltar ao painel</a>
    <h1>Editar torneio</h1>
    <p class="sub">${qtd ? `As ${qtd} ${qtd === 1 ? "inscrição atual será mantida" : "inscrições atuais serão mantidas"}.` : "Ainda não há inscritos neste torneio."}</p>
    <div class="codigo-checkin" style="margin-bottom:20px; border-radius:10px; border:2px solid var(--linha)">
      <span class="rotulo" style="margin:0">Código de check-in</span>
      <strong>${esc(t.codigo)}</strong>
      <button type="button" class="btn pequeno" data-acao="copiar-codigo" data-id="${t.id}">Copiar código</button>
    </div>

    <form class="painel-form" data-form="editar" data-id="${t.id}" novalidate>
      <label>Nome do torneio
        <input name="nome" maxlength="80" required value="${esc(t.nome)}" />
      </label>
      <div class="linha-2">
        <label>Data
          <input type="date" name="data" required value="${esc(t.data)}" />
        </label>
        <label>Hora
          <input type="time" name="hora" required value="${esc(t.hora)}" />
        </label>
      </div>
      <label>Número máximo de jogadores
        <input type="number" name="max" min="${Math.max(2, qtd - ESPERA)}" max="512" required value="${t.maxJogadores}" />
        <small>Mais ${ESPERA} jogadores entram na lista de espera. Se você diminuir o limite, os últimos confirmados passam para a espera.</small>
      </label>
      <label>Descrição <small>(opcional)</small>
        <textarea name="descricao" maxlength="500">${esc(t.descricao)}</textarea>
      </label>
      <label>Regras
        <textarea name="regras" maxlength="1500" required>${esc(t.regras)}</textarea>
      </label>
      <p class="erro" id="erro" role="alert"></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn principal" type="submit">Salvar alterações</button>
        <a class="btn" href="#/">Cancelar</a>
      </div>
    </form>
  `;
}

/* Lista pública */
function telaTorneios() {
  const abertos = db.listar().filter(t => t.status !== "encerrado" && !encerrado(t)).sort((a, b) => dataHora(a) - dataHora(b));
  app.innerHTML = `
    <h1>Torneios abertos</h1>
    <p class="sub">Escolha um torneio para ver as regras e fazer sua inscrição.</p>
    ${abertos.length
      ? `<section class="grade">${abertos.map(t => cartaTorneio(t, { lojista: false })).join("")}</section>`
      : `<div class="vazio"><p>Nenhum torneio com inscrições abertas no momento.</p></div>`}
  `;
}

/* Página pública de um torneio + inscrição */
function telaTorneio(id) {
  const t = db.buscar(id);
  if (!t) {
    app.innerHTML = `<div class="vazio"><p>Torneio não encontrado.</p><a class="btn" href="#/torneios">Ver torneios abertos</a></div>`;
    return;
  }
  const finalizado = t.status === "encerrado";
  const fechado = finalizado || encerrado(t);
  const s = situacao(t);
  const seloTexto = finalizado ? "Histórico" : (fechado ? "Encerrado" : rotuloSelo(s));
  const anoAtual = new Date().getFullYear();

  app.innerHTML = `
    <a class="voltar" href="#/torneios">Ver todos os torneios</a>
    <article class="carta" style="margin-bottom:24px">
      <div class="carta-topo">
        <span>${esc(formatarData(t))}</span>
        <span class="selo ${fechado ? "encerrado" : ""}">${seloTexto}</span>
      </div>
      <div class="carta-corpo">
        <h1 style="font-size:1.8rem; margin:0">${esc(t.nome)}</h1>
        ${t.descricao ? `<p>${esc(t.descricao)}</p>` : ""}
        <div>
          <div class="rotulo">Regras</div>
          <div class="regras">${esc(t.regras)}</div>
        </div>
      </div>
    </article>

    ${(t.inscritos.length && !finalizado) ? blocoCheckin(t) : ""}

    ${finalizado
      ? `<div class="vazio"><p>Este torneio foi encerrado pelo lojista. Inscrições e check-in não estão mais disponíveis.</p></div>`
      : fechado
      ? `<div class="vazio"><p>As inscrições deste torneio foram encerradas.</p></div>`
      : s.lotado
      ? `<div class="vazio"><p>Este torneio está lotado: as vagas e a lista de espera já foram preenchidas.</p></div>`
      : `<form class="painel-form" data-form="inscricao" data-id="${t.id}" novalidate>
          <h2>Inscrição</h2>
          ${avisoVagas(s)}
          <label>Nome completo
            <input name="nome" maxlength="80" required autocomplete="name" />
          </label>
          <div class="linha-2">
            <label>ID Play! Pokémon
              <input name="idPlay" inputmode="numeric" maxlength="12" required placeholder="Somente números" />
            </label>
            <label>Ano de nascimento
              <input name="ano" inputmode="numeric" maxlength="4" required placeholder="Ex.: 2001" />
            </label>
          </div>
          <p class="erro" id="erro" role="alert"></p>
          <button class="btn principal" type="submit">Confirmar inscrição</button>
        </form>`}

    ${listaPublica(t)}
  `;
  app.dataset.anoAtual = anoAtual;
}

function telaSucesso(t, nome, r) {
  const primeiro = esc(nome.split(" ")[0]);
  const msg = r.espera
    ? `Você entrou na lista de espera, ${primeiro}: posição ${r.posicaoEspera} de ${ESPERA}. Se abrir uma vaga, você sobe na fila. Volte à página do torneio para conferir.`
    : `Inscrição confirmada, ${primeiro}! Te vemos em ${esc(formatarData(t))}.`;
  app.innerHTML = `
    <a class="voltar" href="#/torneios">Ver todos os torneios</a>
    <div class="sucesso">${msg}</div>
    <br />
    <a class="btn" href="#/torneio/${t.id}">Voltar ao torneio</a>
  `;
}

/* ---------- Rotas ---------- */
function rotear() {
  const rota = location.hash.replace(/^#/, "") || "/";
  const partes = rota.split("/").filter(Boolean);

  document.querySelectorAll("[data-nav]").forEach(a => a.classList.remove("ativo"));
  const marcar = nome => document.querySelector(`[data-nav="${nome}"]`)?.classList.add("ativo");

  if (rota === "/") { marcar("painel"); telaPainel(); }
  else if (rota === "/novo") { marcar("painel"); telaNovo(); }
  else if (partes[0] === "editar" && partes[1]) { marcar("painel"); telaEditar(partes[1]); }
  else if (rota === "/torneios") { marcar("torneios"); telaTorneios(); }
  else if (partes[0] === "torneio" && partes[1]) { marcar("torneios"); telaTorneio(partes[1]); }
  else { location.hash = "#/"; return; }

  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", rotear);
window.addEventListener("DOMContentLoaded", rotear);

/* ---------- Ações (cliques) ---------- */
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-acao]");
  if (!btn) return;
  const { acao, id, play } = btn.dataset;

  if (acao === "copiar") copiar(linkDoTorneio(id));
  if (acao === "copiar-lista") copiar(linkDaLista());
  if (acao === "copiar-codigo") copiar(db.buscar(id).codigo, "Código copiado");

  if (acao === "encerrar") {
    const t = db.buscar(id);
    if (t && confirm(`Encerrar "${t.nome}"? Não será mais possível se inscrever ou fazer check-in. O torneio continua salvo no histórico, com a lista de inscritos.`)) {
      db.encerrar(id);
      telaPainel();
      avisar("Torneio encerrado e movido para o histórico");
    }
  }

  if (acao === "remover") {
    if (confirm("Remover este jogador do torneio?")) {
      db.removerInscrito(id, play);
      telaPainel();
      // mantém a lista aberta para facilitar remoções em sequência
      document.querySelectorAll("details.inscritos").forEach(d => {
        if (d.closest("article").querySelector(`[data-id="${id}"]`)) d.open = true;
      });
    }
  }
});

/* ---------- Formulários ---------- */
document.addEventListener("submit", e => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();

  const dados = Object.fromEntries(new FormData(form));
  const erro = form.querySelector("#erro");
  const falhar = msg => { erro.textContent = msg; };

  if (form.dataset.form === "novo") {
    const nome = dados.nome.trim();
    const regras = dados.regras.trim();
    if (nome.length < 3) return falhar("Informe o nome do torneio.");
    if (!dados.data || !dados.hora) return falhar("Informe a data e a hora.");
    if (new Date(`${dados.data}T${dados.hora}`) < new Date()) return falhar("A data e a hora precisam ser no futuro.");
    if (regras.length < 3) return falhar("Informe as regras do torneio.");
    const max = Number(dados.max);
    if (!Number.isInteger(max) || max < 2 || max > 512) return falhar("Informe um número máximo de jogadores entre 2 e 512.");

    db.criar({ nome, data: dados.data, hora: dados.hora, descricao: dados.descricao.trim(), regras, maxJogadores: max });
    location.hash = "#/";
    avisar("Torneio criado. Use “Copiar link” para divulgar.");
  }

  if (form.dataset.form === "editar") {
    const original = db.buscar(form.dataset.id);
    if (!original) return falhar("Torneio não encontrado.");
    const nome = dados.nome.trim();
    const regras = dados.regras.trim();
    if (nome.length < 3) return falhar("Informe o nome do torneio.");
    if (!dados.data || !dados.hora) return falhar("Informe a data e a hora.");
    const mudouDataHora = dados.data !== original.data || dados.hora !== original.hora;
    if (mudouDataHora && new Date(`${dados.data}T${dados.hora}`) < new Date()) return falhar("A nova data e hora precisam ser no futuro.");
    if (regras.length < 3) return falhar("Informe as regras do torneio.");
    const max = Number(dados.max);
    const minimo = Math.max(2, original.inscritos.length - ESPERA);
    if (!Number.isInteger(max) || max > 512) return falhar("Informe um número máximo de jogadores válido (até 512).");
    if (max < minimo) return falhar(`Já existem ${original.inscritos.length} inscritos. O limite mínimo é ${minimo}, porque a lista de espera comporta só ${ESPERA}.`);

    db.atualizar(original.id, { nome, data: dados.data, hora: dados.hora, descricao: dados.descricao.trim(), regras, maxJogadores: max });
    location.hash = "#/";
    avisar("Alterações salvas");
  }

  if (form.dataset.form === "checkin") {
    const idPlay = dados.idPlay.trim();
    const codigo = dados.codigo.trim();
    if (!idPlay) return falhar("Informe seu ID Play! Pokémon.");
    if (!codigo) return falhar("Informe o código do dia.");

    const r = db.checkin(form.dataset.id, idPlay, codigo);
    if (!r.ok) return falhar(r.erro);
    falhar("");
    form.reset();
    avisar(`Check-in confirmado, ${r.nome.split(" ")[0]}!`);
  }

  if (form.dataset.form === "inscricao") {
    const nome = dados.nome.trim().replace(/\s+/g, " ");
    const idPlay = dados.idPlay.trim();
    const ano = Number(dados.ano);
    const anoAtual = new Date().getFullYear();

    if (nome.split(" ").length < 2 || nome.length < 5) return falhar("Digite seu nome completo.");
    if (!/^\d{4,12}$/.test(idPlay)) return falhar("O ID Play! Pokémon deve ter apenas números.");
    if (!/^\d{4}$/.test(dados.ano) || ano < 1900 || ano > anoAtual) return falhar(`Informe um ano de nascimento entre 1900 e ${anoAtual}.`);

    const r = db.inscrever(form.dataset.id, { nome, idPlay, anoNascimento: ano });
    if (!r.ok) return falhar(r.erro);
    telaSucesso(db.buscar(form.dataset.id), nome, r);
  }
});
