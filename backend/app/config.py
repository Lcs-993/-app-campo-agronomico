"""Configuração lida das variáveis de ambiente (ver backend/.env.exemplo)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

# Raiz do repositório: o backend reaproveita schemas/, scripts/ e app/parametros-pda.json.
RAIZ_REPO = Path(os.environ.get("RAIZ_REPO", Path(__file__).resolve().parents[2]))


def _lista(valor):
    return [v.strip() for v in (valor or "").split(",") if v.strip()]


def _chaves(valor):
    """'nome:chave,nome2:chave2' -> {chave: nome}."""
    saida = {}
    for item in _lista(valor):
        nome, _, chave = item.partition(":")
        if not chave:
            raise ValueError(f"CHAVES_APARELHOS: use nome:chave (recebido {item!r})")
        saida[chave.strip()] = nome.strip()
    return saida


@dataclass
class Config:
    database_url: str = "postgresql://campo:campo@localhost:5432/campo"
    pasta_fotos: Path = Path("./dados/fotos")
    chaves_aparelhos: dict = field(default_factory=dict)
    chave_leitura: str = ""
    cors_origens: list = field(default_factory=list)
    tamanho_max_foto_mb: float = 15
    parametros_iniciais: Path = RAIZ_REPO / "app" / "parametros-pda.json"

    @classmethod
    def do_ambiente(cls):
        e = os.environ
        return cls(
            database_url=e.get("DATABASE_URL", cls.database_url),
            pasta_fotos=Path(e.get("PASTA_FOTOS", "./dados/fotos")),
            chaves_aparelhos=_chaves(e.get("CHAVES_APARELHOS")),
            chave_leitura=e.get("CHAVE_LEITURA", ""),
            cors_origens=_lista(e.get("CORS_ORIGENS", "http://localhost:8000,https://lcs-993.github.io")),
            tamanho_max_foto_mb=float(e.get("TAMANHO_MAX_FOTO_MB", "15")),
            parametros_iniciais=Path(e.get("PARAMETROS_INICIAIS", RAIZ_REPO / "app" / "parametros-pda.json")),
        )
