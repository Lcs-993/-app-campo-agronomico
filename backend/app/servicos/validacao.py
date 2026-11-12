"""Reaproveita o validador do repositório (scripts/validar_fichas.py): mesmos schemas e regras do app."""

import sys

from ..config import RAIZ_REPO

sys.path.insert(0, str(RAIZ_REPO / "scripts"))

from validar_fichas import validar  # noqa: E402

__all__ = ["validar"]
