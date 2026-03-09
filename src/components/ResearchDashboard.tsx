import React, { useState, useEffect } from 'react';
import { Search, History, FileText, TrendingUp, MapPin, Building2, ExternalLink, Loader2, AlertCircle, CheckCircle2, Download, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ResearchTask, ResearchResult } from '../types';
import { performResearch } from '../services/geminiService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

export default function ResearchDashboard() {
  const [municipality, setMunicipality] = useState('');
  const [state, setState] = useState('');
  const [tasks, setTasks] = useState<ResearchTask[]>([]);
  const [activeTask, setActiveTask] = useState<ResearchTask | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks', err);
    }
  };

  const clearHistory = async () => {
    try {
      await fetch('/api/tasks', { method: 'DELETE' });
      setTasks([]);
      setActiveTask(null);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear history', err);
    }
  };

  const generateWordReport = async () => {
    if (!activeTask || !activeTask.results) return;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: `Relatório de Oportunidades Comerciais - ${activeTask.municipality}, ${activeTask.state}`,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Data da Análise: ${new Date(activeTask.created_at).toLocaleDateString('pt-BR')}`,
                bold: true,
              }),
            ],
            spacing: { after: 200 },
          }),
          ...activeTask.results.flatMap((result, index) => [
            new Paragraph({
              text: `${index + 1}. ${result.company} - ${result.solution_area}`,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tipo de Contrato", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(result.contract_type)] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Valor", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(result.contract_value || "N/A")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Status", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(result.status)] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Link", bold: true })] })] }),
                    new TableCell({ children: [new Paragraph(result.document_link || "N/A")] }),
                  ],
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Descrição:", bold: true }),
                new TextRun({ text: ` ${result.description}` }),
              ],
              spacing: { before: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: "Análise de Oportunidade:", bold: true, color: "2E7D32" }),
                new TextRun({ text: ` ${result.opportunity_analysis}` }),
              ],
              spacing: { before: 100, after: 400 },
            }),
          ]),
          ...(activeTask.sources && activeTask.sources.length > 0 ? [
            new Paragraph({
              text: "Fontes de Pesquisa (Grounding)",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 600, after: 200 },
            }),
            ...activeTask.sources.map(source => 
              new Paragraph({
                children: [
                  new TextRun({ text: `${source.title}: `, bold: true }),
                  new TextRun({ text: source.uri, color: "0000FF" }),
                ],
                spacing: { after: 100 },
              })
            )
          ] : []),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Relatorio_Oportunidades_${activeTask.municipality}_${activeTask.state}.docx`);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!municipality || !state) return;

    setIsSearching(true);
    try {
      // 1. Create task
      const taskRes = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipality, state }),
      });
      const { id } = await taskRes.json();

      // 2. Perform AI Research
      const { results, sources } = await performResearch(municipality, state);

      // 3. Save results
      await fetch('/api/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: id, results, sources, status: 'completed' }),
      });

      fetchTasks();
      // Auto-select the new task
      const updatedTaskRes = await fetch(`/api/research/${id}`);
      const updatedTask = await updatedTaskRes.json();
      setActiveTask(updatedTask);
      
      setMunicipality('');
      setState('');
    } catch (err) {
      console.error('Research failed', err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectTask = async (id: string) => {
    try {
      const res = await fetch(`/api/research/${id}`);
      const data = await res.json();
      setActiveTask(data);
    } catch (err) {
      console.error('Failed to fetch task details', err);
    }
  };

  return (
    <div className="flex h-screen bg-[#E4E3E0] text-[#141414] font-sans">
      {/* Sidebar: History */}
      <div className="w-80 border-r border-[#141414] flex flex-col bg-[#E4E3E0]">
        <div className="p-6 border-b border-[#141414] flex justify-between items-center">
          <h2 className="font-serif italic text-xs uppercase tracking-widest opacity-50 flex items-center gap-2">
            <History size={14} /> Histórico
          </h2>
          {tasks.length > 0 && (
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="p-1.5 hover:bg-red-600 hover:text-white transition-colors rounded-sm opacity-50 hover:opacity-100"
              title="Limpar Histórico"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {tasks.map((task) => (
            <button
              key={task.id}
              onClick={() => selectTask(task.id)}
              className={`w-full text-left p-4 border-b border-[#141414] transition-colors hover:bg-[#141414] hover:text-[#E4E3E0] group ${
                activeTask?.id === task.id ? 'bg-[#141414] text-[#E4E3E0]' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-mono text-sm font-bold">{task.municipality}</span>
                <span className="text-[10px] opacity-50">{task.state}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] opacity-70">
                <FileText size={10} />
                <span>{new Date(task.created_at).toLocaleDateString('pt-BR')}</span>
                <span className={`ml-auto px-1.5 py-0.5 rounded-sm border border-current ${
                  task.status === 'completed' ? 'border-green-600/50 text-green-600' : 'border-orange-600/50 text-orange-600'
                }`}>
                  {task.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header: Search Bar */}
        <header className="p-8 border-b border-[#141414] bg-[#E4E3E0]">
          <form onSubmit={handleSearch} className="max-w-4xl flex gap-4">
            <div className="flex-1 relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30" size={18} />
              <input
                type="text"
                placeholder="Nome do Município (ex: Joinville)"
                value={municipality}
                onChange={(e) => setMunicipality(e.target.value)}
                className="w-full bg-transparent border border-[#141414] py-3 pl-10 pr-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <div className="w-24 relative">
              <input
                type="text"
                placeholder="UF"
                maxLength={2}
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase())}
                className="w-full bg-transparent border border-[#141414] py-3 px-4 font-mono text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#141414]"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="bg-[#141414] text-[#E4E3E0] px-8 py-3 font-mono text-sm font-bold flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {isSearching ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
              PESQUISAR
            </button>
          </form>
        </header>

        {/* Results Area */}
        <main className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTask ? (
              <motion.div
                key={activeTask.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-6xl mx-auto"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h1 className="text-4xl font-serif italic mb-2">{activeTask.municipality}, {activeTask.state}</h1>
                    <p className="font-mono text-xs opacity-50 uppercase tracking-widest">Relatório de Análise de Transparência</p>
                  </div>
                  <div className="flex flex-col items-end gap-4">
                    <button
                      onClick={generateWordReport}
                      className="flex items-center gap-2 bg-[#141414] text-[#E4E3E0] px-4 py-2 font-mono text-xs font-bold hover:opacity-80 transition-all"
                    >
                      <Download size={14} />
                      GERAR RELATÓRIO WORD
                    </button>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <TrendingUp size={14} className="text-green-600" />
                      <span>{activeTask.results?.length || 0} Contratos Identificados</span>
                    </div>
                  </div>
                </div>

                {/* Data Grid */}
                <div className="border border-[#141414]">
                  <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_100px] bg-[#141414] text-[#E4E3E0] p-4 font-serif italic text-xs uppercase tracking-wider">
                    <div>Empresa / Solução</div>
                    <div>Área</div>
                    <div>Valor / Data</div>
                    <div>Status</div>
                    <div className="text-right">Ações</div>
                  </div>

                  {activeTask.results?.map((result, idx) => (
                    <div key={idx} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_100px] p-4 border-t border-[#141414] hover:bg-[#141414]/5 transition-colors group">
                      <div>
                        <div className="font-mono text-sm font-bold mb-1">{result.company}</div>
                        <div className="text-xs opacity-70">{result.contract_type}</div>
                      </div>
                      <div className="flex items-center">
                        <span className="text-[10px] px-2 py-1 border border-[#141414]/20 rounded-full font-mono uppercase">
                          {result.solution_area}
                        </span>
                      </div>
                      <div className="font-mono text-xs">
                        <div className="font-bold">{result.contract_value || 'N/A'}</div>
                        <div className="opacity-50">{result.contract_date}</div>
                      </div>
                      <div className="flex items-center">
                        <span className={`text-[10px] font-mono uppercase flex items-center gap-1 ${
                          result.status.toLowerCase().includes('vigente') ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          {result.status.toLowerCase().includes('vigente') ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                          {result.status}
                        </span>
                      </div>
                      <div className="flex justify-end items-center">
                        {result.document_link && (
                          <a
                            href={result.document_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors rounded-sm"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                      </div>
                      
                      {/* Expanded Analysis */}
                      <div className="col-span-5 mt-4 pt-4 border-t border-dashed border-[#141414]/20">
                        <div className="grid grid-cols-2 gap-8">
                          <div>
                            <h4 className="font-serif italic text-[10px] uppercase opacity-50 mb-2">Descrição / Comprovação</h4>
                            <p className="text-xs leading-relaxed">{result.description}</p>
                          </div>
                          <div className="bg-[#141414]/5 p-4 border border-[#141414]/10">
                            <h4 className="font-serif italic text-[10px] uppercase opacity-50 mb-2">Análise de Oportunidade</h4>
                            <p className="text-xs font-mono leading-relaxed">{result.opportunity_analysis}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!activeTask.results || activeTask.results.length === 0) && (
                    <div className="p-12 text-center opacity-30 font-serif italic">
                      Nenhum contrato direto ou similar encontrado para este município.
                    </div>
                  )}
                </div>

                {/* Grounding Sources Section */}
                {activeTask.sources && activeTask.sources.length > 0 && (
                  <div className="mt-12 pt-8 border-t border-[#141414]">
                    <h3 className="font-serif italic text-sm uppercase tracking-widest opacity-50 mb-6 flex items-center gap-2">
                      <ExternalLink size={14} /> Fontes de Pesquisa (Grounding)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeTask.sources.map((source, idx) => (
                        <a
                          key={idx}
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 border border-[#141414]/10 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all group"
                        >
                          <div className="w-8 h-8 flex items-center justify-center bg-[#141414]/5 group-hover:bg-[#E4E3E0]/20 rounded-sm">
                            <span className="font-mono text-[10px]">{idx + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[10px] font-bold truncate uppercase">{source.title}</div>
                            <div className="text-[10px] opacity-50 truncate">{source.uri}</div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <Building2 size={80} strokeWidth={1} />
                <p className="mt-4 font-serif italic text-xl">Selecione ou inicie uma nova pesquisa municipal</p>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Loading Overlay */}
      {isSearching && (
        <div className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-[#E4E3E0]">
          <Loader2 className="animate-spin mb-6" size={48} />
          <h2 className="text-2xl font-serif italic mb-2">Analisando Portais de Transparência...</h2>
          <p className="font-mono text-xs opacity-50 uppercase tracking-widest">Consultando PNCP, Diários Oficiais e Portais de Licitação</p>
          <div className="mt-8 w-64 h-1 bg-[#E4E3E0]/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#E4E3E0]"
              animate={{ x: [-256, 256] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            />
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#141414]/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#E4E3E0] border border-[#141414] p-8 max-w-md w-full shadow-2xl"
            >
              <h3 className="font-serif italic text-2xl mb-4">Limpar Histórico?</h3>
              <p className="font-mono text-xs opacity-70 mb-8 uppercase tracking-wider leading-relaxed">
                Esta ação removerá permanentemente todas as pesquisas, contratos e fontes do banco de dados local. Esta operação não pode ser desfeita.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 border border-[#141414] py-3 font-mono text-xs font-bold hover:bg-[#141414]/5 transition-all"
                >
                  CANCELAR
                </button>
                <button 
                  onClick={clearHistory}
                  className="flex-1 bg-red-600 text-white py-3 font-mono text-xs font-bold hover:bg-red-700 transition-all"
                >
                  CONFIRMAR LIMPEZA
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
