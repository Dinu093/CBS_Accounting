import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import { createClient } from "@supabase/supabase-js";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n ?? 0);

const today = () => new Date().toISOString().split("T")[0];
const emptyLine = () => ({ _key: Math.random().toString(36).slice(2), product_id: "", sku: "", product_name: "", quantity_ordered: 1, retail_price: 0, unit_price: 0, line_total: 0, qty_on_hand: null });

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

  useEffect(() => {
    if (!customerId) { setCustomer(null); return; }
    const c = customers.find(x => x.id === customerId);
    setCustomer(c ?? null);
    setDiscountPct(Number(c?.discount_pct ?? 0));
    setPaymentTerms(c?.payment_terms_days ?? 30);
    const def = c?.locations?.find(l => l.is_shipping_default) ?? c?.locations?.[0];
    setLocationId(def?.id ?? "");
    setLines(prev => prev.map(l => recalc(l, Number(c?.discount_pct ?? 0))));
  }, [customerId]);

  const recalc = (line, pct) => {
    const unitPrice = line.retail_price * (1 - pct / 100);
    return { ...line, unit_price: unitPrice, line_total: unitPrice * line.quantity_ordered };
  };

  const handleDiscount = (val) => {
    const pct = Math.min(100, Math.max(0, Number(val) || 0));
    setDiscountPct(pct);
    setLines(prev => prev.map(l => recalc(l, pct)));
  };

  const handleProduct = (key, productId) => {
    const p = products.find(x => x.id === productId);
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const base = { ...l, product_id: productId, sku: p?.sku ?? "", product_name: p?.name ?? "", retail_price: Number(p?.retail_price ?? 0), qty_on_hand: p?.qty_on_hand ?? null };
      return recalc(base, discountPct);
    }));
  };

  const handleQty = (key, qty) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const updated = { ...l, quantity_ordered: Math.max(1, parseInt(qty) || 1) };
      return recalc(updated, discountPct);
    }));
  };

  const handlePrice = (key, price) => {
    setLines(prev => prev.map(l => {
      if (l._key !== key) return l;
      const up = Math.max(0, parseFloat(price) || 0);
      return { ...l, unit_price: up, line_total: up * l.quantity_ordered };
    }));
  };

  const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
  const retailSubtotal = lines.reduce((s, l) => s + l.retail_price * l.quantity_ordered, 0);
  const discountAmount = retailSubtotal - subtotal;
  const validLines = lines.filter(l => l.product_id && l.quantity_ordered > 0);
  const canSubmit  = customerId && validLines.length > 0 && orderDate && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, ship_to_location_id: locationId || null, order_date: orderDate, payment_terms_days: paymentTerms, discount_pct: discountPct, notes, subtotal, total_amount: subtotal, lines: validLines.map(l => ({ product_id: l.product_id, sku: l.sku, product_name: l.product_name, quantity_ordered: l.quantity_ordered, unit_price: l.unit_price, line_total: l.line_total })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.push(`/orders/${data.id}`);
    } catch (e) { setError(e.message); setSubmitting(false); }
  };

  return (
    <Layout>
      <div className="page-header">
        <div>
          <Link href="/orders"><span style={{ fontSize: 13, color: "var(--text-3)", cursor: "pointer" }}>← Orders</span></Link>
          <h1 style={{ marginTop: 4 }}>New Wholesale Order</h1>
        </div>
      </div>

      <div style={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Section 1 — Distributor */}
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
                        <option key={loc.id} value={loc.id}>{loc.name}{loc.city ? ` — ${loc.city}, ${loc.state}` : ""}</option>
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
                {customer.contact_name && <div><div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Contact</div><strong>{customer.contact_name}</strong></div>}
                {customer.email && <div><div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Email</div><strong>{customer.email}</strong></div>}
                <div><div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Discount</div><strong style={{ color: "var(--accent)" }}>{discountPct}%</strong></div>
                <div><div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>Payment Terms</div><strong>Net {paymentTerms}</strong></div>
              </div>
            )}
          </div>
        </div>

        {/* Section 2 — Order Info */}
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
                <input type="number" min="0" max="100" value={discountPct} onChange={e => handleDiscount(e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{ margin: 0, marginTop: 12 }}>
              <label className="form-label">Notes (internal)</label>
              <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="PO reference, shipping instructions…" />
            </div>
          </div>
        </div>

        {/* Section 3 — Products */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">3 — Products</span>
            <button className="btn-outline btn-sm" onClick={() => setLines(prev => [...prev, emptyLine()])}>+ Add line</button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {/* column headers */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 130px 110px 36px", gap: 8, padding: "8px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
              {["Product", "Qty", "Unit Price", "Line Total", ""].map((h, i) => (
                <div key={i} style={{ fontSize: 11, fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i >= 2 && i < 4 ? "right" : "left" }}>{h}</div>
              ))}
            </div>

            {lines.map(line => {
              const stockWarn = line.product_id && line.qty_on_hand !== null && line.qty_on_hand < line.quantity_ordered;
              return (
                <div key={line._key} style={{ borderBottom: "1px solid var(--border)", background: stockWarn ? "var(--amber-light)" : "#fff" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 130px 110px 36px", gap: 8, padding: "10px 18px", alignItems: "center" }}>
                    <div>
                      <select value={line.product_id} onChange={e => handleProduct(line._key, e.target.value)} style={{ marginBottom: 0 }}>
                        <option value="">Select product…</option>
                        {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                      </select>
                      {line.product_id && (
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
                          Stock: {line.qty_on_hand ?? "—"} units
                          {stockWarn && <span style={{ color: "var(--amber)", marginLeft: 6 }}>⚠ below qty (pre-order OK)</span>}
                        </div>
                      )}
                    </div>
                    <input type="number" min="1" value={line.quantity_ordered} onChange={e => handleQty(line._key, e.target.value)} style={{ textAlign: "center" }} />
                    <input type="number" min="0" step="0.01" value={line.unit_price.toFixed(2)} onChange={e => handlePrice(line._key, e.target.value)} style={{ textAlign: "right" }} />
                    <div style={{ textAlign: "right", fontWeight: 600, fontSize: 14 }}>{fmt(line.line_total)}</div>
                    <button
                      onClick={() => setLines(prev => prev.filter(l => l._key !== line._key))}
                      disabled={lines.length === 1}
                      style={{ background: "none", border: "none", color: "var(--red)", fontSize: 16, cursor: lines.length === 1 ? "not-allowed" : "pointer", opacity: lines.length === 1 ? 0.3 : 1, padding: 0 }}
                    >✕</button>
                  </div>
                  {line.product_id && line.retail_price > 0 && (
                    <div style={{ padding: "0 18px 10px", fontSize: 11, color: "var(--text-3)", display: "flex", gap: 8 }}>
                      <span>Retail: {fmt(line.retail_price)}</span>
                      <span>→ {discountPct}% off →</span>
                      <span style={{ color: "var(--accent)" }}>Wholesale: {fmt(line.unit_price)}</span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Totals */}
            <div style={{ padding: "16px 18px", background: "var(--bg)", borderTop: "1px solid var(--border)" }}>
              <div style={{ maxWidth: 280, marginLeft: "auto", display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}>
                  <span>Retail subtotal</span><span>{fmt(retailSubtotal)}</span>
                </div>
                {discountPct > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--accent)" }}>
                    <span>Discount ({discountPct}%)</span><span>− {fmt(discountAmount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}>
                  <span>Tax</span><span>$0.00</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 2 }}>
                  <span>Total</span><span>{fmt(subtotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <div className="alert alert-danger">⚠ {error}</div>}

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 40 }}>
          <Link href="/orders"><button className="btn-outline">Cancel</button></Link>
          <button className="btn-primary" onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating order…" : "✓ Confirm Order"}
          </button>
        </div>
      </div>
    </Layout>
  );
}

export async function getServerSideProps() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [{ data: rawCustomers }, { data: products }] = await Promise.all([
    supabase.from("customers").select(`id, name, type, discount_pct, payment_terms_days, email, contact_name, customer_locations ( id, name, city, state, address_line1, is_shipping_default )`).eq("type", "wholesale").eq("status", "active").order("name"),
    supabase.from("products").select(`id, sku, name, retail_price, family, stock_levels ( qty_on_hand, qty_committed )`).eq("is_active", true).order("name"),
  ]);
  const customers = (rawCustomers ?? []).map(c => ({ ...c, locations: c.customer_locations ?? [], customer_locations: undefined }));
  const prods = (products ?? []).map(p => ({ ...p, qty_on_hand: p.stock_levels?.[0]?.qty_on_hand ?? 0, stock_levels: undefined }));
  return { props: { customers, products: prods } };
}
