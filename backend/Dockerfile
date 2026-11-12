# Imagem da API. Construída a partir da raiz do repositório (ver docker-compose.yml),
# porque reaproveita schemas/, scripts/validar_fichas.py e app/parametros-pda.json.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 RAIZ_REPO=/srv PASTA_FOTOS=/dados/fotos
WORKDIR /srv/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY schemas /srv/schemas
COPY scripts /srv/scripts
COPY app/parametros-pda.json /srv/app/parametros-pda.json
COPY backend/app ./app
COPY backend/migracoes ./migracoes

RUN useradd --system --uid 1000 campo && mkdir -p /dados/fotos && chown -R campo /dados
USER campo
EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers"]
