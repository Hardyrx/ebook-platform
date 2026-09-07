const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;


/* =====================================================
   PRODUTOS QUE DÃO ACESSO AO EBOOK
===================================================== */

const EBOOK_PRODUCTS = [
  "fcdd57c5-05e8-4617-9256-f18acb888a0",
  "513095ae-0a1b-47d3-8595-615b059947c7",
];


/* =====================================================
   REQUEST SUPABASE
===================================================== */

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


/* =====================================================
   PEGAR USUÁRIO LOGADO
===================================================== */

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


/* =====================================================
   VERIFICAR ENTITLEMENT
===================================================== */

async function hasEbookAccess(
  userId
) {
  const productFilter =
    EBOOK_PRODUCTS.join(",");


  const response =
    await supabaseRequest(
      `/rest/v1/entitlements?user_id=eq.${encodeURIComponent(
        userId
      )}&active=eq.true&product_id=in.(${productFilter})&select=id,product_id`
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


/* =====================================================
   CRIAR URL TEMPORÁRIA
===================================================== */

async function createSignedUrl() {

  const response =
    await supabaseRequest(
      "/storage/v1/object/sign/conteudos/ebooks/r1000-reais-por-dia.pdf",
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


  /*
   * O Supabase retorna:
   *
   * { signedURL: "/storage/v1/object/sign/..." }
   *
   * Transformamos em URL completa.
   */

  const signedPath =
    data.signedURL ||
    data.signedUrl;


  if (!signedPath) {

    throw new Error(
      "Supabase não retornou a URL assinada."
    );
  }


  const fullUrl =
    signedPath.startsWith("http")
      ? signedPath
      : `${SUPABASE_URL}/storage/v1${signedPath.replace(
          "/storage/v1",
          ""
        )}`;


  return fullUrl;
}


/* =====================================================
   API
===================================================== */

module.exports = async (
  req,
  res
) => {

  /*
   * Somente GET.
   */

  if (req.method !== "GET") {

    return res.status(405).json({
      error:
        "Método não permitido",
    });
  }


  try {

    /*
     * Pega o Authorization:
     *
     * Bearer TOKEN
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
      authorization.substring(
        7
      );


    /*
     * Descobre quem está logado.
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
     * Verifica se comprou.
     */

    const allowed =
      await hasEbookAccess(
        user.id
      );


    if (!allowed) {

      return res.status(403).json({
        error:
          "Você não possui acesso a este conteúdo.",
      });
    }


    /*
     * Cria URL temporária de 5 minutos.
     */

    const signedUrl =
      await createSignedUrl();


    /*
     * Entrega somente a URL temporária.
     */

    return res.status(200).json({

      success:
        true,

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
