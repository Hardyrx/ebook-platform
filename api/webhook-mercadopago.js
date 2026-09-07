const {
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} = require("mercadopago");


/*
|--------------------------------------------------------------------------
| CONFIGURAÇÕES
|--------------------------------------------------------------------------
*/

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const MERCADOPAGO_ACCESS_TOKEN =
  process.env.MERCADOPAGO_ACCESS_TOKEN;

const MERCADOPAGO_WEBHOOK_SECRET =
  process.env.MERCADOPAGO_WEBHOOK_SECRET;


/*
|--------------------------------------------------------------------------
| PRODUTOS
|--------------------------------------------------------------------------
|
| O Mercado Pago envia o valor pago.
| Usamos o valor apenas para descobrir o SLUG.
|
| Depois buscamos o ID real do produto diretamente
| no Supabase.
|
*/

const PRODUCTS = {

  "97.00": {
    slug:
      "r1000-reais-por-dia",
  },

  "199.90": {
    slug:
      "r1000-reais-por-dia-agente",
  },

};


/*
|--------------------------------------------------------------------------
| SUPABASE REQUEST
|--------------------------------------------------------------------------
*/

async function supabaseRequest(
  path,
  options = {}
) {

  return fetch(
    `${SUPABASE_URL}${path}`,
    {

      ...options,

      headers: {

        apikey:
          SUPABASE_SERVICE_ROLE_KEY,

        Authorization:
          `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {}),

      },

    }
  );

}


/*
|--------------------------------------------------------------------------
| VALIDAR ASSINATURA DO MERCADO PAGO
|--------------------------------------------------------------------------
*/

function verifyMercadoPagoSignature(
  req
) {

  if (
    !MERCADOPAGO_WEBHOOK_SECRET
  ) {

    console.error(
      "MERCADOPAGO_WEBHOOK_SECRET não configurado."
    );

    return false;

  }


  const xSignature =
    req.headers["x-signature"];

  const xRequestId =
    req.headers["x-request-id"];

  const dataId =
    req.query?.["data.id"];


  if (
    !xSignature ||
    !xRequestId ||
    !dataId
  ) {

    console.error(
      "Dados necessários para validar assinatura ausentes.",
      {

        hasSignature:
          !!xSignature,

        hasRequestId:
          !!xRequestId,

        dataId,

      }
    );

    return false;

  }


  try {

    WebhookSignatureValidator.validate({

      xSignature,

      xRequestId,

      dataId:
        String(dataId),

      secret:
        MERCADOPAGO_WEBHOOK_SECRET,

    });


    console.log(
      "Assinatura Mercado Pago validada."
    );


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


/*
|--------------------------------------------------------------------------
| BUSCAR PAGAMENTO NO MERCADO PAGO
|--------------------------------------------------------------------------
*/

async function getPayment(
  paymentId
) {

  const response =
    await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {

        method:
          "GET",

        headers: {

          Authorization:
            `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,

        },

      }
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao consultar pagamento ${paymentId}: ${response.status} ${text}`
    );

  }


  return response.json();

}


/*
|--------------------------------------------------------------------------
| BUSCAR PRODUTO PELO SLUG
|--------------------------------------------------------------------------
*/

async function getProductBySlug(
  slug
) {

  const response =
    await supabaseRequest(

      `/rest/v1/products?slug=eq.${encodeURIComponent(
        slug
      )}&active=eq.true&select=id,name,slug,price&limit=1`

    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao consultar produto no Supabase: ${response.status} ${text}`
    );

  }


  const products =
    await response.json();


  if (
    !products.length
  ) {

    throw new Error(
      `Produto não encontrado no Supabase: ${slug}`
    );

  }


  return products[0];

}


/*
|--------------------------------------------------------------------------
| ENCONTRAR USUÁRIO PELO EMAIL
|--------------------------------------------------------------------------
*/

async function findUserByEmail(
  email
) {

  const response =
    await supabaseRequest(
      "/auth/v1/admin/users?per_page=1000"
    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao consultar usuários do Supabase: ${response.status} ${text}`
    );

  }


  const data =
    await response.json();


  const users =
    data.users || [];


  return (
    users.find(
      (user) =>
        user.email &&
        user.email.toLowerCase() ===
          email.toLowerCase()
    ) || null
  );

}


/*
|--------------------------------------------------------------------------
| VERIFICAR PURCHASE EXISTENTE
|--------------------------------------------------------------------------
*/

async function findExistingPurchase(
  paymentId
) {

  const response =
    await supabaseRequest(

      `/rest/v1/purchases?mp_payment_id=eq.${encodeURIComponent(
        String(paymentId)
      )}&select=id&limit=1`

    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao consultar compra existente: ${response.status} ${text}`
    );

  }


  const data =
    await response.json();


  return data[0] || null;

}


/*
|--------------------------------------------------------------------------
| CRIAR PURCHASE
|--------------------------------------------------------------------------
*/

async function createPurchase({
  userId,
  productId,
  paymentId,
  preferenceId,
  amount,
  status,
}) {

  const response =
    await supabaseRequest(
      "/rest/v1/purchases",
      {

        method:
          "POST",

        headers: {

          Prefer:
            "return=representation",

        },

        body:
          JSON.stringify({

            user_id:
              userId,

            product_id:
              productId,

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

    const text =
      await response.text();

    throw new Error(
      `Erro ao criar purchase: ${response.status} ${text}`
    );

  }


  return response.json();

}


/*
|--------------------------------------------------------------------------
| BUSCAR ENTITLEMENT
|--------------------------------------------------------------------------
*/

async function findEntitlement(
  userId,
  productId
) {

  const response =
    await supabaseRequest(

      `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(
        userId
      )}&product_id=eq.${encodeURIComponent(
        productId
      )}&select=id,active&limit=1`

    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao consultar entitlement: ${response.status} ${text}`
    );

  }


  const data =
    await response.json();


  return data[0] || null;

}


/*
|--------------------------------------------------------------------------
| ATIVAR ENTITLEMENT
|--------------------------------------------------------------------------
*/

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
  |--------------------------------------------------------------------------
  | JÁ EXISTE
  |--------------------------------------------------------------------------
  */

  if (existing) {

    const response =
      await supabaseRequest(

        `/rest/v1/entitlements?id=eq.${encodeURIComponent(
          existing.id
        )}`,

        {

          method:
            "PATCH",

          headers: {

            Prefer:
              "return=representation",

          },

          body:
            JSON.stringify({

              active:
                true,

              revoked_at:
                null,

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


    console.log(
      "Entitlement existente reativado."
    );


    return;

  }


  /*
  |--------------------------------------------------------------------------
  | CRIAR NOVO
  |--------------------------------------------------------------------------
  */

  const response =
    await supabaseRequest(
      "/rest/v1/entitlements",
      {

        method:
          "POST",

        headers: {

          Prefer:
            "return=representation",

        },

        body:
          JSON.stringify({

            user_id:
              userId,

            product_id:
              productId,

            active:
              true,

            granted_at:
              new Date().toISOString(),

            revoked_at:
              null,

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


  console.log(
    "Novo entitlement criado."
  );

}


/*
|--------------------------------------------------------------------------
| WEBHOOK MERCADO PAGO
|--------------------------------------------------------------------------
*/

module.exports = async (
  req,
  res
) => {

  /*
  |--------------------------------------------------------------------------
  | MÉTODO
  |--------------------------------------------------------------------------
  */

  if (
    req.method !==
    "POST"
  ) {

    return res.status(405).json({

      error:
        "Método não permitido",

    });

  }


  try {

    /*
    |--------------------------------------------------------------------------
    | TIPO DO EVENTO
    |--------------------------------------------------------------------------
    */

    const type =
      req.body?.type ||
      req.body?.topic;


    console.log(
      "Evento recebido:",
      type
    );


    /*
    |--------------------------------------------------------------------------
    | IGNORAR EVENTOS QUE NÃO SÃO PAYMENT
    |--------------------------------------------------------------------------
    */

    if (
      type !==
      "payment"
    ) {

      return res.status(200).json({

        received:
          true,

        ignored:
          true,

        type,

      });

    }


    /*
    |--------------------------------------------------------------------------
    | VALIDAR ASSINATURA
    |--------------------------------------------------------------------------
    */

    const signatureValid =
      verifyMercadoPagoSignature(
        req
      );


    if (!signatureValid) {

      console.error(
        "Webhook Mercado Pago rejeitado: assinatura inválida."
      );


      return res.status(401).json({

        error:
          "Assinatura inválida.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | ID DO PAGAMENTO
    |--------------------------------------------------------------------------
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
      "Payment ID:",
      paymentId
    );


    /*
    |--------------------------------------------------------------------------
    | SIMULAÇÃO DO MERCADO PAGO
    |--------------------------------------------------------------------------
    */

    if (
      String(paymentId) ===
      "123456"
    ) {

      console.log(
        "Simulação do Mercado Pago recebida."
      );


      return res.status(200).json({

        received:
          true,

        processed:
          false,

        simulation:
          true,

        reason:
          "Notificação simulada recebida com sucesso.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | BUSCAR PAGAMENTO REAL
    |--------------------------------------------------------------------------
    */

    const payment =
      await getPayment(
        paymentId
      );


    console.log(
      "Pagamento encontrado:",
      {

        id:
          payment.id,

        status:
          payment.status,

        amount:
          payment.transaction_amount,

        email:
          payment.payer?.email,

      }
    );


    /*
    |--------------------------------------------------------------------------
    | SÓ LIBERAR PAGAMENTO APROVADO
    |--------------------------------------------------------------------------
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

        received:
          true,

        processed:
          false,

        status:
          payment.status,

      });

    }


    /*
    |--------------------------------------------------------------------------
    | EMAIL DO COMPRADOR
    |--------------------------------------------------------------------------
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


    console.log(
      "Email do comprador:",
      email
    );


    /*
    |--------------------------------------------------------------------------
    | IDENTIFICAR PRODUTO PELO VALOR
    |--------------------------------------------------------------------------
    */

    const amount =
      Number(
        payment.transaction_amount
      ).toFixed(2);


    const productConfig =
      PRODUCTS[amount];


    if (!productConfig) {

      throw new Error(
        `Valor de pagamento não reconhecido: ${amount}`
      );

    }


    console.log(
      "Slug identificado:",
      productConfig.slug
    );


    /*
    |--------------------------------------------------------------------------
    | BUSCAR PRODUTO REAL NO SUPABASE
    |--------------------------------------------------------------------------
    */

    const product =
      await getProductBySlug(
        productConfig.slug
      );


    console.log(
      "Produto encontrado no Supabase:",
      {

        id:
          product.id,

        name:
          product.name,

        slug:
          product.slug,

        price:
          product.price,

      }
    );


    /*
    |--------------------------------------------------------------------------
    | ENCONTRAR USUÁRIO
    |--------------------------------------------------------------------------
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


      return res.status(200).json({

        received:
          true,

        processed:
          false,

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
    |--------------------------------------------------------------------------
    | VERIFICAR PURCHASE DUPLICADA
    |--------------------------------------------------------------------------
    */

    const existingPurchase =
      await findExistingPurchase(
        payment.id
      );


    if (
      !existingPurchase
    ) {

      await createPurchase({

        userId:
          user.id,

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
        "Purchase criada com sucesso."
      );


    } else {

      console.log(
        "Purchase já existe. Não duplicando."
      );

    }


    /*
    |--------------------------------------------------------------------------
    | LIBERAR ACESSO
    |--------------------------------------------------------------------------
    */

    await activateEntitlement(

      user.id,

      product.id

    );


    /*
    |--------------------------------------------------------------------------
    | LOG FINAL
    |--------------------------------------------------------------------------
    */

    console.log(
      "===================================="
    );

    console.log(
      "ACESSO LIBERADO COM SUCESSO"
    );

    console.log(
      "Email:",
      email
    );

    console.log(
      "Produto:",
      product.slug
    );

    console.log(
      "Payment:",
      payment.id
    );

    console.log(
      "Valor:",
      amount
    );

    console.log(
      "===================================="
    );


    /*
    |--------------------------------------------------------------------------
    | RESPOSTA FINAL
    |--------------------------------------------------------------------------
    */

    return res.status(200).json({

      received:
        true,

      processed:
        true,

      payment_id:
        payment.id,

      product:
        product.slug,

      amount:
        Number(amount),

      user_id:
        user.id,

    });


  } catch (error) {

    console.error(
      "===================================="
    );

    console.error(
      "ERRO NO WEBHOOK MERCADO PAGO"
    );

    console.error(
      error
    );

    console.error(
      "===================================="
    );


    /*
    |--------------------------------------------------------------------------
    | RETORNAR 500
    |--------------------------------------------------------------------------
    |
    | O Mercado Pago poderá tentar novamente.
    |
    */

    return res.status(500).json({

      received:
        true,

      processed:
        false,

      error:
        error.message,

    });

  }

};
