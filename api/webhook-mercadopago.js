const {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} = require("mercadopago");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const MERCADOPAGO_ACCESS_TOKEN =
  process.env.MERCADOPAGO_ACCESS_TOKEN;

const MERCADOPAGO_WEBHOOK_SECRET =
  process.env.MERCADOPAGO_WEBHOOK_SECRET;

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

/* =========================
   SUPABASE
========================= */

async function supabaseRequest(path, options = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...options,

    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,

      Authorization:
        `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

      "Content-Type": "application/json",

      ...(options.headers || {}),
    },
  });
}

/* =========================
   VALIDAR WEBHOOK MERCADO PAGO
========================= */

function verifyMercadoPagoSignature(req) {
  if (!MERCADOPAGO_WEBHOOK_SECRET) {
    console.error(
      "MERCADOPAGO_WEBHOOK_SECRET não configurado."
    );

    return false;
  }

  const xSignature =
    req.headers["x-signature"];

  const xRequestId =
    req.headers["x-request-id"];

  /*
   * IMPORTANTE:
   * O Mercado Pago usa data.id da QUERY STRING
   * para validar a assinatura.
   */

  const dataId =
    req.query?.["data.id"];

  if (!xSignature || !xRequestId || !dataId) {
    console.error(
      "Dados necessários para validar assinatura ausentes.",
      {
        hasSignature: !!xSignature,
        hasRequestId: !!xRequestId,
        dataId,
      }
    );

    return false;
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature,
      xRequestId,
      dataId: String(dataId),
      secret: MERCADOPAGO_WEBHOOK_SECRET,
    });

    return true;

  } catch (error) {

    if (
      error instanceof
      InvalidWebhookSignatureError
    ) {
      console.error(
        "Assinatura do Mercado Pago inválida."
      );

      return false;
    }

    console.error(
      "Erro ao validar assinatura:",
      error
    );

    return false;
  }
}

/* =========================
   BUSCAR PAGAMENTO
========================= */

async function getPayment(paymentId) {
  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      method: "GET",

      headers: {
        Authorization:
          `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
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

/* =========================
   ENCONTRAR USUÁRIO PELO EMAIL
========================= */

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
      (user) =>
        user.email &&
        user.email.toLowerCase() ===
          email.toLowerCase()
    ) || null
  );
}

/* =========================
   VERIFICAR COMPRA EXISTENTE
========================= */

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

/* =========================
   CRIAR PURCHASE
========================= */

async function createPurchase({
  userId,
  productId,
  paymentId,
  preferenceId,
  amount,
  status,
}) {
  const response = await supabaseRequest(
    "/rest/v1/purchases",
    {
      method: "POST",

      headers: {
        Prefer: "return=representation",
      },

      body: JSON.stringify({
        user_id: userId,

        product_id: productId,

        mp_payment_id:
          String(paymentId),

        mp_preference_id:
          preferenceId
            ? String(preferenceId)
            : null,

        amount,

        status,
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Erro ao criar purchase: ${response.status} ${text}`
    );
  }

  return response.json();
}

/* =========================
   BUSCAR ENTITLEMENT
========================= */

async function findEntitlement(
  userId,
  productId
) {
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

/* =========================
   ATIVAR ENTITLEMENT
========================= */

async function activateEntitlement(
  userId,
  productId
) {
  const existing =
    await findEntitlement(
      userId,
      productId
    );

  /*
   * Se já existe, apenas reativa.
   */

  if (existing) {
    const response =
      await supabaseRequest(
        `/rest/v1/entitlements?id=eq.${encodeURIComponent(
          existing.id
        )}`,
        {
          method: "PATCH",

          headers: {
            Prefer:
              "return=representation",
          },

          body: JSON.stringify({
            active: true,

            revoked_at: null,
          }),
        }
      );

    if (!response.ok) {
      const text =
        await response.text();

      throw new Error(
        `Erro ao reativar entitlement: ${response.status} ${text}`
      );
    }

    return;
  }

  /*
   * Se não existe, cria.
   */

  const response =
    await supabaseRequest(
      "/rest/v1/entitlements",
      {
        method: "POST",

        headers: {
          Prefer:
            "return=representation",
        },

        body: JSON.stringify({
          user_id: userId,

          product_id: productId,

          active: true,

          granted_at:
            new Date().toISOString(),

          revoked_at: null,
        }),
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Erro ao criar entitlement: ${response.status} ${text}`
    );
  }
}

/* =========================
   WEBHOOK
========================= */

module.exports = async (
  req,
  res
) => {

  /*
   * Somente POST.
   */

  if (req.method !== "POST") {
    return res.status(405).json({
      error:
        "Método não permitido",
    });
  }

  try {

    /*
     * Identifica o tipo de notificação.
     */

    const type =
      req.body?.type ||
      req.body?.topic;

    /*
     * Ignora eventos que não sejam payment.
     */

    if (type !== "payment") {
      console.log(
        "Evento ignorado:",
        type
      );

      return res.status(200).json({
        received: true,

        ignored: true,

        type,
      });
    }

    /*
     * Validação da assinatura.
     */

    const signatureValid =
      verifyMercadoPagoSignature(
        req
      );

    if (!signatureValid) {
      return res.status(401).json({
        error:
          "Assinatura inválida.",
      });
    }

    /*
     * O ID oficial vem da query string.
     */

    const paymentId =
      req.query?.["data.id"];

    if (!paymentId) {
      return res.status(400).json({
        error:
          "ID do pagamento não encontrado.",
      });
    }

    console.log(
      "Webhook recebido. Payment ID:",
      paymentId
    );

    /*
     * Consulta o pagamento diretamente
     * no Mercado Pago.
     */

    const payment =
      await getPayment(
        paymentId
      );

    console.log(
      "Pagamento:",
      {
        id: payment.id,

        status:
          payment.status,

        amount:
          payment.transaction_amount,

        email:
          payment.payer?.email,
      }
    );

    /*
     * Só libera acesso para pagamento aprovado.
     */

    if (
      payment.status !==
      "approved"
    ) {
      console.log(
        "Pagamento ainda não aprovado:",
        payment.status
      );

      return res.status(200).json({
        received: true,

        processed: false,

        status:
          payment.status,
      });
    }

    /*
     * Email usado no pagamento.
     */

    const email =
      payment.payer?.email ||
      payment.additional_info
        ?.payer?.email;

    if (!email) {
      throw new Error(
        "Pagamento aprovado sem email do comprador."
      );
    }

    /*
     * Identifica o produto pelo valor.
     */

    const amount =
      Number(
        payment.transaction_amount
      ).toFixed(2);

    const product =
      PRODUCTS[amount];

    if (!product) {
      throw new Error(
        `Valor de pagamento não reconhecido: ${amount}`
      );
    }

    console.log(
      "Produto identificado:",
      product.slug
    );

    /*
     * Procura o usuário no Supabase.
     */

    const user =
      await findUserByEmail(
        email
      );

    if (!user) {
      console.error(
        "Usuário não encontrado:",
        email
      );

      /*
       * Pagamento está aprovado,
       * mas não podemos liberar acesso
       * sem encontrar a conta.
       */

      return res.status(200).json({
        received: true,

        processed: false,

        reason:
          "Usuário não encontrado no Supabase.",

        email,
      });
    }

    console.log(
      "Usuário encontrado:",
      user.id
    );

    /*
     * Evita duplicar purchase.
     */

    const existingPurchase =
      await findExistingPurchase(
        payment.id
      );

    if (!existingPurchase) {

      await createPurchase({
        userId: user.id,

        productId:
          product.id,

        paymentId:
          payment.id,

        preferenceId:
          payment.preference_id ||
          null,

        amount:
          Number(amount),

        status:
          payment.status,
      });

      console.log(
        "Purchase criada."
      );

    } else {

      console.log(
        "Purchase já existente. Não duplicando."
      );
    }

    /*
     * Libera o acesso.
     */

    await activateEntitlement(
      user.id,
      product.id
    );

    console.log(
      "ACESSO LIBERADO:",
      email,
      product.slug
    );

    /*
     * Resposta final.
     */

    return res.status(200).json({
      received: true,

      processed: true,

      payment_id:
        payment.id,

      product:
        product.slug,

      user_id:
        user.id,
    });

  } catch (error) {

    console.error(
      "Erro no webhook Mercado Pago:",
      error
    );

    /*
     * Erro interno:
     * 500 permite que o Mercado Pago
     * possa reenviar a notificação.
     */

    return res.status(500).json({
      received: true,

      processed: false,

      error:
        error.message,
    });
  }
};
