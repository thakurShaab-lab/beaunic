const { eq, and, ne, desc, count, sql } = require("drizzle-orm")
const db = require("../config/drizzle")
const { wlWalletTransactions } = require("../schema/wl-wallet-transactions")

const t = wlWalletTransactions

// Only completed transactions move money
const completed = eq(t.status, "1")

// The history filter chips: Cashback, Credits (money in other than cashback), Debits
const TRANSACTION_FILTERS = {
    cashback: () => eq(t.category, "cashback"),
    credits: () => and(eq(t.transactionType, "credit"), ne(t.category, "cashback")),
    debits: () => eq(t.transactionType, "debit"),
}

const sumWhere = (condition) => sql`COALESCE(SUM(CASE WHEN ${condition} THEN ${t.amount} ELSE 0 END), 0)`.mapWith(Number)

// The three boxes under the balance card; balance = cashback + credits - debits
const findWalletSummary = async (customerId) => {
    const [row] = await db
        .select({
            cashback: sumWhere(TRANSACTION_FILTERS.cashback()),
            credits: sumWhere(TRANSACTION_FILTERS.credits()),
            debits: sumWhere(TRANSACTION_FILTERS.debits()),
        })
        .from(t)
        .where(and(eq(t.customerId, customerId), completed))

    return row
}

const filterCondition = (customerId, filter) =>
    and(eq(t.customerId, customerId), filter ? TRANSACTION_FILTERS[filter]() : undefined)

// One page of the customer's transactions, newest first. filter: a TRANSACTION_FILTERS key, or undefined for all.
const findTransactions = async (customerId, { filter, limit, offset }) =>
    db
        .select()
        .from(t)
        .where(filterCondition(customerId, filter))
        .orderBy(desc(t.transactionAddedDate), desc(t.transactionId))
        .limit(limit)
        .offset(offset)

const countTransactions = async (customerId, { filter }) => {
    const [row] = await db.select({ total: count() }).from(t).where(filterCondition(customerId, filter))

    return Number(row.total)
}

// The customer's cashback credits, newest first (for the Cashback history list)
const findCashbackTransactions = async (customerId, limit) =>
    db
        .select()
        .from(t)
        .where(and(eq(t.customerId, customerId), TRANSACTION_FILTERS.cashback()))
        .orderBy(desc(t.transactionAddedDate), desc(t.transactionId))
        .limit(limit)

// Returns the new transaction_id
const addTransaction = async (values) => {
    const [result] = await db.insert(t).values(values)

    return result.insertId
}

module.exports = {
    findWalletSummary,
    findTransactions,
    countTransactions,
    findCashbackTransactions,
    addTransaction,
    TRANSACTION_FILTER_KEYS: Object.keys(TRANSACTION_FILTERS),
}
