from fastapi import Request


def conexao(request: Request):
    """Uma conexão do pool por requisição."""
    with request.app.state.pool.connection() as conn:
        yield conn
