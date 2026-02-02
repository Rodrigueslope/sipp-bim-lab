# SIPP-BIM LAB - Sistema de Autenticação

## Funcionalidades

- [x] Sistema de cadastro de usuários com validação de email, senha segura (bcrypt) e campos personalizados (nome, telefone, região/estado)
- [x] Área de login com autenticação via email e senha, proteção de rotas e sessão persistente
- [x] Dashboard administrativo para visualizar todos os usuários cadastrados com informações de criação de conta e último acesso
- [x] Painel de estatísticas mostrando total de usuários cadastrados, novos cadastros por período e usuários ativos
- [x] Integração com o simulador SIPP-BIM existente, redirecionando usuários autenticados para o index.html original
- [x] Sistema de rastreamento de acessos registrando data/hora de cada login do usuário
- [x] Página de perfil do usuário permitindo visualizar e editar informações pessoais
- [x] Exportação de dados de usuários para Excel/CSV para análise administrativa
- [x] Enviar notificação automática por email ao administrador sempre que um novo usuário criar conta no sistema
