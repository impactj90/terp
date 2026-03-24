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
import { whStockMovementsRouter } from "./stockMovements"
import { whWithdrawalsRouter } from "./withdrawals"
import { whSupplierInvoicesRouter } from "./supplierInvoices"

export const warehouseRouter = createTRPCRouter({
  articles: whArticlesRouter,
  articlePrices: whArticlePricesRouter,
  purchaseOrders: whPurchaseOrdersRouter,
  stockMovements: whStockMovementsRouter,
  withdrawals: whWithdrawalsRouter,
  supplierInvoices: whSupplierInvoicesRouter,
})
