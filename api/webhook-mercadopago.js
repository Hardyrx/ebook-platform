const crypto = require("crypto");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

const PRODUCTS = {
  "97.90": {
    id: "fcdd57c5-05e8-4617-9256-f18acb888a0",
    slug: "r1000-reais-por-dia",
  },

  "199.90": {
    id: "513095ae-0a1b-47d3-8595-615b059947c7",
    slug: "r1000-reais-por-dia-agente",
  },
};

function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

function verifyMercadoPagoSignature(req) {
  if (!MERCADOPAGO_WEBHOOK_SECRET) {
    return false;
  }

  const xSignature = req.headers["x-signature"];
  const xRequestId = req.headers["x-request-id"];

  if (!xSignature || !xRequestId) {
    return false;
  }

  const parts = xSignature.split(",");

  let ts = null;
  let v1 = null;

  for (const part of parts) {
    const [key, value] = part.split("=");

    if (key === "ts") {
      ts = value;
    }

    if (key === "v1") {
      v1 = value;
    }
  }

  if (!ts || !v1) {
    return false;
  }

  const dataId =
    req.body?.data?.id ||
    req.query?.["data.id"] ||
    req.query?.id;

  if (!dataId) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const generatedSignature = crypto
    .createHmac("sha256", MERCADOPAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest("hex");

  if (generatedSignature.length !== v1.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(generatedSignature),
    Buffer.from(v1)
  );
}

async function getPayment(paymentId) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao consultar pagamento ${paymentId}: ${response.status} ${text}`
    );
  }

  return response.json();
}

async function findUserByEmail(email) {
  const response = await supabaseRequest(
    "/auth/v1/admin/users?per_page=1000"
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao consultar usuários do Supabase: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  const users = data.users || [];

  return (
    users.find(
      user =>
        user.email &&
        user.email.toLowerCase() === email.toLowerCase()
    ) || null
  );
}

async function findExistingPurchase(paymentId) {
  const response = await supabaseRequest(
    `/rest/v1/purchases?mp_payment_id=eq.${encodeURIComponent(
      String(paymentId)
    )}&select=id&limit=1`
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao consultar compra existente: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  return data[0] || null;
}

async function createPurchase({
  userId,
  productId,
  paymentId,
  preferenceId,
  amount,
  status,
}) {
  const response = await supabaseRequest("/rest/v1/purchases", {
    method: "POST",

    headers: {
      Prefer: "return=representation",
    },

    body: JSON.stringify({
      user_id: userId,
      product_id: productId,
      mp_payment_id: String(paymentId),
      mp_preference_id: preferenceId
        ? String(preferenceId)
        : null,
      amount,
      status,
    }),
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao criar purchase: ${response.status} ${text}`
    );
  }

  return response.json();
}

async function findEntitlement(userId, productId) {
  const response = await supabaseRequest(
    `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(
      userId
    )}&product_id=eq.${encodeURIComponent(
      productId
    )}&select=id,active&limit=1`
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao consultar entitlement: ${response.status} ${text}`
    );
  }

  const data = await response.json();

  return data[0] || null;
}

async function activateEntitlement(userId, productId) {
  const existing = await findEntitlement(
    userId,
    productId
  );

  if (existing) {
    const response = await supabaseRequest(
      `/rest/v1/entitlements?id=eq.${encodeURIComponent(
        existing.id
      )}`,
      {
        method: "PATCH",

        headers: {
          Prefer: "return=representation",
        },

        body: JSON.stringify({
          active: true,
          revoked_at: null,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();

      throw new Error(
        `Erro ao reativar entitlement: ${response.status} ${text}`
      );
    }

    return;
  }

  const response = await supabaseRequest(
    "/rest/v1/entitlements",
    {
      method: "POST",

      headers: {
        Prefer: "return=representation",
      },

      body: JSON.stringify({
        user_id: userId,
        product_id: productId,
        active: true,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao criar entitlement: ${response.status} ${text}`
    );
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
    });
  }

  try {
    /*
     * O Mercado Pago pode enviar notificações
     * que não sejam pagamentos.
     */

    const type =
      req.body?.type ||
      req.body?.topic;

    if (type !== "payment") {
      return res.status(200).json({
        received: true,
        ignored: true,
      });
    }

    /*
     * Validação da assinatura do webhook.
     */

    const signatureValid =
      verifyMercadoPagoSignature(req);

    if (!signatureValid) {
      console.error(
        "Webhook Mercado Pago rejeitado: assinatura inválida."
      );

      return res.status(401).json({
        error: "Assinatura inválida.",
      });
    }

    const paymentId =
      req.body?.data?.id ||
      req.query?.["data.id"] ||
      req.query?.id;

    if (!paymentId) {
      return res.status(400).json({
        error: "ID do pagamento não encontrado.",
      });
    }

    /*
     * Busca os dados reais do pagamento
     * diretamente no Mercado Pago.
     */

    const payment = await getPayment(paymentId);

    console.log(
      "Pagamento recebido:",
      payment.id,
      payment.status,
      payment.transaction_amount
    );

    /*
     * Só libera produto quando o pagamento
     * estiver realmente aprovado.
     */

    if (payment.status !== "approved") {
      return res.status(200).json({
        received: true,
        processed: false,
        status: payment.status,
      });
    }

    const email =
      payment.payer?.email ||
      payment.additional_info?.payer?.email;

    if (!email) {
      throw new Error(
        "Pagamento aprovado sem email do comprador."
      );
    }

    /*
     * Identifica o produto pelo valor pago.
     */

    const amount = Number(
      payment.transaction_amount
    ).toFixed(2);

    const product = PRODUCTS[amount];

    if (!product) {
      throw new Error(
        `Valor de pagamento não reconhecido: ${amount}`
      );
    }

    /*
     * Localiza o usuário cadastrado no Supabase.
     */

    const user = await findUserByEmail(email);

    if (!user) {
      console.error(
        `Nenhum usuário encontrado para o email ${email}.`
      );

      return res.status(200).json({
        received: true,
        processed: false,
        reason:
          "Usuário não encontrado no Supabase.",
      });
    }

    /*
     * Evita registrar o mesmo pagamento duas vezes.
     */

    const existingPurchase =
      await findExistingPurchase(payment.id);

    if (!existingPurchase) {
      await createPurchase({
        userId: user.id,
        productId: product.id,
        paymentId: payment.id,
        preferenceId:
          payment.preference_id || null,
        amount: Number(amount),
        status: payment.status,
      });
    }

    /*
     * Libera o acesso ao produto.
     */

    await activateEntitlement(
      user.id,
      product.id
    );

    console.log(
      `Acesso liberado: ${email} → ${product.slug}`
    );

    return res.status(200).json({
      received: true,
      processed: true,
      payment_id: payment.id,
      product: product.slug,
      user_id: user.id,
    });

  } catch (error) {
    console.error(
      "Erro no webhook Mercado Pago:",
      error
    );

    /*
     * Retorna 200 para evitar que o Mercado Pago
     * fique reenviando indefinidamente enquanto
     * investigamos o erro.
     */

    return res.status(200).json({
      received: true,
      processed: false,
      error: error.message,
    });
  }
};
