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
    VOCÊ É UM ESPECIALISTA EM INTELIGÊNCIA DE MERCADO E LICITAÇÕES PÚBLICAS NO BRASIL.
    Sua missão é realizar uma varredura técnica e precisa no município de ${municipality} - ${state}.

    ESTRATÉGIA DE PESQUISA (GROUNDING):
    1. Identifique o Portal de Transparência oficial do município.
    2. Consulte o PNCP (Portal Nacional de Contratações Públicas) para registros recentes.
    3. Busque em Diários Oficiais do Município e do Estado.
    4. Procure especificamente por: "Contratos de Software", "Licitações de Tecnologia", "Ata de Registro de Preços", "Dispensa de Licitação".

    FOCO NAS EMPRESAS PARCEIRAS (OU CONCORRENTES DIRETOS):
    - Gestão Pública: Betha Sistemas (ou concorrentes como IPM, Fiorilli, Elotech).
    - Conectividade/M2M: Arqia (ou concorrentes como Vivo Empresas, Claro, Link Solutions).
    - Resíduos: Contelurb (ou concorrentes como Solurb, Vega, Estre).
    - Educação: Saber Soluções (ou concorrentes como Positivo, FTD, Pearson).
    - Inclusão Digital: Datami (ou concorrentes como Mobicare).
    - Segurança: Sistema IRIS, Cidade Segura (ou concorrentes como Genetec, Milestone, Hikvision).

    CRITÉRIOS DE ACERTIVIDADE:
    - VALORES: Extraia o valor exato do contrato. Se for valor global, especifique.
    - VIGÊNCIA: Identifique a data de início e fim. Contratos vencendo em menos de 6 meses são PRIORIDADE ALTA.
    - OBJETO: Seja técnico na descrição. Não diga apenas "software", diga "Sistema de Gestão Tributária e Nota Fiscal Eletrônica".
    - LINKS: O document_link deve ser o link direto para a página do contrato ou o PDF. Se não encontrar o PDF, use a página de detalhes da licitação.

    REGRAS DE OURO:
    - Se não encontrar um contrato de uma parceira, você DEVE listar o contrato do CONCORRENTE atual para que possamos planejar a substituição.
    - NUNCA invente dados. Se não encontrar o valor, coloque "Valor não localizado no portal".
    - LINKS DO PNCP: O formato correto é https://pncp.gov.br/app/contratos/{CNPJ}/{ANO}/{NUMERO}. NUNCA use hífens ou formatos como "contratos/ID-ANO". Use APENAS a URL exata que você copiou do resultado da busca.
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
            contract_type: { type: Type.STRING, description: "Ex: Contrato, Ata de Registro de Preços, Dispensa" },
            company: { type: Type.STRING, description: "Nome da empresa contratada" },
            solution_area: { type: Type.STRING, description: "Área técnica da solução" },
            contract_date: { type: Type.STRING, description: "Data de assinatura ou vigência" },
            contract_value: { type: Type.STRING, description: "Valor total do contrato" },
            status: { type: Type.STRING, description: "Vigente, Encerrado ou Em Licitação" },
            document_link: { type: Type.STRING, description: "URL direta e verificada" },
            description: { type: Type.STRING, description: "Descrição técnica do objeto contratado" },
            opportunity_analysis: { type: Type.STRING, description: "Análise estratégica: por que abordar este cliente agora?" },
          },
          required: ["municipality", "state", "company", "solution_area", "document_link", "opportunity_analysis"]
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
