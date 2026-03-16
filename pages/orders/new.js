import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";
import {
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n ?? 0);

const today = () => new Date().toISOString().split("T")[0];

const emptyLine = () => ({
  _key: Math.random().toString(36).slice(2),
  product_id: "",
  sku: "",
  product_name: "",
  quantity_ordered: 1,
  retail_price: 0,
  unit_price: 0,
  line_total: 0,
  qty_on_hand: null,
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5 tracking-wide uppercase">
        {label}
        {hint && <span className="ml-2 text-[10px] text-zinc-600 normal-case tracking-normal">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full px-3 py-2 bg-[#111116] border border-[#1E1E26] rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors ${className}`}
      {...props}
    />
  );
}

function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full px-3 py-2 bg-[#111116] border border-[#1E1E26] rounded-lg text-white text-sm focus:outline-none focus:border-zinc-500 transition-colors cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function NewOrderPage({ customers, products }) {
  const router = useRouter();

  // ── form state ────────────────────────────────────────────────────────────
  const [customerId, setCustomerId]   = useState("");
  const [customer, setCustomer]       = useState(null);
  const [locationId, setLocationId]   = useState("");
  const [orderDate, setOrderDate]     = useState(today());
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [discountPct, setDiscountPct] = useState(0);
  const [notes, setNotes]             = useState("");
  const [lines, setLines]             = useState([emptyLine()]);

  // ── ui state ──────────────────────────────────────────────────────────────
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);

  // ── when customer changes → auto-fill ────────────────────────────────────
  useEffect(() => {
    if (!customerId) { setCustomer(null); return; }
    const c = customers.find((x) => x.id === customerId);
    setCustomer(c ?? null);
    setDiscountPct(Number(c?.discount_pct ?? 0));
    setPaymentTerms(c?.payment_terms_days ?? 30);

    // default shipping location
    const defaultLoc = c?.locations?.find((l) => l.is_shipping_default) ?? c?.locations?.[0];
    setLocationId(defaultLoc?.id ?? "");

    // re-apply discount to existing lines
    setLines((prev) =>
      prev.map((l) => recalcLine(l, Number(c?.discount_pct ?? 0)))
    );
  }, [customerId]);

  // ── when global discount changes → re-apply to all lines ─────────────────
  const handleDiscountChange = (val) => {
    const pct = Math.min(100, Math.max(0, Number(val) || 0));
    setDiscountPct(pct);
    setLines((prev) => prev.map((l) => recalcLine(l, pct)));
  };

  // ── line helpers ──────────────────────────────────────────────────────────
  const recalcLine = (line, pct) => {
    const unitPrice = line.retail_price * (1 - pct / 100);
    const lineTotal = unitPrice * line.quantity_ordered;
    return { ...line, unit_price: unitPrice, line_total: lineTotal };
  };

  const handleProductChange = (key, productId) => {
    const p = products.find((x) => x.id === productId);
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const base = {
          ...l,
          product_id: productId,
          sku: p?.sku ?? "",
          product_name: p?.name ?? "",
          retail_price: Number(p?.retail_price ?? 0),
          qty_on_hand: p?.qty_on_hand ?? null,
        };
        return recalcLine(base, discountPct);
      })
    );
  };

  const handleQtyChange = (key, qty) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const updated = { ...l, quantity_ordered: Math.max(1, parseInt(qty) || 1) };
        return recalcLine(updated, discountPct);
      })
    );
  };

  const handleUnitPriceChange = (key, price) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l._key !== key) return l;
        const unitPrice = Math.max(0, parseFloat(price) || 0);
        return { ...l, unit_price: unitPrice, line_total: unitPrice * l.quantity_ordered };
      })
    );
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key) =>
    setLines((prev) => prev.filter((l) => l._key !== key));

  // ── totals ────────────────────────────────────────────────────────────────
  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const totalAmount = subtotal; // no tax for wholesale
  const discountAmount = lines.reduce(
    (s, l) => s + l.retail_price * l.quantity_ordered - l.line_total,
    0
  );

  // ── validation ────────────────────────────────────────────────────────────
  const validLines = lines.filter((l) => l.product_id && l.quantity_ordered > 0);
  const canSubmit  = customerId && validLines.length > 0 && orderDate && !submitting;

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id:       customerId,
          ship_to_location_id: locationId || null,
          order_date:        orderDate,
          payment_terms_days: paymentTerms,
          discount_pct:      discountPct,
          notes,
          subtotal,
          total_amount:      totalAmount,
          lines: validLines.map((l) => ({
            product_id:      l.product_id,
            sku:             l.sku,
            product_name:    l.product_name,
            quantity_ordered: l.quantity_ordered,
            unit_price:      l.unit_price,
            line_total:      l.line_total,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");

      router.push(`/orders/${data.id}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>New Order — CBS ERP</title>
      </Head>

      <div
        className="min-h-screen bg-[#0A0A0D] text-white"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 6px; } 
          ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
          .mono { font-family: 'DM Mono', monospace; }
          select option { background: #111116; }
        `}</style>

        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* ── header ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-4 mb-8">
            <Link href="/orders">
              <button className="p-2 rounded-lg border border-[#1E1E26] text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors">
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
            </Link>
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-zinc-500">CBS ERP · Orders</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white">New Wholesale Order</h1>
            </div>
          </div>

          <div className="space-y-6">

            {/* ── Section 1 : Distributor ──────────────────────────────── */}
            <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1E1E26]">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">
                  1 — Distributor
                </h2>
              </div>
              <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">

                <Field label="Customer" hint="wholesale only">
                  <Select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Select a distributor…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </Field>

                {customer && (
                  <>
                    <Field label="Ship-to Location">
                      {customer.locations?.length > 0 ? (
                        <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                          <option value="">No specific location</option>
                          {customer.locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}{loc.city ? ` — ${loc.city}, ${loc.state}` : ""}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <div className="px-3 py-2 bg-[#111116] border border-[#1E1E26] rounded-lg text-zinc-600 text-sm">
                          No locations on file
                        </div>
                      )}
                    </Field>

                    {/* customer summary card */}
                    <div className="sm:col-span-2 rounded-lg bg-[#111116] border border-[#1E1E26] px-4 py-3 flex flex-wrap gap-6 text-sm">
                      {customer.contact_name && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">Contact</p>
                          <p className="text-white font-medium">{customer.contact_name}</p>
                        </div>
                      )}
                      {customer.email && (
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">Email</p>
                          <p className="text-white font-medium">{customer.email}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">Discount</p>
                        <p className="text-rose-300 font-semibold mono">{discountPct}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">Payment Terms</p>
                        <p className="text-white font-medium">Net {paymentTerms}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* ── Section 2 : Order info ───────────────────────────────── */}
            <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1E1E26]">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">
                  2 — Order Info
                </h2>
              </div>
              <div className="px-5 py-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
                <Field label="Order Date">
                  <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </Field>
                <Field label="Payment Terms" hint="days">
                  <Input
                    type="number" min="0" value={paymentTerms}
                    onChange={(e) => setPaymentTerms(parseInt(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Wholesale Discount %" hint="applied to all lines">
                  <Input
                    type="number" min="0" max="100" value={discountPct}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-3">
                  <Field label="Notes" hint="internal">
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="PO reference, shipping instructions…"
                      className="w-full px-3 py-2 bg-[#111116] border border-[#1E1E26] rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors resize-none"
                    />
                  </Field>
                </div>
              </div>
            </section>

            {/* ── Section 3 : Line Items ───────────────────────────────── */}
            <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#1E1E26] flex items-center justify-between">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">
                  3 — Products
                </h2>
                <button
                  onClick={addLine}
                  className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-medium transition-colors"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add line
                </button>
              </div>

              <div className="px-5 py-5 space-y-3">
                {/* column headers */}
                <div className="grid items-center gap-3 text-[10px] uppercase tracking-widest text-zinc-600 font-medium px-1"
                  style={{ gridTemplateColumns: "2fr 80px 120px 110px 30px" }}>
                  <span>Product</span>
                  <span className="text-center">Qty</span>
                  <span className="text-right">Unit Price (after disc.)</span>
                  <span className="text-right">Line Total</span>
                  <span></span>
                </div>

                {lines.map((line) => {
                  const product = products.find((p) => p.id === line.product_id);
                  const stockWarning = line.product_id && line.qty_on_hand !== null && line.qty_on_hand < line.quantity_ordered;
                  return (
                    <div key={line._key} className={`rounded-lg border transition-colors ${stockWarning ? "border-amber-500/30 bg-amber-500/5" : "border-[#1E1E26] bg-[#111116]"}`}>
                      <div
                        className="grid items-center gap-3 px-3 py-3"
                        style={{ gridTemplateColumns: "2fr 80px 120px 110px 30px" }}
                      >
                        {/* product select */}
                        <div>
                          <Select
                            value={line.product_id}
                            onChange={(e) => handleProductChange(line._key, e.target.value)}
                            className="bg-transparent border-0 px-0 focus:border-0 text-sm"
                          >
                            <option value="">Select product…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                [{p.sku}] {p.name}
                              </option>
                            ))}
                          </Select>
                          {line.product_id && (
                            <p className="mono text-[10px] text-zinc-600 mt-0.5 px-0">
                              Stock: {line.qty_on_hand ?? "—"} units
                              {stockWarning && <span className="text-amber-400 ml-2">⚠ below qty (pre-order OK)</span>}
                            </p>
                          )}
                        </div>

                        {/* qty */}
                        <input
                          type="number" min="1" value={line.quantity_ordered}
                          onChange={(e) => handleQtyChange(line._key, e.target.value)}
                          className="w-full text-center bg-transparent border border-[#2a2a32] rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500 mono"
                        />

                        {/* unit price */}
                        <input
                          type="number" min="0" step="0.01"
                          value={line.unit_price.toFixed(2)}
                          onChange={(e) => handleUnitPriceChange(line._key, e.target.value)}
                          className="w-full text-right bg-transparent border border-[#2a2a32] rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500 mono"
                        />

                        {/* line total */}
                        <p className="text-right mono text-sm font-medium text-white pr-1">
                          {fmt(line.line_total)}
                        </p>

                        {/* delete */}
                        <button
                          onClick={() => removeLine(line._key)}
                          disabled={lines.length === 1}
                          className="flex items-center justify-center text-zinc-600 hover:text-red-400 disabled:opacity-20 transition-colors"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>

                      {/* retail price hint */}
                      {line.product_id && line.retail_price > 0 && (
                        <div className="px-3 pb-2 flex gap-3 text-[10px] text-zinc-600 mono">
                          <span>Retail: {fmt(line.retail_price)}</span>
                          <span>→</span>
                          <span className="text-rose-400/80">{discountPct}% off</span>
                          <span>→</span>
                          <span>Wholesale: {fmt(line.unit_price)}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── totals ────────────────────────────────────────────── */}
              <div className="mx-5 mb-5 rounded-lg border border-[#1E1E26] bg-[#0A0A0D] px-5 py-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-400">
                    <span>Retail subtotal</span>
                    <span className="mono">{fmt(lines.reduce((s, l) => s + l.retail_price * l.quantity_ordered, 0))}</span>
                  </div>
                  {discountPct > 0 && (
                    <div className="flex justify-between text-rose-400/80">
                      <span>Wholesale discount ({discountPct}%)</span>
                      <span className="mono">− {fmt(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-zinc-400">
                    <span>Tax</span>
                    <span className="mono text-zinc-600">$0.00</span>
                  </div>
                  <div className="h-px bg-[#1E1E26] my-2" />
                  <div className="flex justify-between text-white font-semibold text-base">
                    <span>Total</span>
                    <span className="mono">{fmt(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ── error ───────────────────────────────────────────────── */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── submit ──────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <Link href="/orders">
                <button className="px-4 py-2.5 text-sm text-zinc-500 hover:text-white border border-[#1E1E26] rounded-lg transition-colors">
                  Cancel
                </button>
              </Link>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-6 py-2.5 bg-rose-500/90 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {submitting ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating order…
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-4 w-4" />
                    Confirm Order
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}

// ─── getServerSideProps ───────────────────────────────────────────────────────

export async function getServerSideProps() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [{ data: rawCustomers }, { data: products }] = await Promise.all([
    supabase
      .from("customers")
      .select(`
        id, name, type, discount_pct, payment_terms_days, email, contact_name,
        customer_locations ( id, name, city, state, address_line1, is_shipping_default )
      `)
      .eq("type", "wholesale")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("products")
      .select(`
        id, sku, name, retail_price, family, status,
        stock_levels ( qty_on_hand, qty_committed )
      `)
      .eq("is_active", true)
      .order("name"),
  ]);

  // flatten stock_levels (it's an array from supabase join)
  const customers = (rawCustomers ?? []).map((c) => ({
    ...c,
    locations: c.customer_locations ?? [],
    customer_locations: undefined,
  }));

  const prods = (products ?? []).map((p) => ({
    ...p,
    qty_on_hand: p.stock_levels?.[0]?.qty_on_hand ?? 0,
    qty_committed: p.stock_levels?.[0]?.qty_committed ?? 0,
    stock_levels: undefined,
  }));

  return { props: { customers, products: prods } };
}
