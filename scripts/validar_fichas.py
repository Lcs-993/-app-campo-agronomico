"""Valida fichas de campo contra os schemas JSON e as regras de negócio.

O JSON Schema não consegue comparar um campo com outro (ex.: tocos brocados
<= tocos examinados) nem refazer cálculos. Essas regras ficam aqui, como
referência para a implementação no app.

Uso:
    python scripts/validar_fichas.py schemas/exemplos/*.json
"""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

RAIZ = Path(__file__).resolve().parent.parent
PASTA_SCHEMAS = RAIZ / "schemas"
PARAMETROS_PADRAO = PASTA_SCHEMAS / "exemplos" / "parametros-pda.json"

SCHEMA_POR_TIPO = {
    "pragas_solo": "pragas-solo.schema.json",
    "cigarrinha_raiz": "cigarrinha-raiz.schema.json",
    "cq_infestacao_final_broca": "cq-infestacao-final-broca.schema.json",
}
SCHEMA_PARAMETROS = "parametros-pda.schema.json"
TOLERANCIA = 0.01


def _carregar_registry():
    recursos = []
    for arquivo in PASTA_SCHEMAS.glob("*.schema.json"):
        schema = json.loads(arquivo.read_text(encoding="utf-8"))
        recursos.append((schema["$id"], Resource.from_contents(schema)))
    return Registry().with_resources(recursos)


REGISTRY = _carregar_registry()


def _validador(nome_schema):
    schema = REGISTRY.contents(f"https://app-campo-agronomico/schemas/{nome_schema}")
    return Draft202012Validator(
        schema, registry=REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER
    )


def erros_schema(documento, nome_schema):
    return [
        f"{'/'.join(str(p) for p in e.absolute_path) or '(raiz)'}: {e.message}"
        for e in _validador(nome_schema).iter_errors(documento)
    ]


def _numeros_unicos(itens, rotulo):
    numeros = [i["numero"] for i in itens]
    repetidos = sorted({n for n in numeros if numeros.count(n) > 1})
    return [f"{rotulo} repetido(s): {repetidos}"] if repetidos else []


def _conferir(resultados, campo, esperado):
    """Compara um valor de 'resultados' (se informado) com o recalculado."""
    if campo not in resultados:
        return []
    informado = resultados[campo]
    if isinstance(esperado, float):
        ok = abs(informado - esperado) <= TOLERANCIA
    elif isinstance(esperado, list):
        ok = sorted(informado) == sorted(esperado)
    else:
        ok = informado == esperado
    return [] if ok else [f"resultados/{campo}: informado {informado}, calculado {esperado}"]


def calcular_pragas_solo(ficha, parametros):
    pontos = ficha["pontos"]
    examinados = sum(p["tocos_examinados"] for p in pontos)
    brocados = sum(p["tocos_brocados"] for p in pontos)
    criticas = [
        praga
        for praga in parametros["pragas_solo"]["pragas_criticas"]
        if any(sum(p[praga].values()) > 0 for p in pontos)
    ]
    return {
        "total_tocos_examinados": examinados,
        "total_tocos_brocados": brocados,
        "percentual_tocos_brocados": round(brocados / examinados * 100, 2),
        "alerta_pragas_criticas": bool(criticas),
        "pragas_criticas_detectadas": criticas,
    }


def regras_pragas_solo(ficha, parametros):
    erros = _numeros_unicos(ficha["pontos"], "número de ponto")
    for p in ficha["pontos"]:
        if p["tocos_brocados"] > p["tocos_examinados"]:
            erros.append(
                f"ponto {p['numero']}: tocos brocados ({p['tocos_brocados']}) "
                f"maior que tocos examinados ({p['tocos_examinados']})"
            )
    if not erros:
        calculado = calcular_pragas_solo(ficha, parametros)
        for campo, valor in calculado.items():
            erros += _conferir(ficha.get("resultados", {}), campo, valor)
    return erros


def calcular_cigarrinha(ficha, parametros):
    pontos = ficha["pontos"]
    metros = sum(p["metros_lineares"] for p in pontos)
    ninfas = sum(p["ninfas"] for p in pontos)
    adultos = sum(p["adultos"] for p in pontos)
    nde = parametros["cigarrinha_raiz"]["nde_ninfas_por_metro"]
    ninfas_m = round(ninfas / metros, 2)
    if ninfas == adultos == 0:
        fase = "sem_ocorrencia"
    elif ninfas == adultos:
        fase = "empate"
    else:
        fase = "ninfa" if ninfas > adultos else "adulto"
    return {
        "total_metros": float(metros),
        "total_ninfas": ninfas,
        "total_adultos": adultos,
        "ninfas_por_metro": float(ninfas_m),
        "nde_referencia": float(nde),
        "acima_nde": ninfas_m > nde,
        "fase_predominante": fase,
    }


def regras_cigarrinha(ficha, parametros):
    erros = _numeros_unicos(ficha["pontos"], "número de ponto")
    if not erros:
        calculado = calcular_cigarrinha(ficha, parametros)
        for campo, valor in calculado.items():
            erros += _conferir(ficha.get("resultados", {}), campo, valor)
    return erros


def calcular_cq(ficha, parametros):
    amostras = ficha["amostras"]
    totais = sum(a["entrenos_totais"] for a in amostras)
    danificados = sum(a["entrenos_danificados"] for a in amostras)
    limites = parametros["cq_infestacao_final_broca"]
    return {
        "total_entrenos": totais,
        "total_entrenos_danificados": danificados,
        "indice_infestacao_pct": round(danificados / totais * 100, 2),
        "limite_alerta_pct": float(limites["limite_alerta_pct"]),
        "limite_bloqueio_pct": float(limites["limite_bloqueio_pct"]),
    }


def status_automatico(indice, limite_alerta, limite_bloqueio):
    if indice > limite_bloqueio:
        return "bloqueado"
    if indice > limite_alerta:
        return "alerta"
    return "liberado"


def regras_cq(ficha, parametros):
    erros = _numeros_unicos(ficha["amostras"], "número de amostra")
    for a in ficha["amostras"]:
        if a["entrenos_danificados"] > a["entrenos_totais"]:
            erros.append(
                f"amostra {a['numero']}: entrenós danificados ({a['entrenos_danificados']}) "
                f"maior que entrenós totais ({a['entrenos_totais']})"
            )
    if erros:
        return erros

    calculado = calcular_cq(ficha, parametros)
    for campo, valor in calculado.items():
        erros += _conferir(ficha.get("resultados", {}), campo, valor)

    esperado = status_automatico(
        calculado["indice_infestacao_pct"],
        calculado["limite_alerta_pct"],
        calculado["limite_bloqueio_pct"],
    )
    status = ficha["status_liberacao_corte"]
    if status.endswith("_por_parecer_pda"):
        if esperado != "bloqueado":
            erros.append(
                f"status '{status}' só se aplica a talhão bloqueado; "
                f"II calculado indica '{esperado}'"
            )
        decisao = ficha.get("parecer_pda", {}).get("decisao")
        coerente = {"liberado_por_parecer_pda": "liberar", "reprovado_por_parecer_pda": "reprovar"}
        if decisao and decisao != coerente[status]:
            erros.append(f"parecer_pda/decisao '{decisao}' não combina com status '{status}'")
    elif status != esperado:
        erros.append(
            f"status_liberacao_corte '{status}' não corresponde ao II de "
            f"{calculado['indice_infestacao_pct']}% (esperado '{esperado}')"
        )
    return erros


REGRAS_POR_TIPO = {
    "pragas_solo": regras_pragas_solo,
    "cigarrinha_raiz": regras_cigarrinha,
    "cq_infestacao_final_broca": regras_cq,
}


def validar(documento, parametros=None):
    """Retorna a lista de erros do documento (vazia se estiver válido)."""
    tipo = documento.get("tipo_ficha")
    if tipo is None and "vigente_desde" in documento:
        return erros_schema(documento, SCHEMA_PARAMETROS)
    if tipo not in SCHEMA_POR_TIPO:
        return [f"tipo_ficha desconhecido: {tipo!r}"]

    erros = erros_schema(documento, SCHEMA_POR_TIPO[tipo])
    if erros:
        return erros
    if parametros is None:
        parametros = json.loads(PARAMETROS_PADRAO.read_text(encoding="utf-8"))
    return REGRAS_POR_TIPO[tipo](documento, parametros)


def main(caminhos):
    if not caminhos:
        print(__doc__)
        return 2
    falhou = False
    for caminho in caminhos:
        documento = json.loads(Path(caminho).read_text(encoding="utf-8"))
        erros = validar(documento)
        if erros:
            falhou = True
            print(f"INVÁLIDO  {caminho}")
            for erro in erros:
                print(f"  - {erro}")
        else:
            print(f"OK        {caminho}")
    return 1 if falhou else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
