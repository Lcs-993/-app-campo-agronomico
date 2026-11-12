import copy
import json
import sys
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "scripts"))

from validar_fichas import validar  # noqa: E402

EXEMPLOS = RAIZ / "schemas" / "exemplos"


def carregar(nome):
    return json.loads((EXEMPLOS / nome).read_text(encoding="utf-8"))


class TestExemplos(unittest.TestCase):
    def test_todos_os_exemplos_sao_validos(self):
        for arquivo in sorted(EXEMPLOS.glob("*.json")):
            with self.subTest(arquivo=arquivo.name):
                self.assertEqual(validar(carregar(arquivo.name)), [])


class TestPragasSolo(unittest.TestCase):
    def setUp(self):
        self.ficha = carregar("pragas-solo.json")

    def test_brocados_maior_que_examinados(self):
        self.ficha["pontos"][0]["tocos_brocados"] = 11
        self.assertTrue(any("tocos brocados" in e for e in validar(self.ficha)))

    def test_bloco_obrigatorio(self):
        del self.ficha["identificacao"]["bloco"]
        self.assertTrue(any("bloco" in e for e in validar(self.ficha)))

    def test_contagem_negativa(self):
        self.ficha["pontos"][0]["migdolus"]["larva"] = -1
        self.assertNotEqual(validar(self.ficha), [])

    def test_alerta_critico_sem_praga_critica(self):
        self.ficha["pontos"][0]["sphenophorus_levis"] = {"larva": 0, "pupa": 0, "adulto": 0}
        erros = validar(self.ficha)
        self.assertTrue(any("alerta_pragas_criticas" in e for e in erros))

    def test_percentual_errado(self):
        self.ficha["resultados"]["percentual_tocos_brocados"] = 20.0
        self.assertTrue(any("percentual_tocos_brocados" in e for e in validar(self.ficha)))


class TestCigarrinha(unittest.TestCase):
    def setUp(self):
        self.ficha = carregar("cigarrinha-raiz.json")

    def test_intensidade_sem_espuma(self):
        self.ficha["pontos"][1]["espuma"] = {"presente": False, "intensidade": 2}
        self.assertNotEqual(validar(self.ficha), [])

    def test_intensidade_fora_da_escala(self):
        self.ficha["pontos"][0]["espuma"]["intensidade"] = 4
        self.assertNotEqual(validar(self.ficha), [])

    def test_metros_zero(self):
        self.ficha["pontos"][0]["metros_lineares"] = 0
        self.assertNotEqual(validar(self.ficha), [])

    def test_nde_vem_dos_parametros(self):
        parametros = carregar("parametros-pda.json")
        parametros["cigarrinha_raiz"]["nde_ninfas_por_metro"] = 2.0
        erros = validar(self.ficha, parametros)
        self.assertTrue(any("acima_nde" in e for e in erros))


class TestCQ(unittest.TestCase):
    def setUp(self):
        self.ficha = carregar("cq-infestacao-final-broca.json")

    def _com_danificados(self, a1, a2):
        ficha = copy.deepcopy(self.ficha)
        ficha["amostras"][0]["entrenos_danificados"] = a1
        ficha["amostras"][1]["entrenos_danificados"] = a2
        del ficha["resultados"]
        return ficha

    def test_danificados_maior_que_totais(self):
        ficha = self._com_danificados(121, 0)
        self.assertTrue(any("entrenós danificados" in e for e in validar(ficha)))

    def test_ate_3_pct_liberado(self):
        ficha = self._com_danificados(4, 3)  # 2,8%
        ficha["status_liberacao_corte"] = "liberado"
        self.assertEqual(validar(ficha), [])

    def test_acima_5_pct_tem_que_bloquear(self):
        ficha = self._com_danificados(10, 6)  # 6,4%
        ficha["status_liberacao_corte"] = "alerta"
        self.assertTrue(any("esperado 'bloqueado'" in e for e in validar(ficha)))

    def test_parecer_pda_obrigatorio(self):
        ficha = self._com_danificados(10, 6)
        ficha["status_liberacao_corte"] = "liberado_por_parecer_pda"
        self.assertTrue(any("parecer_pda" in e for e in validar(ficha)))

    def test_liberacao_com_parecer(self):
        ficha = self._com_danificados(10, 6)
        ficha["status_liberacao_corte"] = "liberado_por_parecer_pda"
        ficha["parecer_pda"] = {
            "responsavel": "Eng. Agr. Ana Lima",
            "data": "2026-11-13",
            "decisao": "liberar",
            "justificativa": "Corte antecipado para reduzir perdas.",
        }
        self.assertEqual(validar(ficha), [])

    def test_parecer_so_para_talhao_bloqueado(self):
        self.ficha["status_liberacao_corte"] = "liberado_por_parecer_pda"
        self.ficha["parecer_pda"] = {
            "responsavel": "Eng. Agr. Ana Lima",
            "data": "2026-11-13",
            "decisao": "liberar",
            "justificativa": "x",
        }
        self.assertTrue(any("só se aplica a talhão bloqueado" in e for e in validar(self.ficha)))

    def test_foto_sem_gps(self):
        del self.ficha["amostras"][0]["fotos"][0]["geolocalizacao"]
        self.assertNotEqual(validar(self.ficha), [])


if __name__ == "__main__":
    unittest.main()
