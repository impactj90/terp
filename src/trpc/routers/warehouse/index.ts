/**
 * Warehouse Router
 *
 * Contains warehouse-related procedures (articles, stock, purchasing).
 * Guarded by requireModule("warehouse").
 */
import { createTRPCRouter } from "@/trpc/init"
import { whArticlesRouter } from "./articles"
import { whArticlePricesRouter } from "./articlePrices"
import { whPurchaseOrdersRouter } from "./purchaseOrders"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
})
