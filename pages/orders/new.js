import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import { createClient } from "@supabase/supabase-js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n ?? 0);

const today = () => new Date().toISOString().split("T")[0];

// A line has: qty × unit_price = line_total (unit_price = retail price, editable)
// Discount is applied globally at the bottom, not per-line
const emptyLine = () => ({
  _key: Math.random().toString(36).slice(2),
  product_id: "",
  sku: "",
  product_name: "",
  quantity_ordered: 1,
  unit_price: 0,    // = retail price (auto-filled, editable)
  line_total: 0,
  qty_on_hand: null,
});

export default function NewOrderPage({ customers, products }) {
  const router = useRouter();
  const [customerId, setCustomerId]     = useState("");
  const [customer, setCustomer]         = useState(null);
  const [locationId, setLocationId]     = useState("");
  const [orderDate, setOrderDate]       = useState(today());
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [discountPct, setDiscountPct]   = useState(0);
  const [notes, setNotes]               = useState("");
  const [lines, setLines]               = useState([emptyLine()]);
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState(null);

  // Auto-fill customer info when selected
  useEffect(() => {
    if (!customerId) { setCustomer(null); return; }
    const c = customers.find(x => x.id === customerId);
    setCustomer(c ?? null);
    setDiscountPct(Number(c?.discount_pct ?? 0));
    setPaymentTerms(c?.payment_terms_days ?? 30);
    const def = c?.locations?.find(l => l.is_shipping_default) ?? c?.locations?.[0];
    setLocationId(def?.id ?? "");
  }, [customerId]);

  // When product is selected → auto-fill retail price as unit_price
  const handleProduct = (key, productId) => {
    const p = products.find(x => x.id === productId);
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const up = Number(p?.retail_price ?? 0);
      return {
        ...l,
        product_id:   productId,
        sku:          p?.sku ?? "",
        product_name: p?.name ?? "",
        unit_price:   up,
        line_total:   up * l.quantity_ordered,
        qty_on_hand:  p?.qty_on_hand ?? null,
      };
    }));
  };

  const handleQty = (key, qty) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const q = Math.max(1, parseInt(qty) || 1);
      return { ...l, quantity_ordered: q, line_total: l.unit_price * q };
    }));
  };

  const handlePrice = (key, price) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const up = Math.max(0, parseFloat(price) || 0);
      return { ...l, unit_price: up, line_total: up * l.quantity_ordered };
    }));
  };

  // Totals — discount applied at the end
  const subtotalBeforeDiscount = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const discountAmount         = subtotalBeforeDiscount * (discountPct / 100);
  const subtotal               = subtotalBeforeDiscount - discountAmount;
  const totalAmount            = subtotal; // no tax for wholesale

  const validLines = lines.filter(l => l.product_id && l.quantity_ordered > 0);
  const canSubmit  = customerId && validLines.length > 0 && orderDate && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id:          customerId,
          ship_to_location_id:  locationId || null,
          order_date:           orderDate,
          payment_terms_days:   paymentTerms,
          discount_pct:         discountPct,
          notes,
          subtotal,
          total_amount:         totalAmount,
          lines: validLines.map(l => ({
            product_id:       l.product_id,
            sku:              l.sku,
            product_name:     l.product_name,
            quantity_ordered: l.quantity_ordered,
            // unit_price stored = after-discount price for accounting
            unit_price:       l.unit_price * (1 - discountPct / 100),
            line_total:       l.line_total  * (1 - discountPct / 100),
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

  return (
    <Layout>
      {/* Back button styled like the app */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/orders">
          <button className="btn-outline btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            ← Orders
          </button>
        </Link>
      </div>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h1>New Wholesale Order</h1>
          <p className="page-sub">Create a new order for a wholesale distributor</p>
        </div>
      </div>

      <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── Section 1 — Distributor ──────────────────────────────── */}
        <div className="card">
          <div className="card-header"><span className="card-title">1 — Distributor</span></div>
          <div className="card-body">
            <div className="form-row form-row-2">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Customer</label>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Select a distributor…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {customer && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Ship-to Location</label>
                  {customer.locations?.length > 0 ? (
                    <select value={locationId} onChange={e => setLocationId(e.target.value)}>
                      <option value="">No specific location</option>
                      {customer.locations.map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}{loc.city ? ` — ${loc.city}, ${loc.state}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value="No locations on file" disabled />
                  )}
                </div>
              )}
            </div>

            {customer && (
              <div style={{ display: "flex", gap: 24, marginTop: 12, padding: "12px 14px", background: "var(--bg)", borderRadius: "var(--radius)", border: "1px solid var(--border)", fontSize: 13 }}>
                {customer.contact_name && (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Contact</div>
                    <strong>{customer.contact_name}</strong>
                  </div>
                )}
                {customer.email && (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Email</div>
                    <strong>{customer.email}</strong>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Discount</div>
                  <strong style={{ color: "var(--accent)" }}>{discountPct}%</strong>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Payment Terms</div>
                  <strong>Net {paymentTerms}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 2 — Order Info ───────────────────────────────── */}
        <div className="card">
          <div className="card-header"><span className="card-title">2 — Order Info</span></div>
          <div className="card-body">
            <div className="form-row form-row-3">
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Order Date</label>
                <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Payment Terms (days)</label>
                <input type="number" min="0" value={paymentTerms} onChange={e => setPaymentTerms(parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Wholesale Discount %</label>
                <input
                  type="number" min="0" max="100" value={discountPct}
                  onChange={e => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0, marginTop: 12 }}>
              <label className="form-label">Notes (internal)</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="PO reference, shipping instructions…" />
            </div>
          </div>
        </div>

        {/* ── Section 3 — Products ─────────────────────────────────── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">3 — Products</span>
            <button className="btn-outline btn-sm" onClick={() => setLines(prev => [...prev, emptyLine()])}>
              + Add line
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>

            {/* Column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 130px 110px 36px", gap: 8, padding: "8px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
              {[["Product", "left"], ["Qty", "center"], ["Unit Price (retail)", "right"], ["Line Total", "right"], ["", "left"]].map(([h, align], i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: align }}>{h}</div>
              ))}
            </div>

            {lines.map(line => {
              const stockWarn = line.product_id && line.qty_on_hand !== null && line.qty_on_hand < line.quantity_ordered;
              return (
                <div key={line._key} style={{ borderBottom: "1px solid var(--border)", background: stockWarn ? "var(--amber-light)" : "#fff" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 130px 110px 36px", gap: 8, padding: "10px 18px", alignItems: "center" }}>

                    {/* Product select */}
                    <div>
                      <select value={line.product_id} onChange={e => handleProduct(line._key, e.target.value)}>
                        <option value="">Select product…</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
                        ))}
                      </select>
                      {line.product_id && (
                        <div style={{ fontSize: 11, color: stockWarn ? "var(--amber)" : "var(--text-3)", marginTop: 3 }}>
                          Stock: {line.qty_on_hand ?? "—"} units
                          {stockWarn && " ⚠ below qty — pre-order OK"}
                        </div>
                      )}
                    </div>

                    {/* Qty */}
                    <input
                      type="number" min="1" value={line.quantity_ordered}
                      onChange={e => handleQty(line._key, e.target.value)}
                      style={{ textAlign: "center" }}
                    />

                    {/* Unit price (retail, auto-filled, editable) */}
                    <input
                      type="number" min="0" step="0.01"
                      value={line.unit_price === 0 && !line.product_id ? "" : line.unit_price.toFixed(2)}
                      placeholder="0.00"
                      onChange={e => handlePrice(line._key, e.target.value)}
                      style={{ textAlign: "right" }}
                    />

                    {/* Line total (at retail) */}
                    <div style={{ textAlign: "right", fontWeight: 600, fontSize: 14 }}>
                      {fmt(line.line_total)}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => setLines(prev => prev.filter(l => l._key !== line._key))}
                      disabled={lines.length === 1}
                      style={{ background: "none", border: "none", color: "var(--red)", fontSize: 16, cursor: lines.length === 1 ? "not-allowed" : "pointer", opacity: lines.length === 1 ? 0.3 : 1, padding: 0 }}
                    >✕</button>
                  </div>
                </div>
              );
            })}

            {/* ── Totals ─────────────────────────────────────────── */}
            <div style={{ padding: "16px 18px", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
              <div style={{ maxWidth: 300, marginLeft: "auto", display: "flex", flexDirection: "column", gap: 7, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-2)" }}>
                  <span>Subtotal (retail)</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(subtotalBeforeDiscount)}</span>
                </div>
                {discountPct > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--accent)" }}>
                    <span>Wholesale discount ({discountPct}%)</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>− {fmt(discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}>
                  <span>Tax</span><span>$0.00</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "2px solid var(--border)", paddingTop: 8, marginTop: 2 }}>
                  <span>Total</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <div className="alert alert-danger">⚠ {error}</div>}

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 40 }}>
          <Link href="/orders">
            <button className="btn-outline">Cancel</button>
          </Link>
          <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating order…" : "✓ Confirm Order"}
          </button>
        </div>

      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const [{ data: rawCustomers }, { data: products }] = await Promise.all([
    supabase
      .from("customers")
      .select(`id, name, type, discount_pct, payment_terms_days, email, contact_name, customer_locations ( id, name, city, state, address_line1, is_shipping_default )`)
      .eq("type", "wholesale")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("products")
      .select(`id, sku, name, retail_price, family, stock_levels ( qty_on_hand )`)
      .eq("is_active", true)
      .order("name"),
  ]);

  const customers = (rawCustomers ?? []).map(c => ({
    ...c,
    locations: c.customer_locations ?? [],
    customer_locations: undefined,
  }));

  const prods = (products ?? []).map(p => ({
    ...p,
    qty_on_hand: p.stock_levels?.[0]?.qty_on_hand ?? 0,
    retail_price: p.retail_price ? Number(p.retail_price) : 0,
    stock_levels: undefined,
  }));

  return { props: { customers, products: prods } };
}
