# Sistema Web de Rodízio Interativo para Barbearia

Aplicação web local com painel touchscreen em tela cheia para o **tablet dos barbeiros** (operação por arrastar e soltar) e central de gerenciamento para o **notebook da recepção**, sincronizados em tempo real via WebSocket e persistidos localmente em banco **SQLite**.

---

## 1. Arquitetura e Funcionamento Local

O sistema opera **100% na rede local (Wi-Fi)** da barbearia, sem depender de internet ou serviços de nuvem:

- **Dispositivo 1 — Notebook da Recepção (`http://localhost:3000` / `/admin`)**:
  - Executa o servidor Node.js + Express + WebSocket (`ws`) escutando em `0.0.0.0:3000`.
  - Mantém o banco de dados oficial em disco (`data/rodizio.db` para operação real, `data/demo.db` isolado para demonstração e `data/sistema.db` para credenciais e configurações).
  - Permite direcionar clientes (pelo rodízio ou preferência), cadastrar/editar/desativar barbeiros, consultar histórico de atendimentos e auditoria, controlar turnos e gerar backups.
- **Dispositivo 2 — Tablet dos Barbeiros (`http://<IP-DO-NOTEBOOK>:3000/painel`)**:
  - Interface exclusiva de rodízio para operação por toque em modo tela cheia.
  - Duas colunas principais de igual destaque: **NA FILA** (disponíveis em ordem cronológica, com destaque `PRÓXIMO A ATENDER` para o 1º) e **TRABALHANDO** (em atendimento, com cronômetro ao vivo e identificação `RODÍZIO` ou `ESCOLHA ESPECÍFICA`).
  - Movimentação visual por **arrastar e soltar (drag-and-drop)** otimizada para touchscreen (`@dnd-kit/core` + `framer-motion`).

---

## 2. Instalação e Execução no Notebook da Recepção

### Pré-requisito
- **Node.js 22.13+** (ou Node.js 24 LTS) instalado no notebook da recepção.

### Opção A — Inicializador Rápido (Windows)
Basta dar duplo-clique no arquivo **[`INICIAR_RODIZIO.bat`](./INICIAR_RODIZIO.bat)** na pasta do projeto. Ele instala as dependências (se necessário), compila a aplicação e inicia o servidor exibindo na tela o endereço IP para o tablet.

### Opção B — Via Terminal
```bash
# 1. Instalar dependências
npm install

# 2. Compilar frontend e backend para produção
npm run build

# 3. Iniciar o servidor local (porta 3000 por padrão)
npm start
```

Durante o desenvolvimento (com recarregamento automático):
```bash
npm run dev
```

### Opção C — Docker Compose (Opcional)
```bash
docker compose up -d --build
```

---

## 3. Como Acessar pelo Tablet Android na Rede Local

1. Conecte o **notebook da recepção** e o **tablet dos barbeiros** à **mesma rede Wi-Fi**.
2. Ao iniciar o servidor no notebook, o terminal exibirá o endereço IP local (por exemplo: `http://192.168.1.100:3000`).
   - Você também pode visualizar o endereço e o **QR Code** diretamente na tela inicial do sistema clicando em **Conectar Tablet**, ou em **Administração (`/admin`) › Sistema, Rede & Backup**.
3. No navegador Chrome do tablet Android, acesse `http://<IP-DO-NOTEBOOK>:3000/painel` (ou escaneie o QR Code).
4. Toque em **ENTRAR EM TELA CHEIA** para ocultar as barras do navegador e utilizar toda a área do tablet.
5. **Dica (PWA / Atalho na Tela Inicial)**: no menu do Chrome no Android (`⋮`), toque em **"Adicionar à tela inicial"**. O ícone **Rodízio** será criado na tela inicial do tablet e abrirá diretamente em `/painel` em modo de tela cheia.

### Recomendação de Rede (Reserva de IP no Roteador)
Para que o endereço IP do notebook nunca mude quando o roteador for reiniciado:
1. Acesse o painel do roteador Wi-Fi da barbearia (ex.: `192.168.1.1` ou `192.168.0.1`).
2. Localize a seção **LAN / DHCP / Reserva de Endereço (Address Reservation)**.
3. Vincule o endereço MAC da placa Wi-Fi/Rede do notebook a um IP fixo (ex.: `192.168.1.100`).
4. Caso o Firewall do Windows exiba um aviso no primeiro início do Node.js, marque **Redes Privadas** e clique em **Permitir acesso**.

---

## 4. Regras de Negócio e Operação do Rodízio

1. **Entrada na Fila (`ESTOU DISPONÍVEL`)**:
   - Ao chegar ao trabalho, o barbeiro toca no botão **ESTOU DISPONÍVEL** (ou arrasta seu chip da faixa inferior para a coluna **NA FILA**).
   - O sistema verifica se o barbeiro está ativo, registra o horário e o posiciona **sempre no final da fila**.
2. **Início de Atendimento (`NA FILA` → `TRABALHANDO`)**:
   - Ao arrastar um card da coluna **NA FILA** para **TRABALHANDO**:
     - Se o barbeiro estava na **1ª posição**, o atendimento é registrado automaticamente como **RODÍZIO** (`ROTATION`).
     - Se estava em **qualquer outra posição (2º, 3º...)**, o atendimento é registrado como **ESCOLHA ESPECÍFICA** (`SPECIFIC`), preservando a ordem relativa dos demais profissionais na fila.
3. **Finalização de Atendimento (`TRABALHANDO` → `NA FILA`)**:
   - Ao arrastar um card de **TRABALHANDO** para **NA FILA**, o sistema encerra o atendimento, grava o horário de término, calcula a duração em segundos e insere o profissional **obrigatoriamente na última posição da fila**, independentemente do ponto visual onde o card foi solto.
4. **Proibição de Reordenação Manual**:
   - Não é permitido alterar manualmente a prioridade dentro da coluna **NA FILA**.
5. **Pausa e Fora do Expediente**:
   - Disponíveis no menu de cada card (`⋮`) ou pela recepção. Entrar em pausa retira o profissional da fila; ao retornar da pausa, ele entra no final da fila.
6. **Confirmação Transacional e Desfazer Seguro**:
   - Nenhuma movimentação é confirmada sem validação prévia do backend e gravação transacional no SQLite.
   - Um botão **DESFAZER** fica disponível por tempo configurável (padrão: 90s) para reverter esbarrões acidentais, restaurando inclusive a posição original na fila — e é bloqueado automaticamente caso outras movimentações já tenham ocorrido depois.

---

## 5. Modo Demonstração Comercial (`/demo`)

Para apresentar o sistema ao proprietário da barbearia sem tocar nos dados reais:
- Acesse `http://localhost:3000/demo` (ou ative em **Administração › Sistema**).
- O sistema alterna para o banco isolado `data/demo.db` já povoado com **6 barbeiros fictícios**:
  - **Na fila**: 1º João, 2º Carlos, 3º Pedro, 4º Marcos.
  - **Em pausa**: Rafael.
  - **Fora do expediente**: Lucas.
- Todas as operações (arrastar no tablet, preferência, pausa, tela cheia, sincronização simultânea entre notebook e tablet) funcionam normalmente.
- O botão **REINICIAR DEMONSTRAÇÃO** restaura instantaneamente o estado inicial dos 6 barbeiros fictícios em todos os dispositivos conectados.

---

## 6. Segurança, Persistência e Backups

- **PIN Administrativo**: as rotas `/api/admin/*` exigem autenticação por token HMAC obtido via login com PIN (armazenado com hash `scrypt` e proteção contra força bruta). O PIN inicial padrão é `1234` e pode ser alterado em **Administração › Sistema**.
- **Durabilidade SQLite**: configurado com `PRAGMA journal_mode = WAL`, `PRAGMA synchronous = FULL` e índices únicos parciais no próprio banco que impedem duplicidade na fila ou dois atendimentos simultâneos para o mesmo profissional.
- **Recuperação Automática**: ao iniciar, o servidor executa `PRAGMA integrity_check` e reconcilia eventuais estados órfãos após queda de energia.
- **Backups (`VACUUM INTO`)**:
  - Backups automáticos são gerados em `data/backups/` na inicialização, a cada 6 horas, ao encerrar um turno e no encerramento seguro (`Ctrl+C`).
  - Backup manual pela interface: **Administração › Sistema, Rede & Backup › Criar Backup Agora** (com download direto do arquivo `.db`).
  - Backup manual via linha de comando: `npm run backup` (ou duplo-clique em `FAZER_BACKUP.bat`).

---

## 7. Testes Automatizados

```bash
# Testes de unidade e integração do backend (regras de rodízio, transações, recuperação, API e WebSocket)
npm test

# Teste End-to-End (Playwright) simulando Notebook + Tablet Android com gestos de toque reais (Testes 1 a 9)
npm run test:e2e
```

