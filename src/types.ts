export interface ResearchResult {
  id?: number;
  task_id?: string;
  municipality: string;
  state: string;
  contract_type: string;
  company: string;
  solution_area: string;
  contract_date: string;
  contract_value: string;
  status: string;
  document_link: string;
  description: string;
  opportunity_analysis: string;
  commercial_classification?: string;
  competitor?: string;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ResearchTask {
  id: string;
  municipality: string;
  state: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  results?: ResearchResult[];
  sources?: GroundingSource[];
}

export type SolutionArea = 
  | 'Gestão Pública'
  | 'Conectividade e IoT'
  | 'Resíduos e Limpeza'
  | 'Educação'
  | 'Dados Patrocinados'
  | 'Segurança Pública';
