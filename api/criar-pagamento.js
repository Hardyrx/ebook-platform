const { MercadoPagoConfig, Preference } = require("mercadopago");

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
});

module.exports = async (req, res) => {
  // Aceita somente POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido",
    });
  }

  try {
    const { user_id, email } = req.body || {};

    // Precisamos do usuário logado
    if (!user_id || !email) {
      return res.status(400).json({
        error: "Usuário não identificado.",
      });
    }

    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: "r1000-reais-por-dia",
            title: "R$1000 Reais Por Dia - Ebook Completo Algoritmo Secreto.",
            quantity: 1,
            unit_price: 97.90,
            currency_id: "BRL",
          },
        ],

        payer: {
          email: email,
        },

        external_reference: user_id,

        back_urls: {
          success:
            "https://ebook-platform-jbgl.vercel.app/membros.html",
          failure:
            "https://ebook-platform-jbgl.vercel.app/index.html",
          pending:
            "https://ebook-platform-jbgl.vercel.app/index.html",
        },

        auto_return: "approved",

        notification_url:
          "https://ebook-platform-jbgl.vercel.app/api/webhook-mercadopago.js",

        statement_descriptor:
          "EBOOK PLATFORM",
      },
    });

    return res.status(200).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });

  } catch (error) {

    console.error(
      "Erro ao criar pagamento:",
      error
    );

    return res.status(500).json({
      error: "Não foi possível criar o pagamento.",
    });
  }
};
