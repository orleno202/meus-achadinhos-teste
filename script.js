const URL_PLANILHA = "https://docs.google.com/spreadsheets/d/1kz185SYCWeIEcJhWMWcPyZIhm4RvqGgwbU0DFEPw5kY/export?format=csv&gid=694267279";
const URL_MENU_NOVO = "https://docs.google.com/spreadsheets/d/1jVjEL9ZsoDy_yNYCaAQmu1MRv6EqUassCTEj3osn4Ec/export?format=csv&gid=1022328164";
const URL_BASE = "https://meusachadinhos.qd.je/";
const ITENS_POR_PAGINA = 20;
const SLIDES_NO_CARROSSEL = 6;

const firebaseConfig = {
  apiKey: "AIzaSyDerW6oXJzCfdP8aWrV19ZCXHkLhM0E",
  authDomain: "meus-achadinho123.firebaseapp.com",
  databaseURL: "https://meus-achadinho123-default-rtdb.firebaseio.com",
  projectId: "meus-achadinho123",
  storageBucket: "meus-achadinho123.firebasestorage.app",
  messagingSenderId: "56177826778",
  appId: "1:56177826778:web:cebea89eed76dec4d07"
};

let db = null;
let _firebasePromise = null;

function carregarFirebase(){
    if(_firebasePromise) return _firebasePromise;
    _firebasePromise = new Promise(function(resolve, reject){
        function appOk(){ return typeof firebase !== "undefined" && firebase.apps && firebase.apps.length; }
        function init(){
            try{
                if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
                db = firebase.database();
                resolve(db);
            }catch(e){
                console.warn("Falha ao inicializar Firebase.", e);
                reject(e);
            }
        }
        if(appOk()){ init(); return; }
        const s1 = document.createElement("script");
        s1.src = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
        s1.async = true;
        s1.onload = function(){
            const s2 = document.createElement("script");
            s2.src = "https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js";
            s2.async = true;
            s2.onload = init;
            s2.onerror = function(e){ console.warn("Falha ao carregar firebase-database.", e); reject(e); };
            document.head.appendChild(s2);
        };
        s1.onerror = function(e){ console.warn("Falha ao carregar firebase-app.", e); reject(e); };
        document.head.appendChild(s1);
    });
    return _firebasePromise;
}

let produtos = [];
let categorias = [];
let menuEstrutura = [];
let linkAtual   = "";
let tituloAtual = "";
let indexAtual  = -1;
let modoProduto = false;
let termoBuscaAtual = "";
let paginaAtual = 1;
let resultadosBusca = [];
let _avalListenerAtivo = null;
let _avalListenerRef   = null;

/* ===== CATÁLOGO PAGINADO ===== */
let paginaCatalogo = 1;
let _blocosCatalogo = [];
const CATEGORIAS_POR_PAGINA = 20;
/* ============================== */

function hashProduto(p){
    const base = (p.link || p.titulo || "").toString();
    let h = 5381;
    for(let i = 0; i < base.length; i++){
        h = ((h << 5) + h) + base.charCodeAt(i);
        h = h & 0xffffffff;
    }
    return "p" + Math.abs(h).toString(36);
}

function parseCSV(text){
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while(i < text.length){
        const c = text[i];
        if(inQuotes){
            if(c === '"'){
                if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
                else{ inQuotes = false; i++; continue; }
            }else{ field += c; i++; continue; }
        }else{
            if(c === '"'){ inQuotes = true; i++; continue; }
            if(c === ','){ row.push(field); field = ''; i++; continue; }
            if(c === '\r'){ i++; continue; }
            if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
            field += c; i++;
        }
    }
    if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
    return rows;
}

async function carregarProdutos(){
    const resp = await fetch(URL_PLANILHA, {cache:"no-store"});
    if(!resp.ok) throw new Error("Erro HTTP " + resp.status);
    const buffer = await resp.arrayBuffer();
    const texto = new TextDecoder("utf-8").decode(buffer);
    const linhas = parseCSV(texto);
    produtos = [];
    const ERROS_SHEETS = /^#(ERROR!|N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;
    for(let i = 1; i < linhas.length; i++){
        const l = linhas[i];
        if(!l || l.length < 2) continue;
        const categoria = (l[0]||"").trim();
        const titulo    = (l[1]||"").trim();
        if(!titulo) continue;
        if(ERROS_SHEETS.test(titulo)) continue;
        if(ERROS_SHEETS.test(categoria)) continue;
        produtos.push({
            categoria: categoria,
            titulo:    titulo,
            imagem:    (l[2]||"").trim(),
            descricao: (l[3]||"").replace(/\\n/g, "\n").trim(),
            link:      (l[4]||"").trim()
        });
    }
    const setCats = new Set();
    produtos.forEach(p => {
        p.categoria.split("|").forEach(c => {
            const t = c.trim();
            if(t && !ERROS_SHEETS.test(t)) setCats.add(t);
        });
    });
    categorias = Array.from(setCats).sort((a,b)=>a.localeCompare(b));
}

/* =====================================================
   Carrega a estrutura do menu (aba Menu_Novo)
   Colunas: A=Nivel_1, B=Nivel_2, C=Nivel_3, D=Palavra_Chave, E=Categoria, F=Grupo
===================================================== */
async function carregarMenuEstrutura(){
    try{
        const resp = await fetch(URL_MENU_NOVO, {cache:"no-store"});
        if(!resp.ok) throw new Error("Erro HTTP " + resp.status);
        const buffer = await resp.arrayBuffer();
        const texto = new TextDecoder("utf-8").decode(buffer);
        const linhas = parseCSV(texto);

        menuEstrutura = [];
        for(let i = 1; i < linhas.length; i++){
            const l = linhas[i];
            if(!l || l.length < 5) continue;
            const nivel1 = (l[0]||"").trim();
            const nivel2 = (l[1]||"").trim();
            const nivel3 = (l[2]||"").trim();
            const palavraChave = (l[3]||"").trim();
            const categoria = (l[4]||"").trim();
            const grupo = (l[5]||"").trim();
            if(!nivel1 || !palavraChave) continue;
            menuEstrutura.push({ nivel1, nivel2, nivel3, palavraChave, categoria, grupo });
        }
    }catch(e){
        console.warn("Não foi possível carregar o menu novo:", e);
        menuEstrutura = [];
    }
}

/* =====================================================
   Normaliza texto para busca (VERSÃO BLINDADA):
   - Sempre retorna string (nunca null/undefined)
   - Minúsculas, sem acento
   - Troca hífen e pontuação por espaço
   - Nunca retorna string só com espaços
===================================================== */
function normalizar(s){
    if(s === null || s === undefined) return "";
    let out = String(s).toLowerCase();
    out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    out = out.replace(/[-_/.,;:!?()\[\]{}|]/g, ' ');
    out = out.replace(/\s+/g, ' ');
    return out.trim();
}

function escapeHtml(s){
    return (s||"").toString()
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function criarCard(produto, indexGlobal, lista){
    const card = document.createElement("div");
    card.className = "card";
    card.onclick = function(){ abrirProdutoPopup(indexGlobal); };
    card.innerHTML = `
        <div class="card-img">
            <img src="${produto.imagem}" alt="${produto.titulo}" loading="lazy">
            <button class="share-card" onclick="abrirPopupCompartilhar(event,${indexGlobal})" aria-label="Compartilhar produto">↗</button>
        </div>
        <div class="card-info">
            <div class="card-title">${produto.titulo}</div>
            <a href="${produto.link}" target="_blank" rel="noopener noreferrer" class="btn" onclick="event.stopPropagation()">🛒 EU QUERO</a>
        </div>
    `;
    lista.appendChild(card);
}
function criarCardGrid(produto, indexGlobal){
    const card = document.createElement("div");
    card.className = "card card-grid";
    card.onclick = function(){ abrirProdutoPopup(indexGlobal); };
    card.innerHTML = `
        <div class="card-img">
            <img src="${produto.imagem}" alt="${produto.titulo}" loading="lazy">
            <button class="share-card" onclick="abrirPopupCompartilhar(event,${indexGlobal})" aria-label="Compartilhar produto">↗</button>
        </div>
        <div class="card-info">
            <div class="card-title">${produto.titulo}</div>
            <a href="${produto.link}" target="_blank" rel="noopener noreferrer" class="btn" onclick="event.stopPropagation()">🛒 EU QUERO</a>
        </div>
    `;
    return card;
}

/* =====================================================
   Menu de categorias em cascata (Nivel_1 → Nivel_2 → Nivel_3)
===================================================== */
function preencherMenuCategorias(){
    const dd = document.getElementById("dropdownCategorias");
    dd.innerHTML = "";

    // Fallback: se a planilha Menu_Novo não carregou, usa lista simples
    if(!menuEstrutura.length){
        if(!categorias.length){
            dd.innerHTML = '<div class="cat-item">Nenhuma categoria</div>';
            return;
        }
        const todas = document.createElement("button");
        todas.className = "cat-item";
        todas.type = "button";
        todas.textContent = "Todas as ofertas";
        todas.onclick = function(){ toggleMenuCategorias(); limparBusca(); };
        dd.appendChild(todas);

        categorias.forEach(function(cat){
            const a = document.createElement("button");
            a.className = "cat-item";
            a.type = "button";
            a.textContent = cat;
            a.onclick = function(){
                toggleMenuCategorias();
                document.getElementById("inputBusca").value = cat;
                executarBusca();
            };
            dd.appendChild(a);
        });
        return;
    }

    // Botão "Todas as ofertas"
    const todas = document.createElement("button");
    todas.className = "cat-item";
    todas.type = "button";
    todas.textContent = "Todas as ofertas";
    todas.onclick = function(){ toggleMenuCategorias(); limparBusca(); };
    dd.appendChild(todas);

    // Agrupa por Nivel_1 → Nivel_2 → itens
    const mapaN1 = new Map();
    menuEstrutura.forEach(function(item){
        if(!mapaN1.has(item.nivel1)) mapaN1.set(item.nivel1, new Map());
        const mapaN2 = mapaN1.get(item.nivel1);
        if(!mapaN2.has(item.nivel2)) mapaN2.set(item.nivel2, []);
        mapaN2.get(item.nivel2).push(item);
    });

    // Monta o menu
    Array.from(mapaN1.keys()).sort().forEach(function(n1){
        const grupo = document.createElement("div");
        grupo.className = "menu-grupo";

        const btnN1 = document.createElement("button");
        btnN1.className = "cat-item menu-n1";
        btnN1.type = "button";
        btnN1.innerHTML = '▸ ' + n1;
        btnN1.onclick = function(e){
            e.stopPropagation();
            const sub = grupo.querySelector(".menu-sub-n1");
            const abrindo = (sub.style.display !== "block");
            sub.style.display = abrindo ? "block" : "none";
            btnN1.innerHTML = (abrindo ? "▾ " : "▸ ") + n1;
        };
        grupo.appendChild(btnN1);

        const subN1 = document.createElement("div");
        subN1.className = "menu-sub-n1";
        subN1.style.display = "none";

        const mapaN2 = mapaN1.get(n1);
        Array.from(mapaN2.keys()).sort().forEach(function(n2){
            const btnN2 = document.createElement("button");
            btnN2.className = "cat-item menu-n2";
            btnN2.type = "button";
            btnN2.innerHTML = '&nbsp;&nbsp;▸ ' + n2;
            btnN2.onclick = function(e){
                e.stopPropagation();
                const lista = btnN2.nextElementSibling;
                const abrindo = (lista.style.display !== "block");
                lista.style.display = abrindo ? "block" : "none";
                btnN2.innerHTML = '&nbsp;&nbsp;' + (abrindo ? "▾ " : "▸ ") + n2;
            };
            subN1.appendChild(btnN2);

            const subN2 = document.createElement("div");
            subN2.className = "menu-sub-n2";
            subN2.style.display = "none";

            const vistos = new Set();
            mapaN2.get(n2).forEach(function(item){
                const chave = item.nivel3 + "||" + item.palavraChave;
                if(vistos.has(chave)) return;
                vistos.add(chave);

                const btnN3 = document.createElement("button");
                btnN3.className = "cat-item menu-n3";
                btnN3.type = "button";
                btnN3.textContent = item.nivel3 + " — " + item.palavraChave;
                btnN3.onclick = function(e){
                    e.stopPropagation();
                    toggleMenuCategorias();
                    document.getElementById("inputBusca").value = item.palavraChave;
                    executarBusca();
                };
                subN2.appendChild(btnN3);
            });

            subN1.appendChild(subN2);
        });

        grupo.appendChild(subN1);
        dd.appendChild(grupo);
    });
}

function toggleMenuCategorias(e){
    if(e) e.stopPropagation();
    document.getElementById("dropdownCategorias").classList.toggle("aberto");
}
document.addEventListener("click", function(e){
    const menu = document.querySelector(".menu-cat");
    if(menu && !menu.contains(e.target)){
        document.getElementById("dropdownCategorias").classList.remove("aberto");
    }
});

/* =====================================================
   Busca — VERSÃO BLINDADA
   Regras:
   - Nenhuma palavra vazia entra no filtro
   - Produto sem título/descrição/categoria nunca bate
   - Todas as palavras precisam aparecer em algum campo
===================================================== */
function executarBusca(){
    const termo = document.getElementById("inputBusca").value.trim();
    if(!termo){ limparBusca(); return; }
    termoBuscaAtual = termo;

    const t = normalizar(termo);
    const palavras = t.split(' ').filter(function(p){ return p && p.length > 0; });

    if(palavras.length === 0){ limparBusca(); return; }

    resultadosBusca = produtos.filter(function(p){
        const titulo    = normalizar(p.titulo    || '');
        const descricao = normalizar(p.descricao || '');
        const categoria = normalizar(p.categoria || '');
        const campos = (titulo + ' ' + descricao + ' ' + categoria).trim();

        if(!campos) return false;

        return palavras.every(function(palavra){
            if(!palavra) return false;
            return campos.indexOf(palavra) !== -1;
        });
    });

    paginaAtual = 1;
    mostrarResultados();
    try{
        const params = new URLSearchParams(location.search);
        params.set("q", termo);
        params.delete("cat");
        params.delete("p");
        history.replaceState(null, "", "?" + params.toString());
    }catch(e){}
}
function mostrarResultados(){
    document.getElementById("carrosselBox").style.display = "none";
    document.getElementById("catalogo").style.display = "none";
    document.getElementById("paginacaoCatalogo").style.display = "none";
    document.getElementById("tituloPrincipal").style.display = "none";
    document.getElementById("areaResultados").style.display = "block";
    document.getElementById("termoBusca").textContent = termoBuscaAtual;
    const total = resultadosBusca.length;
    document.getElementById("contResultados").textContent =
        total === 0 ? "" : "(" + total + (total === 1 ? " item" : " itens") + ")";
    renderizarDestaques();
    renderizarRelacionados();
    window.scrollTo(0, 0);
}
function limparBusca(){
    termoBuscaAtual = "";
    resultadosBusca = [];
    paginaAtual = 1;
    document.getElementById("inputBusca").value = "";
    document.getElementById("carrosselBox").style.display = "";
    document.getElementById("catalogo").style.display = "";
    document.getElementById("paginacaoCatalogo").style.display = "";
    document.getElementById("tituloPrincipal").style.display = "";
    document.getElementById("areaResultados").style.display = "none";
    document.getElementById("gridDestaques").innerHTML = "";
    document.getElementById("paginacao").innerHTML = "";
    document.getElementById("carrosseisRelacionados").innerHTML = "";
    try{
        const params = new URLSearchParams(location.search);
        params.delete("q");
        params.delete("p");
        params.delete("cat");
        const qs = params.toString();
        history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    }catch(e){}
}
function renderizarDestaques(){
    const grid = document.getElementById("gridDestaques");
    grid.innerHTML = "";
    const total = resultadosBusca.length;
    const totalPag = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));
    if(total === 0){
        grid.innerHTML = '<p class="sem-resultados">Nenhum produto encontrado para "' +
            termoBuscaAtual + '".<br><br>Tente outra palavra-chave.</p>';
        document.getElementById("paginacao").innerHTML = "";
        document.getElementById("tituloRelacionados").style.display = "none";
        return;
    }
    document.getElementById("tituloRelacionados").style.display = "";
    if(paginaAtual > totalPag) paginaAtual = totalPag;
    if(paginaAtual < 1) paginaAtual = 1;
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const fim = Math.min(inicio + ITENS_POR_PAGINA, total);
    resultadosBusca.slice(inicio, fim).forEach(function(p){
        grid.appendChild(criarCardGrid(p, produtos.indexOf(p)));
    });
    renderizarPaginacao(totalPag);
}
function renderizarPaginacao(totalPag){
    const pag = document.getElementById("paginacao");
    pag.innerHTML = "";
    if(totalPag <= 1) return;
    const btnPrev = document.createElement("button");
    btnPrev.className = "pag-btn";
    btnPrev.innerHTML = "‹";
    btnPrev.disabled = paginaAtual === 1;
    btnPrev.onclick = function(){ irParaPagina(paginaAtual - 1); };
    pag.appendChild(btnPrev);
    calcularPaginas(totalPag, paginaAtual).forEach(function(p){
        if(p === "..."){
            const span = document.createElement("span");
            span.className = "pag-ellipsis";
            span.textContent = "...";
            pag.appendChild(span);
        } else {
            const b = document.createElement("button");
            b.className = "pag-btn" + (p === paginaAtual ? " ativo" : "");
            b.textContent = p;
            b.onclick = function(){ irParaPagina(p); };
            pag.appendChild(b);
        }
    });
    const btnNext = document.createElement("button");
    btnNext.className = "pag-btn pag-next";
    btnNext.innerHTML = '<span class="txt-seguinte">Seguinte </span>›';
    btnNext.disabled = paginaAtual === totalPag;
    btnNext.onclick = function(){ irParaPagina(paginaAtual + 1); };
    pag.appendChild(btnNext);
}
function calcularPaginas(total, atual){
    const paginas = [];
    if(total <= 10){
        for(let i = 1; i <= total; i++) paginas.push(i);
        return paginas;
    }
    paginas.push(1);
    let inicio = Math.max(2, atual - 2);
    let fim = Math.min(total - 1, atual + 2);
    if(inicio > 2) paginas.push("...");
    for(let i = inicio; i <= fim; i++) paginas.push(i);
    if(fim < total - 1) paginas.push("...");
    paginas.push(total);
    return paginas;
}
function irParaPagina(p){
    if(p < 1) return;
    paginaAtual = p;
    renderizarDestaques();
    const area = document.getElementById("areaResultados");
    if(area){
        const y = area.getBoundingClientRect().top + window.pageYOffset - 90;
        window.scrollTo({ top: y, behavior: "smooth" });
    }
}

function renderizarRelacionados(){
    const box = document.getElementById("carrosseisRelacionados");
    box.innerHTML = "";
    if(resultadosBusca.length === 0) return;
    const catsSet = new Set();
    resultadosBusca.forEach(function(p){
        p.categoria.split("|").forEach(function(c){
            const t = c.trim();
            if(t) catsSet.add(t);
        });
    });
    let adicionou = false;
    Array.from(catsSet).forEach(function(cat){
        const itens = produtos.filter(function(p){
            if(resultadosBusca.indexOf(p) >= 0) return false;
            return p.categoria.split("|").map(c=>c.trim()).includes(cat);
        });
        if(itens.length === 0) return;
        adicionou = true;
        box.appendChild(criarCarrosselCategoria("✨ " + cat, itens));
    });
    if(!adicionou){
        categorias.slice(0, 6).forEach(function(cat){
            const itens = produtos.filter(function(p){
                return p.categoria.split("|").map(c=>c.trim()).includes(cat);
            }).slice(0, 12);
            if(itens.length === 0) return;
            box.appendChild(criarCarrosselCategoria(cat, itens));
        });
    }
}
function criarCarrosselCategoria(nome, itens){
    const sec = document.createElement("section");
    sec.className = "categoria";
    const h = document.createElement("h2");
    h.className = "categoria-titulo";
    h.textContent = nome;
    const linha = document.createElement("div");
    linha.className = "linha-produtos";
    const setaE = document.createElement("button");
    setaE.className = "seta-rolagem esquerda";
    setaE.innerHTML = "‹";
    const lista = document.createElement("div");
    lista.className = "lista-cards";
    const setaD = document.createElement("button");
    setaD.className = "seta-rolagem direita";
    setaD.innerHTML = "›";
    itens.forEach(function(p){ criarCard(p, produtos.indexOf(p), lista); });
    setaE.onclick = function(){ lista.scrollBy({ left:-lista.clientWidth, behavior:"smooth" }); };
    setaD.onclick = function(){ lista.scrollBy({ left:lista.clientWidth, behavior:"smooth" }); };
    linha.appendChild(setaE);
    linha.appendChild(lista);
    linha.appendChild(setaD);
    sec.appendChild(h);
    sec.appendChild(linha);
    return sec;
}

/* ================= CATÁLOGO PAGINADO POR CATEGORIA ================= */
function montarCatalogo(filtroCat){
    const catalogo = document.getElementById("catalogo");
    catalogo.innerHTML = "";

    _blocosCatalogo = [];
    const ERROS = /^#(ERROR!|N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;
    const categoriasParaMostrar = filtroCat ? [filtroCat] : categorias;

    categoriasParaMostrar.forEach(function(categoria){
        if(!categoria || ERROS.test(categoria)) return;
        const itens = produtos.filter(function(p){
            return p.categoria.split("|").map(c=>c.trim()).includes(categoria);
        });
        if(itens.length === 0) return;
        _blocosCatalogo.push({ categoria: categoria, itens: itens });
    });

    paginaCatalogo = 1;
    renderizarPaginaCatalogo();
}

function renderizarPaginaCatalogo(){
    const catalogo = document.getElementById("catalogo");
    catalogo.innerHTML = "";

    const total = _blocosCatalogo.length;
    const totalPag = Math.max(1, Math.ceil(total / CATEGORIAS_POR_PAGINA));

    if(paginaCatalogo < 1) paginaCatalogo = 1;
    if(paginaCatalogo > totalPag) paginaCatalogo = totalPag;

    const inicio = (paginaCatalogo - 1) * CATEGORIAS_POR_PAGINA;
    const fim = Math.min(inicio + CATEGORIAS_POR_PAGINA, total);
    const blocosPagina = _blocosCatalogo.slice(inicio, fim);

    if(total === 0){
        catalogo.innerHTML = '<p class="sem-resultados">Nenhum produto encontrado.</p>';
        document.getElementById("paginacaoCatalogo").innerHTML = "";
        return;
    }

    blocosPagina.forEach(function(bloco){
        catalogo.appendChild(criarCarrosselCategoria(bloco.categoria, bloco.itens));
    });

    renderizarPaginacaoCatalogo(totalPag);
}

function renderizarPaginacaoCatalogo(totalPag){
    const pag = document.getElementById("paginacaoCatalogo");
    pag.innerHTML = "";
    if(totalPag <= 1) return;

    const btnPrev = document.createElement("button");
    btnPrev.className = "pag-btn";
    btnPrev.innerHTML = "‹";
    btnPrev.disabled = paginaCatalogo === 1;
    btnPrev.onclick = function(){ irParaPaginaCatalogo(paginaCatalogo - 1); };
    pag.appendChild(btnPrev);

    calcularPaginas(totalPag, paginaCatalogo).forEach(function(p){
        if(p === "..."){
            const span = document.createElement("span");
            span.className = "pag-ellipsis";
            span.textContent = "...";
            pag.appendChild(span);
        } else {
            const b = document.createElement("button");
            b.className = "pag-btn" + (p === paginaCatalogo ? " ativo" : "");
            b.textContent = p;
            b.onclick = function(){ irParaPaginaCatalogo(p); };
            pag.appendChild(b);
        }
    });

    const btnNext = document.createElement("button");
    btnNext.className = "pag-btn pag-next";
    btnNext.innerHTML = '<span class="txt-seguinte">Seguinte </span>›';
    btnNext.disabled = paginaCatalogo === totalPag;
    btnNext.onclick = function(){ irParaPaginaCatalogo(paginaCatalogo + 1); };
    pag.appendChild(btnNext);
}

function irParaPaginaCatalogo(p){
    if(p < 1) return;
    paginaCatalogo = p;
    renderizarPaginaCatalogo();
    const cat = document.getElementById("catalogo");
    if(cat){
        const y = cat.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({ top: y, behavior: "smooth" });
    }
}
/* =================================================================== */

function construirCarrosselDinamico(){
    const carrossel = document.getElementById("carrosselBox");
    carrossel.innerHTML = "";
    const validos = produtos.filter(function(p){
        return p.imagem && /^https?:\/\//i.test(p.imagem);
    });
    if(validos.length === 0){
        carrossel.style.display = "none";
        return;
    }
    carrossel.style.display = "";
    const copia = validos.slice();
    for(let i = copia.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    const selecionados = copia.slice(0, Math.min(SLIDES_NO_CARROSSEL, copia.length));
    selecionados.forEach(function(produto, i){
        const idxGlobal = produtos.indexOf(produto);
        const slide = document.createElement("div");
        slide.className = "slide" + (i === 0 ? " active" : "");
        slide.innerHTML = `
    <img src="${produto.imagem}" alt="${produto.titulo.replace(/"/g,'&quot;')}" fetchpriority="high">
    <div class="slide-content">
        <h2>${produto.titulo}</h2>
        <p><a href="javascript:void(0)" class="link-slide" data-index="${idxGlobal}">Confira esta oferta</a></p>
    </div>
`;
        carrossel.appendChild(slide);
    });
    const btnPrev = document.createElement("button");
    btnPrev.className = "prev";
    btnPrev.innerHTML = "‹";
    btnPrev.onclick = function(){ moverSlide(-1); };
    carrossel.appendChild(btnPrev);
    const btnNext = document.createElement("button");
    btnNext.className = "next";
    btnNext.innerHTML = "›";
    btnNext.onclick = function(){ moverSlide(1); };
    carrossel.appendChild(btnNext);
    const dotsBox = document.createElement("div");
    dotsBox.className = "dots";
    selecionados.forEach(function(_, i){
        const dot = document.createElement("span");
        dot.className = "dot" + (i === 0 ? " active" : "");
        dot.onclick = function(){ irParaSlide(i); };
        dotsBox.appendChild(dot);
    });
    carrossel.appendChild(dotsBox);
    iniciarCarrossel();
}

function abrirProdutoPopup(index){
    const produto = produtos[index];
    if(!produto) return;
    abrirPopup(produto.imagem, produto.titulo, produto.link, produto.descricao, index, false);
    carregarFirebase().then(function(){
        ouvirAvaliacoes("popup", indexAtual);
    }).catch(function(){ /* silencioso */ });
}

function abrirPopup(imagem, titulo, link, descricao, index, modoExclusivo){
    document.getElementById("popupFoto").src = imagem;
    document.getElementById("popupTitulo").textContent = titulo;
    document.getElementById("popupComprar").href = link;
    document.getElementById("popupDescricao").textContent = descricao || "Descrição não disponível.";
    linkAtual   = link;
    tituloAtual = titulo;
    indexAtual  = (typeof index === "number") ? index : -1;
    modoProduto = !!modoExclusivo;

    if(!modoProduto){
        try{
            if(indexAtual >= 0){
                const produto = produtos[indexAtual];
                if(produto){
                    const params = new URLSearchParams(location.search);
                    params.set("p", hashProduto(produto));
                    history.replaceState(null, "", "?" + params.toString());
                }
            }
        }catch(e){}
    }

    const el  = document.getElementById("popupDescricao");
    const btn = document.getElementById("verMaisDescricao");
    el.classList.remove("expandida");
    btn.textContent = "Ver mais";
    document.getElementById("compartilhamento").classList.remove("ativo");
    document.getElementById("dicaStories").classList.remove("ativo");
    atualizarLinkBox();
    resetAvalForm("popup");
    ouvirAvaliacoes("popup", indexAtual);
    document.getElementById("popup").classList.add("ativo");
    requestAnimationFrame(function(){
        requestAnimationFrame(function(){
            btn.style.display = (el.scrollHeight > el.clientHeight) ? "inline-block" : "none";
        });
    });
}
function fecharPopup(){
    document.getElementById("popup").classList.remove("ativo");
    document.getElementById("compartilhamento").classList.remove("ativo");
    document.getElementById("dicaStories").classList.remove("ativo");
    pararOuvirAvaliacoes();
    try{
        const params = new URLSearchParams(location.search);
        params.delete("p");
        const qs = params.toString();
        history.replaceState(null, "", qs ? "?" + qs : location.pathname);
    }catch(e){}
}
function toggleCompartilhamento(){
    document.getElementById("compartilhamento").classList.toggle("ativo");
}
function toggleDescricao(){
    const el  = document.getElementById("popupDescricao");
    const btn = document.getElementById("verMaisDescricao");
    el.classList.toggle("expandida");
    btn.textContent = el.classList.contains("expandida") ? "Ver menos" : "Ver mais";
}
function abrirPopupCompartilhar(event, index){
    event.stopPropagation();
    abrirProdutoPopup(index);
    setTimeout(function(){
        document.getElementById("compartilhamento").classList.add("ativo");
    },100);
}

function pararOuvirAvaliacoes(){
    if(_avalListenerRef && _avalListenerAtivo){
        _avalListenerRef.off("value", _avalListenerAtivo);
        _avalListenerRef = null;
        _avalListenerAtivo = null;
    }
}
function ouvirAvaliacoes(prefix, index){
    const box = document.getElementById(prefix + "AvalLista");
    const resumo = document.getElementById(prefix + "AvalResumo");
    if(index < 0 || !produtos[index]){
        if(box) box.innerHTML = '<div class="aval-vazio">Produto indisponível.</div>';
        if(resumo) resumo.innerHTML = '';
        return;
    }
    if(!db){
        if(box) box.innerHTML = '<div class="aval-vazio">Sistema de avaliações não configurado.</div>';
        if(resumo) resumo.innerHTML = '';
        return;
    }
    if(box) box.innerHTML = '<div class="aval-loading">Carregando avaliações...</div>';
    pararOuvirAvaliacoes();
    const produtoId = hashProduto(produtos[index]);
    const ref = db.ref("avaliacoes/" + produtoId + "/itens");
    _avalListenerRef = ref;
    _avalListenerAtivo = ref.on("value", function(snapshot){
        const lista = [];
        snapshot.forEach(function(child){
            lista.push(child.val());
        });
        lista.sort((a,b) => (b.timestamp||0) - (a.timestamp||0));
        renderizarAvaliacoes(prefix, lista);
    }, function(error){
        console.error("Erro ao carregar avaliações:", error);
        if(box) box.innerHTML = '<div class="aval-vazio">Não foi possível carregar as avaliações.</div>';
    });
}
function renderizarAvaliacoes(prefix, lista){
    const box = document.getElementById(prefix + "AvalLista");
    const resumo = document.getElementById(prefix + "AvalResumo");
    const total = lista.length;
    const soma = lista.reduce((s,a) => s + (a.nota || 0), 0);
    const media = total ? (soma/total) : 0;
    if(resumo){
        if(total === 0){
            resumo.innerHTML = '<span style="font-size:12px;color:#888;font-weight:600">Seja o primeiro a avaliar!</span>';
        } else {
            resumo.innerHTML = `
                <div class="aval-nota-grande">${media.toFixed(1)}</div>
                <div>
                    <div class="aval-estrelas-media">${estrelasTxt(media)}</div>
                    <div class="aval-total">${total} ${total === 1 ? "avaliação" : "avaliações"}</div>
                </div>
            `;
        }
    }
    if(!box) return;
    box.innerHTML = "";
    if(total === 0){
        box.innerHTML = '<div class="aval-vazio">Nenhum comentário ainda. Compartilhe sua opinião! 💬</div>';
        return;
    }
    lista.forEach(function(a){
        const el = document.createElement("div");
        el.className = "aval-item";
        el.innerHTML = `
            <div class="aval-item-top">
                <span class="aval-item-nome">${escapeHtml(a.nome || "Anônimo")}</span>
                <span class="aval-item-data">${escapeHtml(a.data || "")}</span>
            </div>
            <div class="aval-item-estrelas">${estrelasTxt(a.nota)}</div>
            <div class="aval-item-texto">${escapeHtml(a.texto || "")}</div>
        `;
        box.appendChild(el);
    });
}
function estrelasTxt(nota){
    const n = Math.round(nota);
    return "★".repeat(n) + "☆".repeat(5 - n);
}

const _estrelaSel = { popup: 0, pp: 0 };
function resetAvalForm(prefix){
    _estrelaSel[prefix] = 0;
    const form = document.getElementById(prefix + "EstrelasInput");
    if(form){ form.querySelectorAll("span").forEach(s => s.classList.remove("ativo","hover")); }
    const nome = document.getElementById(prefix + "Nome");
    const com  = document.getElementById(prefix + "Comentario");
    const msg  = document.getElementById(prefix + "MsgOk");
    if(nome) nome.value = "";
    if(com)  com.value  = "";
    if(msg)  msg.classList.remove("ativo");
}
function initEstrelasForm(prefix){
    const form = document.getElementById(prefix + "EstrelasInput");
    if(!form) return;
    const spans = form.querySelectorAll("span");
    spans.forEach(function(span){
        const v = parseInt(span.getAttribute("data-v"), 10);
        span.addEventListener("mouseenter", function(){
            spans.forEach(s => {
                const sv = parseInt(s.getAttribute("data-v"), 10);
                s.classList.toggle("hover", sv <= v);
            });
        });
        span.addEventListener("mouseleave", function(){
            spans.forEach(s => s.classList.remove("hover"));
        });
        span.addEventListener("click", function(){
            _estrelaSel[prefix] = v;
            spans.forEach(s => {
                const sv = parseInt(s.getAttribute("data-v"), 10);
                s.classList.toggle("ativo", sv <= v);
            });
        });
    });
}
async function enviarAvaliacao(prefix){
    const nota = _estrelaSel[prefix] || 0;
    if(!nota){ alert("Escolha uma nota de 1 a 5 estrelas ⭐"); return; }
    const nome  = (document.getElementById(prefix + "Nome").value || "").trim() || "Anônimo";
    const texto = (document.getElementById(prefix + "Comentario").value || "").trim();
    if(!texto){ alert("Escreva um comentário antes de publicar 😊"); return; }
    if(indexAtual < 0 || !produtos[indexAtual]){ alert("Não foi possível identificar o produto."); return; }
    if(!db){ alert("Sistema de avaliações indisponível."); return; }
    const agora = new Date();
    const data = agora.toLocaleDateString('pt-BR') + " " +
                 agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    const btn = document.getElementById(prefix + "BtnEnviar");
    if(btn){ btn.disabled = true; btn.textContent = "Enviando..."; }
    try{
        const produtoId = hashProduto(produtos[indexAtual]);
        await db.ref("avaliacoes/" + produtoId + "/itens").push({
            nome: nome.slice(0,40),
            texto: texto.slice(0,500),
            nota: Math.max(1, Math.min(5, nota)),
            data: data,
            timestamp: Date.now()
        });
        const msg = document.getElementById(prefix + "MsgOk");
        if(msg){
            msg.classList.add("ativo");
            setTimeout(() => msg.classList.remove("ativo"), 3500);
        }
        resetAvalForm(prefix);
    }catch(e){
        console.error(e);
        alert("Erro ao enviar avaliação. Tente novamente.");
    }finally{
        if(btn){ btn.disabled = false; btn.textContent = "Publicar avaliação"; }
    }
}

function gerarLinkOferta(index){
    const produto = produtos[index];
    if(!produto) return URL_BASE;
    return URL_BASE + "?p=" + hashProduto(produto);
}
function linkCompartilhavel(){
    if(indexAtual >= 0) return gerarLinkOferta(indexAtual);
    return URL_BASE;
}
function atualizarLinkBox(){
    const link = linkCompartilhavel();
    const inputPopup = document.getElementById("popupLinkInput");
    const inputPP    = document.getElementById("ppLinkInput");
    if(inputPopup) inputPopup.value = link;
    if(inputPP)    inputPP.value    = link;
}
function copiarLinkBox(inputId, btnId){
    const input = document.getElementById(inputId);
    const btn   = document.getElementById(btnId);
    if(!input || !input.value) return;
    const textoOriginal = btn.textContent;
    function feedback(){
        btn.textContent = "✓ Copiado!";
        btn.classList.add("copiado");
        setTimeout(function(){
            btn.textContent = textoOriginal;
            btn.classList.remove("copiado");
        }, 2000);
    }
    if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(input.value).then(feedback).catch(function(){
            input.select(); document.execCommand("copy"); feedback();
        });
    }else{
        input.select();
        input.setSelectionRange(0, 99999);
        document.execCommand("copy");
        feedback();
    }
}

function carregarPaginaProduto(index){
    const produto = produtos[index];
    if(!produto) return;
    document.documentElement.className += " modo-produto";
    document.title = produto.titulo + " — Oferta Exclusiva";
    document.getElementById("ppFoto").src          = produto.imagem;
    document.getElementById("ppFoto").alt          = produto.titulo;
    document.getElementById("ppTitulo").textContent = produto.titulo;
    document.getElementById("ppComprar").href       = produto.link;
    document.getElementById("ppDescricao").textContent = produto.descricao || "Descrição não disponível.";
    linkAtual   = produto.link;
    tituloAtual = produto.titulo;
    indexAtual  = index;
    modoProduto = true;
    const el  = document.getElementById("ppDescricao");
    const btn = document.getElementById("ppVerMais");
    el.classList.remove("expandida");
    btn.textContent = "Ver mais";
    atualizarLinkBox();
    resetAvalForm("pp");
    carregarFirebase().then(function(){
        ouvirAvaliacoes("pp", index);
    }).catch(function(){ /* silencioso */ });
    requestAnimationFrame(function(){
        requestAnimationFrame(function(){
            btn.style.display = (el.scrollHeight > el.clientHeight) ? "inline-block" : "none";
        });
    });
    window.scrollTo(0,0);
}
function ppToggleDescricao(){
    const el  = document.getElementById("ppDescricao");
    const btn = document.getElementById("ppVerMais");
    el.classList.toggle("expandida");
    btn.textContent = el.classList.contains("expandida") ? "Ver menos" : "Ver mais";
}
function ppToggleCompartilhamento(){
    document.getElementById("ppCompartilhamento").classList.toggle("ativo");
}

function textoCompartilhamento(){ return "🔥 " + tituloAtual + "\nConfira essa oferta: "; }
function compartilharWhatsApp(){
    window.open("https://wa.me/?text=" + encodeURIComponent(textoCompartilhamento() + linkCompartilhavel()), "_blank");
}
function compartilharFacebook(){
    window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(linkCompartilhavel()), "_blank");
}
function compartilharTelegram(){
    window.open("https://t.me/share/url?url=" + encodeURIComponent(linkCompartilhavel()) +
        "&text=" + encodeURIComponent(textoCompartilhamento()), "_blank");
}
function compartilharTwitter(){
    window.open("https://twitter.com/intent/tweet?url=" + encodeURIComponent(linkCompartilhavel()) +
        "&text=" + encodeURIComponent(textoCompartilhamento()), "_blank");
}

let _intervaloCarrossel = null;
function iniciarCarrossel(){
    const slides = document.querySelectorAll(".slide");
    const dots = document.querySelectorAll(".dot");
    if(!slides.length) return;
    let slideAtual = 0;
    window.mostrarSlide = function(index){
        if(index >= slides.length){ slideAtual = 0; }
        else if(index < 0){ slideAtual = slides.length - 1; }
        else{ slideAtual = index; }
        slides.forEach(s => s.classList.remove("active"));
        dots.forEach(d => d.classList.remove("active"));
        slides[slideAtual].classList.add("active");
        if(dots[slideAtual]) dots[slideAtual].classList.add("active");
    };
    window.moverSlide  = function(d){ window.mostrarSlide(slideAtual + d); };
    window.irParaSlide = function(i){ window.mostrarSlide(i); };

    if(_intervaloCarrossel) clearInterval(_intervaloCarrossel);
    _intervaloCarrossel = setInterval(function(){ window.moverSlide(1); }, 5000);
    const car = document.querySelector(".carousel");
    if(!car) return;
    car.addEventListener("mouseenter", function(){ clearInterval(_intervaloCarrossel); });
    car.addEventListener("mouseleave", function(){
        clearInterval(_intervaloCarrossel);
        _intervaloCarrossel = setInterval(function(){ window.moverSlide(1); }, 5000);
    });
    let inicioX = 0;
    car.addEventListener("touchstart", function(e){ inicioX = e.touches[0].clientX; }, {passive:true});
    car.addEventListener("touchend", function(e){
        const dif = e.changedTouches[0].clientX - inicioX;
        if(Math.abs(dif) > 50){ window.moverSlide(dif < 0 ? 1 : -1); }
    });
}

function iniciarListeners(){
    document.addEventListener("click", function(e){
        const link = e.target.closest(".link-slide");
        if(!link) return;
        e.preventDefault();
        const idx = parseInt(link.getAttribute("data-index"), 10);
        if(!isNaN(idx) && produtos[idx]) abrirProdutoPopup(idx);
    });
    document.getElementById("popup").addEventListener("click", function(event){
        if(event.target === this){ fecharPopup(); }
    });
    document.addEventListener("keydown", function(event){
        if(event.key === "Escape"){ fecharPopup(); }
    });
    initEstrelasForm("popup");
    initEstrelasForm("pp");
}

(async function iniciar(){
    try{
        await carregarProdutos();
    }catch(e){
        console.error(e);
        document.getElementById("loading").style.display = "none";
        const elErro = document.getElementById("erro");
        elErro.textContent = "Não foi possível carregar as ofertas. Verifique sua conexão e recarregue a página.";
        elErro.style.display = "block";
        return;
    }
    document.getElementById("loading").style.display = "none";
    document.getElementById("paginaNormal").style.visibility = "visible";

    const params = new URLSearchParams(location.search);
    let p = params.get("p");
    const cat = params.get("cat");
    const q = params.get("q");

    if(!p && window.self !== window.top && document.referrer){
        try{
            const refParams = new URL(document.referrer).searchParams;
            p = refParams.get("p");
        }catch(e){}
    }

    if(p !== null && p !== ""){
        let idx = -1;
        if(/^\d+$/.test(p)){
            idx = parseInt(p, 10);
        } else {
            idx = produtos.findIndex(prod => hashProduto(prod) === p);
        }
        if(idx >= 0 && produtos[idx]){
            await carregarMenuEstrutura();
            preencherMenuCategorias();
            iniciarListeners();
            carregarPaginaProduto(idx);
            return;
        }
    }

    await carregarMenuEstrutura();
    preencherMenuCategorias();
    construirCarrosselDinamico();
    iniciarListeners();

    if(q){ document.getElementById("inputBusca").value = q; executarBusca(); return; }
    if(cat){ document.getElementById("inputBusca").value = cat; executarBusca(); return; }
    montarCatalogo(null);
})();
