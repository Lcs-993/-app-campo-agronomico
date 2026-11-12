// Cálculos e regras de negócio das fichas.
// Espelha scripts/validar_fichas.py: qualquer mudança aqui deve ser feita lá também.

export const VERSAO_SCHEMA = '1.0.0';

export const PRAGAS_SOLO = [
  { chave: 'migdolus', nome: 'Migdolus' },
  { chave: 'sphenophorus_levis', nome: 'Sphenophorus levis' },
  { chave: 'metamasius', nome: 'Metamasius' },
  { chave: 'broca_da_cana', nome: 'Broca-da-cana' },
  { chave: 'pao_de_galinha', nome: 'Pão-de-galinha' },
];

export const nomePraga = (chave) => PRAGAS_SOLO.find((p) => p.chave === chave)?.nome ?? chave;

const r2 = (n) => Math.round(n * 100) / 100;
const soma = (lista, fn) => lista.reduce((t, x) => t + (fn(x) ?? 0), 0);
const totalEstagios = (c) => (c ? (c.larva || 0) + (c.pupa || 0) + (c.adulto || 0) : 0);
export const ehInteiro = (v) => Number.isInteger(v);
export const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------- Pragas do solo ----------

export function calcularPragasSolo(ficha, parametros) {
  const pontos = ficha.pontos.filter((p) => ehInteiro(p.tocos_examinados) && p.tocos_examinados > 0);
  const examinados = soma(pontos, (p) => p.tocos_examinados);
  const brocados = soma(pontos, (p) => p.tocos_brocados);
  const criticas = parametros.pragas_solo.pragas_criticas.filter((praga) =>
    ficha.pontos.some((p) => totalEstagios(p[praga]) > 0),
  );
  return {
    total_tocos_examinados: examinados,
    total_tocos_brocados: brocados,
    percentual_tocos_brocados: examinados ? r2((brocados / examinados) * 100) : null,
    alerta_pragas_criticas: criticas.length > 0,
    pragas_criticas_detectadas: criticas,
  };
}

/** Pontos onde cada praga crítica apareceu: { sphenophorus_levis: [1, 3] } */
export function pontosComPragasCriticas(ficha, parametros) {
  const r = {};
  for (const praga of parametros.pragas_solo.pragas_criticas) {
    const pts = ficha.pontos.filter((p) => totalEstagios(p[praga]) > 0).map((p) => p.numero);
    if (pts.length) r[praga] = pts;
  }
  return r;
}

export function errosPontoPragasSolo(p) {
  const e = [];
  if (ehInteiro(p.tocos_examinados) && ehInteiro(p.tocos_brocados) && p.tocos_brocados > p.tocos_examinados) {
    e.push(`Tocos brocados (${p.tocos_brocados}) maior que tocos examinados (${p.tocos_examinados}).`);
  }
  return e;
}

// ---------- Cigarrinha-da-raiz ----------

export function calcularCigarrinha(ficha, parametros) {
  const pontos = ficha.pontos.filter((p) => ehNumero(p.metros_lineares) && p.metros_lineares > 0);
  const metros = soma(pontos, (p) => p.metros_lineares);
  const ninfas = soma(pontos, (p) => p.ninfas);
  const adultos = soma(pontos, (p) => p.adultos);
  const nde = parametros.cigarrinha_raiz.nde_ninfas_por_metro;
  const ninfasM = metros ? r2(ninfas / metros) : null;
  let fase = 'sem_ocorrencia';
  if (ninfas || adultos) fase = ninfas === adultos ? 'empate' : ninfas > adultos ? 'ninfa' : 'adulto';
  return {
    total_metros: r2(metros),
    total_ninfas: ninfas,
    total_adultos: adultos,
    ninfas_por_metro: ninfasM,
    nde_referencia: nde,
    acima_nde: ninfasM != null && ninfasM > nde,
    fase_predominante: fase,
  };
}

// ---------- CQ: índice de infestação final da broca ----------

export function statusAutomatico(indice, limiteAlerta, limiteBloqueio) {
  if (indice > limiteBloqueio) return 'bloqueado';
  if (indice > limiteAlerta) return 'alerta';
  return 'liberado';
}

export function calcularCQ(ficha, parametros) {
  const amostras = ficha.amostras.filter((a) => ehInteiro(a.entrenos_totais) && a.entrenos_totais > 0);
  const totais = soma(amostras, (a) => a.entrenos_totais);
  const danificados = soma(amostras, (a) => a.entrenos_danificados);
  const { limite_alerta_pct: alerta, limite_bloqueio_pct: bloqueio } = parametros.cq_infestacao_final_broca;
  const indice = totais ? r2((danificados / totais) * 100) : null;
  return {
    total_entrenos: totais,
    total_entrenos_danificados: danificados,
    indice_infestacao_pct: indice,
    limite_alerta_pct: alerta,
    limite_bloqueio_pct: bloqueio,
    status_calculado: indice == null ? null : statusAutomatico(indice, alerta, bloqueio),
  };
}

export function errosAmostraCQ(a) {
  const e = [];
  if (ehInteiro(a.entrenos_totais) && ehInteiro(a.entrenos_danificados) && a.entrenos_danificados > a.entrenos_totais) {
    e.push(`Entrenós danificados (${a.entrenos_danificados}) maior que entrenós totais (${a.entrenos_totais}).`);
  }
  return e;
}

const CAMPOS_PARECER = ['responsavel', 'data', 'decisao', 'justificativa'];

export function parecerPreenchido(parecer) {
  return !!parecer && CAMPOS_PARECER.every((c) => typeof parecer[c] === 'string' && parecer[c].trim());
}

export function parecerIniciado(parecer) {
  return !!parecer && CAMPOS_PARECER.some((c) => typeof parecer[c] === 'string' && parecer[c].trim());
}

/** Status final da ficha de CQ, considerando o parecer do PDA quando o talhão está bloqueado. */
export function statusLiberacao(ficha, parametros) {
  const { status_calculado: status } = calcularCQ(ficha, parametros);
  if (status === 'bloqueado' && parecerPreenchido(ficha.parecer_pda)) {
    return ficha.parecer_pda.decisao === 'liberar' ? 'liberado_por_parecer_pda' : 'reprovado_por_parecer_pda';
  }
  return status;
}
