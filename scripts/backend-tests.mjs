/** PAYZIK — tests d'intégration backend (Supabase).
 *
 * Nécessite un projet Supabase avec les migrations appliquées et :
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 * Le service-role n'est utilisé que pour créer les identités de test.
 * Aucune donnée préexistante n'est modifiée ni supprimée.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!url || !serviceKey || !anonKey) {
  console.error(
    "Tests backend non exécutés : définir SUPABASE_URL, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(2);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const password = `PayzikTest!${suffix}`;

let pass = 0;
let fail = 0;

async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    fail += 1;
    console.error(`FAIL  ${name}\n      ${error?.message || error}`);
  }
}

async function rpc(client, name, params = {}) {
  const result = await client.rpc(name, params);
  assert.equal(result.error, null, `${name}: ${result.error?.message}`);
  return result.data;
}

async function expectRpcFailure(client, name, params = {}) {
  const result = await client.rpc(name, params);
  assert.ok(result.error, `${name}: une erreur était attendue`);
  return result.error;
}

async function expectSelectEmpty(client, table, column, value) {
  const result = await client.from(table).select("*").eq(column, value);
  assert.equal(result.error, null, `${table}: ${result.error?.message}`);
  assert.equal(result.data.length, 0, `${table}: ligne ${column}=${value} ne devrait pas être visible`);
}

async function makeUser(label, role) {
  const email = `${label.toLowerCase().replace(/[^a-z0-9]/g, "")}_${suffix}@payzik.test`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: label },
  });
  assert.equal(created.error, null, `createUser ${label}: ${created.error?.message}`);

  const profile = await admin.from("profiles").upsert({
    id: created.data.user.id,
    email,
    name: label,
    role,
    premium: false,
  });
  assert.equal(profile.error, null, `profile ${label}: ${profile.error?.message}`);

  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  assert.equal(signed.error, null, `signIn ${label}: ${signed.error?.message}`);

  return { id: created.data.user.id, email, client, role };
}

async function balanceOf(client, cardId) {
  const { data, error } = await client.from("cards").select("balance_dh").eq("id", cardId).single();
  assert.equal(error, null, `balance ${cardId}: ${error?.message}`);
  return Number(data.balance_dh);
}

console.log(`PAYZIK backend tests — ${suffix}`);

const sellerA = await makeUser("Seller A", "merchant");
const sellerB = await makeUser("Seller B", "merchant");
const clientA = await makeUser("Client A", "customer");
const clientB = await makeUser("Client B", "customer");
const adminUser = await makeUser("Admin", "admin");

const shopA = await rpc(sellerA.client, "create_shop", { p_shop_name: `Boutique A ${suffix}` });
const shopB = await rpc(sellerB.client, "create_shop", { p_shop_name: `Boutique B ${suffix}` });
const shopOffNetwork = await rpc(sellerA.client, "create_shop", { p_shop_name: `Hors réseau ${suffix}` });
const shopUnverified = await rpc(sellerA.client, "create_shop", { p_shop_name: `Non vérifiée ${suffix}` });
const shopInactive = await rpc(sellerA.client, "create_shop", { p_shop_name: `Inactive ${suffix}` });

await rpc(adminUser.client, "admin_set_shop_flags", {
  p_shop: shopA.shop_id, p_verified: true, p_in_network: true, p_is_active: true,
});
await rpc(adminUser.client, "admin_set_shop_flags", {
  p_shop: shopB.shop_id, p_verified: true, p_in_network: false, p_is_active: true,
});
await rpc(adminUser.client, "admin_set_shop_flags", {
  p_shop: shopOffNetwork.shop_id, p_verified: true, p_in_network: false, p_is_active: true,
});
await rpc(adminUser.client, "admin_set_shop_flags", {
  p_shop: shopUnverified.shop_id, p_verified: false, p_in_network: true, p_is_active: true,
});
await rpc(adminUser.client, "admin_set_shop_flags", {
  p_shop: shopInactive.shop_id, p_verified: true, p_in_network: true, p_is_active: false,
});

const tokenA = await rpc(sellerA.client, "create_link_token", {
  p_shop: shopA.shop_id, p_ttl_seconds: 300,
});
await rpc(clientA.client, "confirm_link_token", { p_token: tokenA.token });

const tokenB = await rpc(sellerB.client, "create_link_token", {
  p_shop: shopB.shop_id, p_ttl_seconds: 300,
});
await rpc(clientB.client, "confirm_link_token", { p_token: tokenB.token });

const cardA = await rpc(sellerA.client, "create_shop_card", {
  p_shop: shopA.shop_id,
  p_client: clientA.id,
  p_name: "Carte boutique A",
  p_initial: 100,
  p_funding_method: "cash",
  p_idempotency_key: `init-shop-a-${suffix}`,
});
const cardB = await rpc(sellerB.client, "create_shop_card", {
  p_shop: shopB.shop_id,
  p_client: clientB.id,
  p_name: "Carte boutique B",
  p_initial: 50,
  p_funding_method: "cash",
  p_idempotency_key: `init-shop-b-${suffix}`,
});
const generalA = await rpc(clientA.client, "create_general_card", {
  p_name: "Générale A", p_idempotency_key: `gen-a-${suffix}`,
});
await rpc(sellerA.client, "recharge_general_card", {
  p_card: generalA.card_id,
  p_amount: 200,
  p_funding_method: "cash",
  p_shop: shopA.shop_id,
  p_idempotency_key: `gen-topup-${suffix}`,
});

await test("Seller A ne voit pas les produits de Seller B", async () => {
  const inserted = await sellerB.client.from("products").insert({
    id: `p-b-${suffix}`,
    merchant_id: sellerB.id,
    shop_id: shopB.shop_id,
    name: "Produit B",
    price_dh: 10,
    stock: 1,
  }).select().single();
  assert.equal(inserted.error, null, inserted.error?.message);
  await expectSelectEmpty(sellerA.client, "products", "id", `p-b-${suffix}`);
});

await test("Seller A ne voit pas les clients de Seller B", async () => {
  await expectSelectEmpty(sellerA.client, "profiles", "id", clientB.id);
});

await test("Seller A ne peut pas recharger la carte de Seller B", async () => {
  await expectRpcFailure(sellerA.client, "recharge_shop_card", {
    p_card: cardB.card_id, p_amount: 10, p_funding_method: "cash",
  });
});

await test("Seller A ne peut pas modifier la boutique de Seller B", async () => {
  await sellerA.client.from("shops").update({ shop_name: "hijacked" }).eq("id", shopB.shop_id);
  const { data, error } = await admin.from("shops").select("shop_name").eq("id", shopB.shop_id).single();
  assert.equal(error, null, error?.message);
  assert.notEqual(data.shop_name, "hijacked");
});

await test("Client A ne voit pas la carte de Client B", async () => {
  await expectSelectEmpty(clientA.client, "cards", "id", cardB.card_id);
});

await test("Client A ne peut pas recharger une carte", async () => {
  await expectRpcFailure(clientA.client, "recharge_shop_card", {
    p_card: cardA.card_id, p_amount: 10, p_funding_method: "cash",
  });
  await expectRpcFailure(clientA.client, "recharge_general_card", {
    p_card: generalA.card_id, p_amount: 10, p_funding_method: "cash", p_shop: shopA.shop_id,
  });
});

await test("Carte boutique refusée dans une autre boutique", async () => {
  await expectRpcFailure(sellerB.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 5, p_reference: "cross-shop",
  });
});

await test("Carte générale refusée hors réseau", async () => {
  await expectRpcFailure(sellerA.client, "pay_general_card", {
    p_card: generalA.card_id, p_shop: shopOffNetwork.shop_id, p_amount: 5,
  });
});

await test("Carte générale refusée si boutique non vérifiée", async () => {
  await expectRpcFailure(sellerA.client, "pay_general_card", {
    p_card: generalA.card_id, p_shop: shopUnverified.shop_id, p_amount: 5,
  });
});

await test("Carte générale refusée si boutique inactive", async () => {
  await expectRpcFailure(sellerA.client, "pay_general_card", {
    p_card: generalA.card_id, p_shop: shopInactive.shop_id, p_amount: 5,
  });
});

await test("Requête dupliquée non rejouée", async () => {
  const key = `pay-idempotent-${suffix}`;
  const first = await rpc(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 10, p_reference: "first", p_idempotency_key: key,
  });
  const afterFirst = await balanceOf(sellerA.client, cardA.card_id);
  const second = await rpc(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 10, p_reference: "second", p_idempotency_key: key,
  });
  assert.equal(second.duplicate, true, "la seconde requête doit être marquée duplicate");
  assert.equal(second.transaction_id, first.transaction_id);
  assert.equal(await balanceOf(sellerA.client, cardA.card_id), afterFirst);
});

await test("Double dépense empêchée et solde inchangé après échec", async () => {
  const before = await balanceOf(clientA.client, generalA.card_id);
  await rpc(sellerA.client, "pay_general_card", {
    p_card: generalA.card_id,
    p_shop: shopA.shop_id,
    p_amount: before - 20,
    p_idempotency_key: `gen-pay-${suffix}`,
  });
  const after = await balanceOf(clientA.client, generalA.card_id);
  await expectRpcFailure(sellerA.client, "pay_general_card", {
    p_card: generalA.card_id,
    p_shop: shopA.shop_id,
    p_amount: after,
    p_idempotency_key: `gen-pay-2-${suffix}`,
  });
  assert.equal(await balanceOf(clientA.client, generalA.card_id), after);
});

await test("Paiement réussi crée une écriture complète", async () => {
  const paid = await rpc(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id,
    p_amount: 7,
    p_reference: `ticket-${suffix}`,
    p_idempotency_key: `pay-record-${suffix}`,
  });
  const { data, error } = await sellerA.client
    .from("card_transactions")
    .select("id, transaction_type, amount, shop_id, client_id, card_id, status")
    .eq("id", paid.transaction_id)
    .single();
  assert.equal(error, null, error?.message);
  assert.equal(data.transaction_type, "shop_card_payment");
  assert.equal(Number(data.amount), 7);
  assert.equal(data.shop_id, shopA.shop_id);
  assert.equal(data.client_id, clientA.id);
  assert.equal(data.card_id, cardA.card_id);
  assert.equal(data.status, "completed");
});

await test("Vente crédit distincte d'un paiement", async () => {
  const before = await balanceOf(sellerA.client, cardA.card_id);
  const sale = await rpc(sellerA.client, "record_credit_sale", {
    p_shop: shopA.shop_id,
    p_client: clientA.id,
    p_lines: [{ name: "Kridi", qty: 1, price: 30 }],
    p_total: 30,
    p_idempotency_key: `credit-${suffix}`,
  });
  assert.equal(await balanceOf(sellerA.client, cardA.card_id), before);
  const { data, error } = await sellerA.client
    .from("card_transactions")
    .select("transaction_type, amount")
    .eq("client_id", clientA.id)
    .eq("transaction_type", "credit_sale");
  assert.equal(error, null, error?.message);
  assert.ok(data.some((row) => Number(row.amount) === 30));
  assert.ok(sale.sale_id);
});

await test("Remboursement crédit enregistré, client ne peut pas en créer", async () => {
  await expectRpcFailure(clientA.client, "record_repayment", {
    p_shop: shopA.shop_id, p_client: clientA.id, p_amount: 10,
  });
  const repaid = await rpc(sellerA.client, "record_repayment", {
    p_shop: shopA.shop_id,
    p_client: clientA.id,
    p_amount: 10,
    p_idempotency_key: `repay-${suffix}`,
  });
  const { error } = await sellerA.client
    .from("card_transactions")
    .select("id")
    .eq("id", repaid.transaction_id)
    .single();
  assert.equal(error, null, error?.message);
});

await test("Carte bloquée ne peut pas payer", async () => {
  await rpc(sellerA.client, "set_card_status", { p_card: cardA.card_id, p_status: "blocked" });
  await expectRpcFailure(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 1,
  });
  await rpc(sellerA.client, "set_card_status", { p_card: cardA.card_id, p_status: "active" });
});

await test("Relation bloquée interdit le paiement carte boutique", async () => {
  await rpc(sellerA.client, "set_shop_client_status", {
    p_shop: shopA.shop_id, p_client: clientA.id, p_status: "blocked",
  });
  await expectRpcFailure(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 1,
  });
  await rpc(sellerA.client, "set_shop_client_status", {
    p_shop: shopA.shop_id, p_client: clientA.id, p_status: "active",
  });
});

await test("Token de liage non réutilisable", async () => {
  await expectRpcFailure(clientA.client, "confirm_link_token", { p_token: tokenA.token });
});

await test("Ajustement admin audité, client refusé", async () => {
  await expectRpcFailure(clientA.client, "admin_adjust_card", {
    p_card: cardA.card_id, p_amount: 5, p_reason: "test",
  });
  const before = await balanceOf(sellerA.client, cardA.card_id);
  const adjusted = await rpc(adminUser.client, "admin_adjust_card", {
    p_card: cardA.card_id,
    p_amount: 5,
    p_reason: "Ajustement test",
    p_idempotency_key: `adjust-${suffix}`,
  });
  assert.equal(await balanceOf(sellerA.client, cardA.card_id), before + 5);
  const { error } = await sellerA.client
    .from("card_transactions")
    .select("transaction_type")
    .eq("id", adjusted.transaction_id)
    .single();
  assert.equal(error, null, error?.message);
});

await test("Remboursement crée un reversement sans effacer l'original", async () => {
  const paid = await rpc(sellerA.client, "pay_shop_card", {
    p_card: cardA.card_id, p_amount: 3, p_idempotency_key: `pay-refund-${suffix}`,
  });
  const before = await balanceOf(sellerA.client, cardA.card_id);
  const refunded = await rpc(sellerA.client, "refund_transaction", {
    p_transaction: paid.transaction_id, p_reason: "Annulation test",
  });
  assert.ok(refunded.refund_transaction_id);
  assert.equal(await balanceOf(sellerA.client, cardA.card_id), before + 3);
  const { data, error } = await sellerA.client
    .from("card_transactions")
    .select("status")
    .eq("id", paid.transaction_id)
    .single();
  assert.equal(error, null, error?.message);
  assert.equal(data.status, "reversed");
});

await test("Événements/ledger non exposés à un autre client", async () => {
  const { data, error } = await clientB.client
    .from("card_transactions")
    .select("id")
    .eq("client_id", clientA.id);
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 0);
});

console.log(`\nRésultat : ${pass} pass, ${fail} fail`);
console.log("Identités de test conservées (aucune suppression de données) :");
for (const u of [sellerA, sellerB, clientA, clientB, adminUser]) {
  console.log(`  ${u.role}: ${u.email}`);
}
process.exit(fail === 0 ? 0 : 1);
