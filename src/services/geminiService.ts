import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { ResearchResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const PARTNER_COMPANIES = [
  "Betha Sistemas",
  "Arqia",
  "Contelurb",
  "Saber Soluções Educacionais",
  "Datami",
  "Sistema IRIS",
  "Cidade Segura"
];

export async function performResearch(municipality: string, state: string): Promise<{ results: ResearchResult[], sources: { uri: string, title: string }[] }> {
  const prompt = `
    Você é um agente especializado em inteligência comercial para o setor público brasileiro.
    Sua missão é realizar uma varredura técnica e precisa no município de ${municipality} - ${state} para identificar oportunidades comerciais.

    OBJETIVO PRINCIPAL:
    Identificar se o município:
    1. Possui contratos vigentes relacionados às soluções das empresas parceiras.
    2. Já contratou soluções semelhantes no passado.
    3. Possui contratos próximos do vencimento.
    4. Não possui soluções semelhantes (oportunidade de venda).

    EMPRESAS, ÁREAS E SOLUÇÕES ALVO:
    1. Betha Sistemas (Gestão Pública): ERP público, folha de pagamento, RH, educação, saúde, processos digitais. (Concorrentes: IPM, Fiorilli, Elotech)
    2. Arqia (Conectividade e IoT): Chips M2M, sensores urbanos, telemetria, rastreamento, cidades inteligentes. (Concorrentes: Vivo, Claro)
    3. Contelurb (Limpeza Urbana): Conteinerização de lixo, coleta mecanizada, ecopontos, gestão de resíduos. (Concorrentes: Solurb, Vega, Estre)
    4. Saber Soluções Educacionais (Educação): Sistemas de ensino, material estruturado, plataformas, foco em SAEB/IDEB. (Concorrentes: Positivo, FTD, Pearson)
    5. Datami (Inclusão Digital): Dados patrocinados, apps públicos com internet grátis. (Concorrentes: Mobicare)
    6. Sistema IRIS/Cidade Segura (Segurança): Videomonitoramento, reconhecimento facial, LPR, cercamento digital, despacho de viaturas. (Concorrentes: Genetec, Milestone)

    FONTES DE PESQUISA OBRIGATÓRIAS (VIA GOOGLE SEARCH):
    - Portal de Transparência do Município
    - Portal Nacional de Contratações Públicas (PNCP)
    - Diário Oficial do Município/Estado
    - Buscar por: "Contratos de Software", "Dispensa de Licitação", "Ata de Registro de Preços".

    CRITÉRIOS DE ANÁLISE E PRIORIDADE:
    Analise e foque em resultados que demonstrem:
    - Contratos próximos do vencimento (Prioridade Alta).
    - Cidades com investimentos recentes em tecnologia.
    - Classifique o cenário comercial em commercial_classification:
      * "CLIENTE ATUAL" se já utiliza nossa parceira (ex: Betha, Arqia, etc)
      * "CLIENTE DE CONCORRENTE" se utiliza rival (IPM, Vivo, etc)
      * "CONTRATO ENCERRADO" se já utilizou no passado mas não tem vigente
      * "OPORTUNIDADE NOVA" se não há registros
      * "OPORTUNIDADE ALTA" se tem contrato perto do fim

    REGRAS CRÍTICAS PARA LINKS E DADOS (ANTI-ALUCINAÇÃO):
    1. QUANTIDADE: Retorne de 10 a 12 resultados reais e confirmados.
    2. DATA E VALOR: Extraia a vigência correta e valor.
    3. PROIBIDO INVENTAR LINKS: Nunca deduza ou crie links fakes. O link TEM que existir.
    4. FONTE REAL: Use EXCLUSIVAMENTE os links reportados diretamente pela pesquisa. Se não achar o Diário Oficial/PDF, retorne o link da notícia.
    5. LINKS DO PNCP: Use apenas URLs reais do tipo https://pncp.gov.br/app/contratos/{CNPJ}/{ANO}/{NUMERO}.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            municipality: { type: Type.STRING },
            state: { type: Type.STRING },
            contract_type: { type: Type.STRING, description: "Ex: Contrato, Ata de Registro de Preços, Dispensa, ou N/A" },
            company: { type: Type.STRING, description: "Nome da empresa parceira foco desta oportunidade (Betha, Arqia...)" },
            solution_area: { type: Type.STRING, description: "Área técnica da solução (Gestão, Educação, Segurança...)" },
            contract_date: { type: Type.STRING, description: "Data de assinatura, vigência ou vencimento" },
            contract_value: { type: Type.STRING, description: "Valor total encontrado" },
            status: { type: Type.STRING, description: "Vigente, Encerrado, Em Licitação, N/A" },
            document_link: { type: Type.STRING, description: "URL direta e verificada da fonte" },
            description: { type: Type.STRING, description: "Justificativa/Descrição técnica" },
            opportunity_analysis: { type: Type.STRING, description: "Por que abordar este cliente? Qual a estratégia (alta/média/baixa)?" },
            commercial_classification: { type: Type.STRING, description: "CLIENTE ATUAL, CLIENTE DE CONCORRENTE, CONTRATO ENCERRADO, OPORTUNIDADE ALTA, OPORTUNIDADE NOVA" },
            competitor: { type: Type.STRING, description: "Nome da empresa concorrente caso commercial_classification for CLIENTE DE CONCORRENTE. Senão vazio." }
          },
          required: ["municipality", "state", "company", "solution_area", "document_link", "opportunity_analysis", "commercial_classification"]
        }
      }
    }
  });

  try {
    const results = JSON.parse(response.text);
    
    // Extrair links reais dos metadados de grounding
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources = groundingChunks?.map(chunk => ({
      uri: chunk.web?.uri || "",
      title: chunk.web?.title || "Fonte de Pesquisa"
    })).filter(s => s.uri) || [];

    const webLinks = sources.map(s => s.uri);

    const finalResults = results.map((res: any) => {
      let finalLink = res.document_link;

      // 1. Normalizar links do PNCP
      if (finalLink && finalLink.includes("pncp.gov.br/app/contratos/")) {
        const parts = finalLink.split("pncp.gov.br/app/contratos/")[1].split(/[-/]/);
        if (parts.length >= 3) {
          const cnpj = parts[0];
          const year = parts.find((p: string) => p.length === 4 && !isNaN(Number(p)));
          const numPart = parts.find((p: string) => p.length < 4 && !isNaN(Number(p)) && p !== "2");
          if (cnpj && year && numPart) {
            finalLink = `https://pncp.gov.br/app/contratos/${cnpj}/${year}/${Number(numPart)}`;
          }
        }
      }

      const companyLower = res.company.toLowerCase();
      const firstWord = companyLower.split(' ')[0];
      
      // 2. Filtrar webLinks para remover homepages óbvias (URLs muito curtas ou sem caminhos)
      const deepLinks = webLinks.filter(link => {
        try {
          const url = new URL(link);
          return url.pathname.length > 5 || url.search.length > 5;
        } catch {
          return false;
        }
      });

      const sortedLinks = [...deepLinks].sort((a, b) => b.length - a.length);

      // 3. Tenta encontrar um link no grounding que mencione a empresa NO TÍTULO ou na URL
      const bestMatch = sources.find(s => {
        const titleMatch = s.title.toLowerCase().includes(firstWord);
        const urlMatch = s.uri.toLowerCase().includes(firstWord);
        return (titleMatch || urlMatch) && (s.uri.toLowerCase().includes("contrato") || s.uri.toLowerCase().includes("licitacao") || s.uri.toLowerCase().includes("detalhe") || s.uri.toLowerCase().includes(".pdf"));
      })?.uri;

      // 4. Se o link do JSON for suspeito (muito curto ou homepage)
      const isSuspicious = !finalLink || 
                          finalLink.includes("exemplo.com") || 
                          finalLink.includes("link-do-documento") ||
                          finalLink.length < 30 || // URLs de portais de transparência reais costumam ser longas
                          new URL(finalLink).pathname === "/" ||
                          new URL(finalLink).pathname === "";

      if (bestMatch) {
        finalLink = bestMatch;
      } else if (isSuspicious && sortedLinks.length > 0) {
        // Pega o link mais longo que pareça ser de transparência ou do governo
        finalLink = sortedLinks.find(link => 
          link.toLowerCase().includes("transparencia") || 
          link.toLowerCase().includes(".gov.br") ||
          link.toLowerCase().includes(municipality.toLowerCase().substring(0, 5))
        ) || sortedLinks[0];
      }

      return { ...res, document_link: finalLink };
    });

    return { results: finalResults, sources };
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { results: [], sources: [] };
  }
}
