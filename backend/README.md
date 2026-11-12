# Backend do App de Campo

API que recebe as fichas finalizadas dos aparelhos, grava num PostgreSQL/PostGIS e publica camadas GeoJSON para o WebGIS.

Arquitetura, contrato de sincronização, camadas e o que falta para produção: **[docs/backend.md](../docs/backend.md)**.

## Início rápido

Na raiz do repositório:

```bash
cp backend/.env.exemplo backend/.env
```

```bash
docker compose up -d --build
```

```bash
docker compose exec api python -m app.cli importar-talhoes https://lcs-993.github.io/web_gis/geojson/pol_talhoes.geojson
```

- API: http://localhost:8080
- Documentação interativa: http://localhost:8080/docs
- Camadas: http://localhost:8080/api/v1/camadas

## Sem Docker (desenvolvimento)

Precisa de um PostgreSQL com PostGIS acessível.

```bash
cd backend && pip install -r requirements.txt
```

```bash
cd backend && DATABASE_URL=postgresql://campo:campo@localhost:5432/campo uvicorn app.main:app --reload --port 8080
```

## Testes

```bash
cd backend && TEST_DATABASE_URL=postgresql://campo:campo@localhost:5432/campo_teste python -m unittest discover -s tests -v
```

O banco de `TEST_DATABASE_URL` é apagado a cada execução.
