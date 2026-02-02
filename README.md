# 🧠 SIPP-BIM – Simulador Interativo de Precificação de Projetos e Serviços BIM

O **SIPP-BIM** é uma ferramenta desenvolvida pela RBIM Consultoria para ajudar profissionais da construção civil a **simular o valor justo de projetos BIM**, com base em **hora técnica** ou **metro quadrado**, usando fontes oficiais como CAIXA, Sinduscon, CREA e editais reais.

---

## 🚀 Funcionalidades
- Simulação por **hora técnica personalizada**
- Cálculo por **m² com base no CUB regional**
- Escolha de perfis profissionais (Júnior, Pleno, Sênior)
- Aplicação de multiplicadores por **complexidade** e **LOD**
- Exportação em **PDF** com detalhamento do cálculo
- Interface limpa e didática, pronta para testes e melhorias

---

## 🧮 Fórmulas

**Por hora técnica:**
Valor Total = Σ(Valor/Hora do Perfil × Horas Alocadas × Multiplicador Complexidade × Multiplicador LOD)

**Por M2 (R$/m²):**
Valor Total = Área × Valor CUB × Percentual Projeto × Multiplicador Complexidade × Multiplicador LOD

---

## 🔐 Sistema de Autenticação (SIPP-BIM LAB)

Esta versão inclui um sistema profissional de autenticação e gerenciamento de usuários:

### Funcionalidades
- **Cadastro de usuários** com validação de email, senha segura (bcrypt) e campos personalizados
- **Login seguro** com sessão persistente (JWT)
- **Dashboard administrativo** com estatísticas e gráficos
- **Rastreamento de acessos** por usuário
- **Exportação de dados** para CSV
- **Notificações automáticas** para novos cadastros

### Tecnologias
- Frontend: React 19, Tailwind CSS 4, shadcn/ui
- Backend: Express 4, tRPC 11
- Banco de dados: MySQL/TiDB com Drizzle ORM

### Desenvolvimento
```bash
pnpm install
pnpm db:push
pnpm dev
pnpm test
```

---

## 🧠 Desenvolvido por
**Rodrigues Lopes de Oliveira**  
Diretor Técnico BIM da RBIM Consultoria  
[rbim.com.br](https://rbim.com.br) | [LinkedIn](https://linkedin.com/in/rodrigueslope)



