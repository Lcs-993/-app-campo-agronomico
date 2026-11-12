// Definição das fichas: campos de cada tela, cálculos e montagem do JSON
// no formato dos schemas em schemas/*.schema.json.

import {
  PRAGAS_SOLO, VERSAO_SCHEMA, nomePraga, ehInteiro, ehNumero,
  calcularPragasSolo, pontosComPragasCriticas, errosPontoPragasSolo,
  calcularCigarrinha, calcularCQ, errosAmostraCQ, statusLiberacao,
  parecerIniciado, parecerPreenchido,
} from './regras.js';
import { fmt } from './ui.js';

const estagiosZerados = () => ({ larva: 0, pupa: 0, adulto: 0 });

const ROTULO_FASE = {
  ninfa: 'Ninfas', adulto: 'Adultos', empate: 'Ninfas e adultos empatados', sem_ocorrencia: 'Sem ocorrência',
};

export const ROTULO_STATUS_CQ = {
  liberado: 'Liberado para corte',
  alerta: 'Alerta ao PDA',
  bloqueado: 'Corte bloqueado',
  liberado_por_parecer_pda: 'Liberado por parecer do PDA',
  reprovado_por_parecer_pda: 'Reprovado por parecer do PDA',
};

const NIVEL_STATUS_CQ = {
  liberado: 'ok', alerta: 'atencao', bloqueado: 'perigo',
  liberado_por_parecer_pda: 'ok', reprovado_por_parecer_pda: 'perigo',
};

export const FICHAS = {
  pragas_solo: {
    titulo: 'Pragas do Solo',
    setor: 'Fitossanidade',
    descricao: 'Contagem por toco: Migdolus, Sphenophorus, Metamasius, broca e pão-de-galinha.',
    icone: 'solo',
    colecao: 'pontos',
    nomeItem: 'Ponto',
    identificacao: [
      { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { chave: 'fazenda', rotulo: 'Fazenda', obrigatorio: true, sugestoes: true },
      { chave: 'talhao', rotulo: 'Talhão', obrigatorio: true, sugestoes: true },
      { chave: 'bloco', rotulo: 'Bloco', obrigatorio: true, sugestoes: true },
      { chave: 'amostrador', rotulo: 'Amostrador', obrigatorio: true, sugestoes: true },
    ],
    camposItem: [
      { chave: 'geolocalizacao', rotulo: 'Localização do ponto', tipo: 'gps', obrigatorio: true },
      { chave: 'tocos_examinados', rotulo: 'Tocos examinados', tipo: 'inteiro', obrigatorio: true, min: 1 },
      { chave: 'tocos_brocados', rotulo: 'Tocos brocados', tipo: 'inteiro', obrigatorio: true, min: 0 },
      ...PRAGAS_SOLO.map((p) => ({ chave: p.chave, rotulo: p.nome, tipo: 'estagios', critica: true })),
      { chave: 'fotos', rotulo: 'Fotos', tipo: 'fotos' },
      { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto' },
    ],
    novoItem: (numero) => ({
      numero, geolocalizacao: null, tocos_examinados: null, tocos_brocados: 0,
      ...Object.fromEntries(PRAGAS_SOLO.map((p) => [p.chave, estagiosZerados()])),
      fotos: [], observacoes: '',
    }),
    errosItem: errosPontoPragasSolo,
    resumoItem(p) {
      if (!ehInteiro(p.tocos_examinados)) return '';
      return `${p.tocos_brocados ?? 0}/${p.tocos_examinados} brocados`;
    },
    calcular: calcularPragasSolo,
    indicadores(ficha, par) {
      const r = calcularPragasSolo(ficha, par);
      return [
        { rotulo: 'Tocos brocados', valor: r.percentual_tocos_brocados == null ? '—' : `${fmt(r.percentual_tocos_brocados)}%` },
        { rotulo: 'Brocados / examinados', valor: `${r.total_tocos_brocados} / ${r.total_tocos_examinados}` },
        { rotulo: 'Pontos', valor: String(ficha.pontos.length) },
      ];
    },
    alerta(ficha, par) {
      const pontos = pontosComPragasCriticas(ficha, par);
      const pragas = Object.keys(pontos);
      if (!pragas.length) return null;
      const texto = pragas
        .map((p) => `${nomePraga(p)} no${pontos[p].length > 1 ? 's pontos' : ' ponto'} ${pontos[p].join(', ')}`)
        .join('; ');
      return { nivel: 'perigo', titulo: 'Praga crítica detectada', texto: `${texto}.`, vibrar: true };
    },
    resumoLista(ficha, par) {
      const r = calcularPragasSolo(ficha, par);
      const partes = [];
      if (r.percentual_tocos_brocados != null) partes.push({ texto: `${fmt(r.percentual_tocos_brocados)}% brocados` });
      for (const p of r.pragas_criticas_detectadas) partes.push({ texto: nomePraga(p), nivel: 'perigo' });
      return partes;
    },
  },

  cigarrinha_raiz: {
    titulo: 'Cigarrinha-da-Raiz',
    setor: 'Fitossanidade',
    descricao: 'Ninfas e adultos de Mahanarva fimbriolata por metro linear.',
    icone: 'cigarrinha',
    colecao: 'pontos',
    nomeItem: 'Ponto',
    identificacao: [
      { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { chave: 'fazenda', rotulo: 'Fazenda', obrigatorio: true, sugestoes: true },
      { chave: 'talhao', rotulo: 'Talhão', obrigatorio: true, sugestoes: true },
      { chave: 'bloco', rotulo: 'Bloco', sugestoes: true },
      { chave: 'amostrador', rotulo: 'Amostrador', obrigatorio: true, sugestoes: true },
    ],
    camposItem: [
      { chave: 'geolocalizacao', rotulo: 'Localização do ponto', tipo: 'gps', obrigatorio: true },
      { chave: 'metros_lineares', rotulo: 'Metros lineares amostrados', tipo: 'decimal', obrigatorio: true, sufixo: 'm', positivo: true },
      { chave: 'ninfas', rotulo: 'Ninfas', tipo: 'inteiro', obrigatorio: true, min: 0 },
      { chave: 'adultos', rotulo: 'Adultos', tipo: 'inteiro', obrigatorio: true, min: 0 },
      { chave: 'espuma', rotulo: 'Espuma', tipo: 'espuma', obrigatorio: true },
      { chave: 'fotos', rotulo: 'Fotos', tipo: 'fotos' },
      { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto' },
    ],
    novoItem: (numero) => ({
      numero, geolocalizacao: null, metros_lineares: null, ninfas: 0, adultos: 0,
      espuma: { presente: false }, fotos: [], observacoes: '',
    }),
    errosItem: () => [],
    resumoItem(p) {
      if (!ehNumero(p.metros_lineares) || p.metros_lineares <= 0) return '';
      return `${fmt((p.ninfas ?? 0) / p.metros_lineares, 2)} ninfas/m`;
    },
    calcular: calcularCigarrinha,
    indicadores(ficha, par) {
      const r = calcularCigarrinha(ficha, par);
      return [
        { rotulo: 'Ninfas por metro', valor: r.ninfas_por_metro == null ? '—' : fmt(r.ninfas_por_metro, 2) },
        { rotulo: 'NDE (PDA)', valor: `${fmt(r.nde_referencia, 1)} ninfa/m` },
        { rotulo: 'Fase predominante', valor: ROTULO_FASE[r.fase_predominante] },
        { rotulo: 'Ninfas / adultos / metros', valor: `${r.total_ninfas} / ${r.total_adultos} / ${fmt(r.total_metros, 1)}` },
      ];
    },
    alerta(ficha, par) {
      const r = calcularCigarrinha(ficha, par);
      if (r.ninfas_por_metro == null) return null;
      if (r.acima_nde) {
        return {
          nivel: 'perigo',
          titulo: 'Acima do nível de dano econômico',
          texto: `${fmt(r.ninfas_por_metro, 2)} ninfas/m, acima do NDE de ${fmt(r.nde_referencia, 1)}. Fase predominante: ${ROTULO_FASE[r.fase_predominante].toLowerCase()}.`,
        };
      }
      return { nivel: 'ok', titulo: 'Abaixo do NDE', texto: `${fmt(r.ninfas_por_metro, 2)} ninfas/m (NDE ${fmt(r.nde_referencia, 1)}).` };
    },
    resumoLista(ficha, par) {
      const r = calcularCigarrinha(ficha, par);
      if (r.ninfas_por_metro == null) return [];
      return [{ texto: `${fmt(r.ninfas_por_metro, 2)} ninfas/m`, nivel: r.acima_nde ? 'perigo' : undefined }];
    },
  },

  cq_infestacao_final_broca: {
    titulo: 'Infestação Final da Broca',
    setor: 'Controle de Qualidade',
    descricao: 'Entrenós danificados por Diatraea saccharalis para liberação de corte.',
    icone: 'broca',
    colecao: 'amostras',
    nomeItem: 'Amostra',
    identificacao: [
      { chave: 'data', rotulo: 'Data', tipo: 'data', obrigatorio: true },
      { chave: 'fazenda', rotulo: 'Fazenda', obrigatorio: true, sugestoes: true },
      { chave: 'talhao', rotulo: 'Talhão', obrigatorio: true, sugestoes: true },
      { chave: 'amostrador', rotulo: 'Auditor', sugestoes: true },
    ],
    camposFicha: [
      { chave: 'area_ha', rotulo: 'Área do talhão', tipo: 'decimal', obrigatorio: true, sufixo: 'ha', positivo: true },
    ],
    camposItem: [
      { chave: 'geolocalizacao', rotulo: 'Localização da amostra', tipo: 'gps', obrigatorio: true },
      { chave: 'entrenos_totais', rotulo: 'Entrenós totais', tipo: 'inteiro', obrigatorio: true, min: 1 },
      { chave: 'entrenos_danificados', rotulo: 'Entrenós danificados', dica: 'Brocados ou com podridão associada', tipo: 'inteiro', obrigatorio: true, min: 0 },
      { chave: 'fotos', rotulo: 'Fotos dos entrenós danificados', tipo: 'fotos', exigirGps: true },
      { chave: 'observacoes', rotulo: 'Observações', tipo: 'texto' },
    ],
    novoItem: (numero) => ({
      numero, geolocalizacao: null, entrenos_totais: null, entrenos_danificados: 0, fotos: [], observacoes: '',
    }),
    errosItem: errosAmostraCQ,
    resumoItem(a) {
      if (!ehInteiro(a.entrenos_totais) || a.entrenos_totais <= 0) return '';
      return `${fmt(((a.entrenos_danificados ?? 0) / a.entrenos_totais) * 100)}%`;
    },
    calcular: calcularCQ,
    indicadores(ficha, par) {
      const r = calcularCQ(ficha, par);
      return [
        { rotulo: 'Índice de infestação', valor: r.indice_infestacao_pct == null ? '—' : `${fmt(r.indice_infestacao_pct, 2)}%` },
        { rotulo: 'Danificados / totais', valor: `${r.total_entrenos_danificados} / ${r.total_entrenos}` },
        { rotulo: 'Limites (alerta / bloqueio)', valor: `${fmt(r.limite_alerta_pct)}% / ${fmt(r.limite_bloqueio_pct)}%` },
      ];
    },
    alerta(ficha, par) {
      const status = statusLiberacao(ficha, par);
      if (!status) return null;
      const r = calcularCQ(ficha, par);
      const ii = `II de ${fmt(r.indice_infestacao_pct, 2)}%`;
      const textos = {
        liberado: `${ii}, dentro do limite de ${fmt(r.limite_alerta_pct)}%.`,
        alerta: `${ii}, acima de ${fmt(r.limite_alerta_pct)}%. O talhão será sinalizado ao Planejamento.`,
        bloqueado: `${ii}, acima de ${fmt(r.limite_bloqueio_pct)}%. Corte bloqueado até parecer técnico do PDA.`,
        liberado_por_parecer_pda: `${ii}. Liberado pelo PDA (${ficha.parecer_pda?.responsavel}).`,
        reprovado_por_parecer_pda: `${ii}. Reprovado pelo PDA (${ficha.parecer_pda?.responsavel}).`,
      };
      return { nivel: NIVEL_STATUS_CQ[status], titulo: ROTULO_STATUS_CQ[status], texto: textos[status] };
    },
    resumoLista(ficha, par) {
      const status = statusLiberacao(ficha, par);
      if (!status) return [];
      const r = calcularCQ(ficha, par);
      return [
        { texto: `II ${fmt(r.indice_infestacao_pct, 2)}%` },
        { texto: ROTULO_STATUS_CQ[status], nivel: NIVEL_STATUS_CQ[status] },
      ];
    },
    temParecer: true,
    errosFicha(ficha, par) {
      if (calcularCQ(ficha, par).status_calculado !== 'bloqueado') return [];
      if (parecerIniciado(ficha.parecer_pda) && !parecerPreenchido(ficha.parecer_pda)) {
        return ['Parecer do PDA incompleto: preencha responsável, data, decisão e justificativa, ou limpe o parecer.'];
      }
      return [];
    },
  },
};

export function novoRegistro(tipo, dispositivoId) {
  const cfg = FICHAS[tipo];
  const agora = new Date().toISOString();
  const ficha = {
    tipo_ficha: tipo,
    metadados: {
      id: novoUuid(),
      versao_schema: VERSAO_SCHEMA,
      criado_em: agora,
      atualizado_em: agora,
      dispositivo_id: dispositivoId,
      status_sincronizacao: 'pendente',
    },
    identificacao: { data: hojeLocal() },
    [cfg.colecao]: [cfg.novoItem(1)],
    observacoes: '',
  };
  for (const c of cfg.camposFicha ?? []) ficha[c.chave] = null;
  return { id: ficha.metadados.id, tipo, finalizada: false, ficha };
}

export function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function novoUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// ---------- Validação antes de finalizar ----------

const vazio = (v) => v == null || (typeof v === 'string' && !v.trim());

function erroCampo(c, v) {
  if (c.tipo === 'gps') return v ? null : 'capture a localização (GPS)';
  if (c.tipo === 'inteiro') {
    if (!ehInteiro(v)) return c.obrigatorio ? 'informe um número inteiro' : null;
    if (c.min != null && v < c.min) return `deve ser no mínimo ${c.min}`;
    return null;
  }
  if (c.tipo === 'decimal') {
    if (!ehNumero(v)) return c.obrigatorio ? 'informe um número' : null;
    if (c.positivo && v <= 0) return 'deve ser maior que zero';
    return null;
  }
  if (c.tipo === 'espuma') {
    return v && typeof v.presente === 'boolean' ? null : 'informe se há espuma';
  }
  if (c.obrigatorio && vazio(v)) return 'campo obrigatório';
  return null;
}

/** Lista de pendências que impedem finalizar a ficha. Lista vazia = pode finalizar. */
export function pendencias(registro, parametros) {
  const cfg = FICHAS[registro.tipo];
  const f = registro.ficha;
  const erros = [];
  for (const c of cfg.identificacao) {
    if (c.obrigatorio && vazio(f.identificacao[c.chave])) erros.push(`${c.rotulo}: campo obrigatório`);
  }
  for (const c of cfg.camposFicha ?? []) {
    const e = erroCampo(c, f[c.chave]);
    if (e) erros.push(`${c.rotulo}: ${e}`);
  }
  const itens = f[cfg.colecao];
  if (!itens.length) erros.push(`Adicione pelo menos um(a) ${cfg.nomeItem.toLowerCase()}.`);
  for (const item of itens) {
    const prefixo = `${cfg.nomeItem} ${item.numero}`;
    for (const c of cfg.camposItem) {
      const e = erroCampo(c, item[c.chave]);
      if (e) erros.push(`${prefixo} · ${c.rotulo}: ${e}`);
    }
    for (const e of cfg.errosItem(item)) erros.push(`${prefixo}: ${e}`);
  }
  erros.push(...(cfg.errosFicha?.(f, parametros) ?? []));
  return erros;
}

// ---------- Montagem do JSON final (formato dos schemas) ----------

function limparItem(cfg, item) {
  const saida = { numero: item.numero };
  for (const c of cfg.camposItem) {
    const v = item[c.chave];
    if (c.tipo === 'fotos') {
      if (v?.length) saida.fotos = v.map((foto) => ({ ...foto }));
    } else if (c.tipo === 'texto') {
      if (!vazio(v)) saida[c.chave] = v.trim();
    } else if (c.tipo === 'espuma') {
      saida.espuma = v.presente && ehInteiro(v.intensidade) ? { presente: true, intensidade: v.intensidade } : { presente: v.presente };
    } else if (v != null) {
      saida[c.chave] = structuredClone(v);
    }
  }
  return saida;
}

export function documentoFinal(registro, parametros) {
  const cfg = FICHAS[registro.tipo];
  const f = registro.ficha;
  const identificacao = {};
  for (const c of cfg.identificacao) if (!vazio(f.identificacao[c.chave])) identificacao[c.chave] = f.identificacao[c.chave].trim();

  const doc = {
    tipo_ficha: f.tipo_ficha,
    metadados: { ...f.metadados },
    identificacao,
  };
  for (const c of cfg.camposFicha ?? []) doc[c.chave] = f[c.chave];
  doc[cfg.colecao] = f[cfg.colecao].map((item) => limparItem(cfg, item));

  const resultados = { ...cfg.calcular(f, parametros) };
  if (registro.tipo === 'cq_infestacao_final_broca') {
    delete resultados.status_calculado;
    doc.status_liberacao_corte = statusLiberacao(f, parametros);
    if (doc.status_liberacao_corte.endsWith('_por_parecer_pda')) {
      const p = f.parecer_pda;
      doc.parecer_pda = { responsavel: p.responsavel.trim(), data: p.data, decisao: p.decisao, justificativa: p.justificativa.trim() };
    }
  }
  doc.resultados = resultados;
  if (!vazio(f.observacoes)) doc.observacoes = f.observacoes.trim();
  return doc;
}
