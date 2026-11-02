import "server-only";
import { NextResponse } from "next/server";

type Kind = "fulfillment" | "shipments";
class Invalid extends Error {}
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function positive(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 2147483647) throw new Invalid("A positive integer ID is required.");
  return value;
}
function pathId(value: string) { if (!/^[1-9]\d*$/.test(value)) throw new Invalid("Invalid ID or page."); return positive(Number(value)); }
function shortText(value: unknown, required = false) {
  if (value === null || value === undefined) { if (required) throw new Invalid("Courier is required."); return null; }
  if (typeof value !== "string") throw new Invalid("Courier and tracking number must be strings.");
  const result = value.trim();
  if (result.includes("\u0000") || Array.from(result).length > 100 || required && !result) throw new Invalid("Courier/tracking number must be at most 100 characters; courier is required.");
  return result || null;
}
function failure(error: unknown) {
  if (error instanceof Invalid) return json({ error: error.message }, 400);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "42883" || code === "42P01") return json({ error: "Stage A preparation is unavailable until migrations/20261101_stage_a_preparation.sql is applied manually." }, 503);
  if (code === "P4040") return json({ error: "The requested record was not found." }, 404);
  if (code === "P4000" || code === "23514" || code === "22001") return json({ error: "Invalid Stage A update. Fulfillment permits PENDING → PROCESSING → PACKED; shipments must remain PENDING." }, 400);
  if (code === "23505") return json({ error: "An active preparation record or this tracking number already exists. Refresh before retrying." }, 409);
  if (["P4090", "23503", "40001", "40P01"].includes(code)) return json({ error: "Record changed, is already in preparation, or no longer has eligible payment/reservations. Refresh and review before retrying." }, 409);
  console.error("OmniLock preparation request unavailable.");
  return json({ error: "Request could not be confirmed. Refresh records before retrying." }, 503);
}
const fulfillmentStatuses = ["PENDING", "PROCESSING", "PACKED", "FULFILLED", "CANCELLED"];
const shipmentStatuses = ["PENDING", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED", "CANCELLED"];
// Read-only eligibility snapshot. Mutation functions repeat these checks under locks.
const eligibleItems = `eligible_items AS (
 SELECT oi.order_item_id,oi.order_id,oi.quantity,p.product_name,c.name AS customer
 FROM public.order_item oi JOIN public.orders o USING(order_id)
 JOIN public.product p ON p.product_id=oi.product_id JOIN public.customer c ON c.customer_id=o.customer_id
 WHERE o.status='CONFIRMED' AND o.total_amount>0
 AND (SELECT count(*) FROM public.payment pay WHERE pay.order_id=o.order_id AND pay.status='SUCCESS')=1
 AND EXISTS (SELECT 1 FROM public.payment pay WHERE pay.order_id=o.order_id AND pay.status='SUCCESS' AND pay.amount=o.total_amount)
 AND NOT EXISTS (SELECT 1 FROM public.payment pay WHERE pay.order_id=o.order_id AND pay.status='REFUNDED')
 AND NOT EXISTS (SELECT 1 FROM public.payment_refund pr JOIN public.payment pay USING(payment_id) WHERE pay.order_id=o.order_id)
 AND (SELECT COALESCE(sum(r.reserved_quantity),0) FROM public.inventory_reservation r WHERE r.order_item_id=oi.order_item_id AND r.reservation_status='CONFIRMED')=oi.quantity
 AND NOT EXISTS (SELECT 1 FROM public.inventory_reservation r WHERE r.order_item_id=oi.order_item_id AND r.reservation_status='ACTIVE')
 AND NOT EXISTS (SELECT 1 FROM public.inventory_reservation r JOIN public.inventory i USING(inventory_id)
   WHERE r.order_item_id=oi.order_item_id AND r.reservation_status='CONFIRMED' AND
    (i.product_id<>oi.product_id OR r.reserved_quantity<=0 OR i.stock_quantity<i.reserved_quantity OR i.reserved_quantity<0 OR
     i.reserved_quantity<>(SELECT COALESCE(sum(x.reserved_quantity),0) FROM public.inventory_reservation x WHERE x.inventory_id=i.inventory_id AND x.reservation_status IN ('ACTIVE','CONFIRMED'))))
)`;
const base = (kind: Kind) => kind === "fulfillment" ? `
 SELECT f.fulfillment_id AS id,f.order_item_id,oi.order_id,oi.quantity,p.product_name,c.name AS customer,
 f.status,f.fulfillment_date FROM public.fulfillment f JOIN public.order_item oi USING(order_item_id)
 JOIN public.orders o USING(order_id) JOIN public.product p ON p.product_id=oi.product_id JOIN public.customer c ON c.customer_id=o.customer_id
` : `
 SELECT s.shipment_id AS id,s.fulfillment_id,f.order_item_id,oi.order_id,oi.quantity,p.product_name,c.name AS customer,
 s.status,s.courier,s.tracking_no,s.ship_date,s.delivery_date,f.status AS fulfillment_status
 FROM public.shipment s JOIN public.fulfillment f USING(fulfillment_id) JOIN public.order_item oi USING(order_item_id)
 JOIN public.orders o USING(order_id) JOIN public.product p ON p.product_id=oi.product_id JOIN public.customer c ON c.customer_id=o.customer_id
`;
const readiness = `to_regprocedure('public.stage_a_create_fulfillment(integer)') IS NOT NULL
 AND to_regprocedure('public.stage_a_update_fulfillment(integer,text,text)') IS NOT NULL
 AND to_regprocedure('public.stage_a_create_shipment(integer,text,text)') IS NOT NULL
 AND to_regprocedure('public.stage_a_update_shipment(integer,text,text,text,text,text,text)') IS NOT NULL`;

export async function listPreparation(request: Request, kind: Kind) {
  try {
    const params = new URL(request.url).searchParams;
    const page=pathId(params.get("page") ?? "1"), pageSize=pathId(params.get("pageSize") ?? "10");
    if (pageSize>100) throw new Invalid("pageSize must be at most 100.");
    const search=(params.get("search") ?? "").trim(), status=params.get("status") ?? "";
    if (search.includes("\u0000") || status && !(kind === "fulfillment" ? fulfillmentStatuses : shipmentStatuses).includes(status)) throw new Invalid("Invalid search or status filter.");
    const options = kind === "fulfillment" ? `SELECT e.order_item_id AS id,e.* FROM eligible_items e WHERE NOT EXISTS (SELECT 1 FROM public.fulfillment f WHERE f.order_item_id=e.order_item_id AND f.status<>'CANCELLED')` : `SELECT f.fulfillment_id AS id,e.* FROM public.fulfillment f JOIN eligible_items e USING(order_item_id) WHERE f.status='PACKED' AND NOT EXISTS (SELECT 1 FROM public.shipment s WHERE s.fulfillment_id=f.fulfillment_id AND s.status<>'CANCELLED')`;
    const { sql } = await import("@/lib/neon-http");
    // SQL structure is selected only from internal constants; all user values are parameters.
    const rows = await sql.query(`WITH ${eligibleItems}, records AS (${base(kind)}), filtered AS (
      SELECT * FROM records WHERE ($1='' OR strpos(lower(concat_ws(' ',id::text,order_id::text,order_item_id::text,product_name,customer${kind === "shipments" ? ",courier,tracking_no,fulfillment_id::text" : ""})),lower($1))>0) AND ($2='' OR status=$2)
    ), paged AS (SELECT * FROM filtered ORDER BY id DESC LIMIT $3 OFFSET $4), options AS (${options})
    SELECT COALESCE((SELECT json_agg(paged ORDER BY id DESC) FROM paged),'[]'::json) AS records,
      (SELECT count(*)::integer FROM filtered) AS total,
      COALESCE((SELECT json_agg(options ORDER BY order_id,id) FROM options),'[]'::json) AS eligible,
      (${readiness}) AS ready`, [search,status,pageSize,(page-1)*pageSize]);
    return json({ success:true,...rows[0],page,pageSize });
  } catch(error) { return failure(error); }
}
export async function getPreparation(value: string, kind: Kind) {
  try {
    const id=pathId(value); const { sql }=await import("@/lib/neon-http");
    const rows=await sql.query(`SELECT r.*, (${readiness}) AS ready FROM (${base(kind)}) r WHERE id=$1`,[id]);
    if (!rows.length) return json({error:"Record not found."},404);
    return json({success:true,record:rows[0]});
  } catch(error) { return failure(error); }
}
export async function mutatePreparation(request: Request, kind: Kind, value?: string) {
  try {
    const id=value === undefined ? null : pathId(value);
    let body: unknown; try { body=await request.json(); } catch { throw new Invalid("Invalid JSON body."); }
    if (!body || typeof body!=="object" || Array.isArray(body)) throw new Invalid("Request body must be an object.");
    const input=body as Record<string,unknown>;
    const allowed = kind === "fulfillment" ? (id===null ? ["orderItemId"] : ["currentStatus","newStatus"]) : (id===null ? ["fulfillmentId","courier","trackingNo"] : ["currentStatus","newStatus","courier","trackingNo","expectedCourier","expectedTrackingNo"]);
    if (Object.keys(input).some(key=>!allowed.includes(key))) throw new Invalid("Unsupported fields. Dispatch dates, order state and stock cannot be changed in Stage A.");
    if (kind==="fulfillment" && id!==null && !((input.currentStatus==="PENDING" && input.newStatus==="PROCESSING") || (input.currentStatus==="PROCESSING" && input.newStatus==="PACKED"))) throw new Invalid("Only PENDING → PROCESSING → PACKED is allowed.");
    if (kind==="shipments" && id!==null && (input.currentStatus!=="PENDING" || input.newStatus!=="PENDING")) throw new Invalid("Shipment status must remain PENDING in Stage A.");
    const target=id===null ? positive(kind==="fulfillment" ? input.orderItemId : input.fulfillmentId) : id;
    const courier=kind==="shipments" ? shortText(input.courier,true) : null;
    const tracking=kind==="shipments" ? shortText(input.trackingNo) : null;
    if (kind==="shipments" && id!==null && (typeof input.expectedCourier!=="string" || !(input.expectedTrackingNo===null || typeof input.expectedTrackingNo==="string"))) throw new Invalid("Original courier and tracking number are required for conflict detection.");
    const { sql }=await import("@/lib/neon-http");
    const rows=kind==="fulfillment" ? id===null
      ? await sql`SELECT public.stage_a_create_fulfillment(${target}::integer) AS record`
      : await sql`SELECT public.stage_a_update_fulfillment(${target}::integer,${input.currentStatus as string}::text,${input.newStatus as string}::text) AS record`
      : id===null ? await sql`SELECT public.stage_a_create_shipment(${target}::integer,${courier}::text,${tracking}::text) AS record`
      : await sql`SELECT public.stage_a_update_shipment(${target}::integer,${input.currentStatus as string}::text,${input.newStatus as string}::text,${courier}::text,${tracking}::text,${input.expectedCourier as string}::text,${input.expectedTrackingNo as string | null}::text) AS record`;
    return json({success:true,record:rows[0].record},id===null ? 201 : 200);
  } catch(error) { return failure(error); }
}
