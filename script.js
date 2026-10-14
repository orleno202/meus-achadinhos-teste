async function carregarProdutos(){
    // URL da sua planilha de teste, apontando para a aba Menu_Novo
    const URL_PLANILHA_MENU = "https://docs.google.com/spreadsheets/d/1jVjEL9ZsoDy_yNYCaAQmu1MRv6EqUassCTEj3osn4Ec/export?format=csv&gid=1022328164";
    
    const resp = await fetch(URL_PLANILHA_MENU, {cache:"no-store"});
    if(!resp.ok) throw new Error("Erro HTTP " + resp.status);
    const texto = await resp.text();
    const linhas = parseCSV(texto);
    produtos = [];
    
    const ERROS_SHEETS = /^#(ERROR!|N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NULL!|NUM!)/i;
    
    // A aba Menu_Novo tem as colunas:
    // A: Nivel_1, B: Nivel_2, C: Nivel_3, D: Palavra_Chave, E: Categoria, F: Grupo
    for(let i = 1; i < linhas.length; i++){
        const l = linhas[i];
        if(!l || l.length < 5) continue; // Precisa ter pelo menos 5 colunas (A até E)
        
        const nivel1 = (l[0]||"").trim();
        const nivel2 = (l[1]||"").trim();
        const nivel3 = (l[2]||"").trim();
        const palavraChave = (l[3]||"").trim();
        const categoria = (l[4]||"").trim();
        const grupo = (l[5]||"").trim();
        
        // Ignora linhas sem palavra-chave ou categoria
        if(!palavraChave || !categoria) continue;
        if(ERROS_SHEETS.test(palavraChave)) continue;
        if(ERROS_SHEETS.test(categoria)) continue;
        
        // Cria um "produto" fictício para cada linha.
        // A "categoria" do produto será a coluna E (Categoria)
        // O "título" será a Palavra_Chave (coluna D) para a busca funcionar
        produtos.push({
            categoria: categoria,
            titulo: palavraChave,
            imagem: "",
            descricao: `Nível 1: ${nivel1} | Nível 2: ${nivel2} | Nível 3: ${nivel3}`,
            link: ""
        });
    }
    
    // Extrai as categorias únicas da lista de produtos (coluna E)
    const setCats = new Set();
    produtos.forEach(p => {
        p.categoria.split("|").forEach(c => {
            const t = c.trim();
            if(t && !ERROS_SHEETS.test(t)) setCats.add(t);
        });
    });
    categorias = Array.from(setCats).sort((a,b)=>a.localeCompare(b));
}
