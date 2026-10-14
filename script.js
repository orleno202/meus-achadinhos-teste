/* =====================================================
   Parser CSV — necessário para ler a planilha do Google
===================================================== */
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

/* =====================================================
   Carrega os produtos da planilha Menu_Novo
===================================================== */
async function carregarProdutos(){
    const URL_PLANILHA_MENU = "https://docs.google.com/spreadsheets/d/1jVjEL9ZsoDy_yNYCaAQmu1MRv6EqUassCTEj3osn4Ec/export?format=csv&gid=1022328164";

    const resp = await fetch(URL_PLANILHA_MENU, {cache:"no-store"});
    if(!resp.ok) throw new Error("Erro HTTP " + resp.status);

    // Força UTF-8 para corrigir acentos (ACESSÃ"RIOS → ACESSÓRIOS)
    const buffer = await resp.arrayBuffer();
    const texto = new TextDecoder("utf-8").decode(buffer);

    const linhas = parseCSV(texto);
    produtos = [];

    const ERROS_SHEETS = /^#(ERROR!|N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;

    // Colunas: A=Nivel_1, B=Nivel_2, C=Nivel_3, D=Palavra_Chave, E=Categoria, F=Grupo
    for(let i = 1; i < linhas.length; i++){
        const l = linhas[i];
        if(!l || l.length < 5) continue;

        const nivel1 = (l[0]||"").trim();
        const nivel2 = (l[1]||"").trim();
        const nivel3 = (l[2]||"").trim();
        const palavraChave = (l[3]||"").trim();
        const categoria = (l[4]||"").trim();
        const grupo = (l[5]||"").trim();

        if(!palavraChave || !categoria) continue;
        if(ERROS_SHEETS.test(palavraChave)) continue;
        if(ERROS_SHEETS.test(categoria)) continue;

        produtos.push({
            categoria: categoria,
            titulo: palavraChave,
            imagem: "",
            descricao: `Nível 1: ${nivel1} | Nível 2: ${nivel2} | Nível 3: ${nivel3}`,
            link: ""
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
