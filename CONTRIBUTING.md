# Contribuindo para o Cyber Defense Suite

Obrigado por considerar contribuir para o Cyber Defense Suite! 🎉

## Como Contribuir

### 1. Reportando Bugs

Se você encontrou um bug, por favor abra uma issue com:

- **Título claro** descrevendo o problema
- **Passos para reproduzir** o bug
- **Comportamento esperado** vs **comportamento atual**
- **Screenshots** se aplicável
- **Informações do ambiente** (SO, Python versão, etc.)

### 2. Sugerindo Features

Para sugestões de novas funcionalidades:

1. Abra uma issue com a tag `enhancement`
2. Descreva a feature em detalhes
3. Explique por que seria útil
4. Aguarde discussão antes de implementar

### 3. Enviando Pull Requests

1. **Fork** o repositório
2. **Crie uma branch** para sua feature:
   ```bash
   git checkout -b feature/nova-feature
   ```
3. **Faça suas mudanças**
4. **Teste** localmente:
   ```bash
   python -m uvicorn app:app --reload
   ```
5. **Commit** com mensagens claras:
   ```bash
   git commit -m "Adiciona: funcionalidade X"
   ```
6. **Push** para sua branch:
   ```bash
   git push origin feature/nova-feature
   ```
7. **Abra um Pull Request**

### 4. Regras para PRs

- ✅ Código deve seguir o estilo existente
- ✅ Adicione comentários em código complexo
- ✅ Atualize a documentação se necessário
- ✅ Certifique-se que não quebra funcionalidades existentes
- ✅ Adicione tests se possível

### 5. Estrutura de Commits

Use o formato:
```
Tipo: Descrição curta

Tipos:
- feat: Nova funcionalidade
- fix: Correção de bug
- docs: Documentação
- style: Formatação (não afeta lógica)
- refactor: Refatoração de código
- test: Adição de tests
- chore: Manutenção
```

Exemplo:
```
feat: Adiciona scan de portas UDP

- Implementa scan UDP na porta 53 (DNS)
- Adiciona timeout configurável
- Atualiza documentação da API
```

## Desenvolvimento Local

### Setup

```bash
# Clone
git clone https://github.com/sucosegulas/cyber-defense-suite.git
cd cyber-defense-suite

# Ambiente virtual
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows
source .venv/bin/activate   # Linux/Mac

# Dependências
pip install -r requirements.txt

# Execute
python -m uvicorn app:app --reload
```

### Estrutura do Projeto

```
cyber-defense-suite/
├── app.py              # Aplicação principal
├── requirements.txt    # Dependências
├── templates/
│   └── index.html     # Interface web
└── README.md          # Documentação
```

## Perguntas?

Se tiver dúvidas, abra uma issue com a tag `question`.

Obrigado por contribuir! 🚀