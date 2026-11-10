// La regla de precios del CRM, calculada en el dispositivo para cuando no hay señal. Es la misma de la base
// (public.default_price_book, public.channel_price_book y public.quote_line_price): primero la lista propia del
// cliente; si no tiene, o el producto no está en ella, la lista de su canal y mercado.
//
// Sin dependencias de la app: scripts/test-db.mjs la importa para comprobar que da lo mismo que la base.

import type { OfflineBook, OfflinePrice } from "./types";

/** Lo que la regla necesita de un cliente. Uno creado sin señal no tiene lista propia todavía. */
export type PricedAccount = { market: string | null; industry: string | null; price_book_id: string | null };

export type PriceResult = {
  unit_price: number;
  currency: string;
  /** «lista»: de la lista del cliente (propia o de canal). «canal»: tiene lista propia, pero el producto solo está en la de su canal. */
  source: "lista" | "canal";
  book: OfflineBook;
};

/** Igual que public.market_of: todo lo que no es Internacional se trata como Nacional. */
export function marketOf(market: string | null | undefined): "Nacional" | "Internacional" {
  return market === "Internacional" ? "Internacional" : "Nacional";
}

/** Moneda en que se cotiza a un mercado. */
export function marketCurrency(market: string | null | undefined): "COP" | "USD" {
  return marketOf(market) === "Internacional" ? "USD" : "COP";
}

/** Lista del canal y mercado del cliente; en Nacional, si su canal no tiene lista, la general (sin canal). */
export function channelBook(account: PricedAccount, books: OfflineBook[], currency: string = marketCurrency(account.market)): OfflineBook | null {
  const market = marketOf(account.market);
  const found = books
    .filter((b) => !b.is_client_list && b.market === market && b.currency === currency
      && ((account.industry !== null && b.channel === account.industry) || (b.channel === null && b.market === "Nacional")))
    .sort((a, b) => Number(b.channel !== null) - Number(a.channel !== null) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return found[0] ?? null;
}

/** Lista con que se le cotiza al cliente: la suya si aplica a su mercado y moneda; si no, la de su canal. */
export function defaultBook(account: PricedAccount, books: OfflineBook[], currency: string = marketCurrency(account.market)): OfflineBook | null {
  const own = account.price_book_id
    ? books.find((b) => b.id === account.price_book_id && b.is_client_list && b.market === marketOf(account.market) && b.currency === currency)
    : undefined;
  return own ?? channelBook(account, books, currency);
}

export type PriceIndex = Map<string, Map<string, number>>;

/** Precios por lista y producto, para consultar sin recorrerlos todos. */
export function priceIndex(prices: OfflinePrice[]): PriceIndex {
  const index: PriceIndex = new Map();
  for (const [book, product, price] of prices) {
    let entries = index.get(book);
    if (!entries) index.set(book, (entries = new Map()));
    entries.set(product, Number(price));
  }
  return index;
}

/** Precio de un producto en una lista, sin más reglas. */
export function bookPrice(book: OfflineBook, productId: string, index: PriceIndex): PriceResult | null {
  const price = index.get(book.id)?.get(productId);
  return price === undefined ? null : { unit_price: price, currency: book.currency, source: "lista", book };
}

/** Precio de un producto para un cliente. `null`: no tiene precio en las listas que le aplican. */
export function priceFor(account: PricedAccount, productId: string, books: OfflineBook[], index: PriceIndex): PriceResult | null {
  const book = defaultBook(account, books);
  if (!book) return null;
  const direct = bookPrice(book, productId, index);
  if (direct || !book.is_client_list) return direct;
  const channel = channelBook(account, books, book.currency);
  const fallback = channel ? bookPrice(channel, productId, index) : null;
  return fallback ? { ...fallback, source: "canal" } : null;
}
