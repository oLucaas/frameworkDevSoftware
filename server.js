const express = require('express');
const { v4: uuidv4 } = require('uuid'); // Para gerar códigos únicos
const app = express();
const PORT = 3000;

// Middleware para analisar o corpo das requisições JSON
app.use(express.json());

// --- SIMULAÇÃO DE BANCO DE DADOS (In-Memory) ---
// Dicionário para armazenar o estado das contas: {id_conta: saldo}
const ACCOUNTS = {
    "ACC12345": 1500.00,
    "ACC67890": 500.00,
    "ACC99999": 10000.00
};

// Dicionário para rastrear transações por Idempotency-Key
const PROCESSED_KEYS = {};
// Dicionário para armazenar o registro completo das transações
const TRANSACTIONS = {};

// --- ENDPOINT PRINCIPAL: TRANSFERÊNCIA FINANCEIRA ---
app.post('/api/v1/transfers', (req, res) => {
    // 1. Obter a Chave de Idempotência do cabeçalho
    const idempotencyKey = req.header('Idempotency-Key');

    if (!idempotencyKey) {
        return res.status(400).json({ 
            status: "ERROR", 
            message: "O cabeçalho 'Idempotency-Key' é obrigatório." 
        });
    }

    // 2. Verificar Idempotência (Prevenção de Duplicação)
    if (PROCESSED_KEYS[idempotencyKey]) {
        console.log(`Alerta: Tentativa de duplicação detectada para Chave: ${idempotencyKey}`);
        // Retorna a resposta da transação original (Status 202 - Accepted)
        return res.status(202).json(PROCESSED_KEYS[idempotencyKey]); 
    }

    try {
        const { sender_account_id, receiver_account_id, amount } = req.body;
        
        // 3. Validação Básica dos Campos
        if (!sender_account_id || !receiver_account_id || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ 
                status: "ERROR", 
                message: "Dados de transação inválidos. Verifique as contas e o valor." 
            });
        }

        // --- INÍCIO DA VALIDAÇÃO DE NEGÓCIO ---
        // 4. Validação de Contas e Auto-Transferência
        if (!ACCOUNTS.hasOwnProperty(sender_account_id) || !ACCOUNTS.hasOwnProperty(receiver_account_id)) {
            return res.status(400).json({ status: "ERROR", code: "INVALID_ACCOUNT", message: "Uma ou ambas as contas não são válidas." });
        }
        
        if (sender_account_id === receiver_account_id) {
             return res.status(400).json({ status: "ERROR", code: "SELF_TRANSFER", message: "Transferência para a mesma conta não é permitida." });
        }

        // 5. Validação de Saldo (CRUCIAL)
        const currentBalance = ACCOUNTS[sender_account_id];
        if (currentBalance < amount) {
            // Salva o erro na chave de idempotência para garantir que a chave seja usada
            PROCESSED_KEYS[idempotencyKey] = { status: "ERROR", code: "INSUFFICIENT_FUNDS", message: "Saldo insuficiente." };
            return res.status(400).json(PROCESSED_KEYS[idempotencyKey]);
        }

        // --- 6. EXECUÇÃO DA TRANSAÇÃO (Simulação de Bloco Atômico) ---
        
        // Geração do Código Único da Operação (Usamos a versão curta do UUID)
        const transactionId = "TRX-" + uuidv4().split('-')[0].toUpperCase();
        
        // Movimentação dos saldos
        ACCOUNTS[sender_account_id] -= amount;
        ACCOUNTS[receiver_account_id] += amount;
        
        const timestamp = new Date().toISOString();

        // 7. Registro da Transação Completa
        const transactionRecord = {
            transaction_id: transactionId,
            sender_id: sender_account_id,
            receiver_id: receiver_account_id,
            amount: amount,
            timestamp: timestamp,
            status: "COMPLETED"
        };
        TRANSACTIONS[transactionId] = transactionRecord;
        // 8. Preparação da Resposta Confiável ao Cliente
        const responseBody = {
            status: "SUCCESS",
            message: "Transferência realizada com sucesso.",
            transaction_id: transactionId,
            new_sender_balance: ACCOUNTS[sender_account_id],
            timestamp: timestamp
        };
        // 9. Armazenar a resposta para o Idempotency-Key
        PROCESSED_KEYS[idempotencyKey] = responseBody;
        
        return res.status(201).json(responseBody); // 201 Created

    } catch (e) {
        console.error("Erro interno do servidor:", e);
        return res.status(500).json({ status: "ERROR", message: "Erro interno do servidor." });
    }
});

// Endpoint auxiliar para verificar saldos (para teste)
app.get('/api/v1/balance/:accountId', (req, res) => {
    const accountId = req.params.accountId;
    if (ACCOUNTS.hasOwnProperty(accountId)) {
        return res.status(200).json({ account_id: accountId, balance: ACCOUNTS[accountId] });
    }
    return res.status(404).json({ message: "Conta não encontrada" });
});

// Rota de Teste (Raiz) para evitar o erro "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).json({
        message: "API FastPay de Transferências está online!",
        endpoints: {
            transferir: "POST /api/v1/transfers",
            ver_saldo: "GET /api/v1/balance/{id}"
        }
    });
});

app.listen(PORT, () => {
    console.log(`Servidor Express rodando em http://localhost:${PORT}`);
    console.log("Saldos Iniciais:", ACCOUNTS);
});

// Para rodar: node server.js