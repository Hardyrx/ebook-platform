const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


/*
|--------------------------------------------------------------------------
| PRODUTOS
|--------------------------------------------------------------------------
*/

const PRODUCTS = {

  "fcdd57c5-05e8-4617-9256-f18acb888a0": {
    ebook: "ebooks/r1000-reais-por-dia.pdf",
    agent: false,
  },

  "513095ae-0a1b-47d3-8595-615b059947c7": {
    ebook: "ebooks/r1000-reais-por-dia.pdf",
    agent: true,
  },

};


/*
|--------------------------------------------------------------------------
| AGENTE TIEEPO 1KD
|--------------------------------------------------------------------------
*/

const AGENT_URL =
  "https://chatgpt.com/g/g-6845f51d6648819184d0561733e87681-tieepo-1kdtm";


/*
|--------------------------------------------------------------------------
| REQUISIÇÃO SUPABASE
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
| IDENTIFICAR USUÁRIO
|--------------------------------------------------------------------------
*/

async function getUserFromToken(
  accessToken
) {

  const response =
    await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {

        method: "GET",

        headers: {

          apikey:
            SUPABASE_SERVICE_ROLE_KEY,

          Authorization:
            `Bearer ${accessToken}`,

        },

      }
    );


  if (!response.ok) {

    return null;

  }


  return response.json();

}


/*
|--------------------------------------------------------------------------
| VERIFICAR ACESSO AO PRODUTO
|--------------------------------------------------------------------------
*/

async function hasProductAccess(
  userId,
  productId
) {

  const response =
    await supabaseRequest(

      `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(
        userId
      )}&product_id=eq.${encodeURIComponent(
        productId
      )}&active=eq.true&select=id,product_id`

    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao verificar acesso: ${response.status} ${text}`
    );

  }


  const data =
    await response.json();


  return data.length > 0;

}


/*
|--------------------------------------------------------------------------
| CRIAR URL ASSINADA DO EBOOK
|--------------------------------------------------------------------------
*/

async function createSignedUrl(
  filePath
) {

  const response =
    await supabaseRequest(

      `/storage/v1/object/sign/conteudos/${filePath}`,

      {

        method: "POST",

        body: JSON.stringify({

          expiresIn: 300,

        }),

      }

    );


  if (!response.ok) {

    const text =
      await response.text();

    throw new Error(
      `Erro ao criar URL do ebook: ${response.status} ${text}`
    );

  }


  const data =
    await response.json();


  const signedPath =
    data.signedURL ||
    data.signedUrl;


  if (!signedPath) {

    throw new Error(
      "Supabase não retornou a URL assinada."
    );

  }


  if (
    signedPath.startsWith("http")
  ) {

    return signedPath;

  }


  return `${SUPABASE_URL}/storage/v1${signedPath}`;

}


/*
|--------------------------------------------------------------------------
| API
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

  if (req.method !== "GET") {

    return res.status(405).json({

      error:
        "Método não permitido",

    });

  }


  try {


    /*
    |--------------------------------------------------------------------------
    | AUTORIZAÇÃO
    |--------------------------------------------------------------------------
    */

    const authorization =
      req.headers.authorization;


    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {

      return res.status(401).json({

        error:
          "Usuário não autenticado.",

      });

    }


    const accessToken =
      authorization.substring(7);


    /*
    |--------------------------------------------------------------------------
    | USUÁRIO
    |--------------------------------------------------------------------------
    */

    const user =
      await getUserFromToken(
        accessToken
      );


    if (!user) {

      return res.status(401).json({

        error:
          "Sessão inválida ou expirada.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | PRODUTO
    |--------------------------------------------------------------------------
    */

    const productId =
      req.query.product_id;


    if (
      !productId ||
      !PRODUCTS[productId]
    ) {

      return res.status(400).json({

        error:
          "Produto inválido.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | TIPO DE CONTEÚDO
    |--------------------------------------------------------------------------
    */

    const content =
      req.query.content || "ebook";


    if (
      content !== "ebook" &&
      content !== "agent"
    ) {

      return res.status(400).json({

        error:
          "Conteúdo inválido.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | VERIFICAR COMPRA
    |--------------------------------------------------------------------------
    */

    const allowed =
      await hasProductAccess(
        user.id,
        productId
      );


    if (!allowed) {

      return res.status(403).json({

        error:
          "Você não possui acesso a este conteúdo.",

      });

    }


    /*
    |--------------------------------------------------------------------------
    | AGENTE
    |--------------------------------------------------------------------------
    */

    if (
      content === "agent"
    ) {


      if (
        !PRODUCTS[productId].agent
      ) {

        return res.status(403).json({

          error:
            "O Agente de Implementação não está incluído neste produto.",

        });

      }


      return res.status(200).json({

        success:
          true,

        type:
          "agent",

        url:
          AGENT_URL,

      });

    }


    /*
    |--------------------------------------------------------------------------
    | EBOOK
    |--------------------------------------------------------------------------
    */

    const filePath =
      PRODUCTS[productId].ebook;


    const signedUrl =
      await createSignedUrl(
        filePath
      );


    return res.status(200).json({

      success:
        true,

      type:
        "ebook",

      expires_in:
        300,

      url:
        signedUrl,

    });


  } catch (error) {


    console.error(
      "Erro ao abrir conteúdo:",
      error
    );


    return res.status(500).json({

      error:
        "Não foi possível liberar o conteúdo.",

    });

  }

};
