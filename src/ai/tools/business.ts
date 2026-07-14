import type { CommercialCatalogReader } from "@/business/catalog";
import { tool } from "langchain";
import { z } from "zod";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function createBusinessTools(catalog: CommercialCatalogReader) {
  const businessInfo = tool(
    async () =>
      JSON.stringify(
        (await catalog.getProfile()) ?? {
          warning:
            "Informações do estabelecimento ainda não foram cadastradas.",
        },
      ),
    {
      name: "consultar_estabelecimento",
      description:
        "Consulta endereço, horário, serviços e formas de pagamento cadastrados.",
      schema: z.object({}),
    },
  );

  const productPrice = tool(
    async ({ query }) => {
      const offers = await catalog.findCurrentOffers(query);
      if (!offers.length)
        return "Nenhum preço atual foi encontrado para essa busca.";
      return JSON.stringify({
        warning: "Preço cadastrado não confirma estoque nem aplicação no veículo.",
        offers: offers.map((offer) => ({
          ...offer,
          price: brl.format(offer.priceCents / 100),
        })),
      });
    },
    {
      name: "consultar_preco_produto",
      description:
        "Consulta preço por marca, linha, viscosidade ou especificação. Não confirma estoque nem compatibilidade.",
      schema: z.object({ query: z.string().trim().min(1) }),
    },
  );

  return [businessInfo, productPrice] as const;
}
