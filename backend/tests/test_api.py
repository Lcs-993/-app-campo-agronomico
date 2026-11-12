"""Testes da API contra um PostgreSQL/PostGIS de verdade.

ATENÇÃO: o banco de TEST_DATABASE_URL é APAGADO no início dos testes. Nunca aponte para o banco real.

    docker compose up -d banco
    TEST_DATABASE_URL=postgresql://campo:campo@localhost:5432/campo_teste python -m unittest discover -s tests -v

Sem TEST_DATABASE_URL os testes são pulados.
"""

import copy
import json
import os
import shutil
import tempfile
import unittest
import uuid
from pathlib import Path

import psycopg

URL = os.environ.get("TEST_DATABASE_URL")
RAIZ = Path(__file__).resolve().parents[2]
EXEMPLOS = RAIZ / "schemas" / "exemplos"
TALHOES = RAIZ / "tests" / "fixtures" / "pol_talhoes.geojson"
CHAVE = "chave-de-teste"
CHAVE_LEITURA = "leitura-de-teste"
AUT = {"Authorization": f"Bearer {CHAVE}"}
PNG = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf"
                    "c0f01f0005000201a5d1f6e00000000049454e44ae426082")


def exemplo(nome):
    return json.loads((EXEMPLOS / nome).read_text(encoding="utf-8"))


def no_th1(doc, deslocamento=0.0):
    """Coloca a ficha no talhão TH-1 da fixture (fid 101), com id novo."""
    doc = copy.deepcopy(doc)
    doc["metadados"]["id"] = str(uuid.uuid4())
    doc["identificacao"].update(fazenda="9001-FAZENDA TESTE", talhao="TH-1", talhao_fid=101)
    itens = doc.get("pontos") or doc.get("amostras")
    for i, item in enumerate(itens):
        item["geolocalizacao"].update(latitude=-21.1784 + i * 0.0003, longitude=-47.8102 + deslocamento)
        for foto in item.get("fotos", []):
            foto["id"] = str(uuid.uuid4())
            foto["geolocalizacao"].update(latitude=-21.1784, longitude=-47.8102)
    return doc


@unittest.skipUnless(URL, "defina TEST_DATABASE_URL (banco descartável com PostGIS) para rodar")
class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient

        from app.config import Config
        from app.main import criar_app
        from app.servicos.talhoes import importar_talhoes

        with psycopg.connect(URL, autocommit=True) as conn:
            conn.execute("DROP SCHEMA public CASCADE")
            conn.execute("CREATE SCHEMA public")
        cls.pasta_fotos = Path(tempfile.mkdtemp(prefix="fotos-teste-"))
        config = Config(
            database_url=URL,
            pasta_fotos=cls.pasta_fotos,
            chaves_aparelhos={CHAVE: "tablet-teste"},
            cors_origens=["https://lcs-993.github.io"],
            tamanho_max_foto_mb=0.01,
        )
        cls.cliente = TestClient(criar_app(config))
        cls.cliente.__enter__()  # roda as migrações e semeia os parâmetros
        with cls.cliente.app.state.pool.connection() as conn:
            importar_talhoes(conn, json.loads(TALHOES.read_text(encoding="utf-8")))

    @classmethod
    def tearDownClass(cls):
        cls.cliente.__exit__(None, None, None)
        shutil.rmtree(cls.pasta_fotos, ignore_errors=True)

    def enviar(self, *fichas, cabecalhos=AUT):
        resp = self.cliente.post("/api/v1/sync/fichas", json={"fichas": list(fichas)}, headers=cabecalhos)
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()["resultados"]

    def camada(self, nome, **params):
        resp = self.cliente.get(f"/api/v1/camadas/{nome}.geojson", params=params)
        self.assertEqual(resp.status_code, 200, resp.text)
        return resp.json()

    # ---------- geral ----------

    def test_saude(self):
        self.assertEqual(self.cliente.get("/api/v1/saude").json()["ok"], True)

    def test_chave_do_aparelho(self):
        self.assertEqual(self.cliente.get("/api/v1/aparelho").status_code, 401)
        self.assertEqual(self.cliente.get("/api/v1/aparelho", headers={"Authorization": "Bearer errada"}).status_code, 401)
        self.assertEqual(self.cliente.get("/api/v1/aparelho", headers=AUT).json()["aparelho"], "tablet-teste")
        resp = self.cliente.post("/api/v1/sync/fichas", json={"fichas": []})
        self.assertEqual(resp.status_code, 401)

    def test_parametros_vigentes(self):
        self.assertEqual(self.cliente.get("/api/v1/parametros-pda").json()["cigarrinha_raiz"]["nde_ninfas_por_metro"], 1.0)

    def test_cors_libera_o_app_publicado(self):
        resp = self.cliente.options("/api/v1/sync/fichas", headers={
            "Origin": "https://lcs-993.github.io", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type"})
        self.assertEqual(resp.headers.get("access-control-allow-origin"), "https://lcs-993.github.io")

    # ---------- sincronização ----------

    def test_recebe_as_tres_fichas_e_reenvio_nao_duplica(self):
        fichas = [no_th1(exemplo(n)) for n in ("pragas-solo.json", "cigarrinha-raiz.json", "cq-infestacao-final-broca.json")]
        primeira = self.enviar(*fichas)
        self.assertEqual([r["situacao"] for r in primeira], ["gravada"] * 3, primeira)
        self.assertTrue(all(r["avisos"] == [] for r in primeira), primeira)
        segunda = self.enviar(*fichas)
        self.assertEqual([r["situacao"] for r in segunda], ["ja_recebida"] * 3)
        with self.cliente.app.state.pool.connection() as conn:
            n = conn.execute("SELECT count(*) AS n FROM fichas WHERE id = ANY(%s)",
                             ([uuid.UUID(f["metadados"]["id"]) for f in fichas],)).fetchone()["n"]
        self.assertEqual(n, 3)

    def test_mesma_id_com_conteudo_diferente_e_conflito(self):
        ficha = no_th1(exemplo("cigarrinha-raiz.json"))
        self.assertEqual(self.enviar(ficha)[0]["situacao"], "gravada")
        ficha["observacoes"] = "alterada depois de enviada"
        r = self.enviar(ficha)[0]
        self.assertEqual(r["situacao"], "conflito")

    def test_ficha_invalida_nao_impede_as_outras(self):
        ruim = no_th1(exemplo("pragas-solo.json"))
        ruim["pontos"][0]["tocos_brocados"] = 999
        boa = no_th1(exemplo("pragas-solo.json"))
        r = self.enviar(ruim, boa, {"sem": "metadados"})
        self.assertEqual([x["situacao"] for x in r], ["invalida", "gravada", "invalida"])
        self.assertTrue(any("tocos brocados" in e for e in r[0]["erros"]), r[0])

    def test_servidor_recalcula_os_resultados(self):
        ficha = no_th1(exemplo("cq-infestacao-final-broca.json"))
        ficha["resultados"]["indice_infestacao_pct"] = 1.0
        r = self.enviar(ficha)[0]
        self.assertEqual(r["situacao"], "invalida")
        self.assertTrue(any("indice_infestacao_pct" in e for e in r["erros"]))

    def test_avisos_de_localizacao(self):
        desconhecido = exemplo("pragas-solo.json")  # talhao_fid 1 não existe na fixture
        desconhecido["metadados"]["id"] = str(uuid.uuid4())
        r = self.enviar(desconhecido)[0]
        self.assertEqual(r["situacao"], "gravada")
        self.assertTrue(any("não existe nos talhões" in a for a in r["avisos"]), r)

        longe = no_th1(exemplo("cigarrinha-raiz.json"), deslocamento=0.01)  # ~1 km a leste
        r = self.enviar(longe)[0]
        self.assertEqual(r["situacao"], "gravada")
        self.assertTrue(any("fora do talhão" in a for a in r["avisos"]), r)

    def test_usa_parametros_vigentes_na_data_da_coleta(self):
        from app.db import gravar_parametros

        novos = exemplo("parametros-pda.json")
        novos.update(versao=99, vigente_desde="2030-01-01")
        novos["cigarrinha_raiz"] = {"nde_ninfas_por_metro": 9.0}
        with self.cliente.app.state.pool.connection() as conn:
            gravar_parametros(conn, novos)
        try:
            # Coleta de 2026 continua conferida com o NDE 1,0 da versão vigente na época.
            self.assertEqual(self.enviar(no_th1(exemplo("cigarrinha-raiz.json")))[0]["situacao"], "gravada")
            futura = no_th1(exemplo("cigarrinha-raiz.json"))
            futura["identificacao"]["data"] = "2030-02-01"
            r = self.enviar(futura)[0]
            self.assertEqual(r["situacao"], "invalida")
            self.assertTrue(any("nde_referencia" in e for e in r["erros"]), r)
        finally:
            with self.cliente.app.state.pool.connection() as conn:
                conn.execute("DELETE FROM parametros_pda WHERE versao = 99")

    # ---------- fotos ----------

    def test_fluxo_das_fotos(self):
        ficha = no_th1(exemplo("cq-infestacao-final-broca.json"))
        id_foto = ficha["amostras"][0]["fotos"][0]["id"]
        r = self.enviar(ficha)[0]
        self.assertEqual(r["fotos_pendentes"], [id_foto])

        url = f"/api/v1/fotos/{id_foto}"
        self.assertEqual(self.cliente.put(url, content=PNG, headers={**AUT, "Content-Type": "image/png"}).status_code, 200)
        self.assertEqual(self.enviar(ficha)[0]["fotos_pendentes"], [])
        resp = self.cliente.get(url)
        self.assertEqual((resp.status_code, resp.content, resp.headers["content-type"]), (200, PNG, "image/png"))

        fotos = self.camada("fotos", talhao_fid=101)
        alvo = [f for f in fotos["features"] if f["properties"]["foto_id"] == id_foto]
        self.assertEqual(len(alvo), 1)
        self.assertTrue(alvo[0]["properties"]["url"].endswith(url))

    def test_fotos_recusadas(self):
        ficha = no_th1(exemplo("cq-infestacao-final-broca.json"))
        id_foto = ficha["amostras"][0]["fotos"][0]["id"]
        png = {**AUT, "Content-Type": "image/png"}
        self.assertEqual(self.cliente.put(f"/api/v1/fotos/{id_foto}", content=PNG, headers=png).status_code, 404)
        self.enviar(ficha)
        self.assertEqual(self.cliente.put(f"/api/v1/fotos/{id_foto}", content=PNG).status_code, 401)
        self.assertEqual(self.cliente.put(f"/api/v1/fotos/{id_foto}", content=b"x",
                                          headers={**AUT, "Content-Type": "text/plain"}).status_code, 415)
        grande = b"0" * 20000  # limite do teste: 0,01 MB
        self.assertEqual(self.cliente.put(f"/api/v1/fotos/{id_foto}", content=grande, headers=png).status_code, 413)
        self.assertEqual(self.cliente.get(f"/api/v1/fotos/{id_foto}").status_code, 404)
        self.assertEqual(list(self.pasta_fotos.glob(".*parcial")), [])

    # ---------- camadas ----------

    def test_camadas_geojson(self):
        ficha = no_th1(exemplo("pragas-solo.json"))
        ficha["identificacao"]["data"] = "2026-10-05"
        self.enviar(ficha)
        nomes = [c["nome"] for c in self.cliente.get("/api/v1/camadas").json()]
        self.assertIn("talhoes_cq_broca", nomes)

        pontos = self.camada("pontos_pragas_solo", de="2026-10-05", ate="2026-10-05")
        self.assertEqual(pontos["type"], "FeatureCollection")
        self.assertEqual(len(pontos["features"]), len(ficha["pontos"]))
        props = pontos["features"][0]["properties"]
        self.assertEqual(pontos["features"][0]["geometry"]["type"], "Point")
        self.assertIn("pct_tocos_brocados", props)
        self.assertNotIn("amostrador", props)
        self.assertEqual(self.camada("pontos_pragas_solo", de="2026-10-05", fazenda="9001")["features"][0]["properties"]["talhao_fid"], 101)
        self.assertEqual(self.camada("pontos_pragas_solo", de="2026-10-05", ate="2026-10-05", fazenda="0000")["features"], [])
        self.assertEqual(self.cliente.get("/api/v1/camadas/nao_existe.geojson").status_code, 404)

    def test_talhao_tematico_usa_a_ficha_mais_recente(self):
        antiga = no_th1(exemplo("cq-infestacao-final-broca.json"))
        antiga["identificacao"]["data"] = "2026-11-01"
        recente = no_th1(exemplo("cq-infestacao-final-broca.json"))
        recente["identificacao"]["data"] = "2026-11-20"
        recente["amostras"][0]["entrenos_danificados"] = 1
        recente["resultados"].update(total_entrenos_danificados=5, indice_infestacao_pct=2.0)
        recente["status_liberacao_corte"] = "liberado"
        self.assertEqual([r["situacao"] for r in self.enviar(antiga, recente)], ["gravada", "gravada"])
        talhoes = self.camada("talhoes_cq_broca", talhao_fid=101)["features"]
        self.assertEqual(len(talhoes), 1)
        self.assertEqual(talhoes[0]["geometry"]["type"], "MultiPolygon")
        self.assertEqual(talhoes[0]["properties"]["status_liberacao_corte"], "liberado")
        self.assertEqual(talhoes[0]["properties"]["ficha_id"], recente["metadados"]["id"])

    def test_chave_de_leitura(self):
        config = self.cliente.app.state.config
        config.chave_leitura = CHAVE_LEITURA
        try:
            self.assertEqual(self.cliente.get("/api/v1/camadas/fotos.geojson").status_code, 401)
            self.assertEqual(self.cliente.get("/api/v1/camadas/fotos.geojson", params={"chave": CHAVE_LEITURA}).status_code, 200)
        finally:
            config.chave_leitura = ""


if __name__ == "__main__":
    unittest.main()
